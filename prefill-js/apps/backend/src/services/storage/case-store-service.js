// The case store: one JSON manifest tracking every case (data/uploads/manifest.json, gitignored). Document OCR
// progress is written here as it happens, so status polling just rereads it.
//
// Every route that takes a case id MUST resolve it through getCase() first - a filesystem path is never built
// from a request-supplied id before that lookup succeeds. Ids are server-generated UUIDs.
import crypto from "node:crypto";
import path from "node:path";
import { readFile, writeFile, mkdir, rm, rename } from "node:fs/promises";
import { UPLOADS_DIRECTORY, OUTPUT_DIRECTORY } from "../../config/paths-config.js";

const MANIFEST_PATH = path.join(UPLOADS_DIRECTORY, "manifest.json");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every read-modify-write goes through this queue, so concurrent OCR jobs finishing at once never interleave
// their writes; each write is temp-file-then-rename (atomic), so a reader never sees a half-written file.
let manifestQueue = Promise.resolve();
function runInManifestQueue(task) {
  const run = manifestQueue.then(task, task);
  manifestQueue = run.then(() => {}, () => {});
  return run;
}

async function readManifestFile() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, "utf-8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeManifestFile(manifest) {
  await mkdir(UPLOADS_DIRECTORY, { recursive: true });
  const temporaryPath = `${MANIFEST_PATH}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(manifest, null, 2));
  await rename(temporaryPath, MANIFEST_PATH);
}

function updateManifest(mutate) {
  return runInManifestQueue(async () => {
    const manifest = await readManifestFile();
    const mutationResult = await mutate(manifest);
    await writeManifestFile(manifest);
    return mutationResult;
  });
}

export async function createCase(formId, { batchId = null, typedValues = {} } = {}) {
  const caseId = crypto.randomUUID();
  const caseEntry = {
    id: caseId, formId, batchId, typedValues, createdAt: new Date().toISOString(),
    documents: [], isFilled: false, confirmedAt: null,
  };
  await updateManifest((manifest) => { manifest[caseId] = caseEntry; });
  await mkdir(path.join(UPLOADS_DIRECTORY, caseId), { recursive: true });
  return caseEntry;
}

/** Only returns an entry for a well-formed UUID that is actually in the manifest - the sole gate before any
 * path derived from a case id is touched. */
export async function getCase(caseId) {
  if (typeof caseId !== "string" || !UUID_PATTERN.test(caseId)) return null;
  const manifest = await runInManifestQueue(readManifestFile);
  return manifest[caseId] || null;
}

export async function listCases() {
  const manifest = await runInManifestQueue(readManifestFile);
  return Object.values(manifest);
}

export async function updateCase(caseId, changes) {
  return updateManifest((manifest) => {
    if (!manifest[caseId]) return null;
    manifest[caseId] = { ...manifest[caseId], ...changes };
    return manifest[caseId];
  });
}

export async function addCaseDocument(caseId, caseDocument) {
  return updateManifest((manifest) => {
    if (!manifest[caseId]) return null;
    manifest[caseId].documents.push(caseDocument);
    return caseDocument;
  });
}

export async function updateCaseDocument(caseId, documentId, changes) {
  return updateManifest((manifest) => {
    const caseDocument = manifest[caseId]?.documents.find((candidate) => candidate.id === documentId);
    if (!caseDocument) return null;
    Object.assign(caseDocument, changes);
    return caseDocument;
  });
}

/** Removes one document's record and its file on disk. */
export async function removeCaseDocument(caseId, documentId) {
  const removedFilename = await updateManifest((manifest) => {
    const caseDocument = manifest[caseId]?.documents.find((candidate) => candidate.id === documentId);
    if (!caseDocument) return undefined;
    manifest[caseId].documents = manifest[caseId].documents.filter((candidate) => candidate.id !== documentId);
    return caseDocument.filename || null;
  });
  if (removedFilename === undefined) return false;
  if (removedFilename) await rm(path.join(UPLOADS_DIRECTORY, caseId, removedFilename), { force: true });
  return true;
}

export function getCaseUploadDirectory(caseId) {
  return path.join(UPLOADS_DIRECTORY, caseId);
}

/** Only ever call with an id already confirmed by getCase(). */
export function getDocumentPath(caseId, filename) {
  return path.join(UPLOADS_DIRECTORY, caseId, filename);
}

export const getFillResultsPath = (caseId) => path.join(OUTPUT_DIRECTORY, `upload-${caseId}-results.json`);
export const getFilledPdfPath = (caseId) => path.join(OUTPUT_DIRECTORY, `upload-${caseId}-prefilled.pdf`);
export const getRegeneratedPdfPath = (caseId) => path.join(OUTPUT_DIRECTORY, `upload-${caseId}-regenerated.pdf`);
export const getRegeneratedResultsPath = (caseId) => path.join(OUTPUT_DIRECTORY, `upload-${caseId}-regenerated-results.json`);
export const getPreviewPdfPath = (caseId) => path.join(OUTPUT_DIRECTORY, `preview-${caseId}.pdf`);

/** Removes everything for one case: scans, generated PDFs/results, and its manifest entry. */
export async function deleteCase(caseId) {
  const didExist = await updateManifest((manifest) => {
    if (!manifest[caseId]) return false;
    delete manifest[caseId];
    return true;
  });
  if (!didExist) return false;
  await rm(getCaseUploadDirectory(caseId), { recursive: true, force: true });
  for (const generatedPath of [getFillResultsPath(caseId), getFilledPdfPath(caseId), getRegeneratedPdfPath(caseId), getRegeneratedResultsPath(caseId), getPreviewPdfPath(caseId)]) {
    await rm(generatedPath, { force: true });
  }
  return true;
}
