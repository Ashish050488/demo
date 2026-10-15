// Fills batch cases in the background: a started batch's case is filled as soon as none of its documents is still
// being read, at most MAXIMUM_PARALLEL_FILLS at a time. One client failing never stops the others.
// On server start, work that a restart interrupted is picked up again: scans left "Reading…" are read again and
// cases left half-filled are queued again.
import crypto from "node:crypto";
import { copySignature } from "../documents/signature-store-service.js";
import path from "node:path";
import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { listBatches } from "../storage/batch-store-service.js";
import { getCase, listCases, updateCase, updateCaseDocument, addCaseDocument, getDocumentPath, getCaseUploadDirectory } from "../storage/case-store-service.js";
import { getIdentityRecord, storeIdentityRecord } from "../documents/identity-number-memory-service.js";
import { processUploadedDocument, DOCUMENT_STATUSES } from "../documents/process-document-service.js";
import { fillCase } from "../fill/fill-case-service.js";

export const BATCH_STAGES = { WAITING: "waiting", FILLING: "filling", DONE: "done", FAILED: "failed" };
const MAXIMUM_PARALLEL_FILLS = 2;
const RUNNER_INTERVAL_MILLISECONDS = 1500;

const fillingCaseIds = new Set();
let isTickRunning = false;

/** A client's second form gets copies of the documents read for its first form (no second OCR): same file,
 * same grouping, and the ID numbers held in memory copied under the new document ids. */
async function shareDocumentsFromCase(caseEntry) {
  const sourceCase = await getCase(caseEntry.documentsFromCaseId);
  if (!sourceCase) return;
  await mkdir(getCaseUploadDirectory(caseEntry.id), { recursive: true });
  for (const sourceDocument of sourceCase.documents) {
    const documentId = crypto.randomUUID();
    const filename = `doc-${documentId}${path.extname(sourceDocument.filename || "")}`;
    if (sourceDocument.filename && existsSync(getDocumentPath(sourceCase.id, sourceDocument.filename))) {
      await copyFile(getDocumentPath(sourceCase.id, sourceDocument.filename), getDocumentPath(caseEntry.id, filename));
    }
    const identityRecord = getIdentityRecord(sourceDocument.id);
    if (identityRecord) storeIdentityRecord(documentId, { ...identityRecord });
    await addCaseDocument(caseEntry.id, { ...sourceDocument, id: documentId, filename, sharedFromDocumentId: sourceDocument.id });
  }
  await copySignature(sourceCase.id, caseEntry.id);
  await updateCase(caseEntry.id, { documentsSharedAt: new Date().toISOString() });
}

async function fillBatchCase(caseId) {
  fillingCaseIds.add(caseId);
  try {
    await updateCase(caseId, { batchStage: BATCH_STAGES.FILLING, batchError: null });
    let caseEntry = await getCase(caseId);
    if (!caseEntry) return;
    if (caseEntry.documentsFromCaseId && !caseEntry.documentsSharedAt) {
      await shareDocumentsFromCase(caseEntry);
      caseEntry = await getCase(caseId);
    }
    await fillCase(caseEntry);
    await updateCase(caseId, { isFilled: true, batchStage: BATCH_STAGES.DONE, batchFilledAt: new Date().toISOString() });
  } catch (error) {
    console.error(`batch fill failed (case ${caseId}):`, error.message);
    await updateCase(caseId, { batchStage: BATCH_STAGES.FAILED, batchError: error.message || "Filling failed" }).catch(() => {});
  } finally {
    fillingCaseIds.delete(caseId);
  }
}

async function runOnce() {
  if (isTickRunning) return;
  isTickRunning = true;
  try {
    const startedBatchIds = new Set((await listBatches()).filter((batchEntry) => batchEntry.startedAt).map((batchEntry) => batchEntry.id));
    if (!startedBatchIds.size) return;
    const allCases = await listCases();
    const caseById = new Map(allCases.map((caseEntry) => [caseEntry.id, caseEntry]));
    const isStillReading = (caseEntry) => Boolean(caseEntry?.documents.some((caseDocument) => caseDocument.status === DOCUMENT_STATUSES.PROCESSING));
    // A form that shares another form's documents also waits for those to be read.
    const readyCases = allCases.filter((caseEntry) => startedBatchIds.has(caseEntry.batchId)
      && caseEntry.batchStage === BATCH_STAGES.WAITING && !caseEntry.confirmedAt && !fillingCaseIds.has(caseEntry.id)
      && !isStillReading(caseEntry) && !(caseEntry.documentsFromCaseId && !caseEntry.documentsSharedAt && isStillReading(caseById.get(caseEntry.documentsFromCaseId))));
    readyCases.sort((first, second) => (first.sheetImport?.rowNumber || 0) - (second.sheetImport?.rowNumber || 0));
    for (const caseEntry of readyCases.slice(0, Math.max(0, MAXIMUM_PARALLEL_FILLS - fillingCaseIds.size))) fillBatchCase(caseEntry.id);
  } catch (error) {
    console.error("batch runner:", error.message);
  } finally {
    isTickRunning = false;
  }
}

/** Restart recovery, for single cases too: re-read scans stuck "Reading…", requeue cases stuck "Filling". */
async function resumeInterruptedWork() {
  for (const caseEntry of await listCases()) {
    if (caseEntry.confirmedAt) continue;
    if (caseEntry.batchStage === BATCH_STAGES.FILLING) await updateCase(caseEntry.id, { batchStage: BATCH_STAGES.WAITING });
    for (const caseDocument of caseEntry.documents) {
      if (caseDocument.status !== DOCUMENT_STATUSES.PROCESSING || !caseDocument.filename) continue;
      const documentPath = getDocumentPath(caseEntry.id, caseDocument.filename);
      if (existsSync(documentPath)) processUploadedDocument(caseEntry.id, caseDocument.id, documentPath);
      else await updateCaseDocument(caseEntry.id, caseDocument.id, { status: DOCUMENT_STATUSES.ERROR, message: "The file is gone - upload it again" });
    }
  }
}

export function startBatchRunner() {
  resumeInterruptedWork().catch((error) => console.error("resuming interrupted work failed:", error.message));
  setInterval(runOnce, RUNNER_INTERVAL_MILLISECONDS).unref();
}
