"use client";
import type { ReviewSession } from "@/hooks/useReviewSession";
import type { CaseField } from "@/types/cases";
import {
  REVIEW_SECTIONS, describeValueSource, getEffectiveValue, getFieldState, getPrintedOrder, getReviewSection, matchesFilter, type FieldFilter,
} from "@/utils/review-field-helpers";
import FieldRow from "./FieldRow";

interface FieldListProps {
  session: ReviewSession;
  activeFilter: FieldFilter;
  selectedFieldKey: string | null;
  onSelectField: (caseField: CaseField) => void;
  onChooseTick: (caseField: CaseField, chosenOption: string) => void;
  onViewSource: (caseField: CaseField) => void;
  onAddDocument: (nomineeNumber: number) => void;
}

const REQUIRED_TEXT = "Required - fill this before saving";

export default function FieldList({ session, activeFilter, selectedFieldKey, onSelectField, onChooseTick, onViewSource, onAddDocument }: FieldListProps) {
  const { shownFields, editedValues, formCheck, formRules } = session;
  const requiredBaseKeys = new Set(formRules?.requiredFields || []);
  const fieldRows = shownFields.map((caseField) => {
    const effectiveValue = getEffectiveValue(caseField, editedValues);
    const isEdited = editedValues.has(caseField.field);
    return { caseField, effectiveValue, isEdited, fieldState: getFieldState(caseField, effectiveValue, formCheck, isEdited) };
  });

  const sections = REVIEW_SECTIONS.map((section) => {
    const sectionRows = fieldRows.filter((fieldRow) => getReviewSection(fieldRow.caseField.field) === section)
      .sort((first, second) => getPrintedOrder(first.caseField.field) - getPrintedOrder(second.caseField.field));
    return { section, sectionRows, visibleRows: sectionRows.filter((fieldRow) => matchesFilter(fieldRow.fieldState, activeFilter)) };
  }).filter((sectionGroup) => sectionGroup.visibleRows.length);

  if (!sections.length) return <p className="p-6 text-center text-sm text-muted">Nothing here.</p>;
  return (
    <div className="space-y-5">
      {sections.map(({ section, sectionRows, visibleRows }) => {
        const doneCount = sectionRows.filter((fieldRow) => fieldRow.fieldState !== "invalid" && fieldRow.fieldState !== "required").length;
        return (
          <section key={section}>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white/95 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted backdrop-blur">
              <span>{section}</span><span>{doneCount}/{sectionRows.length}</span>
            </div>
            <div className="space-y-0.5">
              {visibleRows.map(({ caseField, effectiveValue, isEdited, fieldState }) => {
                const problem = formCheck.invalid.find((invalidField) => invalidField.field === caseField.field);
                const nomineeNumber = Number((caseField.field.match(/_n(\d)$/) || [])[1]) || 1;
                return (
                  <div key={caseField.field} data-field={caseField.field}>
                    <FieldRow caseField={caseField} effectiveValue={effectiveValue} fieldState={fieldState}
                      problemText={problem?.reason || (fieldState === "required" ? REQUIRED_TEXT : null)}
                      sourceText={describeValueSource(caseField, isEdited)} isEdited={isEdited}
                      isRequired={requiredBaseKeys.has(caseField.field.replace(/_n\d+$/, "")) || fieldState === "required"}
                      isSelected={selectedFieldKey === caseField.field}
                      onSelect={() => onSelectField(caseField)}
                      onChange={(typedValue) => session.updateTypedValue(caseField, typedValue)}
                      onChooseTick={(chosenOption) => onChooseTick(caseField, chosenOption)}
                      onCommit={() => session.commitField(caseField)}
                      onRestore={() => session.restoreField(caseField)}
                      onViewSource={() => onViewSource(caseField)}
                      onAddDocument={() => onAddDocument(nomineeNumber)} />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
