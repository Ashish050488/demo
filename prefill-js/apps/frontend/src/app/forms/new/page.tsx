"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createFormDraft, createFormFromDraft, deleteFormDraft } from "@/api/form-drafts-api";
import DraftFieldTable from "@/components/forms/DraftFieldTable";
import DraftPagePreview from "@/components/forms/DraftPagePreview";
import Button from "@/components/ui/Button";
import FileDropZone from "@/components/ui/FileDropZone";
import Notice from "@/components/ui/Notice";
import PageContainer from "@/components/ui/PageContainer";
import type { DraftField, FormDraft } from "@/types/form-drafts";

const METHOD_TEXT: Record<FormDraft["method"], string> = {
  "filled-sample": "Found by comparing the blank with the filled sample - every value it had is a box.",
  "pdf-fields": "Read from the fill-in boxes built into the PDF.",
  "printed-blanks": "Found from printed blanks (____ and \"Label:\"). Add a filled sample for a much better result.",
};
const inputClasses = "w-full rounded-lg border border-line bg-white px-3 py-1.5 text-sm";

/** Add a form: blank (+ filled sample) -> the app proposes every box, its name and source -> check -> create. */
export default function NewFormPage() {
  const router = useRouter();
  const [blankFile, setBlankFile] = useState<File | null>(null);
  const [filledFile, setFilledFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [fields, setFields] = useState<DraftField[]>([]);
  const [formName, setFormName] = useState("");
  const [personLabel, setPersonLabel] = useState("Client");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleFindBoxes() {
    if (!blankFile) return;
    setIsWorking(true);
    setErrorMessage(null);
    try {
      const createdDraft = await createFormDraft(blankFile, filledFile);
      setDraft(createdDraft);
      setFields(createdDraft.fields);
      setFormName(blankFile.name.replace(/\.pdf$/i, "").replace(/^(blank|pre ?filled)\s*[-–]\s*/i, ""));
      setPageNumber(createdDraft.fields[0]?.page ?? 1);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleCreate() {
    if (!draft) return;
    setIsWorking(true);
    setErrorMessage(null);
    try {
      const { formId } = await createFormFromDraft(draft.draftId, { label: formName, shortLabel: formName.slice(0, 40), purpose: "", personLabel, fields });
      router.push(`/forms/${formId}`);
    } catch (error) {
      setErrorMessage((error as Error).message);
      setIsWorking(false);
    }
  }

  async function handleStartOver() {
    if (draft) await deleteFormDraft(draft.draftId).catch(() => {});
    setDraft(null);
    setFields([]);
    setSelectedFieldId(null);
  }

  const selectField = (fieldId: string) => {
    setSelectedFieldId(fieldId);
    const field = fields.find((candidate) => candidate.id === fieldId);
    if (field && field.page !== pageNumber && !field.alsoAt.some((repeat) => repeat.page === pageNumber)) setPageNumber(field.page);
  };
  const pagesWithFields = [...new Set(fields.flatMap((field) => [field.page, ...field.alsoAt.map((repeat) => repeat.page)]))].sort((first, second) => first - second);

  if (!draft) {
    return (
      <PageContainer title="Add a form" description="Upload the blank form. Add a filled sample of it too - the app then finds every box, its size and what goes in it.">
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
          <FileDropZone allowedExtensions={[".pdf"]} title={blankFile ? blankFile.name : "1. Blank form (PDF)"} hint="The empty form, exactly as clients receive it" isDisabled={isWorking}
            onFilesChosen={([chosenFile]) => setBlankFile(chosenFile ?? null)} />
          <FileDropZone allowedExtensions={[".pdf"]} title={filledFile ? filledFile.name : "2. Filled sample (PDF, recommended)"} isDisabled={isWorking}
            hint="The same form filled for any one client. Read once to find the boxes - never saved." onFilesChosen={([chosenFile]) => setFilledFile(chosenFile ?? null)} />
          <div className="flex items-center gap-3 md:col-span-2">
            <Button variant="primary" disabled={!blankFile || isWorking} onClick={handleFindBoxes}>{isWorking ? "Finding the boxes…" : "Find the boxes →"}</Button>
            {errorMessage ? <span className="text-sm text-red-700">{errorMessage}</span> : null}
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Check the proposed fields" description={`${fields.length} fields on ${pagesWithFields.length} pages of ${draft.pageCount}. ${METHOD_TEXT[draft.method]}`}
      actions={<>
        <Button onClick={handleStartOver} disabled={isWorking}>Start over</Button>
        <Button variant="primary" onClick={handleCreate} disabled={isWorking || !formName.trim() || !fields.length}>{isWorking ? "Creating…" : "Create form →"}</Button>
      </>}>
      <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-white">
          <div className="grid gap-2 border-b border-line p-3 sm:grid-cols-2">
            <label className="text-xs text-muted">Form name<input className={inputClasses} value={formName} onChange={(event) => setFormName(event.target.value)} /></label>
            {draft.nomineeCount === 1 ? (
              <label className="text-xs text-muted">Whose KYC documents fill it<input className={inputClasses} value={personLabel} onChange={(event) => setPersonLabel(event.target.value)} /></label>
            ) : <div className="self-end text-xs text-muted">{draft.nomineeCount} nominee columns found (N1, N2…)</div>}
          </div>
          {errorMessage ? <div className="p-3"><Notice tone="error">{errorMessage}</Notice></div> : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <DraftFieldTable fields={fields} selectedFieldId={selectedFieldId} onSelectField={selectField}
              onChangeField={(fieldId, change) => setFields((current) => current.map((field) => (field.id === fieldId ? { ...field, ...change } : field)))}
              onRemoveField={(fieldId) => setFields((current) => current.filter((field) => field.id !== fieldId))} />
          </div>
        </section>
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-canvas">
          <div className="flex flex-wrap items-center gap-1 border-b border-line bg-white px-3 py-2 text-xs">
            <span className="mr-1 text-muted">Pages with fields:</span>
            {pagesWithFields.map((candidatePage) => (
              <button key={candidatePage} type="button" onClick={() => setPageNumber(candidatePage)}
                className={`rounded-full px-2.5 py-0.5 tabular-nums ${candidatePage === pageNumber ? "bg-ink text-white" : "border border-line hover:bg-canvas"}`}>{candidatePage}</button>
            ))}
          </div>
          <div className="min-h-0 flex-1 p-3">
            <DraftPagePreview draft={draft} pageNumber={pageNumber} fields={fields} selectedFieldId={selectedFieldId} onSelectField={selectField} />
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
