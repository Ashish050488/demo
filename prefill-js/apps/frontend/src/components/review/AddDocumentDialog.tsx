"use client";
import { useState } from "react";
import { assignDocument, fetchCase, uploadDocuments } from "@/api/cases-api";
import DocumentDropZone from "@/components/cases/DocumentDropZone";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";

const POLL_INTERVAL_MILLISECONDS = 1000;
const MAXIMUM_POLL_COUNT = 120;
const waitMilliseconds = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

interface AddDocumentDialogProps {
  caseId: string;
  nomineeNumber: number | null;
  onClose: () => void;
  onDocumentsRead: () => Promise<void>;
}

/** Add documents for one nominee without leaving the review screen; the form refills once they are read. */
export default function AddDocumentDialog({ caseId, nomineeNumber, onClose, onDocumentsRead }: AddDocumentDialogProps) {
  const [progressLines, setProgressLines] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  async function handleFilesChosen(documentFiles: File[]) {
    if (!nomineeNumber) return;
    setIsBusy(true);
    try {
      const uploadResults = await uploadDocuments(caseId, documentFiles);
      const acceptedResults = uploadResults.filter((uploadResult) => uploadResult.isAccepted && uploadResult.documentId);
      for (const acceptedResult of acceptedResults) await assignDocument(caseId, acceptedResult.documentId!, nomineeNumber);
      for (let pollCount = 0; pollCount < MAXIMUM_POLL_COUNT; pollCount += 1) {
        const caseSummary = await fetchCase(caseId);
        const uploadedDocuments = acceptedResults.map((acceptedResult) => caseSummary.documents.find((caseDocument) => caseDocument.id === acceptedResult.documentId)).filter(Boolean);
        setProgressLines([
          ...uploadResults.filter((uploadResult) => !uploadResult.isAccepted).map((uploadResult) => `${uploadResult.filename} — ${uploadResult.reason}`),
          ...uploadedDocuments.map((caseDocument) => `${caseDocument!.originalName} — ${caseDocument!.status === "processing" ? "reading…" : caseDocument!.status === "done" ? `${caseDocument!.documentTypeLabel}: ${caseDocument!.readFieldLabels.join(", ") || "nothing readable"}` : caseDocument!.message || "could not be read"}`),
        ]);
        if (uploadedDocuments.every((caseDocument) => caseDocument!.status !== "processing")) break;
        await waitMilliseconds(POLL_INTERVAL_MILLISECONDS);
      }
      await onDocumentsRead();
    } catch (error) {
      setProgressLines((current) => [...current, (error as Error).message]);
    } finally {
      setIsBusy(false);
    }
  }

  const handleClose = () => { if (!isBusy) { setProgressLines([]); onClose(); } };
  return (
    <Dialog title={`Add a document for Nominee ${nomineeNumber ?? ""}`} isOpen={nomineeNumber != null} onClose={handleClose}>
      <DocumentDropZone onFilesChosen={handleFilesChosen} isDisabled={isBusy} />
      {progressLines.length ? <ul className="mt-4 space-y-1 text-xs text-muted">{progressLines.map((progressLine) => <li key={progressLine}>{progressLine}</li>)}</ul> : null}
      <div className="mt-4 flex justify-end"><Button variant="primary" disabled={isBusy} onClick={handleClose}>{isBusy ? "Reading…" : "Done"}</Button></div>
    </Dialog>
  );
}
