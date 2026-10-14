"use client";
import type { CaseField } from "@/types/cases";
import type { FieldState } from "@/utils/review-field-helpers";

const MULTILINE_FIELD_PATTERN = /^(address|fund_name|guardian_address)/;
const AADHAAR_LAST4_FIELD_PATTERN = /^(id_aadhaar_last4|id_details)/;
const MAXIMUM_OPTION_BUTTONS_TEXT_LENGTH = 70;
const STATE_CLASSES: Record<FieldState, string> = {
  invalid: "border-red-300 bg-red-50", required: "border-red-200 bg-red-50/60", lowConfidence: "border-amber-300 bg-amber-50/50",
  ok: "border-line bg-white", blank: "border-line bg-white", notApplicable: "border-dashed border-line bg-canvas text-muted",
};

interface FieldCellProps {
  caseField: CaseField;
  effectiveValue: string | null;
  fieldState: FieldState;
  problemText: string | null;
  isSelected: boolean;
  isWide: boolean;
  onSelect: () => void;
  onChange: (typedValue: string) => void;
  onChooseTick: (chosenOption: string) => void;
  onCommit: () => void;
}

/** Tick-box options as one row of buttons (one click, every choice visible) when they fit. */
function OptionButtons({ options, chosenOption, hasProblem, onChoose }: { options: string[]; chosenOption: string | null; hasProblem: boolean; onChoose: (option: string) => void }) {
  return (
    <div className={`flex flex-wrap gap-1 rounded-md ${hasProblem && !chosenOption ? "bg-red-50/60 p-0.5 ring-1 ring-red-200" : ""}`}>
      {options.map((option) => (
        <button key={option} type="button" onClick={() => onChoose(option === chosenOption ? "" : option)}
          className={`h-7 rounded-md border px-2.5 text-xs transition ${option === chosenOption ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white text-ink hover:border-brand-500"}`}>
          {option}
        </button>
      ))}
    </div>
  );
}

/** One compact editable cell, the same height whatever its state; the reason for a problem is in the tooltip
 * and the details bar, so rows never jump. */
export default function FieldCell(props: FieldCellProps) {
  const { caseField, effectiveValue, fieldState, problemText, isSelected, isWide, onSelect, onChange, onChooseTick, onCommit } = props;
  const controlClasses = `w-full rounded-md border px-2 py-1 text-[13px] leading-5 outline-none placeholder:text-red-400/80 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${STATE_CLASSES[fieldState]} ${isSelected ? "border-brand-500 ring-2 ring-brand-100" : ""}`;
  const placeholder = fieldState === "notApplicable" ? "not needed" : fieldState === "required" ? "Required" : "";
  const options = caseField.options || [];
  const canShowOptionButtons = isWide && options.join("").length <= MAXIMUM_OPTION_BUTTONS_TEXT_LENGTH;

  let control;
  if (caseField.isTickbox && options.length && canShowOptionButtons) {
    control = <OptionButtons options={options} chosenOption={effectiveValue} hasProblem={fieldState === "required"} onChoose={(option) => { onSelect(); onChooseTick(option); }} />;
  } else if (caseField.isTickbox && options.length) {
    control = (
      <select value={effectiveValue ?? ""} onFocus={onSelect} onChange={(event) => onChooseTick(event.target.value)} className={`${controlClasses} h-7`}>
        <option value="">— not ticked —</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  } else if (MULTILINE_FIELD_PATTERN.test(caseField.field)) {
    control = <textarea rows={2} value={effectiveValue ?? ""} placeholder={placeholder} onFocus={onSelect} className={`${controlClasses} resize-y`}
      onChange={(event) => onChange(event.target.value)} onBlur={onCommit} />;
  } else {
    control = <input value={effectiveValue ?? ""} placeholder={placeholder} onFocus={onSelect} className={`${controlClasses} h-7`}
      maxLength={AADHAAR_LAST4_FIELD_PATTERN.test(caseField.field) ? 4 : undefined}
      onChange={(event) => onChange(event.target.value)} onBlur={onCommit} />;
  }
  return <div data-field={caseField.field} className="min-w-0" title={problemText || undefined} onClick={onSelect}>{control}</div>;
}
