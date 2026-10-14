"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchBatches } from "@/api/batches-api";
import type { BatchListEntry } from "@/types/batches";
import { formatDateTime } from "@/utils/format-date";

const MAXIMUM_RECENT_BATCHES = 5;

/** The last few batches, under the Batch choice on Home. Hidden when there are none. */
export default function RecentBatchesList() {
  const [recentBatches, setRecentBatches] = useState<BatchListEntry[]>([]);
  useEffect(() => { fetchBatches().then((batches) => setRecentBatches(batches.filter((batchEntry) => batchEntry.startedAt).slice(0, MAXIMUM_RECENT_BATCHES))).catch(() => {}); }, []);
  if (!recentBatches.length) return null;
  return (
    <section className="rounded-xl border border-line bg-white">
      <h2 className="border-b border-line px-4 py-2 text-xs font-semibold text-muted">Recent batches</h2>
      <ul className="divide-y divide-line">
        {recentBatches.map((batchEntry) => (
          <li key={batchEntry.id}>
            <Link href={`/batches/${batchEntry.id}`} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-canvas">
              <span className="truncate font-medium">{batchEntry.sheetFileName}</span>
              <span className="shrink-0 text-muted">{batchEntry.clientCount} clients</span>
              <span className="ml-auto shrink-0 text-muted">{formatDateTime(batchEntry.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
