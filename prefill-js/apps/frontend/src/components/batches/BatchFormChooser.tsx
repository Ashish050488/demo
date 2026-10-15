import { getBatchTemplateUrl, getCombinedBatchTemplateUrl } from "@/api/forms-api";
import type { FormSummary } from "@/types/forms";

interface BatchFormChooserProps {
  forms: FormSummary[];
  chosenFormIds: string[];
  isDisabled: boolean;
  onChange: (chosenFormIds: string[]) => void;
}

/** Tick one form, or several to fill each client's forms from one Excel. At least one stays ticked. */
export default function BatchFormChooser({ forms, chosenFormIds, isDisabled, onChange }: BatchFormChooserProps) {
  const toggleForm = (formId: string) => {
    const isChosen = chosenFormIds.includes(formId);
    if (isChosen && chosenFormIds.length === 1) return;
    // Keep the forms in list order, so the first ticked form is always the same one (its case gets the documents).
    onChange(forms.map((form) => form.formId).filter((candidateId) => (candidateId === formId ? !isChosen : chosenFormIds.includes(candidateId))));
  };
  const templateUrl = chosenFormIds.length > 1 ? getCombinedBatchTemplateUrl(chosenFormIds) : chosenFormIds[0] ? getBatchTemplateUrl(chosenFormIds[0]) : null;
  return (
    <div>
      <div className="space-y-1.5" role="group" aria-label="Forms">
        {forms.map((form) => {
          const isChosen = chosenFormIds.includes(form.formId);
          return (
            <button key={form.formId} type="button" role="checkbox" aria-checked={isChosen} disabled={isDisabled} onClick={() => toggleForm(form.formId)}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition disabled:opacity-60 ${isChosen ? "border-ink bg-white" : "border-line bg-white/60 text-muted hover:border-ink/40"}`}>
              <span className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded border text-[9px] leading-none ${isChosen ? "border-ink bg-ink text-white" : "border-line"}`}>{isChosen ? "✓" : ""}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink" title={form.label}>{form.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {chosenFormIds.length > 1 ? "Each client gets every ticked form, from one Excel. " : "Tick more than one to fill several forms per client. "}
        {templateUrl ? <a href={templateUrl} className="text-brand-600 hover:underline">{chosenFormIds.length > 1 ? "Combined Excel template" : "Excel template"}</a> : null}
      </p>
    </div>
  );
}
