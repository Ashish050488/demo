// A case's uploaded documents: upload (read in the background), assign to a nominee, view, remove.
import path from "node:path";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { sendData, ApiError, ERROR_CODES } from "../../helpers/api-response-helpers.js";
import { addCaseDocument, updateCaseDocument, updateCase, removeCaseDocument, getDocumentPath } from "../../services/storage/case-store-service.js";
import { processUploadedDocument, DOCUMENT_STATUSES } from "../../services/documents/process-document-service.js";
import { deleteIdentityRecord, getTypedPanValues, storeTypedPanValues } from "../../services/documents/identity-number-memory-service.js";
import { groupCaseDocuments } from "../../services/documents/group-documents-service.js";
import { renderPage } from "../../services/pdf/render-page-service.js";

export const MAXIMUM_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024;
export const MAXIMUM_DOCUMENTS_PER_CASE = 15; // about 3 nominees x (Aadhaar front + back, PAN, one more)
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
  const relativePaths = readRelativePaths(request.body?.relativePaths, uploadedFiles.length);
  for (const [fileIndex, uploadedFile] of uploadedFiles.entries()) {
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
      folderName: getParentFolderName(relativePaths[fileIndex]),
    });
    acceptedCount += 1;
    uploadResults.push({ filename: uploadedFile.originalname, isAccepted: true, documentId });
    processUploadedDocument(caseEntry.id, documentId, uploadedFile.path);
  }
  sendData(response, { uploadResults });
}

/** The browser's path for each file of a folder upload ("Tushar/pan.jpg"), as a JSON array in the same order. */
function readRelativePaths(relativePathsJson, fileCount) {
  try {
    const relativePaths = JSON.parse(relativePathsJson || "[]");
    return Array.isArray(relativePaths) && relativePaths.length === fileCount ? relativePaths.map((relativePath) => String(relativePath || "")) : [];
  } catch {
    return [];
  }
}

/** "Clients/Tushar/pan.jpg" -> "Tushar"; a loose file has no folder. */
function getParentFolderName(relativePath) {
  const pathParts = String(relativePath || "").split(/[\/]/).filter(Boolean);
  return pathParts.length > 1 ? pathParts[pathParts.length - 2].slice(0, 80) : null;
}

/** Moving one document by hand also pins the documents already at the target, so that person does not move away. */
export async function handleAssignDocument(request, response) {
  const nomineeNumber = Number(request.body?.nomineeNumber);
  if (!NOMINEE_NUMBERS.includes(nomineeNumber)) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "nomineeNumber must be 1, 2 or 3");
  const updatedDocument = await updateCaseDocument(request.caseEntry.id, request.params.documentId, { assignedNominee: nomineeNumber, assignedManually: true, assignedBy: null });
  if (!updatedDocument) throw new ApiError(404, ERROR_CODES.NOT_FOUND, "No such document");
  for (const caseDocument of request.caseEntry.documents) {
    if (caseDocument.id !== updatedDocument.id && caseDocument.assignedNominee === nomineeNumber && !caseDocument.assignedManually) {
      await updateCaseDocument(request.caseEntry.id, caseDocument.id, { assignedManually: true });
    }
  }
  await groupCaseDocuments(request.caseEntry.id);
  sendData(response, { documentId: updatedDocument.id, nomineeNumber });
}

/** Body: {firstNominee, secondNominee}. Swaps every document (and sheet-typed value) of the two nominees, so the
 * person who was Nominee 1 becomes Nominee 2 and the other way round. Saved corrections stay with their slot. */
export async function handleSwapNominees(request, response) {
  const firstNominee = Number(request.body?.firstNominee);
  const secondNominee = Number(request.body?.secondNominee);
  if (!NOMINEE_NUMBERS.includes(firstNominee) || !NOMINEE_NUMBERS.includes(secondNominee) || firstNominee === secondNominee) {
    throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Need two different nominee numbers (1, 2 or 3)");
  }
  const { caseEntry } = request;
  if (caseEntry.confirmedAt) throw new ApiError(409, "CASE_ALREADY_SAVED", "This case is already saved - start a new case to change nominees");
  const swapNumber = (nomineeNumber) => (nomineeNumber === firstNominee ? secondNominee : nomineeNumber === secondNominee ? firstNominee : nomineeNumber);
  for (const caseDocument of caseEntry.documents) {
    const swappedNominee = swapNumber(caseDocument.assignedNominee);
    if (swappedNominee !== caseDocument.assignedNominee) {
      await updateCaseDocument(caseEntry.id, caseDocument.id, { assignedNominee: swappedNominee, assignedManually: true, assignedBy: "swapped by you" });
    }
  }
  const swapFieldKeys = (fieldValues) => Object.fromEntries(Object.entries(fieldValues).map(([fieldKey, fieldValue]) => {
    const nomineeMatch = /_n(\d+)$/.exec(fieldKey);
    return [nomineeMatch ? fieldKey.replace(/_n\d+$/, `_n${swapNumber(Number(nomineeMatch[1]))}`) : fieldKey, fieldValue];
  }));
  await updateCase(caseEntry.id, { typedValues: swapFieldKeys(caseEntry.typedValues || {}) });
  storeTypedPanValues(caseEntry.id, swapFieldKeys(getTypedPanValues(caseEntry.id)));
  sendData(response, { firstNominee, secondNominee });
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
  await groupCaseDocuments(request.caseEntry.id);
  sendData(response, { documentId: request.params.documentId });
}
