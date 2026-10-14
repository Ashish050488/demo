import type { BatchListEntry, BatchStatus } from "@/types/batches";
import { buildApiUrl, requestJson, sendJson } from "./http-client";

export function createBatch(formId: string, sheetFile: File) {
  const formData = new FormData();
  formData.append("formId", formId);
  formData.append("file", sheetFile);
  return requestJson<BatchStatus>("/batches", { method: "POST", body: formData });
}

export const fetchBatches = () => requestJson<{ batches: BatchListEntry[] }>("/batches").then((response) => response.batches);
export const fetchBatch = (batchId: string) => requestJson<BatchStatus>(`/batches/${batchId}`);
export const startBatch = (batchId: string) => sendJson<BatchStatus>(`/batches/${batchId}/start`, "POST");
export const deleteBatch = (batchId: string) => sendJson(`/batches/${batchId}`, "DELETE");
export const getBatchEventsUrl = (batchId: string) => buildApiUrl(`/batches/${batchId}/events`);
export const getBatchPdfsUrl = (batchId: string) => buildApiUrl(`/batches/${batchId}/pdfs`);
