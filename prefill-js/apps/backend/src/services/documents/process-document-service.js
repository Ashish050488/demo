// Reads one saved upload in the background: OCR, classify, keep what it shows, then auto-assign it to a nominee.
// Failures land in the case store as status "error", never as an unhandled rejection.
import { createEnglishOcrWorker, readScanText } from "../ocr/scan-ocr-service.js";
import { hasDecodableQr } from "../ocr/qr-detect-service.js";
import { classifyDocument, AADHAAR_DOC_TYPES, UNSUPPORTED_DOC_MESSAGE } from "./classify-document-service.js";
import { maskPan } from "./pan-extract-service.js";
import { buildIdentityRecord } from "./read-identity-document-service.js";
import { storeIdentityRecord } from "./identity-number-memory-service.js";
import { assignDocumentToNominee } from "./assign-document-service.js";
import { updateCaseDocument } from "../storage/case-store-service.js";
import { TESSDATA_DIRECTORY } from "../../config/paths-config.js";

export const DOCUMENT_STATUSES = { PROCESSING: "processing", DONE: "done", UNRECOGNIZED: "unrecognized", ERROR: "error" };

function describeReadResult(documentType, identityRecord) {
  if (documentType === "unrecognized") return "Not recognised - supported: Aadhaar (front/back/full), PAN card, passport, driving licence";
  if (documentType === "pan") return identityRecord?.panNumber ? "PAN card added - number read" : "PAN card added - number not clearly readable";
  if (identityRecord) {
    const documentWord = documentType === "passport" ? "Passport" : "Driving licence";
    const hasNumber = identityRecord.passportNumber || identityRecord.dlNumber;
    const extras = ["name", "dob", "address"].filter((key) => identityRecord[key]).map((key) => (key === "dob" ? "DOB" : key));
    return `${documentWord} added - ${hasNumber ? "number read" : "number not clearly readable"}${extras.map((extra) => `, ${extra}`).join("")}`;
  }
  return UNSUPPORTED_DOC_MESSAGE[documentType] || null;
}

/** Only an actual Aadhaar contributes Aadhaar-style fields - anything else's incidental text is discarded. */
function pickAadhaarFields(isAadhaarDocument, fields) {
  const pick = (key) => (isAadhaarDocument ? fields[key]?.value ?? null : null);
  const pickConfidence = (key) => (isAadhaarDocument ? fields[key]?.confidence ?? null : null);
  return {
    foundName: pick("name"), foundNameConfidence: pickConfidence("name"),
    foundDob: pick("dob"), foundDobConfidence: pickConfidence("dob"),
    foundAddress: pick("address"), foundAddressConfidence: pickConfidence("address"),
    foundLast4: pick("aadhaarLast4"), foundLast4Confidence: pickConfidence("aadhaarLast4"),
  };
}

export async function processUploadedDocument(caseId, documentId, filePath) {
  const worker = await createEnglishOcrWorker(TESSDATA_DIRECTORY);
  try {
    const { fields, rawText, linesByPass } = await readScanText(worker, filePath);
    const documentType = classifyDocument({ fields, rawText });
    const hasQrCode = await hasDecodableQr(filePath).catch(() => false);
    const identityRecord = buildIdentityRecord(documentType, linesByPass); // PAN / passport / DL -> memory only
    if (identityRecord) storeIdentityRecord(documentId, identityRecord);
    const panRecord = documentType === "pan" ? identityRecord : null;
    await updateCaseDocument(caseId, documentId, {
      status: documentType === "unrecognized" ? DOCUMENT_STATUSES.UNRECOGNIZED : DOCUMENT_STATUSES.DONE,
      message: describeReadResult(documentType, identityRecord), docType: documentType, qrFound: hasQrCode,
      panMaskedNumber: panRecord?.panNumber ? maskPan(panRecord.panNumber) : null,
      ...pickAadhaarFields(AADHAAR_DOC_TYPES.has(documentType), fields),
    });
    await assignDocumentToNominee(caseId, documentId).catch((error) => console.error("auto-assign failed:", error.message));
  } catch (error) {
    await updateCaseDocument(caseId, documentId, { status: DOCUMENT_STATUSES.ERROR, message: "Reading this document failed" });
    console.error(`document OCR failed (case ${caseId}, document ${documentId}):`, error.message);
  } finally {
    await worker.terminate();
  }
}
