"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchCases } from "@/api/cases-api";
import { fetchForms } from "@/api/forms-api";
import type { CaseSummary } from "@/types/cases";
import { formatDateTime } from "@/utils/format-date";

const MAXIMUM_RECENT_CASES = 8;

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

  if (!recentCases.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold text-muted">Recent cases</h2>
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
        {recentCases.map((caseSummary) => (
          <li key={caseSummary.id}>
            <Link href={getCaseLink(caseSummary)} className="flex items-center gap-4 px-4 py-3 text-sm hover:bg-canvas">
              <span className="font-medium">{formLabels[caseSummary.formId] || caseSummary.formId}</span>
              <span className="text-muted">{caseSummary.documents.length} document{caseSummary.documents.length === 1 ? "" : "s"}</span>
              <span className="ml-auto text-xs text-muted">{formatDateTime(caseSummary.createdAt)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${caseSummary.confirmedAt ? "bg-brand-50 text-brand-700" : "bg-canvas text-muted"}`}>
                {caseSummary.confirmedAt ? "Saved" : caseSummary.isFilled ? "In review" : "Documents"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
