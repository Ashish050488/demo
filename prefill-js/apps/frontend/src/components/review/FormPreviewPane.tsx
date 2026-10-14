"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fetchPreviewImage } from "@/api/cases-api";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Skeleton from "@/components/ui/Skeleton";
import StatusState from "@/components/ui/StatusState";
import { usePinchZoom } from "@/hooks/usePinchZoom";
import type { CaseField } from "@/types/cases";

const TYPING_DEBOUNCE_MILLISECONDS = 400;
const FOCUS_POSITION_FROM_TOP = 0.35; // where the selected field sits in Focus view, as a share of the panel height
const PREVIEW_MODE_STORAGE_KEY = "prefill.preview-mode";
type PreviewMode = "focus" | "page";

interface FormPreviewPaneProps {
  caseId: string;
  selectedField: CaseField | null;
  previewValue: string;
  pageCount: number;
  headerActions?: ReactNode;
}

/** The image on screen and what it shows - layout follows this, not the request in flight, so nothing jumps. */
interface ShownImage { url: string; pageNumber: number; boxes: number[][] }

function readSavedPreviewMode(): PreviewMode {
  try { return localStorage.getItem(PREVIEW_MODE_STORAGE_KEY) === "page" ? "page" : "focus"; } catch { return "focus"; }
}

/** The selected field's page with the typed value drawn in. "Focus": full panel width, moved so the selected
 * field is in view. "Whole page": the entire page fitted into the panel. The ‹ › buttons browse any page. */
export default function FormPreviewPane({ caseId, selectedField, previewValue, pageCount, headerActions }: FormPreviewPaneProps) {
  const [shownImage, setShownImage] = useState<ShownImage | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("focus");
  const [pageAspectRatio, setPageAspectRatio] = useState(0.707);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  // A page the reviewer browsed to with the page buttons; null = follow the selected field's page.
  const [browsedPageNumber, setBrowsedPageNumber] = useState<number | null>(null);
  const fieldPageNumber = selectedField?.page ?? null;
  const requestedPageNumber = browsedPageNumber ?? fieldPageNumber ?? 1;
  const viewport = useRef<HTMLDivElement>(null);
  const latestRequestNumber = useRef(0);
  const lastRequestTarget = useRef("");
  const { zoomState, resetZoom } = usePinchZoom(viewport);

  // The view (Focus / Whole page) is the reviewer's choice - keep it across refreshes.
  useEffect(() => { setPreviewMode(readSavedPreviewMode()); }, []);
  function choosePreviewMode(nextMode: PreviewMode) {
    setPreviewMode(nextMode);
    try { localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, nextMode); } catch { /* storage blocked - the choice lasts this visit */ }
  }

  useEffect(() => { setBrowsedPageNumber(null); }, [selectedField?.field]);
  useEffect(() => { resetZoom(); }, [selectedField?.field, previewMode, requestedPageNumber, resetZoom]);

  useEffect(() => {
    if (!viewport.current) return;
    const resizeObserver = new ResizeObserver(([entry]) => setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    resizeObserver.observe(viewport.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedField?.page && browsedPageNumber == null) return;
    const requestNumber = ++latestRequestNumber.current;
    // Only typing waits; moving to another field or page loads at once.
    const requestTarget = `${selectedField?.field}|${browsedPageNumber}|${retryCount}`;
    const isTypingOnly = requestTarget === lastRequestTarget.current;
    lastRequestTarget.current = requestTarget;
    const boxes = browsedPageNumber == null || browsedPageNumber === fieldPageNumber ? selectedField?.boxes || [] : [];
    const previewTimer = setTimeout(async () => {
      setIsUpdating(true);
      try {
        const previewBlob = await fetchPreviewImage(caseId, selectedField?.field ?? null, previewValue, browsedPageNumber);
        if (requestNumber !== latestRequestNumber.current) return; // a later request wins
        const url = URL.createObjectURL(previewBlob);
        setShownImage((previousImage) => { if (previousImage) URL.revokeObjectURL(previousImage.url); return { url, pageNumber: requestedPageNumber, boxes }; });
        setLoadError(null);
      } catch (error) {
        if (requestNumber === latestRequestNumber.current) setLoadError((error as Error).message || "The preview could not be drawn");
      } finally {
        if (requestNumber === latestRequestNumber.current) setIsUpdating(false);
      }
    }, isTypingOnly ? TYPING_DEBOUNCE_MILLISECONDS : 0);
    return () => clearTimeout(previewTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestedPageNumber/fieldPageNumber follow selectedField + browsedPageNumber
  }, [caseId, selectedField, previewValue, browsedPageNumber, retryCount]);

  const fieldBoxes = shownImage?.boxes || [];
  const highlightBox = fieldBoxes.length
    ? [Math.min(...fieldBoxes.map((box) => box[0])), Math.min(...fieldBoxes.map((box) => box[1])), Math.max(...fieldBoxes.map((box) => box[2])), Math.max(...fieldBoxes.map((box) => box[3]))]
    : null;
  // Focus follows a field; a page browsed to without its field is shown whole.
  const isFocusMode = previewMode === "focus" && Boolean(highlightBox);
  const focusPageHeight = viewportSize.width / pageAspectRatio;
  const focusOffset = isFocusMode && highlightBox
    ? Math.min(Math.max(0, highlightBox[1] * focusPageHeight - viewportSize.height * FOCUS_POSITION_FROM_TOP), Math.max(0, focusPageHeight - viewportSize.height))
    : 0;
  const pageStyle = isFocusMode
    ? { width: "100%", transform: `translateY(${-focusOffset}px)` }
    : { height: "100%", aspectRatio: String(pageAspectRatio), maxWidth: "100%", margin: "0 auto" };
  const isAwayFromField = fieldPageNumber != null && requestedPageNumber !== fieldPageNumber;
  const pageButtonClasses = "grid h-7 w-7 place-items-center rounded-full border border-line text-ink hover:bg-canvas disabled:opacity-30";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center gap-2 whitespace-nowrap border-b border-line bg-white px-3 text-xs text-muted">
        {headerActions}
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous page" disabled={requestedPageNumber <= 1} onClick={() => setBrowsedPageNumber(requestedPageNumber - 1)} className={pageButtonClasses}>‹</button>
          <span className="w-[4.5rem] text-center tabular-nums text-ink">Page {requestedPageNumber} / {pageCount}</span>
          <button type="button" aria-label="Next page" disabled={requestedPageNumber >= pageCount} onClick={() => setBrowsedPageNumber(requestedPageNumber + 1)} className={pageButtonClasses}>›</button>
        </div>
        {isAwayFromField ? (
          <button type="button" title={`Back to the selected field on page ${fieldPageNumber}`} onClick={() => setBrowsedPageNumber(null)}
            className="rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700 hover:bg-brand-100">↩ Field</button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {zoomState.zoom > 1 ? (
            <button type="button" onClick={resetZoom} className="rounded-full border border-line px-2.5 py-1 text-ink hover:bg-canvas">{Math.round(zoomState.zoom * 100)}% · Reset</button>
          ) : null}
          <SegmentedControl activeKey={previewMode} onChange={choosePreviewMode} options={[{ key: "focus", label: "Focus" }, { key: "page", label: "Whole page" }]} />
        </div>
      </div>
      <div ref={viewport} title="Pinch or Ctrl + scroll to zoom" className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
        {loadError && !shownImage ? (
          <StatusState tone="error" title="Preview could not load" message={loadError} actionLabel="Try again" onAction={() => setRetryCount((count) => count + 1)} />
        ) : shownImage ? (
          <div className="h-full origin-top-left" style={{ transform: `translate(${zoomState.panX}px, ${zoomState.panY}px) scale(${zoomState.zoom})` }}>
            {/* keyed by page: a new page appears in place instead of sliding from the old page's position */}
            <div key={shownImage.pageNumber} className="relative transition-transform duration-300 ease-out" style={pageStyle}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL from the local API */}
              <img src={shownImage.url} alt={`Filled form, page ${shownImage.pageNumber}`} className="block h-full w-full bg-white object-contain shadow"
                onLoad={(event) => setPageAspectRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
                onDoubleClick={() => choosePreviewMode(isFocusMode ? "page" : "focus")} />
              {highlightBox ? (
                <div className="pointer-events-none absolute rounded-sm border-2 border-brand-500 bg-brand-500/10"
                  style={{ left: `${highlightBox[0] * 100}%`, top: `${highlightBox[1] * 100}%`, width: `${(highlightBox[2] - highlightBox[0]) * 100}%`, height: `${(highlightBox[3] - highlightBox[1]) * 100}%` }} />
              ) : null}
            </div>
          </div>
        ) : isUpdating ? (
          <div className="mx-auto h-full p-4" style={{ aspectRatio: "0.707" }}><Skeleton className="h-full w-full bg-white" /></div>
        ) : (
          <StatusState title="Nothing to preview yet" message="Select a field, or use ‹ › to open a page of the form." />
        )}
        {shownImage && (isUpdating || loadError) ? (
          <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full border border-line bg-white/95 px-3 py-1 text-xs shadow-sm">
            {isUpdating ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />{shownImage.pageNumber === requestedPageNumber ? "Updating…" : `Loading page ${requestedPageNumber}…`}</>
              : <><span className="text-red-700">Preview failed</span><button type="button" className="font-medium text-ink underline" onClick={() => setRetryCount((count) => count + 1)}>Retry</button></>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
