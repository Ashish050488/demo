"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchFormMapping, fetchFormRules, updateRequiredFields } from "@/api/forms-api";
import BlankFormOverlay from "@/components/forms/BlankFormOverlay";
import RequiredFieldsEditor from "@/components/forms/RequiredFieldsEditor";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import type { FormMapping } from "@/types/forms";

export default function FormSetupPage() {
  const { formId } = useParams<{ formId: string }>();
  const [formMapping, setFormMapping] = useState<FormMapping | null>(null);
  const [savedRequiredFields, setSavedRequiredFields] = useState<string[]>([]);
  const [requiredFields, setRequiredFields] = useState<Set<string>>(new Set());
  const [pageNumber, setPageNumber] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchFormMapping(formId).then(setFormMapping).catch((error: Error) => setStatusMessage({ tone: "error", text: error.message }));
    fetchFormRules(formId).then((formRules) => { setSavedRequiredFields(formRules.requiredFields); setRequiredFields(new Set(formRules.requiredFields)); }).catch(() => {});
  }, [formId]);

  function handleToggleRequired(fieldKey: string) {
    setStatusMessage(null);
    setRequiredFields((current) => { const next = new Set(current); if (next.has(fieldKey)) next.delete(fieldKey); else next.add(fieldKey); return next; });
  }

  function handleSelectKey(fieldKey: string) {
    setSelectedKey(fieldKey);
    const firstItem = formMapping?.items.find((mappingItem) => mappingItem.key === fieldKey);
    if (firstItem) setPageNumber(firstItem.page);
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

  const hasChanges = savedRequiredFields.length !== requiredFields.size || savedRequiredFields.some((fieldKey) => !requiredFields.has(fieldKey));
  if (!formMapping) return <p className="p-8 text-center text-sm text-muted">{statusMessage?.text || "Loading…"}</p>;
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center gap-4 border-b border-line bg-white px-4 py-2.5">
        <div>
          <div className="text-sm font-semibold">{formMapping.label}</div>
          <div className="text-xs text-muted">{requiredFields.size} required · red boxes are required</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {statusMessage ? <span className={`text-xs ${statusMessage.tone === "error" ? "text-red-700" : "text-brand-700"}`}>{statusMessage.text}</span> : null}
          <Button variant="primary" disabled={!hasChanges} onClick={handleSave}>Save required fields</Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <div className="min-h-0 overflow-auto border-r border-line bg-white">
          <RequiredFieldsEditor mappingItems={formMapping.items} requiredFields={requiredFields} selectedKey={selectedKey}
            onToggleRequired={handleToggleRequired} onSelectKey={handleSelectKey} />
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="flex gap-1 border-b border-line bg-white px-3 py-1.5">
            {Array.from({ length: formMapping.pageCount }, (_unused, index) => index + 1).map((page) => (
              <button key={page} type="button" onClick={() => setPageNumber(page)}
                className={`rounded-md px-3 py-1 text-xs ${page === pageNumber ? "bg-ink text-white" : "text-muted hover:bg-canvas"}`}>Page {page}</button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-canvas p-3">
            <BlankFormOverlay formId={formId} pageNumber={pageNumber} mappingItems={formMapping.items} requiredFields={requiredFields}
              selectedKey={selectedKey} onSelectKey={handleSelectKey} />
          </div>
        </div>
      </div>
      {statusMessage?.tone === "error" && !formMapping ? <Notice tone="error">{statusMessage.text}</Notice> : null}
    </div>
  );
}
