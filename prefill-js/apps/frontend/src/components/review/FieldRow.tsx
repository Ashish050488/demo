"use client";
import { formatFieldLabel } from "@prefill/shared";
import type { CaseField } from "@/types/cases";
import type { FieldState } from "@/utils/review-field-helpers";

const STATE_DOT_CLASSES: Record<FieldState, string> = {
  invalid: "bg-red-500", required: "bg-red-500", lowConfidence: "bg-amber-400", ok: "bg-brand-500",
  blank: "border border-muted/50 bg-white", notApplicable: "bg-line",
};
const MULTILINE_FIELD_PATTERN = /^(address|fund_name|guardian_address)/;
const AADHAAR_LAST4_FIELD_PATTERN = /^(id_aadhaar_last4|id_details)/;

interface FieldRowProps {
  caseField: CaseField;
  effectiveValue: string | null;
  fieldState: FieldState;
  problemText: string | null;
  sourceText: string | null;
  isRequired: boolean;
  isSelected: boolean;
  isEdited: boolean;
  onSelect: () => void;
  onChange: (typedValue: string) => void;
  onChooseTick: (chosenOption: string) => void;
  onCommit: () => void;
  onRestore: () => void;
  onViewSource: () => void;
  onAddDocument: () => void;
}

export default function FieldRow(props: FieldRowProps) {
  const { caseField, effectiveValue, fieldState, problemText, sourceText, isRequired, isSelected, isEdited } = props;
  const isProblem = fieldState === "invalid" || fieldState === "required";
  const originalValue = caseField.isTickbox ? caseField.option_chosen : caseField.value;
  const inputClasses = `mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${isProblem ? "border-red-300" : "border-line"}`;
  const canAddDocument = !caseField.isTickbox && originalValue == null && /document/.test(caseField.reason || "");

  return (
    <div onClick={props.onSelect}
      className={`rounded-lg px-3 py-2.5 transition ${isSelected ? "bg-brand-50/70 ring-1 ring-brand-100" : "hover:bg-canvas"}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT_CLASSES[fieldState]}`} />
        <span className="text-xs font-medium text-ink">{formatFieldLabel(caseField.field)}{isRequired ? <span className="text-red-600"> *</span> : null}</span>
        {sourceText ? (
          caseField.source_doc
            ? <button type="button" onClick={(event) => { event.stopPropagation(); props.onViewSource(); }} className="ml-auto text-[11px] text-brand-600 hover:underline">{sourceText} · view</button>
            : <span className="ml-auto text-[11px] text-muted">{sourceText}</span>
        ) : null}
      </div>
      {caseField.isTickbox && caseField.options ? (
        <select value={effectiveValue ?? ""} onFocus={props.onSelect} className={inputClasses}
          onChange={(event) => props.onChooseTick(event.target.value)}>
          <option value="">— not ticked —</option>
          {caseField.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : MULTILINE_FIELD_PATTERN.test(caseField.field) ? (
        <textarea rows={3} value={effectiveValue ?? ""} placeholder="Type it here" onFocus={props.onSelect} className={inputClasses}
          onChange={(event) => props.onChange(event.target.value)} onBlur={props.onCommit} />
      ) : (
        <input value={effectiveValue ?? ""} placeholder="Type it here" onFocus={props.onSelect} className={inputClasses}
          maxLength={AADHAAR_LAST4_FIELD_PATTERN.test(caseField.field) ? 4 : undefined}
          onChange={(event) => props.onChange(event.target.value)} onBlur={props.onCommit} />
      )}
      {problemText ? <p className="mt-1 text-xs text-red-700">{problemText}</p> : null}
      {isSelected ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted">
          {caseField.ocr_confidence != null ? <span>OCR confidence {caseField.ocr_confidence.toFixed(0)}%{caseField.ocr_confidence < 85 ? " — check it" : ""}</span> : null}
          {!isEdited && originalValue == null && caseField.reason && !problemText ? <span>{caseField.reason}</span> : null}
          {(isEdited || caseField.decision?.kind === "corrected") && originalValue != null ? (
            <span>Was: <s>{originalValue}</s> <button type="button" className="ml-1 text-brand-600 hover:underline" onClick={(event) => { event.stopPropagation(); props.onRestore(); }}>Restore</button></span>
          ) : null}
          {canAddDocument ? <button type="button" className="text-brand-600 hover:underline" onClick={(event) => { event.stopPropagation(); props.onAddDocument(); }}>Add a document</button> : null}
        </div>
      ) : null}
    </div>
  );
}
