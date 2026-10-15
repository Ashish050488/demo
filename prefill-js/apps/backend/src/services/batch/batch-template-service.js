// The downloadable batch Excel for one form: a "Clients" sheet (one row per client, one column per field) and a
// "How to fill" sheet explaining every column. Row 1 is for people, row 2 holds the exact field keys the import
// reads - so renaming a heading never breaks a file.
import ExcelJS from "exceljs";
import { fetchFormRules } from "../forms/form-files-service.js";
import { buildBatchColumns, COLUMN_SOURCES } from "./batch-columns-helpers.js";
import { listDerivableBaseKeys } from "./cross-form-values-helpers.js";

const TEMPLATE_DATA_ROW_COUNT = 500; // rows that get dropdowns for tick-box columns
const FIRST_DATA_ROW_NUMBER = 3;
const BRAND_COLOURS = { INK: "FF1B1C1E", ORANGE: "FFFD7740", ORANGE_SOFT: "FFFFE0CF", CANVAS: "FFF8F7F2", MUTED: "FF6B6B6B", WHITE: "FFFFFFFF" };
const solidFill = (argbColour) => ({ type: "pattern", pattern: "solid", fgColor: { argb: argbColour } });

function addClientsSheet(workbook, batchColumns) {
  const clientsSheet = workbook.addWorksheet("Clients", { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
  clientsSheet.columns = batchColumns.map((batchColumn) => ({ key: batchColumn.key, width: Math.min(40, Math.max(14, batchColumn.label.length + 4)) }));

  const headingRow = clientsSheet.getRow(1);
  const keyRow = clientsSheet.getRow(2);
  batchColumns.forEach((batchColumn, index) => {
    const headingCell = headingRow.getCell(index + 1);
    headingCell.value = batchColumn.isRequired ? `${batchColumn.label} *` : batchColumn.label;
    headingCell.font = { bold: true, color: { argb: batchColumn.isRequired ? BRAND_COLOURS.WHITE : BRAND_COLOURS.INK } };
    headingCell.fill = solidFill(batchColumn.isRequired ? BRAND_COLOURS.INK : batchColumn.source === COLUMN_SOURCES.DOCUMENT ? BRAND_COLOURS.CANVAS : BRAND_COLOURS.ORANGE_SOFT);
    headingCell.alignment = { wrapText: true, vertical: "middle" };
    headingCell.note = `${batchColumn.sourceDescription}. ${batchColumn.rule}.`;
    const keyCell = keyRow.getCell(index + 1);
    keyCell.value = batchColumn.key;
    keyCell.font = { size: 8, color: { argb: BRAND_COLOURS.MUTED } };
  });
  headingRow.height = 32;

  batchColumns.forEach((batchColumn, index) => {
    if (!batchColumn.options) return;
    const allowedValues = `"${batchColumn.options.join(",").replace(/"/g, "")}"`;
    for (let rowNumber = FIRST_DATA_ROW_NUMBER; rowNumber < FIRST_DATA_ROW_NUMBER + TEMPLATE_DATA_ROW_COUNT; rowNumber += 1) {
      clientsSheet.getRow(rowNumber).getCell(index + 1).dataValidation = {
        type: "list", allowBlank: true, formulae: [allowedValues], showErrorMessage: true, errorTitle: "Not an allowed value", error: batchColumn.rule,
      };
    }
  });
  // Dates, pincodes and mobile numbers are text, so Excel never turns them into numbers or dates.
  batchColumns.forEach((_batchColumn, index) => { clientsSheet.getColumn(index + 1).numFmt = "@"; });
}

function addInstructionsSheet(workbook, batchColumns, formLabel) {
  const instructionsSheet = workbook.addWorksheet("How to fill");
  instructionsSheet.columns = [
    { header: "Column", key: "label", width: 36 }, { header: "Field key (row 2)", key: "key", width: 26 },
    { header: "Required", key: "required", width: 22 }, { header: "Where the value comes from", key: "source", width: 48 },
    { header: "Rule / allowed values", key: "rule", width: 60 },
  ];
  instructionsSheet.getRow(1).font = { bold: true, color: { argb: BRAND_COLOURS.WHITE } };
  instructionsSheet.getRow(1).fill = solidFill(BRAND_COLOURS.INK);
  for (const batchColumn of batchColumns) {
    instructionsSheet.addRow({
      label: batchColumn.label, key: batchColumn.key, rule: batchColumn.rule, source: batchColumn.sourceDescription,
      required: batchColumn.isRequired ? "Yes" : batchColumn.isRequiredWhenNomineeUsed ? "Yes, if this nominee is used" : "No",
    });
  }
  instructionsSheet.addRow({});
  instructionsSheet.addRow({ label: `Form: ${formLabel}` });
  instructionsSheet.addRow({ label: "One row per client. Leave row 2 (field keys) as it is. Dates as DD/MM/YYYY." });
  instructionsSheet.addRow({ label: "Grey columns are read from the client's documents; fill them only if no document is attached." });
}

/** xlsx bytes of the batch template for one form. */
export async function buildBatchTemplate(formId) {
  const [batchColumns, formRules] = await Promise.all([buildBatchColumns(formId), fetchFormRules(formId)]);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "360 ONE Form Prefill";
  addClientsSheet(workbook, batchColumns);
  addInstructionsSheet(workbook, batchColumns, formRules.label);
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
  addClientsSheet(workbook, combinedColumns);
  addInstructionsSheet(workbook, combinedColumns, combinedLabel);
  return { fileBytes: Buffer.from(await workbook.xlsx.writeBuffer()), fileName: `${rulesByForm.map((formRules) => formRules.shortLabel || formRules.label).join(" + ")} - combined Excel template.xlsx` };
}
