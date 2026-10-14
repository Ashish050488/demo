// Turns one uploaded Excel into a batch: every client row becomes an ordinary case holding that row's values
// (PAN kept in memory only, like everywhere else). Documents are added to each case afterwards, then the batch
// is started and the runner fills each case as soon as its documents are read.
import { createCase, updateCase } from "../storage/case-store-service.js";
import { createBatch } from "../storage/batch-store-service.js";
import { storeTypedPanValues } from "../documents/identity-number-memory-service.js";
import { SheetFileError } from "./read-sheet-file-service.js";
import { readFormSheet } from "./read-form-sheet-service.js";
import { buildRowValues } from "./sheet-row-values-service.js";

export const MAXIMUM_BATCH_ROW_COUNT = 50;

const normalizeReference = (clientReference) => String(clientReference || "").trim().toLowerCase();

export async function createBatchFromSheet(formId, fileBytes, fileName) {
  const { rows, sheetName, batchColumns, columnMatch, sheetRows } = await readFormSheet(formId, fileBytes, fileName);
  if (sheetRows.length > MAXIMUM_BATCH_ROW_COUNT) {
    throw new SheetFileError(`This sheet has ${sheetRows.length} clients - a batch takes up to ${MAXIMUM_BATCH_ROW_COUNT} for accuracy. Split it into smaller files.`);
  }
  const warnings = [];
  if (columnMatch.unknownHeadings.length) warnings.push(`Columns not used: ${columnMatch.unknownHeadings.slice(0, 6).join(", ")}${columnMatch.unknownHeadings.length > 6 ? "…" : ""}`);
  const referenceCounts = new Map();
  for (const sheetRow of sheetRows) {
    const reference = normalizeReference(sheetRow.clientReference);
    if (reference) referenceCounts.set(reference, (referenceCounts.get(reference) || 0) + 1);
  }
  const duplicateReferences = [...referenceCounts].filter(([, rowCount]) => rowCount > 1).map(([reference]) => reference);
  const duplicateLabels = [...new Set(sheetRows.filter((sheetRow) => duplicateReferences.includes(normalizeReference(sheetRow.clientReference))).map((sheetRow) => sheetRow.clientReference.trim()))];
  if (duplicateLabels.length) warnings.push(`Same client reference on several rows: ${duplicateLabels.join(", ")} - their folders can't be matched, add documents by hand`);
  const rowsWithoutReference = sheetRows.filter((sheetRow) => !sheetRow.clientReference).map((sheetRow) => sheetRow.rowNumber);
  if (rowsWithoutReference.length) warnings.push(`No client reference on row ${rowsWithoutReference.join(", ")} - folders can't be matched to ${rowsWithoutReference.length === 1 ? "it" : "them"}`);

  const batchRows = [];
  for (const sheetRow of sheetRows) {
    const { typedValues, panValues, clientReference, report } = buildRowValues(rows, sheetRow.rowNumber, columnMatch, batchColumns);
    const caseEntry = await createCase(formId, { typedValues });
    storeTypedPanValues(caseEntry.id, panValues);
    const rowProblemCount = (report.invalidValues?.length || 0) + (report.unmatchedOptions?.length || 0);
    batchRows.push({
      rowNumber: sheetRow.rowNumber, clientReference: clientReference || null, displayName: sheetRow.displayName,
      caseId: caseEntry.id, isDuplicateReference: duplicateReferences.includes(normalizeReference(clientReference)), rowProblemCount,
    });
    await updateCase(caseEntry.id, { sheetImport: { fileName, sheetName, rowNumber: sheetRow.rowNumber, clientReference, importedAt: new Date().toISOString() } });
  }
  const batchEntry = await createBatch({ formId, sheetFileName: fileName, sheetName, rows: batchRows, warnings });
  for (const batchRow of batchRows) await updateCase(batchRow.caseId, { batchId: batchEntry.id, batchStage: "waiting" });
  return batchEntry;
}
