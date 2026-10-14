"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { assignDocument, fillCase, removeDocument, uploadDocuments } from "@/api/cases-api";
import CaseStepper from "@/components/cases/CaseStepper";
import DocumentCard from "@/components/cases/DocumentCard";
import DocumentDropZone from "@/components/cases/DocumentDropZone";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import PageContainer from "@/components/ui/PageContainer";
import { useCaseSummary } from "@/hooks/useCaseSummary";

export default function CaseDocumentsPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();
  const { caseSummary, loadError, reloadCase, isAnyDocumentProcessing } = useCaseSummary(caseId);
  const [uploadMessages, setUploadMessages] = useState<string[]>([]);
  const [isFilling, setIsFilling] = useState(false);

  async function handleFilesChosen(documentFiles: File[]) {
    try {
      const uploadResults = await uploadDocuments(caseId, documentFiles);
      setUploadMessages(uploadResults.filter((uploadResult) => !uploadResult.isAccepted).map((uploadResult) => `${uploadResult.filename}: ${uploadResult.reason}`));
    } catch (error) {
      setUploadMessages([(error as Error).message]);
    }
    await reloadCase();
  }

  async function handleContinue() {
    setIsFilling(true);
    try {
      await fillCase(caseId);
      router.push(`/cases/${caseId}/review`);
    } catch (error) {
      setUploadMessages([(error as Error).message]);
      setIsFilling(false);
    }
  }

  const caseDocuments = caseSummary?.documents || [];
  const hasReadDocument = caseDocuments.some((caseDocument) => caseDocument.status === "done");
  return (
    <PageContainer>
      <CaseStepper currentStep="documents" caseId={caseId} />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Upload documents</h1>
      <p className="mt-2 text-sm text-muted">Drop everything you have for each nominee. Each file is read, matched to a nominee by name, and used to fill the form.</p>
      {loadError ? <div className="mt-4"><Notice tone="error">{loadError}</Notice></div> : null}
      <div className="mt-6"><DocumentDropZone onFilesChosen={handleFilesChosen} /></div>
      {uploadMessages.length ? <div className="mt-4"><Notice tone="error">{uploadMessages.map((message) => <div key={message}>{message}</div>)}</Notice></div> : null}
      <div className="mt-6 space-y-2">
        {caseDocuments.map((caseDocument) => (
          <DocumentCard key={caseDocument.id} caseDocument={caseDocument}
            onAssign={async (nomineeNumber) => { await assignDocument(caseId, caseDocument.id, nomineeNumber); await reloadCase(); }}
            onRemove={async () => { await removeDocument(caseId, caseDocument.id); await reloadCase(); }} />
        ))}
      </div>
      <div className="mt-8 flex items-center justify-end gap-3">
        {isAnyDocumentProcessing ? <span className="text-xs text-muted">Waiting for documents to finish reading…</span> : null}
        <Button variant="primary" disabled={!hasReadDocument || isAnyDocumentProcessing || isFilling} onClick={handleContinue}>
          {isFilling ? "Filling the form…" : "Continue to review →"}
        </Button>
      </div>
    </PageContainer>
  );
}
