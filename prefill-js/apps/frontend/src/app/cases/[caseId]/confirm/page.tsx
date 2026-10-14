"use client";
import { formatFieldLabel } from "@prefill/shared";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { confirmCase, fetchCaseFields, getCasePdfUrl, regenerateCase } from "@/api/cases-api";
import { fetchSheetColumns } from "@/api/forms-api";
import { fetchSheetSettings, type SheetSettings } from "@/api/settings-api";
import CaseStepper from "@/components/cases/CaseStepper";
import SheetConnectionBox from "@/components/cases/SheetConnectionBox";
import Button, { ButtonLink } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import PageContainer from "@/components/ui/PageContainer";
import type { ConfirmResult } from "@/types/cases";
import { collectEffectiveValues } from "@/utils/review-field-helpers";

const PAN_VALUE_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;
const isNeverStored = (fieldKey: string, fieldValue: string) => /pan/i.test(fieldKey) || PAN_VALUE_PATTERN.test(fieldValue.toUpperCase());

export default function CaseConfirmPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({});
  const [sheetSettings, setSheetSettings] = useState<SheetSettings | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const fieldsView = await fetchCaseFields(caseId);
        const shownFields = fieldsView.fields.filter((caseField) => caseField.status !== "not_applicable" && !/_n3$/.test(caseField.field));
        setFieldValues(collectEffectiveValues(shownFields, new Map()));
        const sheetColumns = await fetchSheetColumns(fieldsView.formId);
        setColumnLabels(Object.fromEntries(sheetColumns.map((sheetColumn) => [sheetColumn.key, sheetColumn.label])));
        setSheetSettings(await fetchSheetSettings());
      } catch (error) {
        setErrorMessage((error as Error).message);
      }
    })();
  }, [caseId]);

  async function handleSave() {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await regenerateCase(caseId); // the PDF with every correction, before the scans are deleted
      setConfirmResult(await confirmCase(caseId, fieldValues));
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  const fieldEntries = Object.entries(fieldValues);
  return (
    <PageContainer>
      <CaseStepper currentStep="confirm" caseId={caseId} />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Save to Google Sheet</h1>
      <p className="mt-2 text-sm text-muted">One tab per form, one row per case. Aadhaar is saved as the last 4 digits only; PAN numbers are never sent. Saving deletes the uploaded scans from this machine.</p>
      <div className="mt-6 space-y-4">
        {sheetSettings && !confirmResult ? <SheetConnectionBox sheetSettings={sheetSettings} onSettingsChange={setSheetSettings} /> : null}
        {confirmResult ? (
          <Notice tone="success">
            Saved {confirmResult.savedFieldCount} fields to tab “{confirmResult.sheetTabName}”, row {confirmResult.sheetRowNumber}. The uploaded scans were deleted.
            {confirmResult.notStoredFields.length ? <div className="mt-1 text-xs">Not stored (privacy rule): {confirmResult.notStoredFields.map(formatFieldLabel).join(", ")}</div> : null}
            <div className="mt-3 flex gap-2">
              <ButtonLink href={getCasePdfUrl(caseId)} isExternal size="small">Download filled PDF</ButtonLink>
              <ButtonLink href="/cases/new" variant="primary" size="small">Start a new case</ButtonLink>
            </div>
          </Notice>
        ) : null}
        {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
        <Card className="divide-y divide-line">
          {fieldEntries.map(([fieldKey, fieldValue]) => (
            <div key={fieldKey} className="flex items-center gap-4 px-4 py-2 text-sm">
              <span className="w-1/2 text-muted">{columnLabels[fieldKey] || formatFieldLabel(fieldKey)}</span>
              {isNeverStored(fieldKey, fieldValue) ? <span className="text-xs text-muted">PAN - not stored</span> : <span className="truncate">{fieldValue}</span>}
            </div>
          ))}
        </Card>
      </div>
      {!confirmResult ? (
        <div className="mt-6 flex justify-between">
          <ButtonLink href={`/cases/${caseId}/review`}>← Back to review</ButtonLink>
          <Button variant="primary" disabled={isSaving || !sheetSettings?.isConnected} onClick={handleSave}>{isSaving ? "Saving…" : "Save to Google Sheet"}</Button>
        </div>
      ) : null}
    </PageContainer>
  );
}
