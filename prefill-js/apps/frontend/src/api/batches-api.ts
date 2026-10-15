import type { BatchListEntry, BatchStatus } from "@/types/batches";
import { buildApiUrl, requestJson, sendJson } from "./http-client";

export function createBatch(formIds: string[], sheetFile: File) {
  const formData = new FormData();
  formData.append("formIds", formIds.join(","));
  formData.append("file", sheetFile);
  return requestJson<BatchStatus>("/batches", { method: "POST", body: formData });
}

export const fetchBatches = () => requestJson<{ batches: BatchListEntry[] }>("/batches").then((response) => response.batches);
export const fetchBatch = (batchId: string) => requestJson<BatchStatus>(`/batches/${batchId}`);
export const startBatch = (batchId: string) => sendJson<BatchStatus>(`/batches/${batchId}/start`, "POST");
export const deleteBatch = (batchId: string) => sendJson(`/batches/${batchId}`, "DELETE");
export const getBatchEventsUrl = (batchId: string) => buildApiUrl(`/batches/${batchId}/events`);
export const getBatchPdfsUrl = (batchId: string) => buildApiUrl(`/batches/${batchId}/pdfs`);

export interface BatchSheetImportSummary { updatedCount: number; notInFile: string[]; alreadySaved: string[] }

/** A corrected Excel for the whole batch: each client takes the row with its own client reference. */
export function importBatchSheet(batchId: string, sheetFile: File) {
  const formData = new FormData();
  formData.append("file", sheetFile);
  return requestJson<BatchSheetImportSummary>(`/batches/${batchId}/sheet-import`, { method: "POST", body: formData });
}
