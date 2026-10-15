"use client";
import { useRouter } from "next/navigation";
import { isSignatureFile, uploadSignature } from "@/api/signature-api";
import { useEffect, useMemo, useState } from "react";
import { createBatch, deleteBatch, startBatch } from "@/api/batches-api";
import { uploadDocuments } from "@/api/cases-api";
import { fetchForms } from "@/api/forms-api";
import BatchFormChooser from "@/components/batches/BatchFormChooser";
import BatchMatchTable from "@/components/batches/BatchMatchTable";
import Button from "@/components/ui/Button";
import FileDropZone from "@/components/ui/FileDropZone";
import StepHeading from "@/components/batches/StepHeading";
import Notice from "@/components/ui/Notice";
import PageContainer from "@/components/ui/PageContainer";
import { ApiRequestError } from "@/api/http-client";
import type { BatchStatus } from "@/types/batches";
import type { FormSummary } from "@/types/forms";
import { addPickedFiles, matchClientFolders } from "@/utils/match-client-folders";

const SHEET_EXTENSIONS = [".xlsx", ".xls", ".csv"];
const DOCUMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const MAXIMUM_BATCH_FILE_COUNT = 750; // 50 clients x 15 documents
const isSheetFile = (chosenFile: File) => /\.(xlsx|xls|csv)$/i.test(chosenFile.name);

export default function NewBatchPage() {
  const router = useRouter();
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [formIds, setFormIds] = useState<string[]>([]);
  const [batch, setBatch] = useState<BatchStatus | null>(null);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [relativePaths, setRelativePaths] = useState<string[]>([]);
  // Files picked per client with "+ Add files" (e.g. your own PAN and Aadhaar), on top of any dropped folder.
  const [pickedFilesByCaseId, setPickedFilesByCaseId] = useState<Map<string, File[]>>(new Map());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workMessage, setWorkMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchForms().then(setForms) // nothing ticked to start with: the user ticks, or the Excel picks its form
      .catch((error: Error) => setErrorMessage(error.message));
  }, []);

  // Documents go to each client's first form only; its other forms share them once they are read.
  const documentClients = useMemo(() => batch?.clients.filter((client) => !client.documentsFromCaseId) || [], [batch]);
  const folderMatch = useMemo(() => (batch ? addPickedFiles(matchClientFolders(documentClients, documentFiles, relativePaths), pickedFilesByCaseId) : null),
    [batch, documentClients, documentFiles, relativePaths, pickedFilesByCaseId]);

  /** A batch not started yet is only a draft - replace it when the form or the Excel changes. */
  async function discardDraftBatch() {
    if (batch && !batch.startedAt) await deleteBatch(batch.id).catch(() => {});
    setBatch(null);
  }

  async function handleChooseForms(nextFormIds: string[]) {
    await discardDraftBatch();
    setInfoMessage(null);
    setFormIds(nextFormIds);
  }

  async function handleSheetChosen([sheetFile]: File[]) {
    if (!sheetFile) return;
    setErrorMessage(null);
    setInfoMessage(null);
    setWorkMessage("Reading the Excel…");
    try {
      await discardDraftBatch();
      // No form ticked: the Excel's own columns say which form it is for.
      const createdBatch = formIds.length ? await createBatch(formIds, sheetFile) : await findFittingForm(sheetFile);
      if (!createdBatch) throw new Error("This Excel doesn't match any form's columns - tick its form, or use that form's Excel template");
      if (!formIds.length) { setFormIds(createdBatch.formIds); setInfoMessage(`This Excel is for ${createdBatch.formLabel} - ticked it.`); }
      const combinedBatch = await findCombinedFit(createdBatch, sheetFile);
      setBatch(combinedBatch || createdBatch);
      if (combinedBatch) {
        setFormIds(combinedBatch.formIds);
        setInfoMessage(`This Excel has columns for ${combinedBatch.forms.length} forms - ticked all of them.`);
      }
    } catch (error) {
      // An Excel made for the other form: switch to the form it fits instead of making the user start over.
      const isWrongForm = error instanceof ApiRequestError && error.code === "SHEET_NOT_USABLE" && /different form|None of the column headings/.test(error.message);
      const fittingBatch = isWrongForm && formIds.length === 1 ? await findFittingForm(sheetFile) : null;
      const bestBatch = fittingBatch ? (await findCombinedFit(fittingBatch, sheetFile)) || fittingBatch : null;
      if (bestBatch) {
        setFormIds(bestBatch.formIds);
        setBatch(bestBatch);
        setInfoMessage(bestBatch.forms.length > 1 ? `This Excel has columns for ${bestBatch.forms.length} forms - ticked all of them.` : `This Excel is for ${bestBatch.formLabel} - switched to that form.`);
      } else setErrorMessage((error as Error).message);
    } finally {
      setWorkMessage(null);
    }
  }

  /** Everything at once: a folder (or a pile of files) that also holds the client Excel - the Excel is read as
   * step 2, every other file is matched to its client's folder. */
  async function handleDocumentsChosen(chosenFiles: File[], chosenPaths: string[]) {
    const sheetFile = chosenFiles.find(isSheetFile);
    if (!sheetFile && !batch) setErrorMessage("No Excel in this folder - put the client Excel in it (next to the client folders) and choose it again");
    if (sheetFile && sheetFile.name !== batch?.sheetFileName) await handleSheetChosen([sheetFile]);
    const keptIndexes = chosenFiles.map((_file, index) => index).filter((index) => !isSheetFile(chosenFiles[index]));
    setDocumentFiles(keptIndexes.map((index) => chosenFiles[index]));
    setRelativePaths(keptIndexes.map((index) => chosenPaths[index]));
  }

  /** A combined Excel read for fewer forms leaves columns unused: if every form together uses them all, prefer that. */
  async function findCombinedFit(createdBatch: BatchStatus, sheetFile: File): Promise<BatchStatus | null> {
    const hasUnusedColumns = createdBatch.warnings.some((warning) => warning.startsWith("Columns not used"));
    if (!hasUnusedColumns || createdBatch.forms.length >= forms.length) return null;
    try {
      const combinedBatch = await createBatch(forms.map((form) => form.formId), sheetFile);
      if (combinedBatch.warnings.some((warning) => warning.startsWith("Columns not used"))) {
        await deleteBatch(combinedBatch.id).catch(() => {});
        return null;
      }
      await deleteBatch(createdBatch.id).catch(() => {});
      return combinedBatch;
    } catch {
      return null;
    }
  }

  async function findFittingForm(sheetFile: File): Promise<BatchStatus | null> {
    for (const otherForm of forms.filter((form) => !formIds.includes(form.formId))) {
      try { return await createBatch([otherForm.formId], sheetFile); } catch { /* not this one either */ }
    }
    return null;
  }

  async function handleStart() {
    if (!batch || !folderMatch) return;
    if (!folderMatch.filesByCaseId.size && !window.confirm("No client has documents yet (step 3) - nothing will be read from Aadhaar/PAN. Fill from the Excel only?")) return;
    setErrorMessage(null);
    const uploadProblems: string[] = [];
    const clientsWithFiles = documentClients.filter((client) => folderMatch.filesByCaseId.has(client.caseId));
    for (const [clientIndex, client] of clientsWithFiles.entries()) {
      setWorkMessage(`Uploading documents · client ${clientIndex + 1} of ${clientsWithFiles.length}…`);
      const clientFiles = folderMatch.filesByCaseId.get(client.caseId)!;
      try {
        // "signature.png" is the client's signature, not an ID document: it goes to the signature places.
        const signatureFile = clientFiles.files.find(isSignatureFile);
        if (signatureFile) await uploadSignature(client.caseId, signatureFile);
        const documentIndexes = clientFiles.files.map((_file, index) => index).filter((index) => clientFiles.files[index] !== signatureFile);
        const uploadResults = documentIndexes.length
          ? await uploadDocuments(client.caseId, documentIndexes.map((index) => clientFiles.files[index]), documentIndexes.map((index) => clientFiles.relativePaths[index]))
          : [];
        for (const uploadResult of uploadResults.filter((result) => !result.isAccepted)) uploadProblems.push(`${client.clientReference}: ${uploadResult.filename} - ${uploadResult.reason}`);
      } catch (error) {
        uploadProblems.push(`${client.clientReference}: ${(error as Error).message}`);
      }
    }
    setWorkMessage("Starting…");
    try {
      await startBatch(batch.id);
      if (uploadProblems.length) window.sessionStorage.setItem(`batch-upload-problems-${batch.id}`, JSON.stringify(uploadProblems));
      router.push(`/batches/${batch.id}`);
    } catch (error) {
      setErrorMessage((error as Error).message);
      setWorkMessage(null);
    }
  }

  const matchedClientCount = folderMatch?.filesByCaseId.size ?? 0;
  const clientCount = documentClients.length;
  const formCount = batch?.forms.length ?? formIds.length;
  const isWorking = Boolean(workMessage);
  return (
    <PageContainer title="New batch" description="One Excel row = one client = one filled form per ticked form. Each client's documents come from their own folder."
      actions={<>
        {workMessage ? <span className="text-xs text-muted">{workMessage}</span> : null}
        <Button variant="primary" disabled={!batch || isWorking} onClick={handleStart}>
          {batch ? `Start filling ${clientCount} client${clientCount === 1 ? "" : "s"}${formCount > 1 ? ` × ${formCount} forms` : ""} →` : "Start filling →"}
        </Button>
      </>}>
      <div className="grid h-full gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5 overflow-y-auto overflow-x-hidden">
          <section>
            <StepHeading number={1} title={formIds.length > 1 ? `Forms (${formIds.length})` : "Form"} isDone={formIds.length > 0} />
            <BatchFormChooser forms={forms} chosenFormIds={formIds} isDisabled={isWorking} onChange={handleChooseForms} />
          </section>
          <section>
            <StepHeading number={2} title="Excel and documents" isDone={Boolean(batch)} />
            <FileDropZone allowedExtensions={[...DOCUMENT_EXTENSIONS, ...SHEET_EXTENSIONS]} isMultiple isFolderAllowed isFolderOnly isCompact maximumFileCount={MAXIMUM_BATCH_FILE_COUNT}
              isDisabled={isWorking} buttonLabel="Choose files"
              title={batch ? `${clientCount} clients from ${batch.sheetFileName} · ${matchedClientCount} with documents` : "Drop the folder here"}
              hint="One folder: the client Excel + one folder per client"
              onFilesChosen={handleDocumentsChosen} />
          </section>
          {infoMessage ? <Notice tone="success">{infoMessage}</Notice> : null}
          {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
          {batch?.warnings.map((warning) => <Notice key={warning}>{warning}</Notice>)}
        </div>
        <BatchMatchTable batch={batch} clients={documentClients} folderMatch={folderMatch} isDisabled={isWorking}
          onPickFiles={(caseId, pickedFiles) => setPickedFilesByCaseId((current) => new Map(current).set(caseId, [...(current.get(caseId) || []), ...pickedFiles]))}
          onClearPicked={(caseId) => setPickedFilesByCaseId((current) => { const next = new Map(current); next.delete(caseId); return next; })}
          pickedCountByCaseId={new Map([...pickedFilesByCaseId].map(([caseId, pickedFiles]) => [caseId, pickedFiles.length]))} />
      </div>
    </PageContainer>
  );
}
