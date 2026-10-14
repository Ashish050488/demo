"use client";
import { formatFieldLabel } from "@prefill/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchFieldSources } from "@/api/forms-api";
import type { FieldSources } from "@/types/forms";

const SOURCE_WORDS: Record<string, string> = { typed: "Typed here or from a batch sheet", today: "Today's date", tick: "Tick box - by rule or by you" };

/** form field -> where its value comes from, exactly as the fill step reads it (field-sources.json). */
export default function FieldMappingPane({ formId, onSelectField }: { formId: string; onSelectField: (fieldKey: string) => void }) {
  const [fieldSources, setFieldSources] = useState<FieldSources | null>(null);
  const [filterText, setFilterText] = useState("");
  useEffect(() => { fetchFieldSources(formId).then(setFieldSources).catch(() => setFieldSources(null)); }, [formId]);
  if (!fieldSources) return <p className="p-6 text-sm text-muted">Loading mapping…</p>;

  const normalizedFilter = filterText.trim().toLowerCase();
  const sourceRows = Object.entries(fieldSources.fieldSources)
    .filter(([fieldKey, fieldSource]) => !normalizedFilter || `${fieldKey} ${fieldSource} ${formatFieldLabel(fieldKey)}`.toLowerCase().includes(normalizedFilter));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line p-3">
        <input value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="Filter fields…"
          className="h-8 flex-1 rounded-lg border border-line px-3 text-sm outline-none focus:border-brand-500" />
        <Link href={`/forms/${formId}`} target="_blank" className="text-xs text-brand-600 hover:underline">Positions on the form ↗</Link>
      </div>
      <ul className="flex-1 divide-y divide-line overflow-auto">
        {sourceRows.map(([fieldKey, fieldSource]) => {
          const documentKey = /^document\.(\w+)$/.exec(fieldSource)?.[1];
          const documentEntry = documentKey ? fieldSources.documentData[documentKey] : null;
          return (
            <li key={fieldKey}>
              <button type="button" onClick={() => onSelectField(fieldKey)} className="w-full px-4 py-2.5 text-left hover:bg-canvas">
                <code className="text-xs"><span className="text-brand-700">&quot;{fieldKey}&quot;</span>: <span className="text-muted">&quot;{fieldSource}&quot;</span></code>
                <div className="mt-0.5 text-xs text-ink">
                  <b>{formatFieldLabel(fieldKey)}</b> ← {documentEntry ? documentEntry.means : SOURCE_WORDS[fieldSource] || fieldSource}
                  {documentEntry ? <span className="text-muted"> · {documentEntry.read_from.join(", ")}</span> : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <details className="border-t border-line p-3 text-xs">
        <summary className="cursor-pointer text-muted">View the whole JSON</summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-canvas p-2">{JSON.stringify(fieldSources, null, 2)}</pre>
      </details>
    </div>
  );
}
