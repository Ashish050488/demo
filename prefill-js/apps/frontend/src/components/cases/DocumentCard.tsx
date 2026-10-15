"use client";
import { DOCUMENT_DRAG_TYPE } from "@/components/cases/NomineeDocumentGroup";
import type { CaseDocument } from "@/types/cases";


function DocumentStatusLabel({ caseDocument }: { caseDocument: CaseDocument }) {
  if (caseDocument.status === "processing") return <span className="animate-pulse text-xs text-muted">Reading…</span>;
  if (caseDocument.status === "done") return null;
  return <span className="text-xs text-amber-700">{caseDocument.message || "Problem reading this file"}</span>;
}

interface DocumentCardProps {
  caseDocument: CaseDocument;
  onAssign: (nomineeNumber: number) => void;
  /** People this form has (3 nominees; 1 on a subscription form - then there is nowhere to move to). */
  nomineeCount?: number;
  onRemove: () => void;
}

/** One uploaded file: what was read from it. Drag it onto another nominee, or use the quiet "Move" menu. */
export default function DocumentCard({ caseDocument, onAssign, onRemove, nomineeCount = 3 }: DocumentCardProps) {
  const isRead = caseDocument.status === "done";
  return (
    <div draggable={isRead} onDragStart={(event) => { event.dataTransfer.setData(DOCUMENT_DRAG_TYPE, caseDocument.id); event.dataTransfer.effectAllowed = "move"; }}
      className={`group flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2.5 ${isRead ? "cursor-grab active:cursor-grabbing" : ""}`}>
      {isRead ? <span aria-hidden className="select-none text-muted/60 group-hover:text-muted">⋮⋮</span> : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{caseDocument.originalName}</span>
          {caseDocument.documentTypeLabel ? <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">{caseDocument.documentTypeLabel}</span> : null}
          <DocumentStatusLabel caseDocument={caseDocument} />
        </div>
        {isRead && nomineeCount > 1 ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {caseDocument.readFieldLabels.length
              ? caseDocument.readFieldLabels.map((readLabel) => <span key={readLabel} className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">{readLabel}</span>)
              : <span className="text-amber-700">Nothing readable found - try a sharper, closer photo</span>}
            {caseDocument.personName ? <span className="text-muted">· {caseDocument.personName}</span> : null}
            {caseDocument.folderName ? <span className="text-muted">· folder {caseDocument.folderName}</span> : null}
            {caseDocument.assignedBy ? <span className="text-muted/80">· {caseDocument.assignedBy}</span> : null}
          </div>
        ) : null}
      </div>
      {isRead && nomineeCount > 1 ? (
        <select aria-label={`Move ${caseDocument.originalName} to another nominee`} value="" onChange={(event) => onAssign(Number(event.target.value))}
          className="h-7 shrink-0 cursor-pointer rounded-full border border-transparent bg-transparent px-2 text-xs text-muted opacity-0 hover:border-line hover:text-ink focus:opacity-100 group-hover:opacity-100">
          <option value="" disabled hidden>Move</option>
          {Array.from({ length: nomineeCount }, (_unused, index) => index + 1).filter((nomineeNumber) => nomineeNumber !== caseDocument.assignedNominee)
            .map((nomineeNumber) => <option key={nomineeNumber} value={nomineeNumber}>To Nominee {nomineeNumber}</option>)}
        </select>
      ) : null}
      <button type="button" aria-label={`Remove ${caseDocument.originalName}`} title="Remove" onClick={onRemove}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted opacity-0 hover:bg-red-50 hover:text-red-700 focus:opacity-100 group-hover:opacity-100">✕</button>
    </div>
  );
}
