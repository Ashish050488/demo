// A case's uploaded documents: upload (read in the background), assign to a nominee, view, remove.
import path from "node:path";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { sendData, ApiError, ERROR_CODES } from "../../helpers/api-response-helpers.js";
import { addCaseDocument, updateCaseDocument, removeCaseDocument, getDocumentPath } from "../../services/storage/case-store-service.js";
import { processUploadedDocument, DOCUMENT_STATUSES } from "../../services/documents/process-document-service.js";
import { deleteIdentityRecord } from "../../services/documents/identity-number-memory-service.js";
import { renderPage } from "../../services/pdf/render-page-service.js";

export const MAXIMUM_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024;
export const MAXIMUM_DOCUMENTS_PER_CASE = 10;
const ALLOWED_DOCUMENT_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const ALLOWED_DOCUMENT_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const NOMINEE_NUMBERS = [1, 2, 3];

/** Why one saved upload can't be accepted, or null. */
function findRejectionReason(uploadedFile, acceptedSoFarCount) {
  const extension = path.extname(uploadedFile.originalname).toLowerCase();
  if (!ALLOWED_DOCUMENT_EXTENSIONS.has(extension) || !ALLOWED_DOCUMENT_MIME_TYPES.has(uploadedFile.mimetype)) return "unsupported file type";
  if (uploadedFile.size > MAXIMUM_DOCUMENT_SIZE_BYTES) return "file too large (max 15MB)";
  if (acceptedSoFarCount >= MAXIMUM_DOCUMENTS_PER_CASE) return `too many documents (max ${MAXIMUM_DOCUMENTS_PER_CASE} per case)`;
  return null;
}

/** Each file is checked on its own after saving, so one bad file never aborts the rest of the batch. */
export async function handleUploadDocuments(request, response) {
  const { caseEntry } = request;
  const uploadedFiles = request.files || [];
  if (!uploadedFiles.length) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "No files uploaded");
  const uploadResults = [];
  let acceptedCount = caseEntry.documents.length;
  for (const uploadedFile of uploadedFiles) {
    const rejectionReason = findRejectionReason(uploadedFile, acceptedCount);
    if (rejectionReason) {
      await rm(uploadedFile.path, { force: true });
      uploadResults.push({ filename: uploadedFile.originalname, isAccepted: false, reason: rejectionReason });
      continue;
    }
    const documentId = path.basename(uploadedFile.filename, path.extname(uploadedFile.filename)).replace(/^doc-/, "");
    await addCaseDocument(caseEntry.id, {
      id: documentId, filename: uploadedFile.filename, originalName: uploadedFile.originalname,
      status: DOCUMENT_STATUSES.PROCESSING, message: null, docType: null, qrFound: null, assignedNominee: 1,
    });
    acceptedCount += 1;
    uploadResults.push({ filename: uploadedFile.originalname, isAccepted: true, documentId });
    processUploadedDocument(caseEntry.id, documentId, uploadedFile.path);
  }
  sendData(response, { uploadResults });
}

export async function handleAssignDocument(request, response) {
  const nomineeNumber = Number(request.body?.nomineeNumber);
  if (!NOMINEE_NUMBERS.includes(nomineeNumber)) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "nomineeNumber must be 1, 2 or 3");
  const updatedDocument = await updateCaseDocument(request.caseEntry.id, request.params.documentId, { assignedNominee: nomineeNumber, assignedManually: true, assignedBy: null });
  if (!updatedDocument) throw new ApiError(404, ERROR_CODES.NOT_FOUND, "No such document");
  sendData(response, { documentId: updatedDocument.id, nomineeNumber });
}

/** The uploaded scan itself, for "check this value against the card". Gone once the case is confirmed. */
export async function handleViewDocument(request, response) {
  const caseDocument = request.caseEntry.documents.find((candidate) => candidate.id === request.params.documentId);
  if (!caseDocument?.filename) throw new ApiError(404, ERROR_CODES.NOT_FOUND, "No such document");
  const documentPath = getDocumentPath(request.caseEntry.id, caseDocument.filename);
  if (!existsSync(documentPath)) throw new ApiError(410, ERROR_CODES.DOCUMENT_DELETED, "This document was deleted when the case was confirmed");
  response.set("Cache-Control", "no-store");
  if (/\.pdf$/i.test(caseDocument.filename)) {
    const { png } = await renderPage(documentPath, 1, { scale: 2.5 });
    return response.type("png").send(png);
  }
  response.sendFile(documentPath);
}

export async function handleRemoveDocument(request, response) {
  const wasRemoved = await removeCaseDocument(request.caseEntry.id, request.params.documentId);
  deleteIdentityRecord(request.params.documentId);
  if (!wasRemoved) throw new ApiError(404, ERROR_CODES.NOT_FOUND, "No such document");
  sendData(response, { documentId: request.params.documentId });
}
