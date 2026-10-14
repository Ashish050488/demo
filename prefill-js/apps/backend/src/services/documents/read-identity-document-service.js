// ID numbers (PAN / passport / driving licence) live only in memory (identity-number-memory-service.js). A
// server restart empties that memory while the uploaded document may still be on disk; this re-reads such a
// document on demand so the number comes back - still never written anywhere but memory.
import { existsSync } from "node:fs";
import { createEnglishOcrWorker, readScanText } from "../ocr/scan-ocr-service.js";
import { extractPanFields } from "./pan-extract-service.js";
import { extractPassportFields, extractDlFields } from "./passport-and-licence-extract-service.js";
import { storeIdentityRecord, getIdentityRecord } from "./identity-number-memory-service.js";
import { getDocumentPath } from "../storage/case-store-service.js";
import { TESSDATA_DIRECTORY } from "../../config/paths-config.js";

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
  const bestByKey = {};
  for (const lines of linesByPass) {
    const extracted = extraction.extract(lines);
    for (const key of extraction.keys) {
      if (extracted[key] && (!bestByKey[key] || extracted[key].confidence > bestByKey[key].confidence)) bestByKey[key] = extracted[key];
    }
  }
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
  const worker = await createEnglishOcrWorker(TESSDATA_DIRECTORY);
  try {
    for (const document of missingDocuments) {
      const { linesByPass } = await readScanText(worker, getDocumentPath(caseEntry.id, document.filename));
      const identityRecord = buildIdentityRecord(document.docType, linesByPass);
      if (identityRecord) storeIdentityRecord(document.id, identityRecord);
    }
  } catch (error) {
    console.error("re-reading an ID document failed:", error.message);
  } finally {
    await worker.terminate();
  }
}
