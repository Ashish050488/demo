import Link from "next/link";
import { STAGE_DETAILS } from "@/components/batches/BatchClientCard";
import type { BatchClient } from "@/types/batches";

/** One client with several forms: a line per form, each with its own stage and its own review link. */
export default function BatchClientFormsCard({ formCases }: { formCases: BatchClient[] }) {
  const [firstCase] = formCases;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3.5">
      <div className="flex items-center gap-2">
        <span className="truncate rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-muted">{firstCase.clientReference || `Row ${firstCase.rowNumber}`}</span>
        <span className="ml-auto text-[11px] text-muted">{firstCase.documentCount ? `${firstCase.documentCount} document${firstCase.documentCount === 1 ? "" : "s"}` : "Excel only"}</span>
      </div>
      <div className="truncate text-sm font-semibold" title={firstCase.displayName || undefined}>{firstCase.displayName || <span className="font-normal text-muted">No name in the sheet</span>}</div>
      <ul className="space-y-1">
        {formCases.map((formCase) => {
          const stageDetails = STAGE_DETAILS[formCase.stage];
          const isWorking = formCase.stage === "reading" || formCase.stage === "filling";
          const canReview = stageDetails.isFinished && formCase.stage !== "failed";
          return (
            <li key={formCase.caseId}>
              <Link href={canReview ? `/cases/${formCase.caseId}/review` : `/cases/${formCase.documentsFromCaseId || formCase.caseId}/documents`}
                className="group flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs hover:border-ink">
                <span className="min-w-0 flex-1 truncate" title={formCase.formLabel}>{formCase.formShortLabel}</span>
                {formCase.stage === "needs_fixing" && formCase.problemCount ? <span className="shrink-0 font-medium text-amber-800">{formCase.problemCount} to fix</span> : null}
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${stageDetails.pillClasses}`}>
                  {isWorking ? <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
                  {stageDetails.label}
                </span>
                {canReview ? <span className="shrink-0 text-ink opacity-40 group-hover:opacity-100">→</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
