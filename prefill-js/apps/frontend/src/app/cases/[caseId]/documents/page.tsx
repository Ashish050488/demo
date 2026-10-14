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
    <PageContainer title="Upload documents"
      description="Drop everything you have for each nominee. Each file is read, matched to a nominee by name, and used to fill the form."
      actions={<>
        <CaseStepper currentStep="documents" caseId={caseId} />
        {isAnyDocumentProcessing ? <span className="text-xs text-muted">Reading documents…</span> : null}
        <Button variant="primary" disabled={!hasReadDocument || isAnyDocumentProcessing || isFilling} onClick={handleContinue}>
          {isFilling ? "Filling the form…" : "Continue to review →"}
        </Button>
      </>}>
      <div className="grid h-full gap-5 lg:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <DocumentDropZone onFilesChosen={handleFilesChosen} />
          {loadError ? <Notice tone="error">{loadError}</Notice> : null}
          {uploadMessages.length ? <Notice tone="error">{uploadMessages.map((message) => <div key={message}>{message}</div>)}</Notice> : null}
        </div>
        <section className="flex min-h-0 flex-col rounded-xl border border-line bg-white">
          <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Documents <span className="font-normal text-muted">({caseDocuments.length})</span></h2>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
            {!caseDocuments.length ? <p className="p-6 text-center text-sm text-muted">No documents yet - drop them on the left.</p> : null}
            {caseDocuments.map((caseDocument) => (
              <DocumentCard key={caseDocument.id} caseDocument={caseDocument}
                onAssign={async (nomineeNumber) => { await assignDocument(caseId, caseDocument.id, nomineeNumber); await reloadCase(); }}
                onRemove={async () => { await removeDocument(caseId, caseDocument.id); await reloadCase(); }} />
            ))}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
