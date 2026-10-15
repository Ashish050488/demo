"use client";
import { useEffect, useRef } from "react";
import type { DraftField } from "@/types/form-drafts";

// Where a value can come from. The first group is read from the client's KYC documents.
const SOURCE_OPTIONS: [string, string][] = [
  ["typed", "Excel / typed"],
  ["today", "Today's date"],
  ["document.name|upper", "Documents · full name"],
  ["document.name|surname|upper", "Documents · surname"],
  ["document.name|givenName|upper", "Documents · first name"],
  ["document.name|middleNames|upper", "Documents · middle name"],
  ["document.dob", "Documents · date of birth"],
  ["document.dob|monthFirst", "Documents · date of birth (MM/DD/YYYY)"],
  ["document.address|withoutCareOf|upper", "Documents · full address"],
  ["document.address|withoutCareOf|addressLine1|upper", "Documents · address line 1"],
  ["document.address|withoutCareOf|addressLine2|upper", "Documents · address line 2"],
  ["document.city", "Documents · city"],
  ["document.state", "Documents · state"],
  ["document.pincode", "Documents · pincode"],
  ["document.country|upper", "Documents · country"],
  ["document.pan", "Documents · PAN"],
  ["document.aadhaarLast4", "Documents · Aadhaar last 4"],
];
const MATCH_BADGES: Record<DraftField["matchedBy"], [string, string]> = {
  label: ["from label", "bg-emerald-50 text-emerald-800"],
  value: ["from value", "bg-sky-50 text-sky-800"],
  "same value": ["repeat", "bg-violet-50 text-violet-800"],
  new: ["new field", "bg-amber-50 text-amber-800"],
};

function describeSource(source: string) {
  if (source.startsWith("copy.")) return `Same as ${source.slice(5)}`;
  if (source.startsWith("default.")) return `Usually "${source.slice(8)}" (Excel can change)`;
  return SOURCE_OPTIONS.find(([value]) => value === source)?.[1] || source;
}

interface DraftFieldTableProps {
  fields: DraftField[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  onChangeField: (fieldId: string, change: Partial<DraftField>) => void;
  onRemoveField: (fieldId: string) => void;
}

/** Every proposed field: rename it, change where its value comes from, mark it required, or drop it. */
export default function DraftFieldTable({ fields, selectedFieldId, onSelectField, onChangeField, onRemoveField }: DraftFieldTableProps) {
  const selectedRow = useRef<HTMLDivElement>(null);
  useEffect(() => { selectedRow.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [selectedFieldId]);
  const otherKeys = [...new Set(fields.map((field) => field.key))];
  return (
    <div className="divide-y divide-line">
      {fields.map((field) => {
        const isSelected = field.id === selectedFieldId;
        const [badgeText, badgeClasses] = MATCH_BADGES[field.matchedBy];
        const sourceChoices = [...SOURCE_OPTIONS.map(([value]) => value), ...(field.source.startsWith("default.") ? [field.source] : []),
          ...otherKeys.filter((key) => key !== field.key).map((key) => `copy.${key}`)];
        return (
          <div key={field.id} ref={isSelected ? selectedRow : undefined} onClick={() => onSelectField(field.id)}
            className={`grid cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-xs ${isSelected ? "bg-brand-50" : "hover:bg-canvas"}`}>
            <span className="rounded bg-canvas px-1.5 py-0.5 text-center tabular-nums text-muted">p{field.page}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <input value={field.key} aria-label="Field name" onChange={(event) => onChangeField(field.id, { key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                  className="w-full min-w-0 rounded border border-line bg-white px-1.5 py-1 font-mono text-[11px]" />
                {field.nominee ? <span className="shrink-0 rounded bg-ink px-1.5 py-0.5 text-[10px] text-white">N{field.nominee}</span> : null}
              </div>
              <div className="mt-1 truncate text-muted" title={`${field.label}\nSample: ${field.sampleValue}`}>
                <span className={`mr-1 rounded px-1 py-px text-[10px] ${badgeClasses}`}>{badgeText}</span>
                {field.label || "no printed label"}{field.sampleValue ? <span className="text-ink/70"> · “{field.sampleValue.split("\n")[0]}”</span> : null}
                {field.alsoAt.length ? <span> · +{field.alsoAt.length} more place{field.alsoAt.length === 1 ? "" : "s"}</span> : null}
              </div>
            </div>
            <select value={field.source} aria-label="Where the value comes from" onChange={(event) => onChangeField(field.id, { source: event.target.value })}
              className="w-full min-w-0 rounded border border-line bg-white px-1.5 py-1 text-[11px]">
              {sourceChoices.map((value) => <option key={value} value={value}>{describeSource(value)}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-muted" onClick={(event) => event.stopPropagation()}>
                <input type="checkbox" checked={field.isRequired} onChange={(event) => onChangeField(field.id, { isRequired: event.target.checked })} />Required
              </label>
              <button type="button" aria-label={`Remove ${field.key}`} title="Not a field - remove"
                onClick={(event) => { event.stopPropagation(); onRemoveField(field.id); }}
                className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-red-50 hover:text-red-700">✕</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
