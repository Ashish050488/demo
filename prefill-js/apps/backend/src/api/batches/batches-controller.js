// Batches: one Excel row = one case. Create from a sheet, start filling, watch progress live, download all PDFs.
import { readFile } from "node:fs/promises";
import { sendData, ApiError, ERROR_CODES } from "../../helpers/api-response-helpers.js";
import { buildZipFile } from "../../helpers/zip-writer-helpers.js";
import { getFormDefinition } from "../../forms/form-registry.js";
import { getBatch, listBatches, updateBatch, deleteBatch } from "../../services/storage/batch-store-service.js";
import { getCase, deleteCase, getRegeneratedPdfPath } from "../../services/storage/case-store-service.js";
import { deleteIdentityRecord, deleteTypedPanValues } from "../../services/documents/identity-number-memory-service.js";
import { SheetFileError } from "../../services/batch/read-sheet-file-service.js";
import { createBatchFromSheet } from "../../services/batch/create-batch-service.js";
import { buildBatchStatus, CLIENT_STAGES } from "../../services/batch/batch-status-service.js";
import { regenerateCasePdf } from "../../services/fill/regenerate-case-pdf-service.js";

const STATUS_PUSH_INTERVAL_MILLISECONDS = 1000;
const FINISHED_STAGES = new Set([CLIENT_STAGES.DONE, CLIENT_STAGES.NEEDS_FIXING, CLIENT_STAGES.SAVED]);

export async function requireBatchMiddleware(request, response, next) {
  const batchEntry = await getBatch(request.params.batchId);
  if (!batchEntry) throw new ApiError(404, ERROR_CODES.NOT_FOUND, "No such batch");
  request.batchEntry = batchEntry;
  next();
}

/** multipart: formId + file (the Excel/CSV). Creates one case per client row. */
export async function handleCreateBatch(request, response) {
  const formId = request.body?.formId;
  if (!getFormDefinition(formId)) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Unknown formId");
  if (!request.file) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "No Excel file uploaded");
  try {
    const batchEntry = await createBatchFromSheet(formId, request.file.buffer, request.file.originalname);
    sendData(response, await buildBatchStatus(batchEntry), 201);
  } catch (error) {
    if (error instanceof SheetFileError) throw new ApiError(422, "SHEET_NOT_USABLE", error.message);
    throw error;
  }
}

export async function handleListBatches(request, response) {
  const batches = (await listBatches()).sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)));
  sendData(response, { batches: batches.map((batchEntry) => ({ id: batchEntry.id, formId: batchEntry.formId, sheetFileName: batchEntry.sheetFileName, clientCount: batchEntry.rows.length, createdAt: batchEntry.createdAt, startedAt: batchEntry.startedAt })) });
}

export async function handleGetBatch(request, response) {
  sendData(response, await buildBatchStatus(request.batchEntry));
}

/** Documents are uploaded to each case first; starting lets the runner fill every case once its scans are read. */
export async function handleStartBatch(request, response) {
  const startedBatch = request.batchEntry.startedAt ? request.batchEntry : await updateBatch(request.batchEntry.id, { startedAt: new Date().toISOString() });
  sendData(response, await buildBatchStatus(startedBatch));
}

/** Server-Sent Events: the whole status, pushed whenever it changes (checked every second). */
export async function handleBatchEvents(request, response) {
  response.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
  response.flushHeaders();
  let lastSentJson = "";
  let isClosed = false;
  const pushStatus = async () => {
    if (isClosed) return;
    try {
      const batchEntry = await getBatch(request.batchEntry.id);
      if (!batchEntry) { response.write("event: deleted\ndata: {}\n\n"); return response.end(); }
      const statusJson = JSON.stringify(await buildBatchStatus(batchEntry));
      if (statusJson !== lastSentJson && !isClosed) { response.write(`data: ${statusJson}\n\n`); lastSentJson = statusJson; }
      else if (!isClosed) response.write(": keep-alive\n\n");
    } catch (error) {
      console.error("batch events:", error.message);
    }
  };
  await pushStatus();
  const pushTimer = setInterval(pushStatus, STATUS_PUSH_INTERVAL_MILLISECONDS);
  request.on("close", () => { isClosed = true; clearInterval(pushTimer); });
}

const toSafeFileName = (text) => String(text || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

/** Every filled client's PDF (with the reviewer's corrections) in one .zip. Clients still in progress are left out. */
export async function handleDownloadBatchZip(request, response) {
  const { clients, formLabel } = await buildBatchStatus(request.batchEntry);
  const finishedClients = clients.filter((client) => FINISHED_STAGES.has(client.stage));
  if (!finishedClients.length) throw new ApiError(409, ERROR_CODES.INVALID_REQUEST, "No client is filled yet");
  const zipFiles = [];
  for (const client of finishedClients) {
    const caseEntry = await getCase(client.caseId);
    if (!caseEntry) continue;
    await regenerateCasePdf(caseEntry);
    const fileLabel = toSafeFileName([client.clientReference || `Row ${client.rowNumber}`, client.displayName].filter(Boolean).join(" - "));
    zipFiles.push({ name: `${fileLabel}.pdf`, bytes: await readFile(getRegeneratedPdfPath(caseEntry.id)) });
  }
  response.set("Content-Type", "application/zip")
    .set("Content-Disposition", `attachment; filename="${toSafeFileName(formLabel)} - ${zipFiles.length} clients.zip"`)
    .send(buildZipFile(zipFiles));
}

/** Deletes the batch and every one of its cases (scans, PDFs, PAN in memory). */
export async function handleDeleteBatch(request, response) {
  for (const batchRow of request.batchEntry.rows) {
    const caseEntry = await getCase(batchRow.caseId);
    if (!caseEntry) continue;
    for (const caseDocument of caseEntry.documents) deleteIdentityRecord(caseDocument.id);
    deleteTypedPanValues(caseEntry.id);
    await deleteCase(caseEntry.id);
  }
  await deleteBatch(request.batchEntry.id);
  sendData(response, { batchId: request.batchEntry.id });
}
