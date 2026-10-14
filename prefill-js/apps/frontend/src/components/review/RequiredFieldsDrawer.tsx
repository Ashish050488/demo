"use client";
import { formatFieldLabel, getNomineeNumber } from "@prefill/shared";
import { useState } from "react";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Drawer from "@/components/ui/Drawer";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { ReviewSession } from "@/hooks/useReviewSession";
import type { CaseField } from "@/types/cases";
import { getEffectiveValue, getFieldState } from "@/utils/review-field-helpers";
import type { ReviewSection } from "@/utils/review-sections";
import FieldCell from "./FieldCell";

type RequiredFieldStatus = "missing" | "invalid" | "filled";
type RowFilter = "all" | "left";

interface RequiredFieldsDrawerProps {
  session: ReviewSession;
  sections: ReviewSection[];
  isOpen: boolean;
  onClose: () => void;
  onJumpToField: (fieldKey: string) => void;
  onChooseTick: (caseField: CaseField, chosenOption: string) => void;
}

const STATUS_BADGES: Record<RequiredFieldStatus, { text: string; tone: BadgeTone }> = {
  missing: { text: "Not filled", tone: "danger" },
  invalid: { text: "Wrong value", tone: "warning" },
  filled: { text: "Filled", tone: "success" },
};
const ROW_FILTER_OPTIONS = [{ key: "all" as const, label: "All required" }, { key: "left" as const, label: "Only not filled" }];

/** Quick fill: every mandatory field (for the nominees in use) with its own input, so a reviewer can fill just
 * the mandatory ones without opening each section. Rows stay in form order while you type. */
export default function RequiredFieldsDrawer({ session, sections, isOpen, onClose, onJumpToField, onChooseTick }: RequiredFieldsDrawerProps) {
  const { formRules, formCheck, editedValues, shownFields } = session;
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [rowsLeftWhenFiltered, setRowsLeftWhenFiltered] = useState<Set<string>>(new Set());
  const requiredBaseKeys = new Set(formRules?.requiredFields || []);
  const missingKeys = new Set(formCheck.missing);
  const invalidReasons = new Map(formCheck.invalid.map((problem) => [problem.field, problem.reason]));
  const isNomineeInUse = (nomineeNumber: number) => nomineeNumber === 1
    || shownFields.some((caseField) => getNomineeNumber(caseField.field) === nomineeNumber && !caseField.isTickbox && getEffectiveValue(caseField, editedValues));
  const statusOf = (fieldKey: string): RequiredFieldStatus => (missingKeys.has(fieldKey) ? "missing" : invalidReasons.has(fieldKey) ? "invalid" : "filled");

  const groups = sections.map((section) => ({
    section,
    requiredFields: section.fields.filter((caseField) => missingKeys.has(caseField.field)
      || (requiredBaseKeys.has(caseField.field.replace(/_n\d+$/, "")) && isNomineeInUse(getNomineeNumber(caseField.field) || 1))),
  })).filter((group) => group.requiredFields.length);
  const allRequiredFields = groups.flatMap((group) => group.requiredFields);
  const leftCount = allRequiredFields.filter((caseField) => statusOf(caseField.field) !== "filled").length;

  // "Only not filled" keeps the rows that were left when it was switched on - a row doesn't vanish mid-typing.
  const handleFilterChange = (nextFilter: RowFilter) => {
    setRowsLeftWhenFiltered(new Set(allRequiredFields.filter((caseField) => statusOf(caseField.field) !== "filled").map((caseField) => caseField.field)));
    setRowFilter(nextFilter);
  };
  const isRowShown = (caseField: CaseField) => rowFilter === "all" || rowsLeftWhenFiltered.has(caseField.field);

  const title = <>Required fields <span className="font-normal text-muted">· {allRequiredFields.length - leftCount} of {allRequiredFields.length} done</span></>;
  return (
    <Drawer title={title} isOpen={isOpen} onClose={onClose}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-2">
        <SegmentedControl options={ROW_FILTER_OPTIONS} activeKey={rowFilter} onChange={handleFilterChange} />
        <span className="text-[11px] text-muted">Type here · Show opens it on the form</span>
      </div>
      {groups.map(({ section, requiredFields }) => {
        const shownRows = requiredFields.filter(isRowShown);
        if (!shownRows.length) return null;
        return (
          <section key={section.key} className="border-b border-line">
            <h3 className="bg-canvas px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{section.label}</h3>
            <ul className="divide-y divide-line/60">
              {shownRows.map((caseField) => {
                const status = statusOf(caseField.field);
                const nomineeNumber = getNomineeNumber(caseField.field);
                const effectiveValue = getEffectiveValue(caseField, editedValues);
                return (
                  <li key={caseField.field} className="px-5 py-2.5">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[12px] font-medium">{formatFieldLabel(caseField.field)}{nomineeNumber ? <span className="font-normal text-muted"> · Nominee {nomineeNumber}</span> : null}</span>
                      <button type="button" onClick={() => { onClose(); onJumpToField(caseField.field); }} className="text-[11px] text-brand-600 hover:underline">Show</button>
                      <span className="ml-auto"><Badge isSoft tone={STATUS_BADGES[status].tone}>{STATUS_BADGES[status].text}</Badge></span>
                    </div>
                    <FieldCell caseField={caseField} effectiveValue={effectiveValue} isWide isSelected={false}
                      fieldState={getFieldState(caseField, effectiveValue, formCheck, editedValues.has(caseField.field))}
                      problemText={invalidReasons.get(caseField.field) || null} onSelect={() => {}}
                      onChange={(typedValue) => session.updateTypedValue(caseField, typedValue)}
                      onChooseTick={(chosenOption) => onChooseTick(caseField, chosenOption)} onCommit={() => session.commitField(caseField)} />
                    {status === "invalid" ? <p className="mt-1 text-[11px] text-amber-800">{invalidReasons.get(caseField.field)}</p> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!groups.length ? <p className="p-6 text-center text-sm text-muted">This form has no required fields set. Choose them in Form setup.</p> : null}
      {groups.length && rowFilter === "left" && !rowsLeftWhenFiltered.size ? <p className="p-6 text-center text-sm text-emerald-700">✓ Every required field is filled.</p> : null}
    </Drawer>
  );
}
