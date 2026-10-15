"use client";
import { useParams, useRouter } from "next/navigation";
import { isSignatureFile, uploadSignature } from "@/api/signature-api";
import { useEffect, useState } from "react";
import { assignDocument, fillCase, removeCaseSheet, removeDocument, swapNominees, uploadDocuments } from "@/api/cases-api";
import { fetchFormRules } from "@/api/forms-api";
import CaseStepper from "@/components/cases/CaseStepper";
import DocumentCard from "@/components/cases/DocumentCard";
import DocumentDropZone from "@/components/cases/DocumentDropZone";
import NomineeDocumentGroup, { listPersonNames } from "@/components/cases/NomineeDocumentGroup";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import PageContainer from "@/components/ui/PageContainer";
import SheetImportDialog from "@/components/review/SheetImportDialog";
import StatusState from "@/components/ui/StatusState";
import { isSamePersonName } from "@prefill/shared";
import { useCaseSummary } from "@/hooks/useCaseSummary";
import type { CaseDocument } from "@/types/cases";
import type { FormRules } from "@/types/forms";

const MAXIMUM_NOMINEE_COUNT = 3;
const isSheetFile = (chosenFile: File) => /\.(xlsx|csv)$/i.test(chosenFile.name);

export default function CaseDocumentsPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();
  const { caseSummary, loadError, reloadCase, isAnyDocumentProcessing } = useCaseSummary(caseId);
  const [uploadMessages, setUploadMessages] = useState<string[]>([]);
  const [isFilling, setIsFilling] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [formRules, setFormRules] = useState<FormRules | null>(null);
  const [isSheetImportOpen, setIsSheetImportOpen] = useState(false);
  const [sheetFileToImport, setSheetFileToImport] = useState<File | null>(null);
  const [isRemovingSheet, setIsRemovingSheet] = useState(false);
  const sheetImport = caseSummary?.sheetImport ?? null;

  async function handleRemoveSheet() {
    setIsRemovingSheet(true);
    try {
      await removeCaseSheet(caseId);
    } catch (error) {
      setUploadMessages([(error as Error).message]);
    }
    await reloadCase();
    setIsRemovingSheet(false);
  }
  const formId = caseSummary?.formId;
  useEffect(() => { if (formId) fetchFormRules(formId).then(setFormRules).catch(() => setFormRules(null)); }, [formId]);
  // A one-person form (subscription, W-8BEN): every document is that person's - one group, its own word for them.
  const maximumNomineeCount = Math.min(MAXIMUM_NOMINEE_COUNT, formRules?.supportedNomineeCount ?? MAXIMUM_NOMINEE_COUNT);
  const personLabel = formRules?.personLabel || "Nominee";
  const isOnePersonForm = maximumNomineeCount === 1;

  async function handleFilesChosen(chosenFiles: File[], chosenPaths: string[]) {
    // The client's Excel goes to "Fill from Excel" (pick the row, see the report); the rest are documents.
    const sheetFile = chosenFiles.find(isSheetFile);
    if (sheetFile) { setSheetFileToImport(sheetFile); setIsSheetImportOpen(true); }
    const documentFiles = chosenFiles.filter((chosenFile) => !isSheetFile(chosenFile));
    const relativePaths = chosenPaths.filter((_path, index) => !isSheetFile(chosenFiles[index]));
    if (!documentFiles.length) return;
    try {
      // A "signature" image is the client's signature (placed on the form's signature lines), not an ID to read.
      const signatureFile = documentFiles.find(isSignatureFile);
      if (signatureFile) await uploadSignature(caseId, signatureFile);
      const keptIndexes = documentFiles.map((_file, index) => index).filter((index) => documentFiles[index] !== signatureFile);
      const uploadResults = keptIndexes.length ? await uploadDocuments(caseId, keptIndexes.map((index) => documentFiles[index]), keptIndexes.map((index) => relativePaths[index])) : [];
      setUploadMessages([...(signatureFile ? [`${signatureFile.name}: used as the client's signature`] : []),
        ...uploadResults.filter((uploadResult) => !uploadResult.isAccepted).map((uploadResult) => `${uploadResult.filename}: ${uploadResult.reason}`)]);
    } catch (error) {
      setUploadMessages([(error as Error).message]);
    }
    await reloadCase();
  }

  async function handleSwap(firstNominee: number, secondNominee: number) {
    setIsSwapping(true);
    try {
      await swapNominees(caseId, firstNominee, secondNominee);
    } catch (error) {
      setUploadMessages([(error as Error).message]);
    }
    await reloadCase();
    setIsSwapping(false);
  }

  /** Same person split across two nominees: move every document of the later nominee into the earlier one. */
  async function handleMerge(keptNominee: number, mergedNominee: number) {
    setIsSwapping(true);
    try {
      for (const caseDocument of caseDocuments.filter((candidate) => candidate.assignedNominee === mergedNominee)) {
        await assignDocument(caseId, caseDocument.id, keptNominee);
      }
    } catch (error) {
      setUploadMessages([(error as Error).message]);
    }
    await reloadCase();
    setIsSwapping(false);
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
  // Documents still being read wait in their own list, so they do not jump between nominees once the name is found.
  const readingDocuments = caseDocuments.filter((caseDocument) => caseDocument.status === "processing");
  const placedDocuments = caseDocuments.filter((caseDocument) => caseDocument.status !== "processing");
  // Every nominee in use, plus one empty slot to drag a document into (up to the form's three).
  const nomineeCount = Math.min(maximumNomineeCount, 1 + Math.max(0, ...placedDocuments.map((caseDocument) => caseDocument.assignedNominee)));
  const nomineeNumbers = Array.from({ length: nomineeCount }, (_unused, index) => index + 1);
  const documentsByNominee = nomineeNumbers.map((nomineeNumber) => placedDocuments.filter((caseDocument) => caseDocument.assignedNominee === nomineeNumber));
  const namesByNominee = documentsByNominee.map(listPersonNames);
  // Pairs of nominees whose documents name the same person - almost always one person split by mistake.
  const samePersonPairs = nomineeNumbers.flatMap((firstNominee) => nomineeNumbers.filter((secondNominee) => secondNominee > firstNominee)
    .filter((secondNominee) => namesByNominee[firstNominee - 1].some((firstName) => namesByNominee[secondNominee - 1].some((secondName) => isSamePersonName(firstName, secondName))))
    .map((secondNominee) => ({ firstNominee, secondNominee, personName: namesByNominee[firstNominee - 1][0] })));
  const renderCard = (caseDocument: CaseDocument) => (
    <DocumentCard key={caseDocument.id} caseDocument={caseDocument} nomineeCount={maximumNomineeCount}
      onAssign={async (nomineeNumber) => { await assignDocument(caseId, caseDocument.id, nomineeNumber); await reloadCase(); }}
      onRemove={async () => { await removeDocument(caseId, caseDocument.id); await reloadCase(); }} />
  );

  return (
    <PageContainer title="Upload documents"
      description={isOnePersonForm ? `Drop the ${personLabel.toLowerCase()}'s KYC documents (Aadhaar, PAN, passport, licence). Name, address, date of birth and PAN are read from them.`
        : "Drop everything you have for each nominee. Each file is read and grouped with the person whose name is on it."}
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
          <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate text-muted" title={sheetImport?.fileName}>{sheetImport
              ? <>Excel: <b className="text-ink">{sheetImport.fileName}</b> · row {sheetImport.rowNumber}{sheetImport.clientReference ? ` · ${sheetImport.clientReference}` : ""}</>
              : "Excel (bank, amount, contact…): not added yet"}</span>
            <Button size="small" onClick={() => { setSheetFileToImport(null); setIsSheetImportOpen(true); }}>{sheetImport ? "Change" : "Fill from Excel"}</Button>
            {sheetImport ? <Button size="small" variant="ghost" disabled={isRemovingSheet} onClick={handleRemoveSheet}>{isRemovingSheet ? "Removing…" : "Remove"}</Button> : null}
          </div>
          {loadError ? <Notice tone="error">{loadError}</Notice> : null}
          {uploadMessages.length ? <Notice tone="error">{uploadMessages.map((message) => <div key={message}>{message}</div>)}</Notice> : null}
        </div>
        <section className="flex min-h-0 flex-col rounded-xl border border-line bg-white">
          <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Documents by person <span className="font-normal text-muted">({caseDocuments.length})</span>
            {placedDocuments.length ? <span className="float-right text-xs font-normal text-muted">Drag a document onto another person to move it</span> : null}</h2>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
            {!caseDocuments.length ? <StatusState title="No documents yet" message={isOnePersonForm ? `Drop the ${personLabel.toLowerCase()}'s Aadhaar, PAN, passport or licence on the left.` : "Drop each nominee's Aadhaar, PAN, passport or licence on the left. They are grouped by the name on them."} /> : null}
            {readingDocuments.length ? (
              <section className="space-y-2 rounded-xl border border-dashed border-line p-3">
                <div className="text-xs font-medium text-muted">Reading {readingDocuments.length} document{readingDocuments.length === 1 ? "" : "s"}… each moves to its person when done</div>
                {readingDocuments.map(renderCard)}
              </section>
            ) : null}
            {samePersonPairs.map(({ firstNominee, secondNominee, personName }) => (
              <div key={`${firstNominee}-${secondNominee}`} className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
                <span className="flex-1">Nominee {firstNominee} and Nominee {secondNominee} look like the same person (<b>{personName}</b>).</span>
                <Button size="small" disabled={isSwapping} onClick={() => handleMerge(firstNominee, secondNominee)}>Put all under Nominee {firstNominee}</Button>
              </div>
            ))}
            {placedDocuments.length ? nomineeNumbers.map((nomineeNumber) => (
              <NomineeDocumentGroup key={nomineeNumber} nomineeNumber={nomineeNumber} nomineeCount={maximumNomineeCount} personLabel={personLabel} caseDocuments={documentsByNominee[nomineeNumber - 1]}
                isBusy={isSwapping || isAnyDocumentProcessing} onMoveTo={(targetNominee) => { if (targetNominee !== nomineeNumber) handleSwap(nomineeNumber, targetNominee); }}
                onDropDocument={async (documentId) => { await assignDocument(caseId, documentId, nomineeNumber); await reloadCase(); }}>
                {documentsByNominee[nomineeNumber - 1].map(renderCard)}
              </NomineeDocumentGroup>
            )) : null}
          </div>
        </section>
      </div>
      {formId ? (
        <SheetImportDialog caseId={caseId} formId={formId} isOpen={isSheetImportOpen} initialFile={sheetFileToImport}
          onClose={() => { setIsSheetImportOpen(false); setSheetFileToImport(null); }}
          onImported={reloadCase} />
      ) : null}
    </PageContainer>
  );
}
