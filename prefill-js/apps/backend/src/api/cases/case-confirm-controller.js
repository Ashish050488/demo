// Confirm: check the whole form (the same check the review screen runs), save to the Google Sheet without any
// PAN number, then delete the case's uploaded scans and every ID number held in memory for it.
import { rm } from "node:fs/promises";
import { checkForm } from "@prefill/shared";
import { sendData, ApiError, ERROR_CODES } from "../../helpers/api-response-helpers.js";
import { fetchFormRules } from "../../services/forms/form-files-service.js";
import { updateCase, getCaseUploadDirectory } from "../../services/storage/case-store-service.js";
import { deleteIdentityRecord } from "../../services/documents/identity-number-memory-service.js";
import { removeNeverStoredFields } from "../../services/sheets/privacy-filter-helpers.js";
import { saveCaseToSheet, SHEET_ERROR_CODES } from "../../services/sheets/google-sheet-service.js";

/** Body: {fieldValues: {fieldKey: value}}. */
export async function handleConfirmCase(request, response) {
  const { caseEntry } = request;
  const fieldValues = request.body?.fieldValues;
  if (!fieldValues || typeof fieldValues !== "object") throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Need fieldValues: {fieldKey: value}");
  const { missing, invalid } = checkForm(await fetchFormRules(caseEntry.formId), fieldValues);
  if (missing.length || invalid.length) {
    throw new ApiError(422, ERROR_CODES.FORM_HAS_PROBLEMS, "Not saved - fix the flagged fields first", { missing, invalid });
  }
  const storableValues = removeNeverStoredFields(fieldValues);
  const notStoredFields = Object.keys(fieldValues).filter((fieldKey) => !(fieldKey in storableValues));
  let savedLocation;
  try {
    savedLocation = await saveCaseToSheet({ caseId: caseEntry.id, formId: caseEntry.formId, fieldValues: storableValues });
  } catch (error) {
    const httpStatus = error.code === SHEET_ERROR_CODES.NOT_CONNECTED ? 412 : 502;
    throw new ApiError(httpStatus, error.code || ERROR_CODES.INTERNAL_ERROR, `Not saved: ${error.message}. Your documents are kept - fix this and press Save again.`);
  }
  await rm(getCaseUploadDirectory(caseEntry.id), { recursive: true, force: true });
  for (const caseDocument of caseEntry.documents) deleteIdentityRecord(caseDocument.id);
  const confirmedAt = new Date().toISOString();
  await updateCase(caseEntry.id, { confirmedAt, scansDeletedAt: confirmedAt });
  sendData(response, {
    caseId: caseEntry.id, savedFieldCount: Object.keys(storableValues).length, notStoredFields,
    sheetTabName: savedLocation.tabName, sheetRowNumber: savedLocation.rowNumber, areScansDeleted: true,
  });
}
