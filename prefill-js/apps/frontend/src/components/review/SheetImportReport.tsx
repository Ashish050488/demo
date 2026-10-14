import { formatFieldLabel, getNomineeNumber } from "@prefill/shared";
import type { ReactNode } from "react";
import Notice from "@/components/ui/Notice";
import type { SheetImportResult } from "@/types/cases";

const describeField = (fieldKey: string) => {
  const nomineeNumber = getNomineeNumber(fieldKey);
  return nomineeNumber ? `${formatFieldLabel(fieldKey)} (Nominee ${nomineeNumber})` : formatFieldLabel(fieldKey);
};

function ReportGroup({ tone, title, children }: { tone: "error" | "warning" | "info"; title: string; children: ReactNode }) {
  const toneClasses = { error: "border-red-200 bg-red-50 text-red-800", warning: "border-amber-200 bg-amber-50 text-amber-900", info: "border-line bg-canvas text-muted" }[tone];
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${toneClasses}`}>
      <div className="mb-1 font-semibold">{title}</div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

/** Everything the reviewer should know after an import - most important first. */
export default function SheetImportReport({ importResult }: { importResult: SheetImportResult }) {
  const { invalidValues = [], unmatchedOptions = [], mappedToOthers = [], documentWins = [], keptCorrections = [], aadhaarCutToLast4 = [],
    panFieldsKeptInMemory = [], unknownHeadings = [], duplicateFields = [], cellWarnings = [] } = importResult;
  return (
    <div className="space-y-2">
      <Notice tone="success">
        Filled <b>{importResult.appliedFieldCount}</b> fields from row {importResult.rowNumber}
        {importResult.clientReference ? <> (client <b>{importResult.clientReference}</b>)</> : null} of “{importResult.sheetName}”.
      </Notice>
      {invalidValues.length ? (
        <ReportGroup tone="error" title={`${invalidValues.length} value(s) break a rule - filled, shown red, please fix`}>
          {invalidValues.map((invalidValue) => <li key={invalidValue.field}><b>{describeField(invalidValue.field)}</b>: “{invalidValue.value}” - {invalidValue.reason}</li>)}
        </ReportGroup>
      ) : null}
      {unmatchedOptions.length ? (
        <ReportGroup tone="error" title="Not a valid choice - left unticked">
          {unmatchedOptions.map((unmatchedOption) => <li key={unmatchedOption.field}><b>{describeField(unmatchedOption.field)}</b>: “{unmatchedOption.value}” - allowed: {unmatchedOption.allowed.join(", ")}</li>)}
        </ReportGroup>
      ) : null}
      {mappedToOthers.length ? (
        <ReportGroup tone="info" title="Not one of the printed options - ticked Others and written on the Others line">
          {mappedToOthers.map((mappedValue) => <li key={mappedValue.field}><b>{describeField(mappedValue.field)}</b>: “{mappedValue.value}”</li>)}
        </ReportGroup>
      ) : null}
      {documentWins.length ? (
        <ReportGroup tone="warning" title="The document and the sheet disagree - the document's value was used">
          {documentWins.map((documentWin) => <li key={documentWin.field}><b>{describeField(documentWin.field)}</b>: {documentWin.documentLabel} says “{documentWin.documentValue}”, sheet says “{documentWin.sheetValue}”</li>)}
        </ReportGroup>
      ) : null}
      {keptCorrections.length ? (
        <ReportGroup tone="warning" title="Your earlier corrections were kept">
          <li>{keptCorrections.map(describeField).join(", ")} - press Restore on a field to use the sheet value instead.</li>
        </ReportGroup>
      ) : null}
      {aadhaarCutToLast4.length || panFieldsKeptInMemory.length ? (
        <ReportGroup tone="info" title="Privacy">
          {aadhaarCutToLast4.length ? <li>Full Aadhaar number cut to the last 4 digits: {aadhaarCutToLast4.map(describeField).join(", ")}.</li> : null}
          {panFieldsKeptInMemory.length ? <li>PAN kept in memory only, never saved to disk: {panFieldsKeptInMemory.map(describeField).join(", ")}.</li> : null}
        </ReportGroup>
      ) : null}
      {unknownHeadings.length || duplicateFields.length || cellWarnings.length ? (
        <ReportGroup tone="info" title="Ignored">
          {unknownHeadings.length ? <li>Columns not on this form: {unknownHeadings.join(", ")}.</li> : null}
          {duplicateFields.length ? <li>Columns found twice (first one used): {duplicateFields.map(describeField).join(", ")}.</li> : null}
          {cellWarnings.map((cellWarning) => <li key={cellWarning.field}>{describeField(cellWarning.field)}: {cellWarning.warning}.</li>)}
        </ReportGroup>
      ) : null}
    </div>
  );
}
