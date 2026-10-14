// The ONLY place a full PAN / passport / driving-licence number exists in this server: a plain in-process Map,
// never written to the case store, the Google Sheet, a log line or any file. Cleared per document on remove,
// and per case on confirm and on delete.
const identityRecordsByDocumentId = new Map(); // documentId -> { panNumber, passportNumber, dlNumber, name, dob, ... }

export function storeIdentityRecord(documentId, identityRecord) {
  identityRecordsByDocumentId.set(documentId, identityRecord);
}

export function getIdentityRecord(documentId) {
  return identityRecordsByDocumentId.get(documentId) || null;
}

export function deleteIdentityRecord(documentId) {
  identityRecordsByDocumentId.delete(documentId);
}

// PAN values typed into a batch / import sheet, per case - same rule as PAN read from a card: memory only.
const typedPanValuesByCaseId = new Map(); // caseId -> { fieldKey: PAN }

export function storeTypedPanValues(caseId, panValues) {
  if (Object.keys(panValues).length) typedPanValuesByCaseId.set(caseId, { ...panValues });
  else typedPanValuesByCaseId.delete(caseId);
}

export function getTypedPanValues(caseId) {
  return typedPanValuesByCaseId.get(caseId) || {};
}

export function deleteTypedPanValues(caseId) {
  typedPanValuesByCaseId.delete(caseId);
}
