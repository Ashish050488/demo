"use client";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getCasePdfUrl, recordDecision, regenerateCase } from "@/api/cases-api";
import Link from "next/link";
import AddDocumentDialog from "@/components/review/AddDocumentDialog";
import BlockedFieldsDialog from "@/components/review/BlockedFieldsDialog";
import FieldDetailBar from "@/components/review/FieldDetailBar";
import FieldMappingPane from "@/components/review/FieldMappingPane";
import FormPreviewPane from "@/components/review/FormPreviewPane";
import BatchClientSwitcher from "@/components/batches/BatchClientSwitcher";
import SignatureCard from "@/components/review/SignatureCard";
import SectionFields from "@/components/review/SectionFields";
import RequiredFieldsDrawer from "@/components/review/RequiredFieldsDrawer";
import SectionRail from "@/components/review/SectionRail";
import SheetImportDialog from "@/components/review/SheetImportDialog";
import SourceDocumentDialog from "@/components/review/SourceDocumentDialog";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Skeleton, { FieldSkeletonGrid } from "@/components/ui/Skeleton";
import StatusState from "@/components/ui/StatusState";
import { useReviewSession } from "@/hooks/useReviewSession";
import type { CaseField } from "@/types/cases";
import { getNomineeNumber } from "@prefill/shared";
import { getEffectiveValue } from "@/utils/review-field-helpers";
import { buildReviewSections, listProblemFieldKeys } from "@/utils/review-sections";

const REQUIRED_REASON = "Required - empty";

const PREVIEW_PANE_OPTIONS = [{ key: "form" as const, label: "Filled form" }, { key: "mapping" as const, label: "Field mapping" }];

export default function CaseReviewPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();
  const session = useReviewSession(caseId);
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);
  // Bumped when the signature changes (the PDF is rebuilt): the preview reloads. pageRequest opens a page from outside.
  const [previewVersion, setPreviewVersion] = useState(0);
  const [pageRequest, setPageRequest] = useState<{ pageNumber: number; requestId: number } | null>(null);
  const [previewPane, setPreviewPane] = useState<"form" | "mapping">("form");
  const [sourceField, setSourceField] = useState<CaseField | null>(null);
  const [addDocumentNominee, setAddDocumentNominee] = useState<number | null>(null);
  const [blockedFields, setBlockedFields] = useState<{ field: string; reason: string }[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRequiredDrawerOpen, setIsRequiredDrawerOpen] = useState(false);
  const [isSheetImportOpen, setIsSheetImportOpen] = useState(false);

  const { shownFields, editedValues, formCheck, formRules, fieldsView } = session;
  const [activeNomineeNumber, setActiveNomineeNumber] = useState(1);
  const [openedNomineeCount, setOpenedNomineeCount] = useState(1);
  // Nominee columns in use: any typed/read value, or a document assigned - plus any the reviewer opened.
  const shownNomineeCount = useMemo(() => {
    const nomineeCount = formRules?.supportedNomineeCount || 1;
    const nomineesInUse = Array.from({ length: nomineeCount }, (_unused, index) => index + 1).filter((nomineeNumber) =>
      shownFields.some((caseField) => getNomineeNumber(caseField.field) === nomineeNumber && !caseField.isTickbox && getEffectiveValue(caseField, editedValues))
      || Boolean(session.caseSummary?.documents.some((caseDocument) => caseDocument.assignedNominee === nomineeNumber)));
    return Math.min(nomineeCount, Math.max(1, openedNomineeCount, ...nomineesInUse));
  }, [formRules, shownFields, editedValues, session.caseSummary, openedNomineeCount]);
  const visibleFields = useMemo(() => shownFields.filter((caseField) => (getNomineeNumber(caseField.field) || 1) <= shownNomineeCount), [shownFields, shownNomineeCount]);
  const sections = useMemo(() => (formRules ? buildReviewSections(formRules, visibleFields) : []), [formRules, visibleFields]);
  const problemFieldKeys = useMemo(() => listProblemFieldKeys(formCheck), [formCheck]);
  const filledFieldKeys = useMemo(() => new Set(visibleFields.filter((caseField) => getEffectiveValue(caseField, editedValues)).map((caseField) => caseField.field)), [visibleFields, editedValues]);
  const activeSectionIndex = Math.max(0, sections.findIndex((section) => section.key === activeSectionKey));
  const activeSection = sections[activeSectionIndex];
  const selectedField = shownFields.find((caseField) => caseField.field === selectedFieldKey) || activeSection?.fields.find((caseField) => caseField.page && (!activeSection.isNomineeSection || getNomineeNumber(caseField.field) === activeNomineeNumber)) || null;

  // Offered as the typed signature: the subscriber / investor / applicant name as it stands on the form.
  const signerName = ["subscriber_name", "investor_name", "applicant_name"].map((fieldKey) => {
    const caseField = shownFields.find((candidate) => candidate.field === fieldKey);
    return caseField ? getEffectiveValue(caseField, editedValues) : null;
  }).find(Boolean) || "";
  const getSectionLabel = (fieldKey: string) => sections.find((section) => section.fields.some((caseField) => caseField.field === fieldKey))?.label || "";
  const openSection = (sectionIndex: number) => { setActiveSectionKey(sections[sectionIndex]?.key ?? null); setSelectedFieldKey(null); };
  function goToField(fieldKey: string) {
    const owningSection = sections.find((section) => section.fields.some((caseField) => caseField.field === fieldKey));
    if (owningSection) setActiveSectionKey(owningSection.key);
    const nomineeNumber = getNomineeNumber(fieldKey);
    if (nomineeNumber) setActiveNomineeNumber(nomineeNumber);
    setSelectedFieldKey(fieldKey);
    setTimeout(() => (document.querySelector(`[data-field="${fieldKey}"] input, [data-field="${fieldKey}"] textarea, [data-field="${fieldKey}"] select`) as HTMLElement | null)?.focus(), 50);
  }

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

  if (session.loadError) {
    return <StatusState tone="error" title="This case could not be opened" message={session.loadError} actionLabel="Try again" onAction={() => session.reloadFields("ifNotFilled")} />;
  }
  if (!fieldsView || !formRules) return <ReviewPageSkeleton />;
  if (!activeSection) return <StatusState title="No fields to review" message="This form has no fields set up yet - check Form setup." />;
  return (
    <div className="flex h-full flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[12.5rem_minmax(0,0.95fr)_minmax(0,1.15fr)]">
        <aside className="flex min-h-0 flex-col border-r border-line bg-white">
          <div className="border-b border-line px-4 py-3">
            <div className="flex gap-3">
              {session.caseSummary?.batchId ? <Link href={`/batches/${session.caseSummary.batchId}`} className="text-[11px] text-muted hover:text-ink">← Batch</Link> : null}
              <Link href={`/cases/${caseId}/documents`} className="text-[11px] text-muted hover:text-ink">{session.caseSummary?.batchId ? "Documents" : "← Documents"}</Link>
            </div>
            <div className="mt-1 text-sm font-semibold leading-tight">{fieldsView.label}</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round((filledFieldKeys.size / Math.max(1, visibleFields.length)) * 100)}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-muted">{filledFieldKeys.size} of {visibleFields.length} filled · <span className={problemFieldKeys.size ? "text-red-700" : ""}>{problemFieldKeys.size} to fix</span></div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <SectionRail sections={sections} activeSectionKey={activeSection.key} problemFieldKeys={problemFieldKeys}
              filledFieldKeys={filledFieldKeys} onSelectSection={(sectionKey) => openSection(sections.findIndex((section) => section.key === sectionKey))} />
          </div>
          <div className="space-y-2 border-t border-line p-3">
            <SignatureCard caseId={caseId} suggestedName={signerName} onChanged={() => setPreviewVersion((current) => current + 1)}
              onGoToPage={(pageNumber) => { setPreviewPane("form"); setPageRequest({ pageNumber, requestId: Date.now() }); }} />
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="small" className="w-full" onClick={() => setIsSheetImportOpen(true)}>Fill from Excel</Button>
              <Button size="small" className="w-full" disabled={isDownloading} onClick={handleDownloadPdf}>{isDownloading ? "Preparing…" : "Download PDF"}</Button>
            </div>
            <Button variant="primary" className="w-full" onClick={handleContinue}>Continue to save →</Button>
          </div>
        </aside>
        <section className="flex min-h-0 flex-col border-r border-line bg-white">
          <div className="flex h-12 shrink-0 items-center gap-2 whitespace-nowrap border-b border-line px-4">
            <h2 className="min-w-0 truncate text-sm font-semibold" title={activeSection.label}>{activeSection.label}</h2>
            <span className="shrink-0 text-xs tabular-nums text-muted">{activeSectionIndex + 1} / {sections.length}</span>
            <div className="ml-auto flex shrink-0 gap-1.5">
              <button type="button" onClick={() => setIsRequiredDrawerOpen(true)}
                className="inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-white px-3 text-xs font-medium hover:border-ink">
                Required fields
                <Badge tone={problemFieldKeys.size ? "danger" : "success"}>{problemFieldKeys.size ? `${problemFieldKeys.size} left` : "✓ all done"}</Badge>
              </button>
              <Button size="small" disabled={activeSectionIndex === 0} onClick={() => openSection(activeSectionIndex - 1)} aria-label="Previous section">←<span className="hidden 2xl:inline">Previous</span></Button>
              <Button size="small" disabled={activeSectionIndex === sections.length - 1} onClick={() => openSection(activeSectionIndex + 1)} aria-label="Next section"><span className="hidden 2xl:inline">Next</span>→</Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <SectionFields key={activeSection.key} session={session} section={activeSection} selectedFieldKey={selectedField?.field ?? null}
              activeNomineeNumber={Math.min(activeNomineeNumber, shownNomineeCount)} shownNomineeCount={shownNomineeCount}
              onSelectNominee={(nomineeNumber) => { setOpenedNomineeCount((current) => Math.max(current, nomineeNumber)); setActiveNomineeNumber(nomineeNumber); setSelectedFieldKey(null); }}
              onSelectField={(caseField) => setSelectedFieldKey(caseField.field)} onChooseTick={handleChooseTick} />
          </div>
          <FieldDetailBar session={session} caseField={selectedField}
            sectionLabel={(selectedField && getSectionLabel(selectedField.field)) || activeSection.label} onViewSource={setSourceField} onAddDocument={setAddDocumentNominee} />
        </section>
        <div className="flex min-h-0 flex-col">
          {session.caseSummary?.batchId ? <BatchClientSwitcher batchId={session.caseSummary.batchId} caseId={caseId} /> : null}
          <div className="min-h-0 flex-1">
            {previewPane === "form"
              ? <FormPreviewPane key={previewVersion} pageRequest={pageRequest} caseId={caseId} pageCount={fieldsView.pageCount} selectedField={selectedField} previewValue={selectedField ? getEffectiveValue(selectedField, editedValues) ?? "" : ""}
                  allFields={shownFields} onSelectField={goToField}
                  headerActions={<SegmentedControl options={PREVIEW_PANE_OPTIONS} activeKey={previewPane} onChange={setPreviewPane} />} />
              : <div className="flex h-full flex-col"><div className="border-b border-line bg-white px-3 py-1.5"><SegmentedControl options={PREVIEW_PANE_OPTIONS} activeKey={previewPane} onChange={setPreviewPane} /></div><div className="min-h-0 flex-1"><FieldMappingPane formId={fieldsView.formId} onSelectField={(fieldKey) => {
                const matchingField = shownFields.find((caseField) => caseField.field === `${fieldKey}_n1` || caseField.field === fieldKey);
                if (matchingField) { goToField(matchingField.field); setPreviewPane("form"); }
              }} /></div></div>}
          </div>
        </div>
      </div>
      <SourceDocumentDialog caseId={caseId} caseField={sourceField} caseDocuments={session.caseSummary?.documents || []} onClose={() => setSourceField(null)} />
      <AddDocumentDialog caseId={caseId} nomineeNumber={addDocumentNominee} onClose={() => setAddDocumentNominee(null)} onDocumentsRead={() => session.reloadFields(true)} />
      <SheetImportDialog caseId={caseId} formId={fieldsView.formId} batchId={session.caseSummary?.batchId} isOpen={isSheetImportOpen} onClose={() => setIsSheetImportOpen(false)} onImported={() => session.reloadFields(true)} />
      <RequiredFieldsDrawer session={session} sections={sections} isOpen={isRequiredDrawerOpen} onClose={() => setIsRequiredDrawerOpen(false)} onJumpToField={goToField} onChooseTick={handleChooseTick} />
      <BlockedFieldsDialog blockedFields={blockedFields} getSectionLabel={getSectionLabel} onClose={() => setBlockedFields([])} onJumpToField={(fieldKey) => { setBlockedFields([]); goToField(fieldKey); }} />
    </div>
  );
}

/** Same three columns as the loaded page, so nothing jumps when the fields arrive. */
function ReviewPageSkeleton() {
  return (
    <div className="grid h-full grid-cols-[12.5rem_minmax(0,0.95fr)_minmax(0,1.15fr)]" role="status" aria-label="Filling the form">
      <div className="space-y-3 border-r border-line bg-white p-4">
        <Skeleton className="h-4 w-32" /><Skeleton className="h-1.5 w-full" />
        {Array.from({ length: 6 }, (_unused, index) => <Skeleton key={index} className="h-8 w-full" />)}
      </div>
      <div className="space-y-5 border-r border-line bg-white p-4"><Skeleton className="h-5 w-40" /><FieldSkeletonGrid /></div>
      <div className="p-4"><Skeleton className="mx-auto aspect-[0.707] h-full bg-white" /><span className="sr-only">Filling the form…</span></div>
    </div>
  );
}
