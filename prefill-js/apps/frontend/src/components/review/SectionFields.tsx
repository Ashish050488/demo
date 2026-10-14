"use client";
import { formatFieldLabel, getNomineeNumber } from "@prefill/shared";
import type { ReviewSession } from "@/hooks/useReviewSession";
import type { CaseField } from "@/types/cases";
import { getEffectiveValue, getFieldState } from "@/utils/review-field-helpers";
import type { ReviewSection } from "@/utils/review-sections";
import FieldCell from "./FieldCell";

interface SectionFieldsProps {
  session: ReviewSession;
  section: ReviewSection;
  activeNomineeNumber: number;
  shownNomineeCount: number;
  selectedFieldKey: string | null;
  onSelectField: (caseField: CaseField) => void;
  onChooseTick: (caseField: CaseField, chosenOption: string) => void;
  onSelectNominee: (nomineeNumber: number) => void;
}

/** One review section in a single compact layout: label above value, as many columns as fit. A nominee section
 * shows one nominee at a time behind tabs, so it looks the same as every other section. */
export default function SectionFields(props: SectionFieldsProps) {
  const { session, section, activeNomineeNumber, shownNomineeCount, selectedFieldKey, onSelectField, onChooseTick, onSelectNominee } = props;
  const { editedValues, formCheck, formRules } = session;
  const requiredBaseKeys = new Set(formRules?.requiredFields || []);
  const problemKeys = new Set([...formCheck.missing, ...formCheck.invalid.map((problem) => problem.field)]);
  const nomineeCount = formRules?.supportedNomineeCount || 1;
  const fieldKeyFor = (baseKey: string) => (section.isNomineeSection ? `${baseKey}_n${activeNomineeNumber}` : baseKey);

  const renderCell = (caseField: CaseField | undefined) => {
    if (!caseField) return <div className="pt-1 text-xs text-muted">—</div>;
    const effectiveValue = getEffectiveValue(caseField, editedValues);
    const problem = formCheck.invalid.find((invalidField) => invalidField.field === caseField.field);
    return (
      <FieldCell caseField={caseField} effectiveValue={effectiveValue} isWide
        fieldState={getFieldState(caseField, effectiveValue, formCheck, editedValues.has(caseField.field))}
        problemText={problem?.reason || null} isSelected={selectedFieldKey === caseField.field}
        onSelect={() => onSelectField(caseField)} onChange={(typedValue) => session.updateTypedValue(caseField, typedValue)}
        onChooseTick={(chosenOption) => onChooseTick(caseField, chosenOption)} onCommit={() => session.commitField(caseField)} />
    );
  };

  return (
    <div>
      {section.isNomineeSection ? (
        <div className="mb-4 flex items-center gap-1 border-b border-line">
          {Array.from({ length: shownNomineeCount }, (_unused, index) => index + 1).map((nomineeNumber) => {
            const hasProblem = section.fields.some((caseField) => getNomineeNumber(caseField.field) === nomineeNumber && problemKeys.has(caseField.field));
            const isActive = nomineeNumber === activeNomineeNumber;
            return (
              <button key={nomineeNumber} type="button" onClick={() => onSelectNominee(nomineeNumber)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[13px] ${isActive ? "border-brand-500 font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}>
                Nominee {nomineeNumber}{hasProblem ? <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> : null}
              </button>
            );
          })}
          {shownNomineeCount < nomineeCount ? (
            <button type="button" onClick={() => onSelectNominee(shownNomineeCount + 1)} className="px-3 py-1.5 text-[13px] text-brand-600 hover:text-brand-700">
              + Add nominee {shownNomineeCount + 1}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-x-4 gap-y-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(13rem, 1fr))" }}>
        {section.baseKeys.map((baseKey) => {
          const caseField = section.fields.find((candidate) => candidate.field === fieldKeyFor(baseKey));
          const isWideField = Boolean(caseField?.isTickbox && (caseField.options || []).join("").length > 24) || /address/.test(baseKey);
          return (
            <div key={baseKey} className={isWideField ? "col-span-full" : ""}>
              <div className="mb-1 truncate text-[11px] font-medium text-muted">
                {formatFieldLabel(baseKey)}{requiredBaseKeys.has(baseKey) ? <span className="text-red-600"> *</span> : null}
              </div>
              {renderCell(caseField)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
