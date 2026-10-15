"use client";
import Link from "next/link";
import type { BatchListEntry } from "@/types/batches";
import { formatDateTime } from "@/utils/format-date";

interface RecentBatchesListProps {
  batches: BatchListEntry[];
  formLabels: Record<string, string>;
}

/** Started batches, newest first: the Excel, which forms it fills and for how many clients. */
export default function RecentBatchesList({ batches, formLabels }: RecentBatchesListProps) {
  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-line bg-white">
      <h2 className="flex items-center border-b border-line px-4 py-2.5 text-sm font-semibold">
        Batches <span className="ml-1 font-normal text-muted">({batches.length})</span>
        <Link href="/batches/new" className="ml-auto text-xs font-medium text-brand-600 hover:underline">+ New batch</Link>
      </h2>
      <div className="min-h-0 flex-1 divide-y divide-line overflow-auto">
        {!batches.length ? <p className="p-6 text-center text-sm text-muted">No batches yet.</p> : null}
        {batches.map((batchEntry) => (
          <Link key={batchEntry.id} href={`/batches/${batchEntry.id}`} className="block px-4 py-2.5 hover:bg-canvas">
            <div className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium" title={batchEntry.sheetFileName}>{batchEntry.sheetFileName}</span>
              <span className="shrink-0 text-xs text-muted">{formatDateTime(batchEntry.startedAt || batchEntry.createdAt)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted">
              <span className="mr-1 tabular-nums">{batchEntry.clientCount} client{batchEntry.clientCount === 1 ? "" : "s"}</span>
              {batchEntry.formIds.map((formId) => <span key={formId} className="rounded-full bg-canvas px-2 py-0.5">{formLabels[formId] || formId}</span>)}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
