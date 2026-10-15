"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createBatch, deleteBatch, startBatch } from "@/api/batches-api";
import { uploadDocuments } from "@/api/cases-api";
import { fetchForms } from "@/api/forms-api";
import BatchFormChooser from "@/components/batches/BatchFormChooser";
import BatchMatchTable from "@/components/batches/BatchMatchTable";
import Button from "@/components/ui/Button";
import FileDropZone from "@/components/ui/FileDropZone";
import Notice from "@/components/ui/Notice";
import PageContainer from "@/components/ui/PageContainer";
import { ApiRequestError } from "@/api/http-client";
import type { BatchStatus } from "@/types/batches";
import type { FormSummary } from "@/types/forms";
import { matchClientFolders } from "@/utils/match-client-folders";

const SHEET_EXTENSIONS = [".xlsx", ".xls", ".csv"];
const DOCUMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const MAXIMUM_BATCH_FILE_COUNT = 750; // 50 clients x 15 documents

function StepHeading({ number, title, isDone }: { number: number; title: string; isDone: boolean }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
      <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${isDone ? "bg-brand-500 text-white" : "bg-ink text-white"}`}>{isDone ? "✓" : number}</span>
      {title}
    </div>
  );
}

export default function NewBatchPage() {
  const router = useRouter();
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [formIds, setFormIds] = useState<string[]>([]);
  const [batch, setBatch] = useState<BatchStatus | null>(null);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [relativePaths, setRelativePaths] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workMessage, setWorkMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchForms().then((loadedForms) => { setForms(loadedForms); setFormIds((current) => (current.length ? current : loadedForms.slice(0, 1).map((form) => form.formId))); })
      .catch((error: Error) => setErrorMessage(error.message));
  }, []);

  // Documents go to each client's first form only; its other forms share them once they are read.
  const documentClients = useMemo(() => batch?.clients.filter((client) => !client.documentsFromCaseId) || [], [batch]);
  const folderMatch = useMemo(() => (batch ? matchClientFolders(documentClients, documentFiles, relativePaths) : null), [batch, documentClients, documentFiles, relativePaths]);

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
    if (!formIds.length || !sheetFile) return;
    setErrorMessage(null);
    setInfoMessage(null);
    setWorkMessage("Reading the Excel…");
    try {
      await discardDraftBatch();
      const createdBatch = await createBatch(formIds, sheetFile);
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
    setErrorMessage(null);
    const uploadProblems: string[] = [];
    const clientsWithFiles = documentClients.filter((client) => folderMatch.filesByCaseId.has(client.caseId));
    for (const [clientIndex, client] of clientsWithFiles.entries()) {
      setWorkMessage(`Uploading documents · client ${clientIndex + 1} of ${clientsWithFiles.length}…`);
      const clientFiles = folderMatch.filesByCaseId.get(client.caseId)!;
      try {
        const uploadResults = await uploadDocuments(client.caseId, clientFiles.files, clientFiles.relativePaths);
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
            <StepHeading number={2} title="Client Excel" isDone={Boolean(batch)} />
            <FileDropZone allowedExtensions={SHEET_EXTENSIONS} isCompact isDisabled={!formIds.length || isWorking} buttonLabel={batch ? "Choose another" : "Choose Excel"}
              title={batch ? `${clientCount} clients from ${batch.sheetFileName}` : "Drop the client Excel here"}
              hint={batch ? "Dropping another file replaces it" : "Up to 50 rows · .xlsx, .xls or .csv · the template's client_reference column names each client's folder"}
              onFilesChosen={handleSheetChosen} />
          </section>
          <section>
            <StepHeading number={3} title="Documents folder" isDone={matchedClientCount > 0} />
            <FileDropZone allowedExtensions={DOCUMENT_EXTENSIONS} isMultiple isFolderAllowed isCompact maximumFileCount={MAXIMUM_BATCH_FILE_COUNT} isDisabled={!batch || isWorking}
              buttonLabel="Choose files" title={documentFiles.length ? `${documentFiles.length} files · ${matchedClientCount} clients matched` : "Drop the clients folder here"}
              hint={<>One folder per client, named like its client reference (C-002) or name. Inside, files can be loose or in &quot;Nominee 1&quot;, &quot;Nominee 2&quot; folders. Optional - a client without a folder is filled from the Excel only.</>}
              onFilesChosen={(chosenFiles, chosenPaths) => { setDocumentFiles(chosenFiles); setRelativePaths(chosenPaths); }} />
          </section>
          {infoMessage ? <Notice tone="success">{infoMessage}</Notice> : null}
          {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
          {batch?.warnings.map((warning) => <Notice key={warning}>{warning}</Notice>)}
        </div>
        <BatchMatchTable batch={batch} clients={documentClients} folderMatch={folderMatch} />
      </div>
    </PageContainer>
  );
}
