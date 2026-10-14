"use client";
import { useEffect, useRef, useState } from "react";
import { fetchPreviewImage } from "@/api/cases-api";
import type { CaseField } from "@/types/cases";

const PREVIEW_DEBOUNCE_MILLISECONDS = 400;

interface FormPreviewPaneProps {
  caseId: string;
  selectedField: CaseField | null;
  previewValue: string;
}

/** The selected field's page, re-rendered (debounced) with whatever is typed, and the field boxed. */
export default function FormPreviewPane({ caseId, selectedField, previewValue }: FormPreviewPaneProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const latestRequestNumber = useRef(0);

  useEffect(() => {
    if (!selectedField?.page) return;
    const requestNumber = ++latestRequestNumber.current;
    const previewTimer = setTimeout(async () => {
      setIsUpdating(true);
      setHasFailed(false);
      try {
        const previewBlob = await fetchPreviewImage(caseId, selectedField.field, previewValue);
        if (requestNumber !== latestRequestNumber.current) return; // a later edit wins
        setImageUrl((previousUrl) => { if (previousUrl) URL.revokeObjectURL(previousUrl); return URL.createObjectURL(previewBlob); });
      } catch {
        if (requestNumber === latestRequestNumber.current) setHasFailed(true);
      } finally {
        if (requestNumber === latestRequestNumber.current) setIsUpdating(false);
      }
    }, PREVIEW_DEBOUNCE_MILLISECONDS);
    return () => clearTimeout(previewTimer);
  }, [caseId, selectedField, previewValue]);

  const highlightBox = selectedField?.boxes[0];
  useEffect(() => {
    if (!highlightBox || !scroller.current) return;
    const stageHeight = scroller.current.scrollHeight;
    scroller.current.scrollTo({ top: Math.max(0, highlightBox[1] * stageHeight - scroller.current.clientHeight / 3), behavior: "smooth" });
  }, [highlightBox, imageUrl]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 items-center gap-3 border-b border-line px-3 text-xs text-muted">
        <span>{selectedField?.page ? `Page ${selectedField.page}` : "No page for this field"}</span>
        <span className="ml-auto">{isUpdating ? "Updating…" : hasFailed ? <span className="text-red-700">Preview failed</span> : null}</span>
      </div>
      <div ref={scroller} className="relative flex-1 overflow-auto bg-canvas p-3">
        {imageUrl ? (
          <div className="relative mx-auto max-w-3xl">
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL from the local API */}
            <img src={imageUrl} alt="Filled form page" className="w-full rounded border border-line bg-white shadow-sm" />
            {highlightBox ? (
              <div className="pointer-events-none absolute rounded-sm border-2 border-brand-500 bg-brand-500/10"
                style={{ left: `${highlightBox[0] * 100}%`, top: `${highlightBox[1] * 100}%`, width: `${(highlightBox[2] - highlightBox[0]) * 100}%`, height: `${(highlightBox[3] - highlightBox[1]) * 100}%` }} />
            ) : null}
          </div>
        ) : <p className="p-8 text-center text-sm text-muted">Select a field to see it on the form.</p>}
      </div>
    </div>
  );
}
