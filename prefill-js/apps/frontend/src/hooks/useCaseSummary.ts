"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchCase } from "@/api/cases-api";
import type { CaseSummary } from "@/types/cases";

const POLL_INTERVAL_MILLISECONDS = 1200;

/** The case and its documents, re-fetched every ~1s while any document is still being read. */
export function useCaseSummary(caseId: string) {
  const [caseSummary, setCaseSummary] = useState<CaseSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reloadCase = useCallback(async () => {
    try {
      setCaseSummary(await fetchCase(caseId));
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, [caseId]);

  useEffect(() => { reloadCase(); }, [reloadCase]);

  const isAnyDocumentProcessing = Boolean(caseSummary?.documents.some((caseDocument) => caseDocument.status === "processing"));
  useEffect(() => {
    if (!isAnyDocumentProcessing) return;
    const pollTimer = setInterval(reloadCase, POLL_INTERVAL_MILLISECONDS);
    return () => clearInterval(pollTimer);
  }, [isAnyDocumentProcessing, reloadCase]);

  return { caseSummary, loadError, reloadCase, isAnyDocumentProcessing };
}
