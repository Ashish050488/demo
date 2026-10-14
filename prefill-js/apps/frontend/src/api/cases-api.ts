import type { CaseFieldsView, CaseSummary, ConfirmResult, FieldDecision, SheetImportResult, UploadResult } from "@/types/cases";
import { buildApiUrl, requestJson, sendJson } from "./http-client";

export const fetchCases = () => requestJson<{ cases: CaseSummary[] }>("/cases").then((response) => response.cases);
export const fetchCase = (caseId: string) => requestJson<CaseSummary>(`/cases/${caseId}`);
export const createCase = (formId: string) => sendJson<CaseSummary>("/cases", "POST", { formId });
export const deleteCase = (caseId: string) => sendJson<{ caseId: string }>(`/cases/${caseId}`, "DELETE");
export const fillCase = (caseId: string) => sendJson<{ statusCounts: Record<string, number> }>(`/cases/${caseId}/fill`, "POST");
export const fetchCaseFields = (caseId: string) => requestJson<CaseFieldsView>(`/cases/${caseId}/fields`);
export const regenerateCase = (caseId: string) => sendJson<CaseFieldsView>(`/cases/${caseId}/regenerate`, "POST");
export const getCasePdfUrl = (caseId: string) => buildApiUrl(`/cases/${caseId}/pdf`);
export const getDocumentViewUrl = (caseId: string, documentId: string) => buildApiUrl(`/cases/${caseId}/documents/${documentId}/view`);

export function recordDecision(caseId: string, field: string, kind: FieldDecision["kind"], value?: string) {
  return sendJson<FieldDecision>(`/cases/${caseId}/decisions`, "POST", { field, kind, value });
}

export function uploadDocuments(caseId: string, documentFiles: File[], relativePaths: string[] = []) {
  const formData = new FormData();
  // Folder of each file ("Tushar/pan.jpg") - sent before the files; the server uses it to group by person.
  if (relativePaths.some(Boolean)) formData.append("relativePaths", JSON.stringify(relativePaths));
  for (const documentFile of documentFiles) formData.append("files", documentFile);
  return requestJson<{ uploadResults: UploadResult[] }>(`/cases/${caseId}/documents`, { method: "POST", body: formData })
    .then((response) => response.uploadResults);
}

export const assignDocument = (caseId: string, documentId: string, nomineeNumber: number) =>
  sendJson(`/cases/${caseId}/documents/${documentId}/assign`, "POST", { nomineeNumber });
export const swapNominees = (caseId: string, firstNominee: number, secondNominee: number) =>
  sendJson(`/cases/${caseId}/nominees/swap`, "POST", { firstNominee, secondNominee });
export const removeDocument = (caseId: string, documentId: string) => sendJson(`/cases/${caseId}/documents/${documentId}`, "DELETE");
export const confirmCase = (caseId: string, fieldValues: Record<string, string>) =>
  sendJson<ConfirmResult>(`/cases/${caseId}/confirm`, "POST", { fieldValues });

/** PNG blob of the field's page (or of `pageNumber`) with `value` drawn in (nothing saved). */
export async function fetchPreviewImage(caseId: string, field: string | null, value: string, pageNumber?: number | null): Promise<Blob> {
  const response = await fetch(buildApiUrl(`/cases/${caseId}/preview`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field, value, pageNumber: pageNumber ?? undefined }),
  });
  if (!response.ok) throw new Error("Preview failed");
  return response.blob();
}

/** Fill this case from one row of an Excel/CSV. Without rowNumber, a file with several clients returns the rows to pick from. */
export function importCaseSheet(caseId: string, sheetFile: File, rowNumber?: number) {
  const formData = new FormData();
  formData.append("file", sheetFile);
  if (rowNumber) formData.append("rowNumber", String(rowNumber));
  return requestJson<SheetImportResult>(`/cases/${caseId}/sheet-import`, { method: "POST", body: formData });
}
