"use client";
import Button from "@/components/ui/Button";
import type { CaseDocument } from "@/types/cases";

const NOMINEE_CHOICES = [1, 2, 3];

function DocumentStatusLabel({ caseDocument }: { caseDocument: CaseDocument }) {
  if (caseDocument.status === "processing") return <span className="animate-pulse text-xs text-muted">Reading…</span>;
  if (caseDocument.status === "done") return <span className="text-xs font-medium text-brand-600">Read</span>;
  return <span className="text-xs text-amber-700">{caseDocument.message || "Problem reading this file"}</span>;
}

interface DocumentCardProps {
  caseDocument: CaseDocument;
  onAssign: (nomineeNumber: number) => void;
  onRemove: () => void;
}

export default function DocumentCard({ caseDocument, onAssign, onRemove }: DocumentCardProps) {
  const isRead = caseDocument.status === "done";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{caseDocument.originalName}</span>
          {caseDocument.documentTypeLabel ? <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">{caseDocument.documentTypeLabel}</span> : null}
          <DocumentStatusLabel caseDocument={caseDocument} />
        </div>
        {isRead ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            {caseDocument.readFieldLabels.length
              ? caseDocument.readFieldLabels.map((readLabel) => <span key={readLabel} className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">{readLabel}</span>)
              : <span className="text-amber-700">Nothing readable found - try a sharper, closer photo</span>}
            {caseDocument.assignedBy ? <span className="text-muted">· matched: {caseDocument.assignedBy}</span> : null}
          </div>
        ) : null}
      </div>
      <select value={caseDocument.assignedNominee} onChange={(event) => onAssign(Number(event.target.value))}
        className="h-8 rounded-lg border border-line bg-white px-2 text-xs">
        {NOMINEE_CHOICES.map((nomineeNumber) => <option key={nomineeNumber} value={nomineeNumber}>Nominee {nomineeNumber}</option>)}
      </select>
      <Button size="small" variant="ghost" onClick={onRemove}>Remove</Button>
    </div>
  );
}
