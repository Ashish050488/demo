// The dynamic "upload case" manifest: one JSON file tracking every in-progress/completed upload-driven case,
// under data/uploads/manifest.json (gitignored). This IS the job-status store too (no separate in-memory map)
// - OCR progress is written here as it happens, so GET polling just rereads this file.
//
// Every route that takes an upload-case id MUST resolve it through getUploadCase() first (manifest lookup) -
// never build a filesystem path from a request-supplied id before that lookup succeeds. IDs are server-
// generated (crypto.randomUUID()), never derived from anything the client sends.
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, mkdir, rm, rename } from "node:fs/promises";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
export const UPLOADS_DIR = path.join(ROOT, "data", "uploads");
const MANIFEST_PATH = path.join(UPLOADS_DIR, "manifest.json");
const OUTPUT_DIR = path.join(ROOT, "output");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every read-modify-write below goes through this queue. Without it, uploading several files in one batch
// kicks off that many concurrent classifyAndOcrInBackground() calls, each doing its own
// read-manifest/modify/write-manifest with no locking - two writeFile calls landing on the same path at once
// can interleave their bytes and corrupt the file (confirmed: this is exactly what produced the truncated/
// doubled JSON reported after a multi-file upload). Mirrors the same pattern already used for
// demo_store.xlsx in server/store.js, applied here too, plus an atomic temp-file-then-rename write.
let queue = Promise.resolve();
function serialize(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => {}, () => {});
  return run;
}

async function readManifestRaw() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, "utf-8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function writeManifestRaw(m) {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const tmp = `${MANIFEST_PATH}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(m, null, 2));
  await rename(tmp, MANIFEST_PATH); // atomic swap - a concurrent reader never sees a half-written file
}

function readManifest() {
  return serialize(readManifestRaw);
}

/** Read-modify-write under the same lock as every other manifest write, so two concurrent updates (e.g. two
 * documents from the same batch finishing OCR at once) never race each other. */
function updateManifest(mutator) {
  return serialize(async () => {
    const m = await readManifestRaw();
    const result = await mutator(m);
    await writeManifestRaw(m);
    return result;
  });
}

/** A new upload case for the given (already-detected) form type. Returns the full entry. */
export async function createUploadCase(formType) {
  const id = crypto.randomUUID();
  const entry = {
    id, formType, camsVariant: null, createdAt: new Date().toISOString(),
    documents: [], // [{id, filename, ext, status, message, assignedNominee, docType, qrFound, foundName, ...}]
    useSampleData: false, // demo_data.xlsx fields stay withheld ("Not provided") until this is explicitly set
    filled: false, resultsPath: null, pdfPath: null,
  };
  await updateManifest((m) => { m[id] = entry; });
  await mkdir(path.join(UPLOADS_DIR, id), { recursive: true });
  return entry;
}

/** Strict: only ever returns an entry for an id that is (a) a well-formed UUID and (b) actually present in
 * the manifest. Callers use this as the sole gate before touching any path derived from the id. */
export async function getUploadCase(id) {
  if (typeof id !== "string" || !UUID_RE.test(id)) return null;
  const m = await readManifest();
  return m[id] || null;
}

export async function updateUploadCase(id, patch) {
  return updateManifest((m) => {
    if (!m[id]) return null;
    m[id] = { ...m[id], ...patch };
    return m[id];
  });
}

/** Appends a new document record (status "processing") and returns it. */
export async function addDocument(id, doc) {
  return updateManifest((m) => {
    if (!m[id]) return null;
    m[id].documents.push(doc);
    return doc;
  });
}

export async function updateDocument(id, docId, patch) {
  return updateManifest((m) => {
    if (!m[id]) return null;
    const doc = m[id].documents.find((d) => d.id === docId);
    if (!doc) return null;
    Object.assign(doc, patch);
    return doc;
  });
}

/** Removes one document's manifest record and its file on disk. */
export async function removeDocument(id, docId) {
  const removedFilename = await updateManifest((m) => {
    if (!m[id]) return undefined;
    const doc = m[id].documents.find((d) => d.id === docId);
    if (!doc) return undefined;
    m[id].documents = m[id].documents.filter((d) => d.id !== docId);
    return doc.filename || null;
  });
  if (removedFilename === undefined) return false;
  if (removedFilename) await rm(path.join(UPLOADS_DIR, id, removedFilename), { force: true });
  return true;
}

/** Where an uploaded document lives on disk - only ever call with an id already confirmed by getUploadCase(). */
export function documentPath(id, filename) {
  return path.join(UPLOADS_DIR, id, filename);
}

export function uploadResultsPath(id) {
  return path.join(OUTPUT_DIR, `upload-${id}-results.json`);
}
export function uploadPdfPath(id) {
  return path.join(OUTPUT_DIR, `upload-${id}-prefilled.pdf`);
}
export function uploadRegeneratedPdfPath(id) {
  return path.join(OUTPUT_DIR, `upload-${id}-regenerated.pdf`);
}
export function uploadRegeneratedResultsPath(id) {
  return path.join(OUTPUT_DIR, `upload-${id}-regenerated-results.json`);
}

/** Removes everything for one upload case: its scans directory, any generated PDFs/results (original and
 * regenerated), and its manifest entry. Idempotent - missing files are not an error. */
export async function deleteUploadCase(id) {
  const existed = await updateManifest((m) => {
    if (!m[id]) return false;
    delete m[id];
    return true;
  });
  if (!existed) return false;
  await rm(path.join(UPLOADS_DIR, id), { recursive: true, force: true });
  for (const p of [uploadResultsPath(id), uploadPdfPath(id), uploadRegeneratedPdfPath(id), uploadRegeneratedResultsPath(id)]) {
    await rm(p, { force: true });
  }
  return true;
}
