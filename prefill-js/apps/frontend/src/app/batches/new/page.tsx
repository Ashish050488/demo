"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createBatch, deleteBatch, startBatch } from "@/api/batches-api";
import { uploadDocuments } from "@/api/cases-api";
import { fetchForms, getBatchTemplateUrl } from "@/api/forms-api";
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
  const [formId, setFormId] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchStatus | null>(null);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [relativePaths, setRelativePaths] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workMessage, setWorkMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchForms().then((loadedForms) => { setForms(loadedForms); setFormId((current) => current ?? loadedForms[0]?.formId ?? null); })
      .catch((error: Error) => setErrorMessage(error.message));
  }, []);

  const folderMatch = useMemo(() => (batch ? matchClientFolders(batch.clients, documentFiles, relativePaths) : null), [batch, documentFiles, relativePaths]);
  const chosenForm = forms.find((form) => form.formId === formId);

  /** A batch not started yet is only a draft - replace it when the form or the Excel changes. */
  async function discardDraftBatch() {
    if (batch && !batch.startedAt) await deleteBatch(batch.id).catch(() => {});
    setBatch(null);
  }

  async function handleChooseForm(nextFormId: string) {
    if (nextFormId === formId) return;
    await discardDraftBatch();
    setFormId(nextFormId);
  }

  async function handleSheetChosen([sheetFile]: File[]) {
    if (!formId || !sheetFile) return;
    setErrorMessage(null);
    setInfoMessage(null);
    setWorkMessage("Reading the Excel…");
    try {
      await discardDraftBatch();
      setBatch(await createBatch(formId, sheetFile));
    } catch (error) {
      // An Excel made for the other form: switch to the form it fits instead of making the user start over.
      const isWrongForm = error instanceof ApiRequestError && error.code === "SHEET_NOT_USABLE" && /different form|None of the column headings/.test(error.message);
      const fittingBatch = isWrongForm ? await findFittingForm(sheetFile) : null;
      if (fittingBatch) {
        setFormId(fittingBatch.formId);
        setBatch(fittingBatch);
        setInfoMessage(`This Excel is for ${fittingBatch.formLabel} - switched to that form.`);
      } else setErrorMessage((error as Error).message);
    } finally {
      setWorkMessage(null);
    }
  }

  async function findFittingForm(sheetFile: File): Promise<BatchStatus | null> {
    for (const otherForm of forms.filter((form) => form.formId !== formId)) {
      try { return await createBatch(otherForm.formId, sheetFile); } catch { /* not this one either */ }
    }
    return null;
  }

  async function handleStart() {
    if (!batch || !folderMatch) return;
    setErrorMessage(null);
    const uploadProblems: string[] = [];
    const clientsWithFiles = batch.clients.filter((client) => folderMatch.filesByCaseId.has(client.caseId));
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
  const isWorking = Boolean(workMessage);
  return (
    <PageContainer title="New batch" description="One Excel row = one client = one filled form. Each client's documents come from their own folder."
      actions={<>
        {workMessage ? <span className="text-xs text-muted">{workMessage}</span> : null}
        <Button variant="primary" disabled={!batch || isWorking} onClick={handleStart}>
          {batch ? `Start filling ${batch.clients.length} client${batch.clients.length === 1 ? "" : "s"} →` : "Start filling →"}
        </Button>
      </>}>
      <div className="grid h-full gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5 overflow-y-auto overflow-x-hidden">
          <section>
            <StepHeading number={1} title="Form" isDone={Boolean(formId)} />
            <div className="space-y-1.5" role="radiogroup" aria-label="Form">
              {forms.map((form) => (
                <button key={form.formId} type="button" role="radio" aria-checked={form.formId === formId} disabled={isWorking} onClick={() => handleChooseForm(form.formId)}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition ${form.formId === formId ? "border-ink bg-white" : "border-line bg-white/60 text-muted hover:border-ink/40"}`}>
                  <span className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${form.formId === formId ? "border-ink" : "border-line"}`}>
                    {form.formId === formId ? <span className="h-1.5 w-1.5 rounded-full bg-ink" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink" title={form.label}>{form.label}</span>
                </button>
              ))}
            </div>
            {chosenForm ? <a href={getBatchTemplateUrl(chosenForm.formId)} className="mt-1.5 inline-block text-xs text-brand-600 hover:underline">Download its Excel template</a> : null}
          </section>
          <section>
            <StepHeading number={2} title="Client Excel" isDone={Boolean(batch)} />
            <FileDropZone allowedExtensions={SHEET_EXTENSIONS} isCompact isDisabled={!formId || isWorking} buttonLabel={batch ? "Choose another" : "Choose Excel"}
              title={batch ? `${batch.clients.length} clients from ${batch.sheetFileName}` : "Drop the client Excel here"}
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
        <BatchMatchTable batch={batch} folderMatch={folderMatch} />
      </div>
    </PageContainer>
  );
}
