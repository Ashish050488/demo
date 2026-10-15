"use client";
import { useEffect, useState } from "react";

interface PageJumpButtonProps {
  pageNumber: number;
  pageCount: number;
  /** Pages that have something to fill - offered as one-click shortcuts. */
  fillPages: number[];
  onJump: (pageNumber: number) => void;
}

/** "Page 17 / 65": click it to type any page, or pick one of the pages that have fields. */
export default function PageJumpButton({ pageNumber, pageCount, fillPages, onJump }: PageJumpButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [typedPage, setTypedPage] = useState("");
  useEffect(() => { setIsOpen(false); }, [pageNumber]); // moved by any other way: close
  const jump = (targetPage: number) => {
    if (Number.isInteger(targetPage) && targetPage >= 1 && targetPage <= pageCount) onJump(targetPage);
    setIsOpen(false);
    setTypedPage("");
  };
  return (
    <div className="relative">
      <button type="button" onClick={() => setIsOpen((current) => !current)} title="Go to a page"
        className="w-[5.5rem] rounded-full px-1 py-0.5 text-center tabular-nums text-ink hover:bg-canvas">Page {pageNumber} / {pageCount} ▾</button>
      {isOpen ? (
        <div className="absolute left-0 top-8 z-30 w-80 rounded-xl border border-line bg-white p-3 text-xs shadow-lg">
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); jump(Number(typedPage)); }}>
            <input autoFocus type="number" min={1} max={pageCount} value={typedPage} onChange={(event) => setTypedPage(event.target.value)}
              placeholder={`Page 1-${pageCount}`} className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1 tabular-nums"
              onKeyDown={(event) => { if (event.key === "Escape") setIsOpen(false); }} />
            <button type="submit" className="rounded-lg bg-ink px-3 py-1 font-medium text-white">Go</button>
          </form>
          <div className="mb-1.5 mt-3 flex items-center gap-2 text-muted">
            All {pageCount} pages <span className="ml-auto flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-500" />has fields</span>
          </div>
          <div className="grid max-h-60 grid-cols-8 gap-1 overflow-auto">
            {Array.from({ length: pageCount }, (_unused, index) => index + 1).map((candidatePage) => {
              const hasFields = fillPages.includes(candidatePage);
              return (
                <button key={candidatePage} type="button" onClick={() => jump(candidatePage)} title={hasFields ? `Page ${candidatePage} - has fields` : `Page ${candidatePage}`}
                  className={`h-7 rounded-md tabular-nums ${candidatePage === pageNumber ? "bg-ink text-white" : hasFields ? "bg-brand-50 font-semibold text-brand-700 ring-1 ring-brand-500/40 hover:bg-brand-100" : "text-muted hover:bg-canvas"}`}>{candidatePage}</button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
