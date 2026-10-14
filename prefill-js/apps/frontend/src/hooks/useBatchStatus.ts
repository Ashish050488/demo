"use client";
import { useEffect, useState } from "react";
import { fetchBatch, getBatchEventsUrl } from "@/api/batches-api";
import type { BatchStatus } from "@/types/batches";

const FALLBACK_POLL_MILLISECONDS = 3000;

/** A batch's live status: pushed by the server (Server-Sent Events) as each client moves on; if the stream
 * drops, it falls back to polling until it reconnects. */
export function useBatchStatus(batchId: string) {
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const loadOnce = () => fetchBatch(batchId).then((status) => { setBatchStatus(status); setLoadError(null); }).catch((error: Error) => setLoadError(error.message));
    loadOnce();
    const eventSource = new EventSource(getBatchEventsUrl(batchId));
    eventSource.onopen = () => { setIsLive(true); if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
    eventSource.onmessage = (messageEvent) => { setBatchStatus(JSON.parse(messageEvent.data)); setLoadError(null); };
    eventSource.addEventListener("deleted", () => { setIsDeleted(true); eventSource.close(); });
    eventSource.onerror = () => { setIsLive(false); if (!pollTimer) pollTimer = setInterval(loadOnce, FALLBACK_POLL_MILLISECONDS); };
    return () => { eventSource.close(); if (pollTimer) clearInterval(pollTimer); };
  }, [batchId]);

  return { batchStatus, loadError, isLive, isDeleted };
}
