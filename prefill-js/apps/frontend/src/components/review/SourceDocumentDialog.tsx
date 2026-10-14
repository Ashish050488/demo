"use client";
import { formatFieldLabel } from "@prefill/shared";
import { getDocumentViewUrl } from "@/api/cases-api";
import Dialog from "@/components/ui/Dialog";
import type { CaseDocument, CaseField } from "@/types/cases";

interface SourceDocumentDialogProps {
  caseId: string;
  caseField: CaseField | null;
  caseDocuments: CaseDocument[];
  onClose: () => void;
}

/** The uploaded document a value was read from - shown locally only, until the case is saved. */
export default function SourceDocumentDialog({ caseId, caseField, caseDocuments, onClose }: SourceDocumentDialogProps) {
  const sourceDocument = caseDocuments.find((caseDocument) => caseDocument.id === caseField?.source_doc);
  const documentUrl = caseField?.source_doc ? getDocumentViewUrl(caseId, caseField.source_doc) : null;
  const title = caseField ? `${formatFieldLabel(caseField.field)} — ${sourceDocument?.documentTypeLabel || "document"}` : "";
  return (
    <Dialog title={title} isOpen={Boolean(caseField)} onClose={onClose}>
      {documentUrl ? (
        <a href={documentUrl} target="_blank" rel="noreferrer" title="Open full size">
          {/* eslint-disable-next-line @next/next/no-img-element -- served by the local API */}
          <img src={documentUrl} alt="Uploaded document" className="max-h-[60vh] w-full rounded border border-line object-contain" />
        </a>
      ) : null}
      <p className="mt-2 text-xs text-muted">{sourceDocument?.originalName} · click the image to open it full size.</p>
    </Dialog>
  );
}
