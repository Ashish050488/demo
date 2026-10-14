// Classifies one uploaded document by OCR label matching - never a guess. Takes the already-extracted
// Aadhaar-style fields (aadhaar-extract-service.js) plus the raw OCR text (for labels extraction doesn't look for, like
// "Address" or "Permanent Account Number"), and returns one of: "aadhaar_full", "aadhaar_front",
// "aadhaar_back", "pan", "bank_statement", "unrecognized".
//
// Only "aadhaar_full"/"aadhaar_front"/"aadhaar_back" are ever treated as a source of Aadhaar-style fields
// (name/dob/address/last-4) elsewhere in the pipeline - process-document-service.js discards fields.* for every
// other type before they're stored, specifically so a PAN card's or bank statement's incidental text can
// never leak into a nominee's Aadhaar-sourced fields (this is what caused the "nonsense data" bug reported
// after manual testing - that page's own OCR happened to contain a date-shaped string).
const PAN_LABEL_RE = /Permanent\s+Account\s+Number/i;
const PAN_PATTERN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/;
const ADDRESS_LABEL_RE = /\bAddress\b/i;
const CARE_OF_RE = /\bC\s*\/\s*O\b/i;
// A bank statement is recognised, never read - no field extractor exists for it (none of our supported
// forms has a bank-statement field yet); adding one later just means adding a case here plus an extractor
// module, the same contract PAN follows (pan-extract-service.js).
const BANK_STATEMENT_RE = /\b(Statement of Account|Account Statement|IFSC Code|Bank Statement)\b/i;

import { looksLikePassport, looksLikeDrivingLicence } from "./passport-and-licence-extract-service.js";

export function classifyDocument({ fields, rawText }) {
  const text = rawText || "";
  if (looksLikePassport(text)) return "passport";
  if (looksLikeDrivingLicence(text)) return "driving_licence";
  if (PAN_LABEL_RE.test(text) || PAN_PATTERN_RE.test(text)) return "pan";
  if (BANK_STATEMENT_RE.test(text)) return "bank_statement";

  const hasFrontSignal = Boolean(fields.dob || fields.name || fields.aadhaarLast4 || fields.gender);
  const hasBackSignal = Boolean(fields.address) || ADDRESS_LABEL_RE.test(text) || CARE_OF_RE.test(text);

  if (hasFrontSignal && hasBackSignal) return "aadhaar_full";
  if (hasFrontSignal) return "aadhaar_front";
  if (hasBackSignal) return "aadhaar_back";
  return "unrecognized";
}

export const AADHAAR_DOC_TYPES = new Set(["aadhaar_full", "aadhaar_front", "aadhaar_back"]);

export const DOC_TYPE_LABELS = {
  aadhaar_full: "Aadhaar (full)",
  aadhaar_front: "Aadhaar front",
  aadhaar_back: "Aadhaar back",
  pan: "PAN card",
  passport: "Passport",
  driving_licence: "Driving licence",
  bank_statement: "Bank statement",
  unrecognized: "Not recognised",
};

export const UNSUPPORTED_DOC_MESSAGE = {
  bank_statement: "None of the currently supported forms has a field for a bank statement - added, but not read.",
};
