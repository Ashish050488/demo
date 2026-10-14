// What the frontend may see about a case and its documents: status and labels of what was read - never the
// saved file path, and never a full ID number except the reviewer's own PAN view (PAN is shown in full by
// request; Aadhaar never is).
import { DOC_TYPE_LABELS } from "../../services/documents/classify-document-service.js";
import { getIdentityRecord } from "../../services/documents/identity-number-memory-service.js";

/** Labels only (no values) of what was read from one document. */
function listReadFieldLabels(caseDocument) {
  const identityRecord = getIdentityRecord(caseDocument.id) || {};
  const readLabels = [];
  if (caseDocument.foundName || identityRecord.name) readLabels.push("Name");
  if (caseDocument.foundDob || identityRecord.dob) readLabels.push("Date of birth");
  if (caseDocument.foundAddress || identityRecord.address) readLabels.push("Address");
  if (caseDocument.foundLast4) readLabels.push("Aadhaar last 4");
  if (identityRecord.panNumber) readLabels.push("PAN number");
  if (identityRecord.passportNumber) readLabels.push("Passport number");
  if (identityRecord.dlNumber) readLabels.push("Licence number");
  return readLabels;
}

export function toDocumentSummary(caseDocument) {
  const identityRecord = getIdentityRecord(caseDocument.id);
  return {
    id: caseDocument.id, originalName: caseDocument.originalName, status: caseDocument.status, message: caseDocument.message,
    documentType: caseDocument.docType, documentTypeLabel: caseDocument.docType ? DOC_TYPE_LABELS[caseDocument.docType] : null,
    hasQrCode: Boolean(caseDocument.qrFound), assignedNominee: caseDocument.assignedNominee,
    assignedBy: caseDocument.assignedBy || null, isAssignedManually: Boolean(caseDocument.assignedManually),
    identityNumber: identityRecord?.panNumber || identityRecord?.passportNumber || identityRecord?.dlNumber || caseDocument.panMaskedNumber || null,
    readFieldLabels: listReadFieldLabels(caseDocument),
  };
}

export function toCaseSummary(caseEntry) {
  return {
    id: caseEntry.id, formId: caseEntry.formId, batchId: caseEntry.batchId || null, createdAt: caseEntry.createdAt,
    isFilled: Boolean(caseEntry.isFilled), confirmedAt: caseEntry.confirmedAt || null,
    documents: caseEntry.documents.map(toDocumentSummary),
  };
}
