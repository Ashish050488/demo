// The batch store: one JSON file listing every batch (data/uploads/batches.json, gitignored). A batch is just a
// named list of cases - each row of the uploaded Excel is an ordinary case with `batchId` set, so review, save
// and download work exactly as for a single case.
import crypto from "node:crypto";
import path from "node:path";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { UPLOADS_DIRECTORY } from "../../config/paths-config.js";

const BATCHES_PATH = path.join(UPLOADS_DIRECTORY, "batches.json");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let batchesQueue = Promise.resolve();
function runInBatchesQueue(task) {
  const run = batchesQueue.then(task, task);
  batchesQueue = run.then(() => {}, () => {});
  return run;
}

async function readBatchesFile() {
  try {
    return JSON.parse(await readFile(BATCHES_PATH, "utf-8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeBatchesFile(batches) {
  await mkdir(UPLOADS_DIRECTORY, { recursive: true });
  const temporaryPath = `${BATCHES_PATH}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(batches, null, 2));
  await rename(temporaryPath, BATCHES_PATH);
}

const updateBatches = (mutate) => runInBatchesQueue(async () => {
  const batches = await readBatchesFile();
  const mutationResult = await mutate(batches);
  await writeBatchesFile(batches);
  return mutationResult;
});

/** rows: [{rowNumber, formId, clientReference, displayName, caseId, documentsFromCaseId}] in sheet order - one
 * per client per form. */
export async function createBatch({ formId, formIds = [formId], sheetFileName, sheetName, rows, warnings }) {
  const batchEntry = {
    id: crypto.randomUUID(), formId, formIds, sheetFileName, sheetName, rows, warnings,
    createdAt: new Date().toISOString(), startedAt: null,
  };
  await updateBatches((batches) => { batches[batchEntry.id] = batchEntry; });
  return batchEntry;
}

export async function getBatch(batchId) {
  if (typeof batchId !== "string" || !UUID_PATTERN.test(batchId)) return null;
  return (await runInBatchesQueue(readBatchesFile))[batchId] || null;
}

export async function listBatches() {
  return Object.values(await runInBatchesQueue(readBatchesFile));
}

export function updateBatch(batchId, changes) {
  return updateBatches((batches) => {
    if (!batches[batchId]) return null;
    batches[batchId] = { ...batches[batchId], ...changes };
    return batches[batchId];
  });
}

export function deleteBatch(batchId) {
  return updateBatches((batches) => {
    const didExist = Boolean(batches[batchId]);
    delete batches[batchId];
    return didExist;
  });
}
