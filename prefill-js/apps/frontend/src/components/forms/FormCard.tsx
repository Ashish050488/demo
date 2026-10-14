import type { ReactNode } from "react";
import type { FormSummary } from "@/types/forms";

interface FormCardProps {
  form: FormSummary;
  actions?: ReactNode;
  onSelect?: () => void;
  isDisabled?: boolean;
}

/** One form, named exactly as printed, with what it's for, its file name and the fields that identify it. */
export default function FormCard({ form, actions, onSelect, isDisabled = false }: FormCardProps) {
  const content = (
    <>
      <div className="text-[15px] font-semibold leading-snug">{form.label}</div>
      <div className="mt-1 text-[13px] text-muted">{form.purpose}</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {form.keyFields.map((keyField) => <span key={keyField} className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted">{keyField}</span>)}
        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted">Up to {form.supportedNomineeCount} nominees</span>
      </div>
      {form.blankFileName.replace(/\.pdf$/i, "") !== form.label
        ? <div className="mt-3 truncate text-[11px] text-muted" title={form.blankFileName}>📄 {form.blankFileName}</div>
        : null}
    </>
  );
  const cardClasses = "rounded-xl border border-line bg-white p-5 text-left";
  if (onSelect) {
    return (
      <button type="button" disabled={isDisabled} onClick={onSelect} className={`${cardClasses} transition hover:border-brand-500 hover:shadow-sm disabled:opacity-60`}>
        {content}
      </button>
    );
  }
  return <div className={cardClasses}>{content}{actions ? <div className="mt-4 flex gap-2">{actions}</div> : null}</div>;
}
