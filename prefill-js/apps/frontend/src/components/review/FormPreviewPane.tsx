"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fetchPreviewImage } from "@/api/cases-api";
import type { CaseField } from "@/types/cases";

const PREVIEW_DEBOUNCE_MILLISECONDS = 400;

interface FormPreviewPaneProps {
  caseId: string;
  selectedField: CaseField | null;
  previewValue: string;
  headerActions?: ReactNode;
}

/** The selected field's page, re-rendered (debounced) with whatever is typed, and the field boxed. */
export default function FormPreviewPane({ caseId, selectedField, previewValue, headerActions }: FormPreviewPaneProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [isFitWidth, setIsFitWidth] = useState(false);
  const [pageAspectRatio, setPageAspectRatio] = useState(0.707);
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
    if (!highlightBox || !scroller.current || !isFitWidth) return;
    const stageHeight = scroller.current.scrollHeight;
    scroller.current.scrollTo({ top: Math.max(0, highlightBox[1] * stageHeight - scroller.current.clientHeight / 3), behavior: "smooth" });
  }, [highlightBox, imageUrl, isFitWidth]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center gap-3 border-b border-line bg-white px-3 text-xs text-muted">
        {headerActions}
        <span>{selectedField?.page ? `Page ${selectedField.page}` : "No page for this field"}</span>
        <span className="ml-auto">{isUpdating ? "Updating…" : hasFailed ? <span className="text-red-700">Preview failed</span> : null}</span>
        <button type="button" onClick={() => setIsFitWidth(!isFitWidth)} className="rounded-full border border-line px-2.5 py-0.5 text-ink hover:bg-canvas">
          {isFitWidth ? "Fit page" : "Zoom in"}
        </button>
      </div>
      <div ref={scroller} className={`relative min-h-0 flex-1 bg-canvas p-1.5 ${isFitWidth ? "overflow-auto" : "overflow-hidden"}`}>
        {imageUrl ? (
          <div className={isFitWidth ? "relative mx-auto w-full" : "relative mx-auto h-full"} style={isFitWidth ? undefined : { aspectRatio: String(pageAspectRatio), maxWidth: "100%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL from the local API */}
            <img src={imageUrl} alt="Filled form page" className="h-full w-full rounded-sm bg-white object-contain shadow"
              onLoad={(event) => setPageAspectRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
              onDoubleClick={() => setIsFitWidth(!isFitWidth)} />
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
