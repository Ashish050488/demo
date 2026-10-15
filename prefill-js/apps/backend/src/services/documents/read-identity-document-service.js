// ID numbers (PAN / passport / driving licence) live only in memory (identity-number-memory-service.js). A
// server restart empties that memory while the uploaded document may still be on disk; this re-reads such a
// document on demand so the number comes back - still never written anywhere but memory.
import { existsSync } from "node:fs";
import { readScanTextInBackground } from "../ocr/scan-ocr-pool-service.js";
import { extractPanFields } from "./pan-extract-service.js";
import { extractPassportFields, extractDlFields } from "./passport-and-licence-extract-service.js";
import { storeIdentityRecord, getIdentityRecord } from "./identity-number-memory-service.js";
import { getDocumentPath } from "../storage/case-store-service.js";
import { pickBestReading } from "../ocr/text-layout-helpers.js";

export const IDENTITY_DOCUMENT_TYPES = new Set(["pan", "passport", "driving_licence"]);

const EXTRACTION_BY_DOCUMENT_TYPE = {
  pan: { extract: extractPanFields, keys: ["panNumber", "name", "fatherName", "dob"] },
  passport: { extract: extractPassportFields, keys: ["passportNumber", "name", "dob", "address"] },
  driving_licence: { extract: extractDlFields, keys: ["dlNumber", "name", "dob", "address"] },
};

/** Best-by-confidence merge of one ID document's fields across every OCR pass -> the in-memory record. */
export function buildIdentityRecord(documentType, linesByPass) {
  const extraction = EXTRACTION_BY_DOCUMENT_TYPE[documentType];
  if (!extraction) return null;
  const extractedByPass = linesByPass.map((lines) => extraction.extract(lines));
  const bestByKey = Object.fromEntries(extraction.keys.map((key) => [key, pickBestReading(extractedByPass.map((extracted) => extracted[key]))]));
  const identityRecord = {};
  for (const key of extraction.keys) identityRecord[key] = bestByKey[key]?.value ?? null;
  identityRecord.nameConfidence = bestByKey.name?.confidence ?? null;
  identityRecord.dobConfidence = bestByKey.dob?.confidence ?? null;
  identityRecord.addressConfidence = bestByKey.address?.confidence ?? null;
  return identityRecord;
}

/** For every ID document of this case whose in-memory record is gone, OCR it again from disk. */
export async function rereadMissingIdentityDocuments(caseEntry) {
  const missingDocuments = caseEntry.documents.filter((document) => document.status === "done"
    && IDENTITY_DOCUMENT_TYPES.has(document.docType) && !getIdentityRecord(document.id) && document.filename
    && existsSync(getDocumentPath(caseEntry.id, document.filename)));
  if (!missingDocuments.length) return;
  try {
    for (const document of missingDocuments) {
      const { linesByPass } = await readScanTextInBackground(getDocumentPath(caseEntry.id, document.filename));
      const identityRecord = buildIdentityRecord(document.docType, linesByPass);
      if (identityRecord) storeIdentityRecord(document.id, identityRecord);
    }
  } catch (error) {
    console.error("re-reading an ID document failed:", error.message);
  }
}
