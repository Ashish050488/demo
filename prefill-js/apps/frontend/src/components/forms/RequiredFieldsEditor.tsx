"use client";
import { useState } from "react";
import { formatFieldLabel } from "@prefill/shared";
import type { FormMappingItem } from "@/types/forms";

type FieldFilter = "all" | "required" | "page";

interface RequiredFieldsEditorProps {
  mappingItems: FormMappingItem[];
  /** The form's own sections ("Page 17 · Bank account") - fields are listed under them, in this order. */
  sections: { key: string; label: string; fields: string[] }[];
  requiredFields: Set<string>;
  selectedKey: string | null;
  pageNumber: number;
  onToggleRequired: (fieldKey: string) => void;
  onSelectKey: (fieldKey: string) => void;
}

/** Every field once (per-nominee fields once), grouped by section: find one, see its page and source, flip Required. */
export default function RequiredFieldsEditor({ mappingItems, sections, requiredFields, selectedKey, pageNumber, onToggleRequired, onSelectKey }: RequiredFieldsEditorProps) {
  const [searchText, setSearchText] = useState("");
  const [fieldFilter, setFieldFilter] = useState<FieldFilter>("all");
  const [closedSections, setClosedSections] = useState<Set<string>>(new Set());
  const itemByKey = new Map<string, FormMappingItem>();
  for (const mappingItem of mappingItems) if (!itemByKey.has(mappingItem.key)) itemByKey.set(mappingItem.key, mappingItem);
  const listedKeys = new Set(sections.flatMap((section) => section.fields));
  const groups = [
    ...sections.map((section) => ({ key: section.key, label: section.label, fieldKeys: section.fields.filter((fieldKey) => itemByKey.has(fieldKey)) })),
    { key: "other", label: "Other fields", fieldKeys: [...itemByKey.keys()].filter((fieldKey) => !listedKeys.has(fieldKey)) },
  ].filter((group) => group.fieldKeys.length);
  const query = searchText.trim().toLowerCase();
  const isShown = (fieldKey: string) => {
    const mappingItem = itemByKey.get(fieldKey)!;
    if (query && !`${formatFieldLabel(fieldKey)} ${fieldKey} ${mappingItem.source}`.toLowerCase().includes(query)) return false;
    if (fieldFilter === "required") return requiredFields.has(fieldKey);
    if (fieldFilter === "page") return mappingItems.some((candidate) => candidate.key === fieldKey && candidate.page === pageNumber);
    return true;
  };
  const toggleSection = (sectionKey: string) => setClosedSections((current) => {
    const next = new Set(current);
    if (next.has(sectionKey)) next.delete(sectionKey); else next.add(sectionKey);
    return next;
  });
  const filterButton = (filter: FieldFilter, label: string) => (
    <button type="button" onClick={() => setFieldFilter(filter)}
      className={`rounded-full px-2.5 py-0.5 ${fieldFilter === filter ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>{label}</button>
  );
  const shownGroups = groups.map((group) => ({ ...group, shownKeys: group.fieldKeys.filter(isShown) })).filter((group) => group.shownKeys.length);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={`Search ${itemByKey.size} fields…`}
          className="w-full rounded-lg border border-line px-3 py-1.5 text-sm" />
        <div className="flex items-center gap-1 text-xs">
          {filterButton("all", "All")}{filterButton("required", `Required (${requiredFields.size})`)}{filterButton("page", `Page ${pageNumber}`)}
          <button type="button" className="ml-auto text-muted hover:text-ink" onClick={() => setClosedSections(closedSections.size ? new Set() : new Set(groups.map((group) => group.key)))}>
            {closedSections.size ? "Open all" : "Fold all"}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {!shownGroups.length ? <p className="p-6 text-center text-xs text-muted">No field matches.</p> : null}
        {shownGroups.map((group) => {
          const isClosed = closedSections.has(group.key) && !query;
          const requiredCount = group.fieldKeys.filter((fieldKey) => requiredFields.has(fieldKey)).length;
          return (
            <section key={group.key}>
              <button type="button" onClick={() => toggleSection(group.key)} aria-expanded={!isClosed}
                className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-line bg-canvas px-3 py-1.5 text-left text-xs font-semibold text-ink">
                <span className="text-muted">{isClosed ? "▸" : "▾"}</span>
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <span className="shrink-0 font-normal tabular-nums text-muted">{requiredCount ? <span className="text-red-700">{requiredCount} req · </span> : null}{group.fieldKeys.length}</span>
              </button>
              {isClosed ? null : group.shownKeys.map((fieldKey) => {
                const mappingItem = itemByKey.get(fieldKey)!;
                const isRequired = requiredFields.has(fieldKey);
                return (
                  <div key={fieldKey} onClick={() => onSelectKey(fieldKey)} title={`${formatFieldLabel(fieldKey)} · ${mappingItem.source} · ${mappingItem.rule}`}
                    className={`flex cursor-pointer items-center gap-2 border-b border-line/60 px-3 py-1.5 text-xs ${selectedKey === fieldKey ? "bg-brand-50" : "hover:bg-canvas"}`}>
                    <span className="w-8 shrink-0 rounded bg-canvas py-px text-center tabular-nums text-muted">p{mappingItem.page}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{formatFieldLabel(fieldKey)}{mappingItem.nominee ? <span className="font-normal text-muted"> · each nominee</span> : null}</span>
                      <span className="block truncate text-[11px] text-muted">{mappingItem.kind === "tick" ? "Tick box" : mappingItem.source}</span>
                    </span>
                    <button type="button" role="switch" aria-checked={isRequired} aria-label={`Required: ${formatFieldLabel(fieldKey)}`} title={isRequired ? "Required" : "Optional"}
                      onClick={(event) => { event.stopPropagation(); onToggleRequired(fieldKey); }}
                      className={`relative h-4 w-7 shrink-0 rounded-full transition ${isRequired ? "bg-red-500" : "bg-line"}`}>
                      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${isRequired ? "left-3.5" : "left-0.5"}`} />
                    </button>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
