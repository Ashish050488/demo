// "Fill from Excel" for one case: read the file, match its columns to this form, pick the client's row, store the
// row as the case's sheet values (PAN in memory only), refill, and report everything the reviewer should know.
import { readFile } from "node:fs/promises";
import { updateCase, getFillResultsPath } from "../storage/case-store-service.js";
import { fetchCorrectedValues } from "../storage/decision-log-service.js";
import { storeTypedPanValues } from "../documents/identity-number-memory-service.js";
import { fillCase } from "../fill/fill-case-service.js";
import { SheetFileError } from "./read-sheet-file-service.js";
import { readFormSheet } from "./read-form-sheet-service.js";
import { buildRowValues } from "./sheet-row-values-service.js";

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
  const { rows, sheetName, batchColumns, columnMatch, sheetRows } = await readFormSheet(caseEntry.formId, fileBytes, fileName);

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
