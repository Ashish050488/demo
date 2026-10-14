// The upload flow's backend. Mounted at /api/upload.
//
// Security rules this file exists to enforce (all explicit, none guessed):
//  - every route takes the case id through requireCase, which resolves it via the manifest (server/uploads.js)
//    before any path is built from it - an id that isn't a well-formed UUID already present in the manifest
//    never reaches a filesystem call.
//  - the uploaded blank form is read only to detect which known form it is (src/formDetect.js) - its bytes
//    never touch disk.
//  - an uploaded document IS written to disk (data/uploads/<caseId>/doc-<id>.ext) for OCR, but no route here
//    ever serves it back - only extracted status/fields, and Aadhaar fields only ever carry the last 4 digits.
//  - on confirm, that case's uploaded documents are deleted automatically (data/uploads/<caseId>); the manual
//    delete route removes everything else (manifest entry, generated PDFs/results, demo_store.xlsx rows).
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";

import { detectForm, SUPPORTED_FORMS } from "../src/formDetect.js";
import { createEnglishWorker, ocrScanDetailed } from "../src/fillkit.js";
import { classifyDocument, DOC_TYPE_LABELS, AADHAAR_DOC_TYPES, UNSUPPORTED_DOC_MESSAGE } from "../src/docClassify.js";
import { validatorForField } from "../src/fieldValidate.js";
import { hasDecodableQr } from "../src/qrPeek.js";
import { extractPanFields, maskPan } from "../src/pan.js";
import { extractIdDoc } from "./idRead.js";
import { setPan, getPan, clearPan } from "./panMemory.js";
import {
  createUploadCase, getUploadCase, updateUploadCase, addDocument, updateDocument, removeDocument,
  deleteUploadCase, UPLOADS_DIR,
} from "./uploads.js";
import { runUploadFill } from "./uploadFill.js";
import { confirmCase, recordCorrection, deleteCaseRows, listCases } from "./store.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const TESSDATA = path.join(ROOT, "tessdata");

const MAX_FILE_BYTES = 15 * 1024 * 1024;
// A ceiling well above MAX_FILE_BYTES for multer's own (whole-request-aborting) limit - see the note above
// documentsUpload: the real per-file 15MB check happens after the file is saved, so one oversized file in a
// batch is rejected on its own instead of aborting every file in the request.
const MULTER_HARD_CEILING_BYTES = 40 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;
const MAX_DOCUMENTS_PER_CASE = 10;
const ALLOWED_DOC_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const ALLOWED_DOC_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

const router = express.Router();

async function requireCase(req, res, next) {
  const entry = await getUploadCase(req.params.caseId);
  if (!entry) return res.status(404).json({ error: "no such upload case" });
  req.uploadCase = entry;
  next();
}

function requireNominee(nominee) {
  return [1, 2, 3].includes(nominee);
}

// ---- detect the uploaded blank form (bytes never written to disk) ----
const detectUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === "application/pdf" && /\.pdf$/i.test(file.originalname);
    cb(ok ? null : new Error("UNSUPPORTED_FILE_TYPE"), ok);
  },
});

router.get("/supported-forms", (req, res) => res.json({ forms: SUPPORTED_FORMS }));

// A mask-on-read view of demo_store.xlsx's Cases sheet, for the "Saved records" screen - the file itself is
// never served. Same last-4-only convention as server/index.js's maskField().
function maskRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v && /^(id_aadhaar_last4|id_details|id_number)/.test(k) ? `XXXX XXXX ${v}` : v;
  }
  return out;
}
router.get("/records", async (req, res, next) => {
  try {
    const rows = await listCases();
    res.json({ rows: rows.map(maskRow) });
  } catch (err) { next(err); }
});

router.post("/detect-form", detectUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no file" });
    const { formType, needsVariant } = await detectForm(req.file.buffer);
    if (!formType) return res.status(422).json({ error: "not supported yet", formType: null });
    const entry = await createUploadCase(formType);
    res.json({ caseId: entry.id, formType, needsVariant });
  } catch (err) { next(err); }
});

router.post("/:caseId/variant", requireCase, async (req, res, next) => {
  try {
    if (req.uploadCase.formType !== "cams") return res.status(400).json({ error: "this case's form has no variant to choose" });
    const variant = req.body?.variant;
    if (!["360one", "hdfc"].includes(variant)) return res.status(400).json({ error: "variant must be '360one' or 'hdfc'" });
    const entry = await updateUploadCase(req.params.caseId, { camsVariant: variant });
    res.json({ caseId: entry.id, camsVariant: entry.camsVariant });
  } catch (err) { next(err); }
});

// "Fill with sample demo data": one-way, explicit opt-in. Until this is called, demo_data.xlsx never
// contributes anything to this case (server/uploadFill.js's getValue checks this flag for every excel-
// sourced field). The caller still needs to POST /run again afterward to regenerate results with it applied.
router.post("/:caseId/sample-data", requireCase, async (req, res, next) => {
  try {
    const { caseId } = req.params;
    const variant = req.body?.variant;
    if (req.uploadCase.formType === "cams" && !req.uploadCase.camsVariant) {
      if (!["360one", "hdfc"].includes(variant)) {
        return res.status(409).json({ error: "needs_variant", message: "choose a fund house (360one or hdfc) first" });
      }
      await updateUploadCase(caseId, { camsVariant: variant });
    }
    const entry = await updateUploadCase(caseId, { useSampleData: true });
    res.json({ caseId: entry.id, useSampleData: entry.useSampleData, camsVariant: entry.camsVariant });
  } catch (err) { next(err); }
});

// ---- multi-file document upload (replaces the old one-slot-per-nominee routes) ----
// fileFilter accepts everything here on purpose: multer aborts the WHOLE request if fileFilter rejects even
// one file in an .array() batch (confirmed against multer's own source, lib/make-middleware.js - a
// fileFilter error always calls abortWithError, which tears down every file already written). Real
// type/size validation happens below, per file, after each is saved, so one bad file in a batch of 10 is
// rejected on its own and the rest still go through.
const documentsUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(UPLOADS_DIR, req.params.caseId)),
    filename: (req, file, cb) => {
      const docId = crypto.randomUUID();
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `doc-${docId}${ext || ""}`);
    },
  }),
  limits: { fileSize: MULTER_HARD_CEILING_BYTES, files: MAX_FILES_PER_REQUEST },
  fileFilter: (req, file, cb) => cb(null, true),
});

const nameKey = (n) => (n || "").toLowerCase().replace(/[^a-z ]/g, " ").split(/s+/).filter((w) => w.length > 1).sort().join(" ");
const nameOf = (d) => d.foundName || getPan(d.id)?.name || null;
function sameName(a, b) {
  const A = nameKey(a).split(" "), B = nameKey(b).split(" ");
  if (!A[0] || !B[0]) return false;
  const shared = A.filter((w) => B.includes(w)).length;
  return shared >= Math.min(2, Math.min(A.length, B.length));
}

/** Put a freshly read document with the nominee whose other documents show the same name; a new name goes to
 * the first nominee with no documents yet. A document the user placed by hand is never moved. A document
 * with no name on it (e.g. Aadhaar back) joins the nominee of the most recent named document. */
async function autoAssign(caseId, docId) {
  const entry = await getUploadCase(caseId);
  const doc = entry?.documents.find((d) => d.id === docId);
  if (!doc || doc.assignedManually || doc.status !== "done") return;
  const others = entry.documents.filter((d) => d.id !== docId && d.status === "done");
  const name = nameOf(doc);
  let target = null;
  let by = null;
  if (name) {
    const match = others.find((d) => nameOf(d) && sameName(nameOf(d), name));
    if (match) { target = match.assignedNominee; by = "same name as another document"; }
    else {
      const named = new Set(others.filter((d) => nameOf(d)).map((d) => d.assignedNominee));
      target = [1, 2, 3].find((n) => !named.has(n)) || 1;
      by = named.size ? "new name - next free nominee" : "first person";
    }
  } else {
    const lastNamed = [...others].reverse().find((d) => nameOf(d));
    if (lastNamed) { target = lastNamed.assignedNominee; by = "no name on it - kept with the last named document"; }
  }
  if (target && (target !== doc.assignedNominee || by)) await updateDocument(caseId, docId, { assignedNominee: target, assignedBy: by });
}

/** Reuses the already-saved file at filePath (never re-reads from req after this point). Runs after the
 * response is already sent - failures land in the manifest as status "error", not as an unhandled rejection. */
async function classifyAndOcrInBackground(caseId, docId, filePath) {
  const worker = await createEnglishWorker(TESSDATA);
  try {
    const { fields, rawText, linesByPass } = await ocrScanDetailed(worker, filePath);
    const docType = classifyDocument({ fields, rawText });
    const qrFound = await hasDecodableQr(filePath).catch(() => false); // a QR-check failure shouldn't fail the whole document
    // Only an actual Aadhaar document ever contributes Aadhaar-style fields (name/dob/address/last-4) - a
    // PAN card, bank statement, or anything unrecognized gets its OCR text run through the same generic
    // extractor (src/aadhaar.js has no way to know it's looking at the wrong document), but that output is
    // discarded here rather than stored, so it can never leak into a nominee's fields later.
    const isAadhaarDoc = AADHAAR_DOC_TYPES.has(docType);

    const idDoc = extractIdDoc(docType, linesByPass); // PAN / passport / DL -> memory only
    if (idDoc) setPan(docId, idDoc);
    const panDoc = docType === "pan" ? idDoc : null;
    const idLabel = docType === "passport" ? "Passport" : "Driving licence";

    const message = idDoc && docType !== "pan"
      ? `${idLabel} added - ${idDoc.passportNumber || idDoc.dlNumber ? "number read" : "number not clearly readable"}${idDoc.name ? ", name" : ""}${idDoc.dob ? ", DOB" : ""}${idDoc.address ? ", address" : ""}`
      : docType === "unrecognized"
      ? "Not recognised - supported: Aadhaar (front/back/full), PAN card, passport, driving licence"
      : docType === "pan" ? (panDoc?.panNumber ? "PAN card added - number read" : "PAN card added - number not clearly readable")
        : UNSUPPORTED_DOC_MESSAGE[docType] || null;

    await updateDocument(caseId, docId, {
      status: docType === "unrecognized" ? "unrecognized" : "done", message, docType, qrFound,
      // Masked display only - never the plain number. maskPan() needs >=4 chars; a too-short OCR misread
      // just doesn't get a masked display rather than showing something wrong.
      panMaskedNumber: panDoc?.panNumber ? maskPan(panDoc.panNumber) : null,
      panNameFound: Boolean(panDoc?.name), panDobFound: Boolean(panDoc?.dob),
      foundName: isAadhaarDoc ? fields.name?.value ?? null : null,
      foundNameConfidence: isAadhaarDoc ? fields.name?.confidence ?? null : null,
      foundDob: isAadhaarDoc ? fields.dob?.value ?? null : null,
      foundDobConfidence: isAadhaarDoc ? fields.dob?.confidence ?? null : null,
      foundAddress: isAadhaarDoc ? fields.address?.value ?? null : null,
      foundAddressConfidence: isAadhaarDoc ? fields.address?.confidence ?? null : null,
      foundLast4: isAadhaarDoc ? fields.aadhaarLast4?.value ?? null : null,
      foundLast4Confidence: isAadhaarDoc ? fields.aadhaarLast4?.confidence ?? null : null,
    });
    await autoAssign(caseId, docId).catch((err) => console.error("auto-assign failed:", err.message));
  } catch (err) {
    await updateDocument(caseId, docId, { status: "error", message: "Reading this document failed" });
    console.error(`upload OCR failed (case ${caseId}, document ${docId}):`, err.message);
  } finally {
    await worker.terminate();
  }
}

router.post("/:caseId/documents", requireCase, documentsUpload.array("files", MAX_FILES_PER_REQUEST), async (req, res, next) => {
  try {
    const caseId = req.params.caseId;
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "no files" });

    const existingCount = req.uploadCase.documents.length;
    const results = [];
    let acceptedCount = 0;

    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const okType = ALLOWED_DOC_EXT.has(ext) && ALLOWED_DOC_MIME.has(file.mimetype);
      const okSize = file.size <= MAX_FILE_BYTES;
      const underCap = existingCount + acceptedCount < MAX_DOCUMENTS_PER_CASE;

      if (!okType) {
        await rm(file.path, { force: true });
        results.push({ filename: file.originalname, accepted: false, reason: "unsupported file type" });
        continue;
      }
      if (!okSize) {
        await rm(file.path, { force: true });
        results.push({ filename: file.originalname, accepted: false, reason: "file too large (max 15MB)" });
        continue;
      }
      if (!underCap) {
        await rm(file.path, { force: true });
        results.push({ filename: file.originalname, accepted: false, reason: `too many documents (max ${MAX_DOCUMENTS_PER_CASE} per case)` });
        continue;
      }

      const docId = path.basename(file.filename, ext).replace(/^doc-/, "");
      const doc = {
        id: docId, filename: file.filename, originalName: file.originalname, status: "processing", message: null,
        docType: null, qrFound: null, assignedNominee: 1,
        foundName: null, foundNameConfidence: null, foundDob: null, foundDobConfidence: null,
        foundAddress: null, foundAddressConfidence: null, foundLast4: null, foundLast4Confidence: null,
      };
      await addDocument(caseId, doc);
      acceptedCount++;
      results.push({ filename: file.originalname, accepted: true, docId });
      classifyAndOcrInBackground(caseId, docId, file.path);
    }

    res.json({ results });
  } catch (err) { next(err); }
});

router.post("/:caseId/documents/:docId/assign", requireCase, async (req, res, next) => {
  try {
    const nominee = Number(req.body?.nominee);
    if (!requireNominee(nominee)) return res.status(400).json({ error: "nominee must be 1, 2, or 3" });
    const doc = await updateDocument(req.params.caseId, req.params.docId, { assignedNominee: nominee, assignedManually: true });
    if (!doc) return res.status(404).json({ error: "no such document" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete("/:caseId/documents/:docId", requireCase, async (req, res, next) => {
  try {
    const ok = await removeDocument(req.params.caseId, req.params.docId);
    clearPan(req.params.docId);
    if (!ok) return res.status(404).json({ error: "no such document" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** Plain-language list of what was read from one document (labels only - no values). */
function readSummary(doc) {
  const mem = getPan(doc.id) || {};
  const out = [];
  if (doc.foundName || mem.name) out.push("Name");
  if (doc.foundDob || mem.dob) out.push("Date of birth");
  if (doc.foundAddress || mem.address) out.push("Address");
  if (doc.foundLast4) out.push("Aadhaar last 4");
  if (mem.panNumber) out.push("PAN number");
  if (mem.passportNumber) out.push("Passport number");
  if (mem.dlNumber) out.push("Licence number");
  return out;
}

router.get("/:caseId/status", requireCase, (req, res) => {
  // Status + extracted fields only (Aadhaar fields already last-4 only; docType/qrFound are metadata, not
  // content) - never the document file itself. originalName is the user's own filename (shown per the
  // "Upload documents" screen's spec); the server-side saved path (doc-<uuid>.ext) is never sent.
  const { id, formType, camsVariant, documents, filled, useSampleData } = req.uploadCase;
  const safeDocs = documents.map(({ id: docId, status, message, docType, qrFound, assignedNominee, originalName, panMaskedNumber, panNameFound, panDobFound }) =>
    ({ id: docId, status, message, docType, docTypeLabel: docType ? DOC_TYPE_LABELS[docType] : null, qrFound, assignedNominee, originalName, panMaskedNumber: (getPan(docId)?.panNumber || getPan(docId)?.passportNumber || getPan(docId)?.dlNumber) ?? panMaskedNumber, panNameFound, panDobFound, read: readSummary(documents.find((d) => d.id === docId)), assignedBy: documents.find((d) => d.id === docId)?.assignedBy || null }));
  res.json({ caseId: id, formType, camsVariant, filled, useSampleData, documents: safeDocs });
});

router.post("/:caseId/run", requireCase, async (req, res, next) => {
  try {
    const entry = req.uploadCase;
    const { results } = await runUploadFill(entry);
    await updateUploadCase(entry.id, { filled: true });
    const statusCounts = {};
    for (const r of results) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    res.json({ caseId: entry.id, statusCounts }); // field values live only in output/upload-<id>-results.json
  } catch (err) { next(err); }
});

router.post("/:caseId/confirm", requireCase, async (req, res, next) => {
  try {
    const entry = req.uploadCase;
    const rawFields = req.body?.fields;
    if (!rawFields || typeof rawFields !== "object") return res.status(400).json({ error: "need fields: {field: value}" });
    // Safety net, not the only check (the client validates as you type, and the OCR stage already rejects a
    // bad value at extraction) - a value that fails its field's shape check is dropped here rather than ever
    // written to the store, in case either of those was bypassed.
    const fields = {};
    const rejected = [];
    for (const [key, value] of Object.entries(rawFields)) {
      const validator = validatorForField(key);
      const check = validator ? validator(value) : { valid: true };
      if (check.valid) fields[key] = value; else rejected.push({ field: key, reason: check.reason });
    }
    await confirmCase({ caseId: entry.id, formType: entry.formType, camsVariant: entry.camsVariant, fields });
    await rm(path.join(UPLOADS_DIR, entry.id), { recursive: true, force: true });
    for (const doc of entry.documents) clearPan(doc.id); // every PAN number this case ever read, gone now too
    await updateUploadCase(entry.id, { confirmedAt: new Date().toISOString(), scansDeletedAt: new Date().toISOString() });
    res.json({ ok: true, caseId: entry.id, scansDeleted: true, rejected });
  } catch (err) { next(err); }
});

router.post("/:caseId/correct", requireCase, async (req, res, next) => {
  try {
    const { field, oldValue, newValue } = req.body || {};
    if (!field) return res.status(400).json({ error: "need field" });
    const result = await recordCorrection({ caseId: req.params.caseId, field, oldValue, newValue });
    res.json(result);
  } catch (err) { next(err); }
});

router.delete("/:caseId", requireCase, async (req, res, next) => {
  try {
    for (const doc of req.uploadCase.documents) clearPan(doc.id);
    await deleteUploadCase(req.params.caseId); // scans dir + generated PDFs/results + manifest entry
    await deleteCaseRows(req.params.caseId); // demo_store.xlsx rows
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err?.message === "UNSUPPORTED_FILE_TYPE") return res.status(415).json({ error: "unsupported file type" });
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "file too large" });
  next(err);
});

export default router;
