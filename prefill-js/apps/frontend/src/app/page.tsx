"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchBatches } from "@/api/batches-api";
import { fetchCases } from "@/api/cases-api";
import { fetchForms } from "@/api/forms-api";
import RecentBatchesList from "@/components/batches/RecentBatchesList";
import RecentCasesList, { getCaseStage } from "@/components/cases/RecentCasesList";
import type { BatchListEntry } from "@/types/batches";
import type { CaseSummary } from "@/types/cases";

const ACTIONS = [
  { href: "/cases/new", icon: "👤", title: "Single case", description: "One client's ID documents → a filled form to review" },
  { href: "/batches/new", icon: "📋", title: "Batch", description: "One Excel + each client's documents → many forms at once" },
  { href: "/forms/new", icon: "➕", title: "Add a form", description: "A new blank form (+ a filled sample) → mapped for you" },
];

/** Home: start something, see where everything stands, find any case or batch. */
export default function HomePage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [batches, setBatches] = useState<BatchListEntry[]>([]);
  const [formLabels, setFormLabels] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      fetchCases().then(setCases).catch(() => setCases([])),
      fetchBatches().then((loaded) => setBatches(loaded.filter((batchEntry) => batchEntry.startedAt))).catch(() => setBatches([])),
      fetchForms().then((forms) => setFormLabels(Object.fromEntries(forms.map((form) => [form.formId, form.shortLabel || form.label])))).catch(() => {}),
    ]).finally(() => setIsLoading(false));
  }, []);
  const countOf = (stage: ReturnType<typeof getCaseStage>) => cases.filter((caseSummary) => getCaseStage(caseSummary) === stage).length;
  const stats = [
    { label: "In review", value: countOf("review"), tone: "text-amber-700" },
    { label: "Waiting for documents", value: countOf("documents"), tone: "text-muted" },
    { label: "Saved", value: countOf("saved"), tone: "text-emerald-700" },
    { label: "Batches", value: batches.length, tone: "text-ink" },
  ];

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Form Prefill</h1>
          <p className="text-xs text-muted">Documents are read on this machine · Aadhaar kept as last 4 only · PAN never saved</p>
        </div>
        <div className="ml-auto flex gap-2">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-[7.5rem] rounded-xl border border-line bg-white px-3 py-2">
              <div className={`text-lg font-semibold tabular-nums ${stat.tone}`}>{isLoading ? "–" : stat.value}</div>
              <div className="text-[11px] text-muted">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {ACTIONS.map((action) => (
          <Link key={action.href} href={action.href}
            className="group flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 transition hover:border-brand-500 hover:shadow-sm">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-canvas text-lg" aria-hidden>{action.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{action.title}</span>
              <span className="block truncate text-xs text-muted">{action.description}</span>
            </span>
            <span className="text-brand-600 transition group-hover:translate-x-0.5" aria-hidden>→</span>
          </Link>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <RecentBatchesList batches={batches} formLabels={formLabels} />
        <RecentCasesList cases={cases} formLabels={formLabels} isLoading={isLoading} />
      </div>
    </div>
  );
}
