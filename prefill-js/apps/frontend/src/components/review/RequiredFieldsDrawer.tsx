"use client";
import { formatFieldLabel, getNomineeNumber } from "@prefill/shared";
import Drawer from "@/components/ui/Drawer";
import type { ReviewSession } from "@/hooks/useReviewSession";
import { getEffectiveValue } from "@/utils/review-field-helpers";
import type { ReviewSection } from "@/utils/review-sections";

type RequiredFieldStatus = "missing" | "invalid" | "filled";

interface RequiredFieldsDrawerProps {
  session: ReviewSession;
  sections: ReviewSection[];
  isOpen: boolean;
  onClose: () => void;
  onJumpToField: (fieldKey: string) => void;
}

const STATUS_BADGES: Record<RequiredFieldStatus, { text: string; classes: string }> = {
  missing: { text: "Not filled", classes: "bg-red-50 text-red-700" },
  invalid: { text: "Wrong value", classes: "bg-amber-50 text-amber-800" },
  filled: { text: "Filled", classes: "bg-emerald-50 text-emerald-700" },
};

/** Every mandatory field (for the nominees in use), filled or not, grouped by section; click to jump to it. */
export default function RequiredFieldsDrawer({ session, sections, isOpen, onClose, onJumpToField }: RequiredFieldsDrawerProps) {
  const { formRules, formCheck, editedValues, shownFields } = session;
  const requiredBaseKeys = new Set(formRules?.requiredFields || []);
  const missingKeys = new Set(formCheck.missing);
  const invalidReasons = new Map(formCheck.invalid.map((problem) => [problem.field, problem.reason]));
  const isNomineeInUse = (nomineeNumber: number) => nomineeNumber === 1
    || shownFields.some((caseField) => getNomineeNumber(caseField.field) === nomineeNumber && !caseField.isTickbox && getEffectiveValue(caseField, editedValues));

  const groups = sections.map((section) => {
    const requiredRows = section.fields
      .filter((caseField) => missingKeys.has(caseField.field) || (requiredBaseKeys.has(caseField.field.replace(/_n\d+$/, ""))
        && isNomineeInUse(getNomineeNumber(caseField.field) || 1)))
      .map((caseField) => {
        const status: RequiredFieldStatus = missingKeys.has(caseField.field) ? "missing" : invalidReasons.has(caseField.field) ? "invalid" : "filled";
        return { caseField, status, effectiveValue: getEffectiveValue(caseField, editedValues) };
      })
      .sort((first, second) => Number(first.status === "filled") - Number(second.status === "filled"));
    return { section, requiredRows };
  }).filter((group) => group.requiredRows.length);

  const allRows = groups.flatMap((group) => group.requiredRows);
  const leftCount = allRows.filter((row) => row.status !== "filled").length;
  const title = <>Required fields <span className="font-normal text-muted">· {allRows.length - leftCount} of {allRows.length} done</span></>;
  return (
    <Drawer title={title} isOpen={isOpen} onClose={onClose}>
      {groups.map(({ section, requiredRows }) => (
        <section key={section.key} className="border-b border-line">
          <h3 className="bg-canvas px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{section.label}</h3>
          <ul>
            {requiredRows.map(({ caseField, status, effectiveValue }) => {
              const nomineeNumber = getNomineeNumber(caseField.field);
              return (
                <li key={caseField.field}>
                  <button type="button" onClick={() => { onClose(); onJumpToField(caseField.field); }}
                    className="flex w-full items-center gap-3 px-5 py-2 text-left hover:bg-canvas">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium">{formatFieldLabel(caseField.field)}{nomineeNumber ? <span className="font-normal text-muted"> · Nominee {nomineeNumber}</span> : null}</div>
                      <div className={`truncate text-xs ${status === "filled" ? "text-muted" : status === "invalid" ? "text-amber-800" : "text-red-700"}`}>
                        {status === "filled" ? effectiveValue : status === "invalid" ? invalidReasons.get(caseField.field) : "Needs a value"}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGES[status].classes}`}>{STATUS_BADGES[status].text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!groups.length ? <p className="p-6 text-center text-sm text-muted">This form has no required fields set. Choose them in Form setup.</p> : null}
    </Drawer>
  );
}
