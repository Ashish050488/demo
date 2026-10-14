import type { FormRules } from "@prefill/shared";
import type { FieldSources, FormMapping, FormSummary, SheetColumn } from "@/types/forms";
import { buildApiUrl, requestJson, sendJson } from "./http-client";

export const fetchForms = () => requestJson<{ forms: FormSummary[] }>("/forms").then((response) => response.forms);
export const fetchFormRules = (formId: string) => requestJson<FormRules>(`/forms/${formId}/rules`);
export const fetchFormMapping = (formId: string) => requestJson<FormMapping>(`/forms/${formId}/mapping`);
export const fetchFieldSources = (formId: string) => requestJson<FieldSources>(`/forms/${formId}/field-sources`);
export const fetchSheetColumns = (formId: string) =>
  requestJson<{ columns: SheetColumn[] }>(`/forms/${formId}/sheet-columns`).then((response) => response.columns);
export const getBlankPageImageUrl = (formId: string, pageNumber: number) => buildApiUrl(`/forms/${formId}/pages/${pageNumber}`);

export function updateRequiredFields(formId: string, requiredFields: string[]) {
  return sendJson<{ requiredFields: string[] }>(`/forms/${formId}/required-fields`, "PUT", { requiredFields });
}

export function detectForm(blankFormFile: File) {
  const formData = new FormData();
  formData.append("file", blankFormFile);
  return requestJson<{ formId: string }>("/forms/detect", { method: "POST", body: formData });
}
