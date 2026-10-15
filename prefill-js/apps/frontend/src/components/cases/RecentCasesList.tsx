"use client";
import Link from "next/link";
import { useState } from "react";
import type { CaseSummary } from "@/types/cases";
import { formatDateTime } from "@/utils/format-date";

export type CaseStage = "review" | "documents" | "saved";
type CaseFilter = "all" | CaseStage;

export function getCaseStage(caseSummary: CaseSummary): CaseStage {
  if (caseSummary.confirmedAt) return "saved";
  return caseSummary.isFilled ? "review" : "documents";
}

const STAGE_DETAILS: Record<CaseStage, { label: string; pillClasses: string; href: (caseId: string) => string }> = {
  review: { label: "In review", pillClasses: "bg-amber-50 text-amber-800", href: (caseId) => `/cases/${caseId}/review` },
  documents: { label: "Documents", pillClasses: "bg-canvas text-muted", href: (caseId) => `/cases/${caseId}/documents` },
  saved: { label: "Saved", pillClasses: "bg-emerald-50 text-emerald-800", href: (caseId) => `/cases/${caseId}/confirm` },
};

interface RecentCasesListProps {
  cases: CaseSummary[];
  formLabels: Record<string, string>;
  isLoading: boolean;
}

/** Every case, newest first: who it is for, which form, where it stands - searchable and filterable. */
export default function RecentCasesList({ cases, formLabels, isLoading }: RecentCasesListProps) {
  const [caseFilter, setCaseFilter] = useState<CaseFilter>("all");
  const [searchText, setSearchText] = useState("");
  const query = searchText.trim().toLowerCase();
  const shownCases = cases.filter((caseSummary) => (caseFilter === "all" || getCaseStage(caseSummary) === caseFilter)
    && (!query || `${caseSummary.clientName || ""} ${formLabels[caseSummary.formId] || caseSummary.formId}`.toLowerCase().includes(query)));
  const countOf = (stage: CaseStage) => cases.filter((caseSummary) => getCaseStage(caseSummary) === stage).length;
  const filterButton = (filter: CaseFilter, label: string) => (
    <button key={filter} type="button" onClick={() => setCaseFilter(filter)}
      className={`rounded-full px-2.5 py-0.5 ${caseFilter === filter ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>{label}</button>
  );

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">Cases <span className="font-normal text-muted">({cases.length})</span></h2>
        <div className="flex items-center gap-1 text-xs">
          {filterButton("all", "All")}{filterButton("review", `In review ${countOf("review")}`)}
          {filterButton("documents", `Documents ${countOf("documents")}`)}{filterButton("saved", `Saved ${countOf("saved")}`)}
        </div>
        <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search client or form…"
          className="ml-auto w-48 rounded-lg border border-line px-2.5 py-1 text-xs" />
      </div>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_4.5rem_6.5rem_5.5rem] gap-3 border-b border-line bg-canvas px-4 py-1.5 text-[11px] font-medium text-muted">
        <span>Client</span><span>Form</span><span>Documents</span><span>Created</span><span>Status</span>
      </div>
      <div className="min-h-0 flex-1 divide-y divide-line overflow-auto">
        {isLoading ? <p className="p-6 text-center text-sm text-muted">Loading…</p>
          : !shownCases.length ? <p className="p-6 text-center text-sm text-muted">{cases.length ? "No case matches." : "No cases yet - start a single case or a batch."}</p> : null}
        {shownCases.map((caseSummary) => {
          const stage = STAGE_DETAILS[getCaseStage(caseSummary)];
          return (
            <Link key={caseSummary.id} href={stage.href(caseSummary.id)}
              className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_4.5rem_6.5rem_5.5rem] items-center gap-3 px-4 py-2 text-sm hover:bg-canvas">
              <span className="min-w-0 truncate font-medium">
                {caseSummary.clientName || <span className="font-normal text-muted">Not read yet</span>}
                {caseSummary.batchId ? <span className="ml-1.5 rounded bg-canvas px-1 text-[10px] font-normal text-muted">batch</span> : null}
              </span>
              <span className="min-w-0 truncate text-xs text-muted" title={formLabels[caseSummary.formId]}>{formLabels[caseSummary.formId] || caseSummary.formId}</span>
              <span className="text-xs tabular-nums text-muted">{caseSummary.documents.length}</span>
              <span className="text-xs text-muted">{formatDateTime(caseSummary.createdAt)}</span>
              <span className={`justify-self-start rounded-full px-2 py-0.5 text-[11px] font-medium ${stage.pillClasses}`}>{stage.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
