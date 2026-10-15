"use client";
import { isSamePersonName } from "@prefill/shared";
import { useState, type DragEvent, type ReactNode } from "react";
import type { CaseDocument } from "@/types/cases";

export const DOCUMENT_DRAG_TYPE = "application/x-prefill-document-id";

/** The distinct people named on a nominee's documents (same person spelled differently counts once). */
export function listPersonNames(caseDocuments: CaseDocument[]): string[] {
  const personNames: string[] = [];
  for (const caseDocument of caseDocuments) {
    if (caseDocument.personName && !personNames.some((knownName) => isSamePersonName(knownName, caseDocument.personName))) personNames.push(caseDocument.personName);
  }
  return personNames;
}

interface NomineeDocumentGroupProps {
  nomineeNumber: number;
  nomineeCount: number;
  /** "Nominee", or a one-person form's own word ("Subscriber"). */
  personLabel?: string;
  caseDocuments: CaseDocument[];
  isBusy: boolean;
  /** Puts this person at `targetNominee`; whoever was there takes this place (one swap, any distance). */
  onMoveTo: (targetNominee: number) => void;
  /** A document card dragged in from another nominee. */
  onDropDocument: (documentId: string) => void;
  children: ReactNode;
}

/** One nominee: who the documents say this is, a single "Change order" menu, and the cards (drop target too). */
export default function NomineeDocumentGroup({ nomineeNumber, nomineeCount, personLabel = "Nominee", caseDocuments, isBusy, onMoveTo, onDropDocument, children }: NomineeDocumentGroupProps) {
  const [isDropTarget, setIsDropTarget] = useState(false);
  const personNames = listPersonNames(caseDocuments);
  const hasMixedPeople = personNames.length > 1;
  const slotName = nomineeCount > 1 ? `${personLabel} ${nomineeNumber}` : personLabel;
  const otherNominees = Array.from({ length: nomineeCount }, (_unused, index) => index + 1).filter((choice) => choice !== nomineeNumber);

  function handleDragOver(event: DragEvent) {
    if (isBusy || !event.dataTransfer.types.includes(DOCUMENT_DRAG_TYPE)) return;
    event.preventDefault();
    setIsDropTarget(true);
  }
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setIsDropTarget(false);
    const documentId = event.dataTransfer.getData(DOCUMENT_DRAG_TYPE);
    if (documentId && !caseDocuments.some((caseDocument) => caseDocument.id === documentId)) onDropDocument(documentId);
  }

  const borderClasses = isDropTarget ? "border-brand-500 ring-2 ring-brand-500/20" : hasMixedPeople ? "border-amber-300" : "border-line";
  return (
    <section onDragOver={handleDragOver} onDragLeave={() => setIsDropTarget(false)} onDrop={handleDrop}
      className={`rounded-xl border bg-canvas/60 transition-colors ${borderClasses}`}>
      <header className="flex items-center gap-3 px-4 py-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{nomineeNumber}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {personNames.length ? personNames.join(" / ") : <span className="font-normal text-muted">No name found yet</span>}
          </div>
          <div className="text-xs text-muted">
            {slotName} · {caseDocuments.length ? `${caseDocuments.length} document${caseDocuments.length === 1 ? "" : "s"}` : "no documents"}
            {hasMixedPeople ? <span className="font-medium text-amber-800"> · different names - check</span> : null}
          </div>
        </div>
        {caseDocuments.length && otherNominees.length ? (
          <select aria-label={`Change the order of ${slotName}`} disabled={isBusy} value=""
            onChange={(event) => onMoveTo(Number(event.target.value))}
            className="h-8 shrink-0 cursor-pointer rounded-full border border-transparent bg-transparent px-2 text-xs font-medium text-muted hover:border-line hover:bg-white hover:text-ink">
            <option value="" disabled hidden>Change order</option>
            {otherNominees.map((choice) => <option key={choice} value={choice}>Make {personLabel} {choice}</option>)}
          </select>
        ) : null}
      </header>
      <div className="space-y-2 px-3 pb-3">
        {caseDocuments.length ? children : (
          <p className="rounded-lg border border-dashed border-line px-4 py-3 text-center text-xs text-muted">Drag a document here to make it {slotName}&apos;s.</p>
        )}
      </div>
    </section>
  );
}
