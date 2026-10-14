"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getBatchPdfsUrl } from "@/api/batches-api";
import BatchClientCard, { STAGE_DETAILS } from "@/components/batches/BatchClientCard";
import { ButtonLink } from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import PageContainer from "@/components/ui/PageContainer";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Skeleton from "@/components/ui/Skeleton";
import StatusState from "@/components/ui/StatusState";
import { useBatchStatus } from "@/hooks/useBatchStatus";
import type { BatchClient } from "@/types/batches";

type ClientFilter = "all" | "working" | "needs_fixing" | "done";
const FILTER_MATCHERS: Record<ClientFilter, (client: BatchClient) => boolean> = {
  all: () => true,
  working: (client) => !STAGE_DETAILS[client.stage].isFinished,
  needs_fixing: (client) => client.stage === "needs_fixing" || client.stage === "failed",
  done: (client) => client.stage === "done" || client.stage === "saved",
};

export default function BatchProgressPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const { batchStatus, loadError, isLive, isDeleted } = useBatchStatus(batchId);
  const [clientFilter, setClientFilter] = useState<ClientFilter>("all");
  // Files the upload step could not add (wrong type, too big) - shown once, here.
  const [uploadProblems, setUploadProblems] = useState<string[]>([]);
  useEffect(() => {
    try {
      const storageKey = `batch-upload-problems-${batchId}`;
      setUploadProblems(JSON.parse(window.sessionStorage.getItem(storageKey) || "[]"));
      window.sessionStorage.removeItem(storageKey);
    } catch { /* storage blocked - nothing to show */ }
  }, [batchId]);

  if (isDeleted) return <StatusState title="This batch was deleted" message="Start a new one from Home." />;
  if (loadError && !batchStatus) return <StatusState tone="error" title="This batch could not be opened" message={loadError} />;
  if (!batchStatus) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 p-6" role="status" aria-label="Loading">
        {Array.from({ length: 8 }, (_unused, index) => <Skeleton key={index} className="h-28" />)}
      </div>
    );
  }

  const { clients, stageCounts } = batchStatus;
  const finishedCount = clients.filter((client) => STAGE_DETAILS[client.stage].isFinished).length;
  const attentionCount = stageCounts.needs_fixing + stageCounts.failed;
  const shownClients = clients.filter(FILTER_MATCHERS[clientFilter]);
  const filterOptions: { key: ClientFilter; label: string }[] = [
    { key: "all", label: `All ${clients.length}` },
    { key: "working", label: `In progress ${clients.length - finishedCount}` },
    { key: "needs_fixing", label: `Needs fixing ${attentionCount}` },
    { key: "done", label: `Done ${stageCounts.done + stageCounts.saved}` },
  ];
  return (
    <PageContainer title={`Batch · ${batchStatus.formLabel}`}
      description={`${batchStatus.sheetFileName} · ${clients.length} clients · each card turns ready on its own - open any finished one to review`}
      actions={<>
        <span className={`inline-flex items-center gap-1.5 text-xs ${isLive ? "text-emerald-700" : "text-muted"}`}>
          <span className={`h-2 w-2 rounded-full ${isLive ? "animate-pulse bg-emerald-500" : "bg-line"}`} />{isLive ? "Live" : "Reconnecting…"}
        </span>
        <SegmentedControl options={filterOptions} activeKey={clientFilter} onChange={setClientFilter} />
        {finishedCount ? <ButtonLink href={getBatchPdfsUrl(batchId)} isExternal variant="primary">Download {finishedCount} PDF{finishedCount === 1 ? "" : "s"} (ZIP)</ButtonLink> : null}
      </>}>
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${Math.round((finishedCount / Math.max(1, clients.length)) * 100)}%` }} />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted">{finishedCount} of {clients.length} finished{attentionCount ? ` · ${attentionCount} need fixing` : ""}</span>
        </div>
        {batchStatus.warnings.map((warning) => <Notice key={warning}>{warning}</Notice>)}
        {uploadProblems.length ? <Notice tone="error">Some files were not added: {uploadProblems.slice(0, 5).join("; ")}{uploadProblems.length > 5 ? ` and ${uploadProblems.length - 5} more` : ""}</Notice> : null}
        <div className="min-h-0 flex-1 overflow-auto">
          {shownClients.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 pb-2">
              {shownClients.map((client) => <BatchClientCard key={client.caseId} client={client} />)}
            </div>
          ) : <StatusState title="No client here" message="Nothing matches this filter yet." actionLabel="Show all" onAction={() => setClientFilter("all")} />}
        </div>
      </div>
    </PageContainer>
  );
}
