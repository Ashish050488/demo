export type ClientStage = "waiting" | "reading" | "filling" | "done" | "needs_fixing" | "failed" | "saved";

export interface BatchClient {
  caseId: string;
  rowNumber: number;
  clientReference: string | null;
  displayName: string | null;
  stage: ClientStage;
  error: string | null;
  rowProblemCount: number;
  documentCount: number;
  readDocumentCount: number;
  filledCount: number | null;
  fieldCount: number | null;
  problemCount: number | null;
}

export interface BatchStatus {
  id: string;
  formId: string;
  formLabel: string;
  sheetFileName: string;
  createdAt: string;
  startedAt: string | null;
  warnings: string[];
  clients: BatchClient[];
  stageCounts: Record<ClientStage, number>;
}

export interface BatchListEntry {
  id: string;
  formId: string;
  sheetFileName: string;
  clientCount: number;
  createdAt: string;
  startedAt: string | null;
}
