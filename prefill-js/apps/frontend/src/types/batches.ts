export type ClientStage = "waiting" | "reading" | "filling" | "done" | "needs_fixing" | "failed" | "saved";

export interface BatchClient {
  caseId: string;
  formId: string;
  formLabel: string;
  formShortLabel: string;
  /** Set on a client's 2nd+ form: it uses the documents uploaded for this case. */
  documentsFromCaseId: string | null;
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
  formIds: string[];
  forms: { formId: string; label: string; shortLabel: string }[];
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
  formIds: string[];
  sheetFileName: string;
  clientCount: number;
  createdAt: string;
  startedAt: string | null;
}
