"use client";
import { useEffect, useState } from "react";
import { importCaseSheet } from "@/api/cases-api";
import { importBatchSheet, type BatchSheetImportSummary } from "@/api/batches-api";
import { getBatchTemplateUrl } from "@/api/forms-api";
import Button, { ButtonLink } from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import FileDropZone from "@/components/ui/FileDropZone";
import Notice from "@/components/ui/Notice";
import type { SheetImportResult, SheetRowSummary } from "@/types/cases";
import SheetImportReport from "./SheetImportReport";

const SHEET_EXTENSIONS = [".xlsx", ".csv"];

interface SheetImportDialogProps {
  caseId: string;
  formId: string;
  isOpen: boolean;
  onClose: () => void;
  onImported: (importResult: SheetImportResult) => Promise<void>;
  /** A file already chosen elsewhere (dropped with the documents): read at once when the dialog opens. */
  initialFile?: File | null;
  /** In a batch: also offer to apply the same Excel to every client (each takes its own row). */
  batchId?: string | null;
}

/** Fill this case's non-document fields from one row of an Excel/CSV: choose file → (pick row) → report. */
export default function SheetImportDialog({ caseId, formId, isOpen, onClose, onImported, initialFile = null, batchId = null }: SheetImportDialogProps) {
  const [chosenFile, setChosenFile] = useState<File | null>(null);
  const [sheetRows, setSheetRows] = useState<SheetRowSummary[] | null>(null);
  const [importResult, setImportResult] = useState<SheetImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [batchSummary, setBatchSummary] = useState<BatchSheetImportSummary | null>(null);

  async function applyToWholeBatch() {
    if (!batchId || !chosenFile) return;
    setIsWorking(true);
    setErrorMessage(null);
    try {
      setBatchSummary(await importBatchSheet(batchId, chosenFile));
      await onImported(importResult as SheetImportResult);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsWorking(false);
    }
  }

  const resetDialog = () => { setChosenFile(null); setSheetRows(null); setImportResult(null); setErrorMessage(null); setBatchSummary(null); };
  const handleClose = () => { if (!isWorking) { resetDialog(); onClose(); } };

  async function runImport(sheetFile: File, rowNumber?: number) {
    setIsWorking(true);
    setErrorMessage(null);
    try {
      const result = await importCaseSheet(caseId, sheetFile, rowNumber);
      if (result.needsRowChoice) { setSheetRows(result.sheetRows || []); return; }
      setSheetRows(null);
      setImportResult(result);
      await onImported(result);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsWorking(false);
    }
  }

  const handleFileChosen = (sheetFile: File | undefined) => {
    if (!sheetFile) return;
    resetDialog();
    setChosenFile(sheetFile);
    runImport(sheetFile);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isOpen && initialFile) handleFileChosen(initialFile); }, [isOpen, initialFile]);

  return (
    <Dialog title="Fill from Excel" isOpen={isOpen} onClose={handleClose} width="large">
      {!importResult ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Fills the fields documents can&apos;t show (bank, amount, mobile, email…) from one row of an .xlsx or .csv.
            Values read from documents are kept; your corrections are kept.
          </p>
          <FileDropZone allowedExtensions={SHEET_EXTENSIONS} isCompact isDisabled={isWorking}
            title={isWorking ? "Reading…" : chosenFile ? `${chosenFile.name} - drop another file to replace it` : "Drop the Excel or CSV here"}
            buttonLabel={chosenFile ? "Choose another file" : "Choose Excel / CSV"}
            hint=".xlsx or .csv · one file · up to 5 MB" onFilesChosen={([sheetFile]) => handleFileChosen(sheetFile)} />
          <div className="text-xs text-muted">No file yet? <ButtonLink href={getBatchTemplateUrl(formId)} size="small" isExternal>Download the template</ButtonLink></div>
        </div>
      ) : null}
      {errorMessage ? <div className="mt-3"><Notice tone="error">{errorMessage}</Notice></div> : null}
      {sheetRows && chosenFile ? (
        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold">This file has {sheetRows.length} clients - which one is this case?</div>
          <ul className="max-h-72 divide-y divide-line overflow-auto rounded-lg border border-line">
            {sheetRows.map((sheetRow) => (
              <li key={sheetRow.rowNumber}>
                <button type="button" disabled={isWorking} onClick={() => runImport(chosenFile, sheetRow.rowNumber)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-canvas disabled:opacity-60">
                  <span className="w-14 text-xs text-muted">Row {sheetRow.rowNumber}</span>
                  <span className="font-medium">{sheetRow.clientReference || "—"}</span>
                  <span className="text-muted">{sheetRow.displayName || ""}</span>
                  <span className="ml-auto text-xs text-muted">{sheetRow.filledCount} values</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {importResult ? (
        <>
          <SheetImportReport importResult={importResult} />
          {batchSummary ? (
            <div className="mt-3"><Notice tone="success">Updated {batchSummary.updatedCount} client{batchSummary.updatedCount === 1 ? "" : "s"} from this Excel
              {batchSummary.notInFile.length ? ` · not in the file: ${batchSummary.notInFile.join(", ")}` : ""}
              {batchSummary.alreadySaved.length ? ` · already saved, left as they are: ${batchSummary.alreadySaved.join(", ")}` : ""}</Notice></div>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            {batchId && !batchSummary ? <Button disabled={isWorking} onClick={applyToWholeBatch}>{isWorking ? "Updating every client…" : "Apply to all clients in this batch"}</Button> : null}
            <Button onClick={resetDialog}>Import another file or row</Button>
            <Button variant="primary" onClick={handleClose}>Done</Button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
