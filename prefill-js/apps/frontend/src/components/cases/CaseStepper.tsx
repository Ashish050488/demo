import Link from "next/link";

const CASE_STEPS = [
  { key: "form", label: "Form" },
  { key: "documents", label: "Documents" },
  { key: "review", label: "Review" },
  { key: "confirm", label: "Save" },
] as const;

export type CaseStepKey = (typeof CASE_STEPS)[number]["key"];

/** Steps already passed are links back; the current one is highlighted. */
export default function CaseStepper({ currentStep, caseId }: { currentStep: CaseStepKey; caseId?: string }) {
  const currentIndex = CASE_STEPS.findIndex((step) => step.key === currentStep);
  return (
    <ol className="flex items-center gap-2 text-xs">
      {CASE_STEPS.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        const href = step.key === "form" ? "/cases/new" : caseId ? `/cases/${caseId}/${step.key}` : null;
        const label = (
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${isCurrent ? "bg-brand-500 text-white" : isDone ? "bg-brand-50 text-brand-700" : "text-muted"}`}>
            <span className="font-semibold">{index + 1}</span>{step.label}
          </span>
        );
        return (
          <li key={step.key} className="flex items-center gap-2">
            {index > 0 ? <span className="h-px w-4 bg-line" /> : null}
            {isDone && href ? <Link href={href} className="hover:underline">{label}</Link> : label}
          </li>
        );
      })}
    </ol>
  );
}
