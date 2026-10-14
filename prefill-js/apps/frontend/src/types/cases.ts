export type DocumentStatus = "processing" | "done" | "unrecognized" | "error";

export interface CaseDocument {
  id: string;
  originalName: string;
  status: DocumentStatus;
  message: string | null;
  documentType: string | null;
  documentTypeLabel: string | null;
  hasQrCode: boolean;
  assignedNominee: number;
  assignedBy: string | null;
  isAssignedManually: boolean;
  identityNumber: string | null;
  readFieldLabels: string[];
}

export interface CaseSummary {
  id: string;
  formId: string;
  batchId: string | null;
  createdAt: string;
  isFilled: boolean;
  confirmedAt: string | null;
  documents: CaseDocument[];
}

export type FieldStatus = "ok" | "low_confidence" | "needs_review" | "not_provided" | "not_applicable" | "invalid";

export interface FieldDecision {
  kind: "corrected" | "skipped";
  value: string | null;
  decidedAt?: string;
}

export interface CaseField {
  field: string;
  page: number | null;
  value: string | null;
  status: FieldStatus;
  reason: string | null;
  source_file: string | null;
  source_doc?: string;
  ocr_confidence: number | null;
  isTickbox: boolean;
  options?: string[];
  option_chosen?: string | null;
  boxes: [number, number, number, number][];
  decision: FieldDecision | null;
}

export interface CaseFieldsView {
  caseId: string;
  formId: string;
  label: string;
  pageCount: number;
  fields: CaseField[];
}

export interface UploadResult {
  filename: string;
  isAccepted: boolean;
  reason?: string;
  documentId?: string;
}

export interface ConfirmResult {
  caseId: string;
  savedFieldCount: number;
  notStoredFields: string[];
  sheetTabName: string;
  sheetRowNumber: number;
  areScansDeleted: boolean;
}

export interface SheetRowSummary {
  rowNumber: number;
  clientReference: string | null;
  displayName: string | null;
  filledCount: number;
}

export interface SheetImportResult {
  needsRowChoice: boolean;
  sheetName: string;
  sheetRows?: SheetRowSummary[];
  rowNumber?: number;
  clientReference?: string | null;
  appliedFieldCount?: number;
  panFieldsKeptInMemory?: string[];
  unknownHeadings?: string[];
  duplicateFields?: string[];
  documentWins?: { field: string; sheetValue: string; documentValue: string; documentLabel: string }[];
  keptCorrections?: string[];
  invalidValues?: { field: string; value: string; reason: string }[];
  unmatchedOptions?: { field: string; value: string; allowed: string[] }[];
  mappedToOthers?: { field: string; value: string }[];
  aadhaarCutToLast4?: string[];
  cellWarnings?: { field: string; warning: string }[];
}
