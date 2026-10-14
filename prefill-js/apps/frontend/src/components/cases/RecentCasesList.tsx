"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchCases } from "@/api/cases-api";
import { fetchForms } from "@/api/forms-api";
import type { CaseSummary } from "@/types/cases";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/utils/format-date";

const MAXIMUM_RECENT_CASES = 50;

function getCaseLink(caseSummary: CaseSummary) {
  if (caseSummary.confirmedAt) return `/cases/${caseSummary.id}/confirm`;
  return caseSummary.isFilled ? `/cases/${caseSummary.id}/review` : `/cases/${caseSummary.id}/documents`;
}

export default function RecentCasesList() {
  const [recentCases, setRecentCases] = useState<CaseSummary[]>([]);
  const [formLabels, setFormLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchCases().then((cases) => setRecentCases(cases.slice(0, MAXIMUM_RECENT_CASES))).catch(() => setRecentCases([]));
    fetchForms().then((forms) => setFormLabels(Object.fromEntries(forms.map((form) => [form.formId, form.shortLabel])))).catch(() => {});
  }, []);

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-line bg-white">
      <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Recent cases <span className="font-normal text-muted">({recentCases.length})</span></h2>
      {!recentCases.length ? <p className="p-6 text-center text-sm text-muted">No cases yet.</p> : null}
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-auto">
        {recentCases.map((caseSummary) => (
          <li key={caseSummary.id}>
            <Link href={getCaseLink(caseSummary)} className="flex items-center gap-4 px-4 py-3 text-sm hover:bg-canvas">
              <span className="font-medium">{formLabels[caseSummary.formId] || caseSummary.formId}</span>
              <span className="text-muted">{caseSummary.documents.length} document{caseSummary.documents.length === 1 ? "" : "s"}</span>
              <span className="ml-auto text-xs text-muted">{formatDateTime(caseSummary.createdAt)}</span>
              <Badge isSoft tone={caseSummary.confirmedAt ? "success" : "neutral"}>
                {caseSummary.confirmedAt ? "Saved" : caseSummary.isFilled ? "In review" : "Documents"}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
