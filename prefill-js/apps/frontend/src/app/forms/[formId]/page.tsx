"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchFormMapping, fetchFormRules, getBatchTemplateUrl, updateRequiredFields } from "@/api/forms-api";
import BlankFormOverlay from "@/components/forms/BlankFormOverlay";
import RequiredFieldsEditor from "@/components/forms/RequiredFieldsEditor";
import PageJumpButton from "@/components/review/PageJumpButton";
import Button, { ButtonLink } from "@/components/ui/Button";
import StatusState from "@/components/ui/StatusState";
import type { FormMapping, FormRules } from "@/types/forms";

/** Form setup: every mapped box of a form on its own page, and which fields must be filled before a case is saved. */
export default function FormSetupPage() {
  const { formId } = useParams<{ formId: string }>();
  const [formMapping, setFormMapping] = useState<FormMapping | null>(null);
  const [formRules, setFormRules] = useState<FormRules | null>(null);
  const [savedRequiredFields, setSavedRequiredFields] = useState<string[]>([]);
  const [requiredFields, setRequiredFields] = useState<Set<string>>(new Set());
  const [pageNumber, setPageNumber] = useState<number | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchFormMapping(formId).then((mapping) => {
      setFormMapping(mapping);
      // Open on the first page that has something to fill (page 1 is often a cover page).
      setPageNumber((current) => current ?? Math.min(...mapping.items.map((mappingItem) => mappingItem.page)));
    }).catch((error: Error) => setStatusMessage({ tone: "error", text: error.message }));
    fetchFormRules(formId).then((rules) => { setFormRules(rules); setSavedRequiredFields(rules.requiredFields); setRequiredFields(new Set(rules.requiredFields)); }).catch(() => {});
  }, [formId]);

  function handleToggleRequired(fieldKey: string) {
    setStatusMessage(null);
    setRequiredFields((current) => { const next = new Set(current); if (next.has(fieldKey)) next.delete(fieldKey); else next.add(fieldKey); return next; });
  }

  function handleSelectKey(fieldKey: string) {
    setSelectedKey(fieldKey);
    const itemsOfField = formMapping?.items.filter((mappingItem) => mappingItem.key === fieldKey) || [];
    if (itemsOfField.length && !itemsOfField.some((mappingItem) => mappingItem.page === pageNumber)) setPageNumber(itemsOfField[0].page);
  }

  async function handleSave() {
    try {
      const response = await updateRequiredFields(formId, [...requiredFields]);
      setSavedRequiredFields(response.requiredFields);
      setStatusMessage({ tone: "success", text: "Saved - every case of this form now uses these required fields." });
    } catch (error) {
      setStatusMessage({ tone: "error", text: (error as Error).message });
    }
  }

  if (!formMapping || pageNumber == null) {
    return statusMessage?.tone === "error"
      ? <StatusState tone="error" title="Form could not load" message={statusMessage.text} />
      : <p className="p-8 text-center text-sm text-muted">Loading…</p>;
  }
  const hasChanges = savedRequiredFields.length !== requiredFields.size || savedRequiredFields.some((fieldKey) => !requiredFields.has(fieldKey));
  const fillPages = [...new Set(formMapping.items.map((mappingItem) => mappingItem.page))].sort((first, second) => first - second);
  const boxesOnPage = formMapping.items.filter((mappingItem) => mappingItem.page === pageNumber).length;
  const pageButtonClasses = "grid h-7 w-7 place-items-center rounded-full border border-line text-ink hover:bg-canvas disabled:opacity-30";
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-line bg-white px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{formMapping.label}</div>
          <div className="text-xs text-muted">{formMapping.items.length} boxes on {fillPages.length} of {formMapping.pageCount} pages · {requiredFields.size} required</div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {statusMessage ? <span className={`text-xs ${statusMessage.tone === "error" ? "text-red-700" : "text-brand-700"}`}>{statusMessage.text}</span> : null}
          <ButtonLink href={getBatchTemplateUrl(formId)} isExternal>Excel template</ButtonLink>
          <Button variant="primary" disabled={!hasChanges} onClick={handleSave}>{hasChanges ? "Save required fields" : "Saved"}</Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <div className="min-h-0 border-r border-line bg-white">
          <RequiredFieldsEditor mappingItems={formMapping.items} sections={formRules?.reviewSections || []} requiredFields={requiredFields}
            selectedKey={selectedKey} pageNumber={pageNumber} onToggleRequired={handleToggleRequired} onSelectKey={handleSelectKey} />
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="flex h-11 items-center gap-2 whitespace-nowrap border-b border-line bg-white px-3 text-xs text-muted">
            <button type="button" aria-label="Previous page" disabled={pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)} className={pageButtonClasses}>‹</button>
            <PageJumpButton pageNumber={pageNumber} pageCount={formMapping.pageCount} fillPages={fillPages} onJump={setPageNumber} />
            <button type="button" aria-label="Next page" disabled={pageNumber >= formMapping.pageCount} onClick={() => setPageNumber(pageNumber + 1)} className={pageButtonClasses}>›</button>
            <span className="ml-1">{boxesOnPage ? `${boxesOnPage} boxes` : "Nothing to fill"}</span>
            <span className="ml-auto flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-red-500 bg-red-500/20" />Required</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-brand-500 bg-brand-500/20" />Optional</span>
            </span>
          </div>
          <div className="min-h-0 flex-1 bg-canvas p-3">
            <BlankFormOverlay formId={formId} pageNumber={pageNumber} mappingItems={formMapping.items} requiredFields={requiredFields}
              selectedKey={selectedKey} onSelectKey={handleSelectKey} />
          </div>
        </div>
      </div>
    </div>
  );
}
