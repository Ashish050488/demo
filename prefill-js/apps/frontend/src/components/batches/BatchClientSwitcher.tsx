"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchBatch } from "@/api/batches-api";
import { STAGE_DETAILS } from "@/components/batches/BatchClientCard";
import type { BatchClient, BatchStatus } from "@/types/batches";

/** Where a client's form opens: its review once filled, else its documents (still being read or filled). */
function getClientHref(client: BatchClient) {
  const isReviewable = STAGE_DETAILS[client.stage].isFinished && client.stage !== "failed";
  return isReviewable ? `/cases/${client.caseId}/review` : `/cases/${client.documentsFromCaseId || client.caseId}/documents`;
}

/** Bulk review without going back to the batch: ‹ › to the previous / next client (same form), a list of every
 * client with its status, and one tab per form of this client. */
export default function BatchClientSwitcher({ batchId, caseId }: { batchId: string; caseId: string }) {
  const router = useRouter();
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  useEffect(() => { fetchBatch(batchId).then(setBatchStatus).catch(() => setBatchStatus(null)); }, [batchId, caseId]);
  if (!batchStatus) return <div className="h-10 border-b border-line bg-white" />;

  const currentClient = batchStatus.clients.find((client) => client.caseId === caseId);
  if (!currentClient) return null;
  const rowNumbers = [...new Set(batchStatus.clients.map((client) => client.rowNumber))];
  const formsOfRow = (rowNumber: number) => batchStatus.clients.filter((client) => client.rowNumber === rowNumber);
  const rowIndex = rowNumbers.indexOf(currentClient.rowNumber);
  // The same form for the neighbouring client, so going through one form for everybody is just "›, ›, ›".
  const sameFormOfRow = (rowNumber: number) => formsOfRow(rowNumber).find((client) => client.formId === currentClient.formId) || formsOfRow(rowNumber)[0];
  const goToRow = (targetIndex: number) => { const target = sameFormOfRow(rowNumbers[targetIndex]); if (target) router.push(getClientHref(target)); };
  const clientName = (client: BatchClient) => `${client.clientReference || `Row ${client.rowNumber}`}${client.displayName ? ` · ${client.displayName}` : ""}`;
  const arrowClasses = "grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line text-ink hover:bg-canvas disabled:opacity-30";

  return (
    <div className="flex h-10 items-center gap-2 whitespace-nowrap border-b border-line bg-white px-3 text-xs">
      <span className="shrink-0 text-muted">Client {rowIndex + 1} / {rowNumbers.length}</span>
      <button type="button" aria-label="Previous client" title="Previous client (same form)" disabled={rowIndex <= 0} onClick={() => goToRow(rowIndex - 1)} className={arrowClasses}>‹</button>
      <select aria-label="Switch to another client" value={currentClient.rowNumber} onChange={(event) => goToRow(rowNumbers.indexOf(Number(event.target.value)))}
        className="h-7 min-w-0 max-w-[16rem] flex-1 cursor-pointer truncate rounded-full border border-line bg-white px-2 font-medium text-ink">
        {rowNumbers.map((rowNumber) => {
          const forms = formsOfRow(rowNumber);
          const problemCount = forms.filter((client) => client.stage === "needs_fixing").length;
          return <option key={rowNumber} value={rowNumber}>{clientName(forms[0])}{problemCount ? ` - ${problemCount} to fix` : forms.every((client) => client.stage === "done" || client.stage === "saved") ? " - done" : ""}</option>;
        })}
      </select>
      <button type="button" aria-label="Next client" title="Next client (same form)" disabled={rowIndex >= rowNumbers.length - 1} onClick={() => goToRow(rowIndex + 1)} className={arrowClasses}>›</button>
      {batchStatus.forms.length > 1 ? (
        <div className="ml-auto flex min-w-0 items-center gap-1" role="tablist" aria-label="This client's forms">
          {formsOfRow(currentClient.rowNumber).map((client) => {
            const isCurrent = client.caseId === caseId;
            return (
              <button key={client.caseId} type="button" role="tab" aria-selected={isCurrent} title={client.formLabel} onClick={() => { if (!isCurrent) router.push(getClientHref(client)); }}
                className={`flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 ${isCurrent ? "bg-ink text-white" : "border border-line text-ink hover:bg-canvas"}`}>
                <span className="max-w-[9rem] truncate">{client.formShortLabel}</span>
                {!isCurrent ? <span className={`rounded-full px-1.5 text-[10px] ${STAGE_DETAILS[client.stage].pillClasses}`}>{STAGE_DETAILS[client.stage].label}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
