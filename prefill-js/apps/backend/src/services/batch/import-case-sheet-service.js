// "Fill from Excel" for one case: read the file, match its columns to this form, pick the client's row, store the
// row as the case's sheet values (PAN in memory only), refill, and report everything the reviewer should know.
import { readFile } from "node:fs/promises";
import { fetchFormRules } from "../forms/form-files-service.js";
import { updateCase, getFillResultsPath } from "../storage/case-store-service.js";
import { fetchCorrectedValues } from "../storage/decision-log-service.js";
import { storeTypedPanValues } from "../documents/identity-number-memory-service.js";
import { fillCase } from "../fill/fill-case-service.js";
import { buildBatchColumns } from "./batch-columns-helpers.js";
import { readSheetFile, SheetFileError } from "./read-sheet-file-service.js";
import { matchSheetColumns } from "./column-matching-helpers.js";
import { listSheetRows, buildRowValues } from "./sheet-row-values-service.js";

const MINIMUM_MATCHED_FIELD_COUNT = 2;
const MAXIMUM_FOREIGN_KEY_SHARE = 0.25;

/** What happened to the sheet values after the fill: where a document won, and where a correction was kept. */
async function compareWithFilledForm(caseId, sheetValues) {
  const fillResults = JSON.parse(await readFile(getFillResultsPath(caseId), "utf-8"));
  const correctedValues = await fetchCorrectedValues(caseId);
  const documentWins = [];
  for (const fillResult of fillResults) {
    const sheetValue = sheetValues[fillResult.field];
    if (sheetValue && fillResult.value && fillResult.source_file && fillResult.source_file !== "batch sheet"
      && String(fillResult.value).toLowerCase() !== String(sheetValue).toLowerCase()) {
      documentWins.push({ field: fillResult.field, sheetValue, documentValue: fillResult.value, documentLabel: fillResult.source_file });
    }
  }
  const keptCorrections = Object.keys(sheetValues).filter((fieldKey) => correctedValues[fieldKey] && correctedValues[fieldKey] !== sheetValues[fieldKey]);
  return { documentWins, keptCorrections };
}

/** {needsRowChoice, sheetRows} when the file has several clients and no row was picked; else the import report. */
export async function importSheetIntoCase(caseEntry, fileBytes, fileName, requestedRowNumber) {
  const { rows, sheetName } = await readSheetFile(fileBytes, fileName);
  const batchColumns = await buildBatchColumns(caseEntry.formId);
  const columnMatch = matchSheetColumns(rows, batchColumns);
  const { label: formLabel } = await fetchFormRules(caseEntry.formId);

  const keyRowCellCount = columnMatch.matchedFieldCount + columnMatch.unknownHeadings.length;
  if (columnMatch.isOurTemplate && columnMatch.unknownHeadings.length > keyRowCellCount * MAXIMUM_FOREIGN_KEY_SHARE) {
    throw new SheetFileError(`This looks like the template for a different form (it has ${columnMatch.unknownHeadings.slice(0, 3).join(", ")}…). Download the template for ${formLabel}.`);
  }
  if (columnMatch.matchedFieldCount < MINIMUM_MATCHED_FIELD_COUNT) {
    throw new SheetFileError(`None of the column headings match ${formLabel}. Use the Excel template from Form setup, or name the columns like the form's fields.`);
  }
  const sheetRows = listSheetRows(rows, columnMatch);
  if (!sheetRows.length) throw new SheetFileError("The sheet has headings but no client rows.");

  const rowNumber = requestedRowNumber ?? (sheetRows.length === 1 ? sheetRows[0].rowNumber : null);
  if (rowNumber == null) return { needsRowChoice: true, sheetName, sheetRows };
  if (!sheetRows.some((sheetRow) => sheetRow.rowNumber === rowNumber)) throw new SheetFileError(`Row ${rowNumber} has no client data.`);

  const { typedValues, panValues, clientReference, report } = buildRowValues(rows, rowNumber, columnMatch, batchColumns);
  // A new import replaces the previous sheet values completely, so nothing stale from another row stays behind.
  await updateCase(caseEntry.id, { typedValues, sheetImport: { fileName, sheetName, rowNumber, clientReference, importedAt: new Date().toISOString() } });
  storeTypedPanValues(caseEntry.id, panValues);
  const refilledCase = { ...caseEntry, typedValues };
  await fillCase(refilledCase);
  await updateCase(caseEntry.id, { isFilled: true });
  const { documentWins, keptCorrections } = await compareWithFilledForm(caseEntry.id, { ...typedValues, ...panValues });

  return {
    needsRowChoice: false, sheetName, rowNumber, clientReference,
    appliedFieldCount: Object.keys(typedValues).length + Object.keys(panValues).length,
    panFieldsKeptInMemory: Object.keys(panValues),
    unknownHeadings: columnMatch.unknownHeadings, duplicateFields: columnMatch.duplicateFields,
    documentWins, keptCorrections, ...report,
  };
}
