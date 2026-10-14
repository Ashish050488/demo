"use client";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getCasePdfUrl, recordDecision, regenerateCase } from "@/api/cases-api";
import CaseStepper from "@/components/cases/CaseStepper";
import AddDocumentDialog from "@/components/review/AddDocumentDialog";
import BlockedFieldsDialog from "@/components/review/BlockedFieldsDialog";
import FieldFilterBar from "@/components/review/FieldFilterBar";
import FieldList from "@/components/review/FieldList";
import FieldMappingPane from "@/components/review/FieldMappingPane";
import FormPreviewPane from "@/components/review/FormPreviewPane";
import SourceDocumentDialog from "@/components/review/SourceDocumentDialog";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import { useReviewSession } from "@/hooks/useReviewSession";
import type { CaseField } from "@/types/cases";
import { getEffectiveValue, getFieldState, matchesFilter, isFieldFilled, type FieldFilter } from "@/utils/review-field-helpers";

const REQUIRED_REASON = "Required - empty";

export default function CaseReviewPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();
  const session = useReviewSession(caseId);
  const [activeFilter, setActiveFilter] = useState<FieldFilter>("all");
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);
  const [previewPane, setPreviewPane] = useState<"form" | "mapping">("form");
  const [sourceField, setSourceField] = useState<CaseField | null>(null);
  const [addDocumentNominee, setAddDocumentNominee] = useState<number | null>(null);
  const [blockedFields, setBlockedFields] = useState<{ field: string; reason: string }[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  const { shownFields, editedValues, formCheck, formRules, fieldsView } = session;
  const fieldStates = useMemo(() => shownFields.map((caseField) =>
    getFieldState(caseField, getEffectiveValue(caseField, editedValues), formCheck, editedValues.has(caseField.field))), [shownFields, editedValues, formCheck]);
  const countByFilter = {
    all: fieldStates.length, filled: fieldStates.filter(isFieldFilled).length,
    empty: fieldStates.filter((fieldState) => matchesFilter(fieldState, "empty")).length,
    mustFix: fieldStates.filter((fieldState) => matchesFilter(fieldState, "mustFix")).length,
  };
  const selectedField = shownFields.find((caseField) => caseField.field === selectedFieldKey) || shownFields.find((caseField) => caseField.page) || null;

  async function handleChooseTick(caseField: CaseField, chosenOption: string) {
    await recordDecision(caseId, caseField.field, "corrected", chosenOption);
    // The ID type decides which number goes on the form - refill so the number rows follow the tick.
    const isIdTypeTick = formRules && caseField.field.replace(/_n\d+$/, "") === formRules.identityType.tickboxField;
    await session.reloadFields(Boolean(isIdTypeTick));
  }

  async function handleDownloadPdf() {
    setIsDownloading(true);
    try {
      await session.commitAllFields();
      await regenerateCase(caseId);
      window.location.href = getCasePdfUrl(caseId);
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleContinue() {
    await session.commitAllFields();
    const problems = [...formCheck.invalid, ...formCheck.missing.map((field) => ({ field, reason: REQUIRED_REASON }))];
    if (problems.length) { setBlockedFields(problems); return; }
    router.push(`/cases/${caseId}/confirm`);
  }

  function handleJumpToField(fieldKey: string) {
    setBlockedFields([]);
    setActiveFilter("mustFix");
    setSelectedFieldKey(fieldKey);
    setTimeout(() => document.querySelector(`[data-field="${fieldKey}"]`)?.scrollIntoView({ block: "center" }), 50);
  }

  if (session.loadError) return <div className="mx-auto max-w-3xl p-8"><Notice tone="error">{session.loadError}</Notice></div>;
  if (!fieldsView || !formRules) return <p className="p-8 text-center text-sm text-muted">Filling the form…</p>;
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center gap-4 border-b border-line bg-white px-4 py-2.5">
        <div>
          <div className="text-sm font-semibold">{fieldsView.label}</div>
          <div className="text-xs text-muted">{countByFilter.filled} of {countByFilter.all} filled</div>
        </div>
        <CaseStepper currentStep="review" caseId={caseId} />
        <div className="ml-auto flex gap-2">
          <Button disabled={isDownloading} onClick={handleDownloadPdf}>{isDownloading ? "Preparing…" : "Download PDF"}</Button>
          <Button variant="primary" onClick={handleContinue}>Continue to save →</Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(340px,440px)_1fr]">
        <div className="flex min-h-0 flex-col border-r border-line bg-white">
          <div className="border-b border-line p-3"><FieldFilterBar activeFilter={activeFilter} countByFilter={countByFilter} onFilterChange={setActiveFilter} /></div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            <FieldList session={session} activeFilter={activeFilter} selectedFieldKey={selectedField?.field ?? null}
              onSelectField={(caseField) => setSelectedFieldKey(caseField.field)} onChooseTick={handleChooseTick}
              onViewSource={setSourceField} onAddDocument={setAddDocumentNominee} />
          </div>
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="flex gap-1 border-b border-line bg-white px-3 py-1.5">
            {(["form", "mapping"] as const).map((paneKey) => (
              <button key={paneKey} type="button" onClick={() => setPreviewPane(paneKey)}
                className={`rounded-md px-3 py-1 text-xs ${previewPane === paneKey ? "bg-ink text-white" : "text-muted hover:bg-canvas"}`}>
                {paneKey === "form" ? "Filled form" : "Field mapping (JSON)"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {previewPane === "form"
              ? <FormPreviewPane caseId={caseId} selectedField={selectedField} previewValue={selectedField ? getEffectiveValue(selectedField, editedValues) ?? "" : ""} />
              : <FieldMappingPane formId={fieldsView.formId} onSelectField={(fieldKey) => {
                const matchingField = shownFields.find((caseField) => caseField.field === `${fieldKey}_n1` || caseField.field === fieldKey);
                if (matchingField) { setSelectedFieldKey(matchingField.field); setPreviewPane("form"); }
              }} />}
          </div>
        </div>
      </div>
      <SourceDocumentDialog caseId={caseId} caseField={sourceField} caseDocuments={session.caseSummary?.documents || []} onClose={() => setSourceField(null)} />
      <AddDocumentDialog caseId={caseId} nomineeNumber={addDocumentNominee} onClose={() => setAddDocumentNominee(null)} onDocumentsRead={() => session.reloadFields(true)} />
      <BlockedFieldsDialog blockedFields={blockedFields} onClose={() => setBlockedFields([])} onJumpToField={handleJumpToField} />
    </div>
  );
}
