import type { DraftField, FormDraft } from "@/types/form-drafts";
import { buildApiUrl, requestJson, sendJson } from "./http-client";

/** Upload a blank form (and best, a filled sample of it) -> the app's proposed mapping. */
export function createFormDraft(blankFile: File, filledFile: File | null) {
  const formData = new FormData();
  formData.append("blank", blankFile);
  if (filledFile) formData.append("filled", filledFile);
  return requestJson<FormDraft>("/forms/drafts", { method: "POST", body: formData });
}

export const getDraftPageImageUrl = (draftId: string, pageNumber: number) => buildApiUrl(`/forms/drafts/${draftId}/pages/${pageNumber}`);

export interface CreateFormRequest {
  label: string;
  shortLabel: string;
  purpose: string;
  personLabel: string;
  fields: DraftField[];
}

export function createFormFromDraft(draftId: string, createFormRequest: CreateFormRequest) {
  return sendJson<{ formId: string }>(`/forms/drafts/${draftId}/create`, "POST", createFormRequest);
}

export function deleteFormDraft(draftId: string) {
  return requestJson<{ deleted: boolean }>(`/forms/drafts/${draftId}`, { method: "DELETE" });
}
