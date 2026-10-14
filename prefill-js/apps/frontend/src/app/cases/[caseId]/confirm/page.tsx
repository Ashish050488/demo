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
        const shownFields = fieldsView.fields.filter((caseField) => caseField.status !== "not_applicable");
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
    <PageContainer title="Save to Google Sheet"
      description="One tab per form, one row per case. Aadhaar last 4 digits only; PAN never sent. Saving deletes the uploaded scans from this machine."
      actions={<>
        <CaseStepper currentStep="confirm" caseId={caseId} />
        {!confirmResult ? <>
          <ButtonLink href={`/cases/${caseId}/review`}>← Back to review</ButtonLink>
          <Button variant="primary" disabled={isSaving || !sheetSettings?.isConnected} onClick={handleSave}>{isSaving ? "Saving…" : "Save to Google Sheet"}</Button>
        </> : null}
      </>}>
      <div className="space-y-4">
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
        <Card className="grid gap-px overflow-hidden bg-line sm:grid-cols-2 xl:grid-cols-3">
          {fieldEntries.map(([fieldKey, fieldValue]) => (
            <div key={fieldKey} className="min-w-0 bg-white px-4 py-2">
              <div className="truncate text-[11px] text-muted">{columnLabels[fieldKey] || formatFieldLabel(fieldKey)}</div>
              {isNeverStored(fieldKey, fieldValue) ? <div className="text-xs text-muted">PAN - not stored</div> : <div className="truncate text-sm" title={fieldValue}>{fieldValue}</div>}
            </div>
          ))}
        </Card>
      </div>
    </PageContainer>
  );
}
