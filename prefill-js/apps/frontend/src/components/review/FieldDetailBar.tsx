"use client";
import { formatFieldLabel, getNomineeNumber, RULE_TEXT } from "@prefill/shared";
import type { ReviewSession } from "@/hooks/useReviewSession";
import type { CaseField } from "@/types/cases";
import { describeValueSource } from "@/utils/review-field-helpers";

interface FieldDetailBarProps {
  session: ReviewSession;
  caseField: CaseField | null;
  sectionLabel: string;
  onViewSource: (caseField: CaseField) => void;
  onAddDocument: (nomineeNumber: number) => void;
}

/** Everything about the selected field in one line: where it came from, its rule, what it was, and actions. */
export default function FieldDetailBar({ session, caseField, sectionLabel, onViewSource, onAddDocument }: FieldDetailBarProps) {
  if (!caseField) return <div className="border-t border-line bg-canvas px-4 py-2 text-xs text-muted">Select a field.</div>;
  const isEdited = session.editedValues.has(caseField.field);
  const nomineeNumber = getNomineeNumber(caseField.field);
  const originalValue = caseField.isTickbox ? caseField.option_chosen : caseField.value;
  const sourceText = describeValueSource(caseField, isEdited);
  const problem = session.formCheck.invalid.find((invalidField) => invalidField.field === caseField.field);
  const isMissing = session.formCheck.missing.includes(caseField.field);
  const rule = RULE_TEXT[caseField.field.replace(/_n\d+$/, "")];
  const canAddDocument = !caseField.isTickbox && originalValue == null && /document/.test(caseField.reason || "");
  const isCorrected = isEdited || caseField.decision?.kind === "corrected";
  const linkClasses = "text-brand-600 hover:underline";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-canvas px-4 py-2 text-xs">
      <span className="font-semibold text-ink">{sectionLabel} · {formatFieldLabel(caseField.field)}{nomineeNumber ? ` · Nominee ${nomineeNumber}` : ""}</span>
      {sourceText ? (caseField.source_doc
        ? <button type="button" className={linkClasses} onClick={() => onViewSource(caseField)}>{sourceText} · view document</button>
        : <span className="text-muted">{sourceText}</span>) : null}
      {caseField.ocr_confidence != null ? <span className={caseField.ocr_confidence < 85 ? "text-amber-700" : "text-muted"}>OCR {caseField.ocr_confidence.toFixed(0)}%</span> : null}
      {problem ? <span className="text-red-700">{problem.reason}</span> : isMissing ? <span className="text-red-700">Required - fill this before saving</span> : null}
      {!problem && !isMissing && originalValue == null && caseField.reason && !isEdited ? <span className="text-muted">{caseField.reason}</span> : null}
      {rule ? <span className="text-muted">Rule: {rule}</span> : null}
      {isCorrected && originalValue != null ? (
        <span className="text-muted">Was <s>{originalValue}</s> <button type="button" className={linkClasses} onClick={() => session.restoreField(caseField)}>Restore</button></span>
      ) : null}
      {canAddDocument ? <button type="button" className={linkClasses} onClick={() => onAddDocument(getNomineeNumber(caseField.field) || 1)}>Add a document</button> : null}
    </div>
  );
}
