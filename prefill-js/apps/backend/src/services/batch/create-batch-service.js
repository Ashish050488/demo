// Turns one uploaded Excel into a batch: every client row becomes one ordinary case per chosen form, holding that
// row's values (PAN kept in memory only, like everywhere else). With several forms, values one form names
// differently are translated across (see cross-form-values-helpers.js), and the client's documents are uploaded
// once - to the first form's case - and shared with the other forms' cases after they are read.
import { getFormDefinition } from "../../forms/form-registry.js";
import { fetchFormRules } from "../forms/form-files-service.js";
import { createCase, updateCase } from "../storage/case-store-service.js";
import { createBatch } from "../storage/batch-store-service.js";
import { storeTypedPanValues } from "../documents/identity-number-memory-service.js";
import { SheetFileError } from "./read-sheet-file-service.js";
import { readFormSheet } from "./read-form-sheet-service.js";
import { buildRowValues } from "./sheet-row-values-service.js";
import { deriveValuesForForm } from "./cross-form-values-helpers.js";

export const MAXIMUM_BATCH_ROW_COUNT = 50;

const normalizeReference = (clientReference) => String(clientReference || "").trim().toLowerCase();

function listReferenceWarnings(sheetRows) {
  const warnings = [];
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
  return { warnings, duplicateReferences };
}

/** Everything one form needs to read the sheet. */
async function readSheetForForm(formId, fileBytes, fileName, isCombinedSheet) {
  const [sheet, formRules] = await Promise.all([readFormSheet(formId, fileBytes, fileName, { isCombinedSheet }), fetchFormRules(formId)]);
  const relationshipOptions = getFormDefinition(formId).formConfiguration.tickboxes.find((tickbox) => tickbox.key === "relationship_option")?.options || [];
  return { formId, formRules, relationshipOptions, ...sheet, columnKeys: new Set(sheet.batchColumns.map((batchColumn) => batchColumn.key)) };
}

export async function createBatchFromSheet(formIds, fileBytes, fileName) {
  const isCombinedSheet = formIds.length > 1;
  const formSheets = [];
  for (const formId of formIds) formSheets.push(await readSheetForForm(formId, fileBytes, fileName, isCombinedSheet));
  const { sheetRows, sheetName, columnMatch } = formSheets[0];
  if (sheetRows.length > MAXIMUM_BATCH_ROW_COUNT) {
    throw new SheetFileError(`This sheet has ${sheetRows.length} clients - a batch takes up to ${MAXIMUM_BATCH_ROW_COUNT} for accuracy. Split it into smaller files.`);
  }
  const { warnings, duplicateReferences } = listReferenceWarnings(sheetRows);
  // On a combined sheet another form's columns are expected; only a column no chosen form reads is "not used".
  const unusedHeadings = columnMatch.unknownHeadings.filter((heading) => !formSheets.some((formSheet) => formSheet.columnKeys.has(heading)));
  if (unusedHeadings.length) warnings.unshift(`Columns not used: ${unusedHeadings.slice(0, 6).join(", ")}${unusedHeadings.length > 6 ? "…" : ""}`);

  const batchRows = [];
  const idTypeNotes = [];
  for (const sheetRow of sheetRows) {
    const rowByForm = formSheets.map((formSheet) => ({ formSheet, ...buildRowValues(formSheet.rows, sheetRow.rowNumber, formSheet.columnMatch, formSheet.batchColumns) }));
    let primaryCaseId = null;
    for (const [formIndex, formRow] of rowByForm.entries()) {
      const typedValues = { ...formRow.typedValues };
      const panValues = { ...formRow.panValues };
      for (const otherRow of rowByForm.filter((candidate) => candidate !== formRow)) {
        const derivedValues = deriveValuesForForm({
          targetRules: formRow.formSheet.formRules, targetColumnKeys: formRow.formSheet.columnKeys, targetValues: { ...typedValues, ...panValues },
          targetRelationshipOptions: formRow.formSheet.relationshipOptions,
          sourceRules: otherRow.formSheet.formRules, sourceValues: { ...otherRow.typedValues, ...otherRow.panValues },
        });
        Object.assign(typedValues, derivedValues.typedValues);
        Object.assign(panValues, derivedValues.panValues);
        for (const note of derivedValues.notes) {
          idTypeNotes.push(`${rowByForm[0].clientReference || `row ${sheetRow.rowNumber}`} nominee ${note.nomineeNumber} (has ${note.givenOption})`);
          if (!idTypeNotes.formLabel) idTypeNotes.formLabel = formRow.formSheet.formRules.label;
        }
      }
      const caseEntry = await createCase(formRow.formSheet.formId, { typedValues });
      storeTypedPanValues(caseEntry.id, panValues);
      if (formIndex === 0) primaryCaseId = caseEntry.id;
      const clientReference = rowByForm[0].clientReference || null;
      batchRows.push({
        rowNumber: sheetRow.rowNumber, formId: formRow.formSheet.formId, clientReference, displayName: sheetRow.displayName,
        caseId: caseEntry.id, documentsFromCaseId: formIndex === 0 ? null : primaryCaseId,
        isDuplicateReference: duplicateReferences.includes(normalizeReference(clientReference)),
        rowProblemCount: (formRow.report.invalidValues?.length || 0) + (formRow.report.unmatchedOptions?.length || 0),
      });
      await updateCase(caseEntry.id, {
        documentsFromCaseId: formIndex === 0 ? null : primaryCaseId,
        sheetImport: { fileName, sheetName, rowNumber: sheetRow.rowNumber, clientReference, importedAt: new Date().toISOString() },
      });
    }
  }
  if (idTypeNotes.length) {
    warnings.push(`${idTypeNotes.formLabel} takes one ID type for all nominees (nominee 1's) - type the matching ID number on review for: ${idTypeNotes.slice(0, 6).join(", ")}${idTypeNotes.length > 6 ? ` and ${idTypeNotes.length - 6} more` : ""}`);
  }
  const batchEntry = await createBatch({ formId: formIds[0], formIds, sheetFileName: fileName, sheetName, rows: batchRows, warnings });
  for (const batchRow of batchRows) await updateCase(batchRow.caseId, { batchId: batchEntry.id, batchStage: "waiting" });
  return batchEntry;
}
