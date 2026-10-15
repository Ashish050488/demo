// The downloadable batch Excel for a form: "Clients" (one row per client), "How to fill" (every column: page, where
// the value comes from, rule, example) and "Page map" (every page of the form and what is printed on it). Row 1 is
// for people, row 2 holds the exact field keys the import reads - so renaming a heading never breaks a file.
import ExcelJS from "exceljs";
import { fetchFormRules } from "../forms/form-files-service.js";
import { buildBatchColumns, COLUMN_SOURCES, CLIENT_REFERENCE_COLUMN_KEY } from "./batch-columns-helpers.js";
import { listDerivableBaseKeys } from "./cross-form-values-helpers.js";
import { buildPageMapRows, describeComesFrom, getExample } from "./batch-template-details-helpers.js";

const TEMPLATE_DATA_ROW_COUNT = 500; // rows that get dropdowns for tick-box columns
const FIRST_DATA_ROW_NUMBER = 3;
const BRAND_COLOURS = { INK: "FF1B1C1E", ORANGE: "FFFD7740", ORANGE_SOFT: "FFFFE0CF", CANVAS: "FFF8F7F2", GREY: "FFE4E2DC", MUTED: "FF6B6B6B", WHITE: "FFFFFFFF" };
const solidFill = (argbColour) => ({ type: "pattern", pattern: "solid", fgColor: { argb: argbColour } });
const formatPages = (pages) => (pages?.length ? `p.${pages.join(", ")}` : "");

/** Columns you fill first (in page order), KYC columns - only for clients without documents - last. */
function orderForFilling(batchColumns) {
  const firstPage = (batchColumn) => batchColumn.pages?.[0] ?? 0;
  const byPage = (first, second) => firstPage(first) - firstPage(second);
  const referenceColumns = batchColumns.filter((batchColumn) => batchColumn.key === CLIENT_REFERENCE_COLUMN_KEY);
  const otherColumns = batchColumns.filter((batchColumn) => batchColumn.key !== CLIENT_REFERENCE_COLUMN_KEY);
  return [
    ...referenceColumns,
    ...otherColumns.filter((batchColumn) => batchColumn.source !== COLUMN_SOURCES.DOCUMENT).sort(byPage),
    ...otherColumns.filter((batchColumn) => batchColumn.source === COLUMN_SOURCES.DOCUMENT).sort(byPage),
  ];
}

function addClientsSheet(workbook, batchColumns) {
  const clientsSheet = workbook.addWorksheet("Clients", { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
  clientsSheet.columns = batchColumns.map((batchColumn) => ({ key: batchColumn.key, width: Math.min(40, Math.max(16, batchColumn.label.length + 6)) }));

  const headingRow = clientsSheet.getRow(1);
  const keyRow = clientsSheet.getRow(2);
  batchColumns.forEach((batchColumn, index) => {
    const isDocumentColumn = batchColumn.source === COLUMN_SOURCES.DOCUMENT;
    const headingCell = headingRow.getCell(index + 1);
    const pageText = formatPages(batchColumn.pages);
    headingCell.value = `${batchColumn.label}${batchColumn.isRequired && !isDocumentColumn ? " *" : ""}${pageText ? `\n${pageText}` : ""}${isDocumentColumn ? " · KYC" : ""}`;
    headingCell.font = { bold: true, color: { argb: batchColumn.isRequired && !isDocumentColumn ? BRAND_COLOURS.WHITE : BRAND_COLOURS.INK } };
    headingCell.fill = solidFill(isDocumentColumn ? BRAND_COLOURS.GREY : batchColumn.isRequired ? BRAND_COLOURS.INK : BRAND_COLOURS.ORANGE_SOFT);
    headingCell.alignment = { wrapText: true, vertical: "middle" };
    headingCell.note = `${describeComesFrom(batchColumn.fieldSource)}. ${batchColumn.rule}. Example: ${getExample(batchColumn.baseKey, batchColumn.options) || "-"}`;
    const keyCell = keyRow.getCell(index + 1);
    keyCell.value = batchColumn.key;
    keyCell.font = { size: 8, color: { argb: BRAND_COLOURS.MUTED } };
  });
  headingRow.height = 44;

  // Excel rejects a typed dropdown list over 255 characters (or with a comma inside an option): the whole file then
  // opens with "We found a problem with some content". Those lists live on a hidden "Lists" sheet instead.
  let listsSheet = null;
  let listsColumnCount = 0;
  const listRangeFor = (options) => {
    listsSheet ||= workbook.addWorksheet("Lists", { state: "hidden" });
    listsColumnCount += 1;
    options.forEach((option, optionIndex) => { listsSheet.getRow(optionIndex + 1).getCell(listsColumnCount).value = option; });
    const columnLetter = listsSheet.getColumn(listsColumnCount).letter;
    return `Lists!$${columnLetter}$1:$${columnLetter}$${options.length}`;
  };
  batchColumns.forEach((batchColumn, index) => {
    if (!batchColumn.options) return;
    const typedList = `"${batchColumn.options.join(",").replace(/"/g, "")}"`;
    const allowedValues = typedList.length > 255 || batchColumn.options.some((option) => option.includes(",")) ? listRangeFor(batchColumn.options) : typedList;
    for (let rowNumber = FIRST_DATA_ROW_NUMBER; rowNumber < FIRST_DATA_ROW_NUMBER + TEMPLATE_DATA_ROW_COUNT; rowNumber += 1) {
      clientsSheet.getRow(rowNumber).getCell(index + 1).dataValidation = {
        // Excel caps the message at 255 characters (longer -> it calls the file damaged); a long list says "pick from the list".
        type: "list", allowBlank: true, formulae: [allowedValues], showErrorMessage: true, errorTitle: "Not an allowed value",
        error: batchColumn.rule.length <= 255 ? batchColumn.rule : "Pick one of the values in this column's dropdown list",
      };
    }
  });
  // Dates, pincodes and mobile numbers are text, so Excel never turns them into numbers or dates.
  batchColumns.forEach((_batchColumn, index) => { clientsSheet.getColumn(index + 1).numFmt = "@"; });
}

function addHeadingRow(sheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: BRAND_COLOURS.WHITE } };
  sheet.getRow(1).fill = solidFill(BRAND_COLOURS.INK);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addInstructionsSheet(workbook, batchColumns, formLabel) {
  const instructionsSheet = workbook.addWorksheet("How to fill");
  instructionsSheet.columns = [
    { header: "Column", key: "label", width: 34 }, { header: "Printed on", key: "pages", width: 14 },
    { header: "Comes from", key: "comesFrom", width: 52 }, { header: "Required", key: "required", width: 16 },
    { header: "Rule / allowed values", key: "rule", width: 50 }, { header: "Example", key: "example", width: 36 }, { header: "Field key (row 2)", key: "key", width: 28 },
  ];
  addHeadingRow(instructionsSheet);
  for (const batchColumn of batchColumns) {
    const addedRow = instructionsSheet.addRow({
      label: batchColumn.label, pages: formatPages(batchColumn.pages), key: batchColumn.key, rule: batchColumn.rule,
      comesFrom: batchColumn.key === CLIENT_REFERENCE_COLUMN_KEY ? "Fill in - also the name of the client's documents folder" : describeComesFrom(batchColumn.fieldSource),
      required: batchColumn.source === COLUMN_SOURCES.DOCUMENT ? "If no documents" : batchColumn.isRequired ? "Yes" : batchColumn.isRequiredWhenNomineeUsed ? "Yes, if nominee used" : "No",
      example: getExample(batchColumn.baseKey, batchColumn.options),
    });
    if (batchColumn.source === COLUMN_SOURCES.DOCUMENT) addedRow.fill = solidFill(BRAND_COLOURS.CANVAS);
  }
  instructionsSheet.addRow({});
  for (const line of [
    `Form: ${formLabel}`,
    "1. One row per client. Leave row 2 (field keys) as it is.",
    "2. Fill the white/orange columns: amount, bank, contact and other details no ID document shows.",
    "3. Grey (KYC) columns are read from the client's documents folder (named like the Client reference). Fill them only for a client with no documents.",
    "4. Dates as DD/MM/YYYY. Dropdown columns: pick from the list; empty = the usual answer.",
    "5. The \"Page map\" sheet shows every page of the form and where each printed value comes from.",
  ]) instructionsSheet.addRow({ label: line });
}

async function addPageMapSheet(workbook, formId, sheetName) {
  const pageMapSheet = workbook.addWorksheet(sheetName.slice(0, 31));
  pageMapSheet.columns = [{ header: "Page", key: "page", width: 8 }, { header: "What is printed", key: "field", width: 40 }, { header: "Comes from", key: "comesFrom", width: 64 }];
  addHeadingRow(pageMapSheet);
  let previousPage = null;
  for (const row of await buildPageMapRows(formId)) {
    const addedRow = pageMapSheet.addRow({ ...row, page: row.page === previousPage ? "" : row.page });
    if (row.page !== previousPage) addedRow.border = { top: { style: "thin", color: { argb: BRAND_COLOURS.MUTED } } };
    previousPage = row.page;
  }
}

/** xlsx bytes of the batch template for one form. */
export async function buildBatchTemplate(formId) {
  const [batchColumns, formRules] = await Promise.all([buildBatchColumns(formId), fetchFormRules(formId)]);
  const orderedColumns = orderForFilling(batchColumns);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "360 ONE Form Prefill";
  addClientsSheet(workbook, orderedColumns);
  addInstructionsSheet(workbook, orderedColumns, formRules.label);
  await addPageMapSheet(workbook, formId, "Page map");
  return { fileBytes: Buffer.from(await workbook.xlsx.writeBuffer()), fileName: `${formRules.label} - Excel template.xlsx` };
}


/** One template for several forms: the first form's columns, then only what the others need on top - a value
 * another form's column already gives (investor/applicant name, ID type, state, …) is asked once. */
export async function buildCombinedBatchTemplate(formIds) {
  const columnsByForm = await Promise.all(formIds.map((formId) => buildBatchColumns(formId)));
  const rulesByForm = await Promise.all(formIds.map((formId) => fetchFormRules(formId)));
  const combinedColumns = [...columnsByForm[0]];
  const includedKeys = new Set(combinedColumns.map((batchColumn) => batchColumn.key));
  columnsByForm.slice(1).forEach((formColumns, formIndex) => {
    const derivableBaseKeys = listDerivableBaseKeys(rulesByForm[formIndex + 1]);
    for (const batchColumn of formColumns) {
      if (includedKeys.has(batchColumn.key)) continue;
      const isSingleVersusPerNominee = includedKeys.has(`${batchColumn.key}_n1`) || (batchColumn.key.endsWith("_n1") && includedKeys.has(batchColumn.key.slice(0, -3)));
      if (isSingleVersusPerNominee || derivableBaseKeys.has(batchColumn.baseKey)) continue;
      combinedColumns.push(batchColumn);
      includedKeys.add(batchColumn.key);
    }
  });
  const combinedLabel = rulesByForm.map((formRules) => formRules.label).join(" + ");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "360 ONE Form Prefill";
  const orderedColumns = orderForFilling(combinedColumns);
  addClientsSheet(workbook, orderedColumns);
  addInstructionsSheet(workbook, orderedColumns, combinedLabel);
  for (const [formIndex, formId] of formIds.entries()) await addPageMapSheet(workbook, formId, `Page map - ${rulesByForm[formIndex].shortLabel || rulesByForm[formIndex].label}`);
  return { fileBytes: Buffer.from(await workbook.xlsx.writeBuffer()), fileName: `${rulesByForm.map((formRules) => formRules.shortLabel || formRules.label).join(" + ")} - combined Excel template.xlsx` };
}
