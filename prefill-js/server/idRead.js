// ID numbers (PAN / passport / driving licence) live only in memory (panMemory.js). A server restart empties
// that memory while the uploaded document is still on disk, which used to silently blank the PAN field. This
// re-reads such a document on demand so the number comes back - still never written anywhere but memory.
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createEnglishWorker, ocrScanDetailed } from "../src/fillkit.js";
import { extractPanFields } from "../src/pan.js";
import { extractPassportFields, extractDlFields } from "../src/idDocs.js";
import { setPan, getPan } from "./panMemory.js";
import { documentPath } from "./uploads.js";

const TESSDATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tessdata");
export const ID_DOC_TYPES = new Set(["pan", "passport", "driving_licence"]);

const SPEC = {
  pan: { extract: extractPanFields, keys: ["panNumber", "name", "fatherName", "dob"] },
  passport: { extract: extractPassportFields, keys: ["passportNumber", "name", "dob", "address"] },
  driving_licence: { extract: extractDlFields, keys: ["dlNumber", "name", "dob", "address"] },
};

/** Best-by-confidence merge of one ID document's fields across every OCR pass -> the in-memory record. */
export function extractIdDoc(docType, linesByPass) {
  const spec = SPEC[docType];
  if (!spec) return null;
  const best = {};
  for (const lines of linesByPass) {
    const got = spec.extract(lines);
    for (const k of spec.keys) if (got[k] && (!best[k] || got[k].confidence > best[k].confidence)) best[k] = got[k];
  }
  const out = {};
  for (const k of spec.keys) out[k] = best[k]?.value ?? null;
  out.nameConfidence = best.name?.confidence ?? null;
  out.dobConfidence = best.dob?.confidence ?? null;
  out.addressConfidence = best.address?.confidence ?? null;
  return out;
}

/** For every ID document of this case whose in-memory record is gone, OCR it again from disk. */
export async function rereadMissingIdDocs(entry) {
  // only documents whose file is still on disk (a confirmed case's scans are deleted)
  const missing = entry.documents.filter((d) => d.status === "done" && ID_DOC_TYPES.has(d.docType) && !getPan(d.id) && d.filename
    && existsSync(documentPath(entry.id, d.filename)));
  if (!missing.length) return;
  const worker = await createEnglishWorker(TESSDATA);
  try {
    for (const d of missing) {
      const { linesByPass } = await ocrScanDetailed(worker, documentPath(entry.id, d.filename));
      const rec = extractIdDoc(d.docType, linesByPass);
      if (rec) setPan(d.id, rec);
    }
  } catch (err) {
    console.error("re-reading an ID document failed:", err.message);
  } finally {
    await worker.terminate();
  }
}
