"use client";
import { formatFieldLabel } from "@prefill/shared";
import type { FormMappingItem } from "@/types/forms";

interface RequiredFieldsEditorProps {
  mappingItems: FormMappingItem[];
  requiredFields: Set<string>;
  selectedKey: string | null;
  onToggleRequired: (fieldKey: string) => void;
  onSelectKey: (fieldKey: string) => void;
}

/** One row per form field (per-nominee fields once): a Required switch and what fills it. */
export default function RequiredFieldsEditor({ mappingItems, requiredFields, selectedKey, onToggleRequired, onSelectKey }: RequiredFieldsEditorProps) {
  const uniqueItems = [...new Map(mappingItems.map((mappingItem) => [mappingItem.key, mappingItem])).values()];
  return (
    <ul className="divide-y divide-line">
      {uniqueItems.map((mappingItem) => {
        const isRequired = requiredFields.has(mappingItem.key);
        return (
          <li key={mappingItem.key} onClick={() => onSelectKey(mappingItem.key)}
            className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${selectedKey === mappingItem.key ? "bg-brand-50" : "hover:bg-canvas"}`}>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{formatFieldLabel(mappingItem.key)}{mappingItem.nominee ? <span className="ml-1 text-xs font-normal text-muted">(each nominee)</span> : null}</div>
              <div className="truncate text-xs text-muted">{mappingItem.source} · {mappingItem.rule}</div>
            </div>
            <label className="flex items-center gap-2 text-xs" onClick={(event) => event.stopPropagation()}>
              <span className={isRequired ? "font-medium text-red-700" : "text-muted"}>Required</span>
              <button type="button" role="switch" aria-checked={isRequired} onClick={() => onToggleRequired(mappingItem.key)}
                className={`relative h-5 w-9 rounded-full transition ${isRequired ? "bg-red-500" : "bg-line"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${isRequired ? "left-4" : "left-0.5"}`} />
              </button>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
