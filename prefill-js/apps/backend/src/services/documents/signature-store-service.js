// A client's signature image, one per case, kept next to the case's scans (local only; removed with the case).
// Either an uploaded image or a typed name. Never read from an ID card and never made up: someone gives it, or the
// places stay blank for a pen.
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { getCaseUploadDirectory } from "../storage/case-store-service.js";

const EXTENSION_BY_MIME_TYPE = { "image/png": "png", "image/jpeg": "jpg" };
export const SIGNATURE_MIME_TYPES = Object.keys(EXTENSION_BY_MIME_TYPE);

const signaturePathFor = (caseId, extension) => path.join(getCaseUploadDirectory(caseId), `signature.${extension}`);

/** {path, mimeType} of the case's signature, or null. */
export function findSignature(caseId) {
  for (const [mimeType, extension] of Object.entries(EXTENSION_BY_MIME_TYPE)) {
    const signaturePath = signaturePathFor(caseId, extension);
    if (existsSync(signaturePath)) return { path: signaturePath, mimeType };
  }
  return null;
}

const typedSignaturePathFor = (caseId) => path.join(getCaseUploadDirectory(caseId), "signature-typed.json");

/** A typed ("digital") signature: just the name, printed in a signature-style font. null when there is none. */
export function findTypedSignature(caseId) {
  const typedPath = typedSignaturePathFor(caseId);
  return existsSync(typedPath) ? JSON.parse(readFileSync(typedPath, "utf-8")).name || null : null;
}

/** Removes both kinds - a case has one signature at a time. */
export async function deleteSignature(caseId) {
  for (const extension of Object.values(EXTENSION_BY_MIME_TYPE)) await rm(signaturePathFor(caseId, extension), { force: true });
  await rm(typedSignaturePathFor(caseId), { force: true });
}

export async function saveTypedSignature(caseId, name) {
  await deleteSignature(caseId);
  await mkdir(getCaseUploadDirectory(caseId), { recursive: true });
  await writeFile(typedSignaturePathFor(caseId), JSON.stringify({ name }));
}

export async function saveSignature(caseId, bytes, mimeType) {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  if (!extension) throw new Error("signature must be a PNG or JPG image");
  await deleteSignature(caseId);
  await mkdir(getCaseUploadDirectory(caseId), { recursive: true });
  await writeFile(signaturePathFor(caseId, extension), bytes);
}

/** A client's second form (same Excel row) uses the signature uploaded for the first. */
export async function copySignature(fromCaseId, toCaseId) {
  const typedName = findTypedSignature(fromCaseId);
  if (typedName && !findSignature(toCaseId) && !findTypedSignature(toCaseId)) { await saveTypedSignature(toCaseId, typedName); return; }
  const signature = findSignature(fromCaseId);
  if (!signature || findSignature(toCaseId)) return;
  await mkdir(getCaseUploadDirectory(toCaseId), { recursive: true });
  await copyFile(signature.path, signaturePathFor(toCaseId, EXTENSION_BY_MIME_TYPE[signature.mimeType]));
}
