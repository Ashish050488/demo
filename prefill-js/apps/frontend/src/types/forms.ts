export type { FormRules } from "@prefill/shared";

export interface FormSummary {
  formId: string;
  /** The form's own printed title, e.g. "Nomination Form — Mutual Fund (CAMS)". */
  label: string;
  shortLabel: string;
  purpose: string;
  blankFileName: string;
  keyFields: string[];
  supportedNomineeCount: number;
}

export interface FormMappingItem {
  id: string;
  key: string;
  nominee: number | null;
  page: number;
  kind: "text" | "tick";
  option?: string | null;
  source: string;
  isRequired: boolean;
  rule: string;
  box: [number, number, number, number];
}

export interface FormMapping {
  formId: string;
  label: string;
  pageCount: number;
  items: FormMappingItem[];
}

export interface FieldSources {
  fieldSources: Record<string, string>;
  documentData: Record<string, { means: string; read_from: string[] }>;
}

export interface SheetColumn {
  key: string;
  label: string;
}
