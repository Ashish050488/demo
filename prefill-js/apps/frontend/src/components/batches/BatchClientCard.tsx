import Link from "next/link";
import type { BatchClient, ClientStage } from "@/types/batches";

export const STAGE_DETAILS: Record<ClientStage, { label: string; pillClasses: string; isFinished: boolean }> = {
  waiting: { label: "Waiting", pillClasses: "bg-canvas text-muted", isFinished: false },
  reading: { label: "Reading documents", pillClasses: "bg-blue-50 text-blue-800", isFinished: false },
  filling: { label: "Filling", pillClasses: "bg-brand-50 text-brand-700", isFinished: false },
  done: { label: "Done", pillClasses: "bg-emerald-50 text-emerald-800", isFinished: true },
  needs_fixing: { label: "Needs fixing", pillClasses: "bg-amber-50 text-amber-800", isFinished: true },
  failed: { label: "Failed", pillClasses: "bg-red-50 text-red-800", isFinished: true },
  saved: { label: "Saved", pillClasses: "bg-ink text-white", isFinished: true },
};

function describeProgress(client: BatchClient): string {
  switch (client.stage) {
    case "waiting": return client.documentCount ? `${client.documentCount} document${client.documentCount === 1 ? "" : "s"} · in the queue` : "Excel only · in the queue";
    case "reading": return `Reading ${client.readDocumentCount} of ${client.documentCount} documents…`;
    case "filling": return "Filling the form…";
    case "failed": return client.error || "Filling failed";
    default: return `${client.filledCount ?? 0} of ${client.fieldCount ?? 0} fields filled`;
  }
}

/** One client in a batch. Finished ones open the normal review screen; others open their documents. */
export default function BatchClientCard({ client }: { client: BatchClient }) {
  const stageDetails = STAGE_DETAILS[client.stage];
  const isWorking = client.stage === "reading" || client.stage === "filling";
  const href = stageDetails.isFinished && client.stage !== "failed" ? `/cases/${client.caseId}/review` : `/cases/${client.caseId}/documents`;
  const readShare = client.stage === "reading" && client.documentCount ? client.readDocumentCount / client.documentCount : null;
  return (
    <Link href={href} className="group flex flex-col gap-2 rounded-xl border border-line bg-white p-3.5 transition hover:border-ink hover:shadow-sm">
      <div className="flex items-center gap-2">
        <span className="truncate rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-muted">{client.clientReference || `Row ${client.rowNumber}`}</span>
        <span className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${stageDetails.pillClasses}`}>
          {isWorking ? <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
          {stageDetails.label}
        </span>
      </div>
      <div className="truncate text-sm font-semibold" title={client.displayName || undefined}>{client.displayName || <span className="font-normal text-muted">No name in the sheet</span>}</div>
      <div className="h-1 overflow-hidden rounded-full bg-canvas">
        <div className={`h-full rounded-full transition-all duration-500 ${client.stage === "needs_fixing" ? "bg-amber-500" : client.stage === "failed" ? "bg-red-500" : "bg-brand-500"}`}
          style={{ width: `${stageDetails.isFinished ? 100 : client.stage === "filling" ? 80 : readShare != null ? 15 + readShare * 55 : 5}%` }} />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="truncate">{describeProgress(client)}</span>
        {client.stage === "needs_fixing" && client.problemCount ? <span className="ml-auto shrink-0 font-medium text-amber-800">{client.problemCount} to fix</span> : null}
        {stageDetails.isFinished && client.stage !== "failed" ? <span className="ml-auto shrink-0 text-ink opacity-0 transition group-hover:opacity-100">Review →</span> : null}
      </div>
    </Link>
  );
}
