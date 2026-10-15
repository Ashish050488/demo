// The batch store: one JSON file listing every batch (data/uploads/batches.json, gitignored). A batch is just a
// named list of cases - each row of the uploaded Excel is an ordinary case with `batchId` set, so review, save
// and download work exactly as for a single case.
import crypto from "node:crypto";
import path from "node:path";
import { createJsonFileStore } from "./json-file-store-helpers.js";
import { UPLOADS_DIRECTORY } from "../../config/paths-config.js";

const BATCHES_PATH = path.join(UPLOADS_DIRECTORY, "batches.json");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reads come from memory and writes are queued + atomic + retried on Windows file locks (json-file-store-helpers.js).
const batchesStore = createJsonFileStore(BATCHES_PATH);
const updateBatches = (mutate) => batchesStore.update(mutate);

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
  return (await batchesStore.read())[batchId] || null;
}

export async function listBatches() {
  return Object.values(await batchesStore.read());
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
