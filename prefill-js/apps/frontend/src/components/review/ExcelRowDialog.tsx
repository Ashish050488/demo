"use client";
import { useEffect, useRef, useState } from "react";
import { formatFieldLabel } from "@prefill/shared";
import { fetchCaseSheetRow, type CaseSheetRow } from "@/api/cases-api";
import Dialog from "@/components/ui/Dialog";
import Notice from "@/components/ui/Notice";
import type { CaseField } from "@/types/cases";

interface ExcelRowDialogProps {
  caseId: string;
  caseField: CaseField | null;
  onClose: () => void;
}

/** The client's own Excel row (the app keeps the row, never the file): every column it filled, the value this
 * field took from it highlighted. */
export default function ExcelRowDialog({ caseId, caseField, onClose }: ExcelRowDialogProps) {
  const [sheetRow, setSheetRow] = useState<CaseSheetRow | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const highlightedRow = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (!caseField) return;
    setErrorMessage(null);
    fetchCaseSheetRow(caseId).then(setSheetRow, (error: Error) => setErrorMessage(error.message));
  }, [caseId, caseField]);
  useEffect(() => { highlightedRow.current?.scrollIntoView({ block: "center" }); }, [sheetRow]);

  const entries = Object.entries(sheetRow?.values || {});
  return (
    <Dialog title="From the Excel" isOpen={Boolean(caseField)} onClose={onClose} width="large">
      {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
      {sheetRow ? (
        <>
          <p className="mb-3 text-sm text-muted">
            <b className="text-ink">{sheetRow.fileName}</b>{sheetRow.sheetName ? ` · ${sheetRow.sheetName} sheet` : ""} · row {sheetRow.rowNumber}
            {sheetRow.clientReference ? ` · ${sheetRow.clientReference}` : ""} · {entries.length} filled columns
          </p>
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-canvas text-left text-xs text-muted">
                <tr><th className="px-3 py-2 font-medium">Column</th><th className="px-3 py-2 font-medium">Value in row {sheetRow.rowNumber}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map(([fieldKey, value]) => {
                  const isThisField = fieldKey === caseField?.field;
                  return (
                    <tr key={fieldKey} ref={isThisField ? highlightedRow : undefined} className={isThisField ? "bg-brand-50 font-medium" : ""}>
                      <td className="px-3 py-1.5 text-muted">{formatFieldLabel(fieldKey)}</td>
                      <td className="px-3 py-1.5">{String(value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">PAN columns are not shown: PAN numbers are kept in memory only, never stored.</p>
        </>
      ) : !errorMessage ? <p className="text-sm text-muted">Loading…</p> : null}
    </Dialog>
  );
}
