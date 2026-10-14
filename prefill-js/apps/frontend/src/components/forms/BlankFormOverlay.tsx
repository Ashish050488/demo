"use client";
import { getBlankPageImageUrl } from "@/api/forms-api";
import type { FormMappingItem } from "@/types/forms";

interface BlankFormOverlayProps {
  formId: string;
  pageNumber: number;
  mappingItems: FormMappingItem[];
  requiredFields: Set<string>;
  selectedKey: string | null;
  onSelectKey: (fieldKey: string) => void;
}

/** The blank form page with every mapped box drawn on it: red = required, green = optional. */
export default function BlankFormOverlay({ formId, pageNumber, mappingItems, requiredFields, selectedKey, onSelectKey }: BlankFormOverlayProps) {
  return (
    <div className="relative mx-auto max-w-3xl">
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the local API */}
      <img src={getBlankPageImageUrl(formId, pageNumber)} alt={`Blank form page ${pageNumber}`} className="w-full rounded border border-line bg-white" />
      {mappingItems.filter((mappingItem) => mappingItem.page === pageNumber).map((mappingItem) => {
        const [left, top, right, bottom] = mappingItem.box;
        const isSelected = mappingItem.key === selectedKey;
        const colourClasses = requiredFields.has(mappingItem.key) ? "border-red-500 bg-red-500/10" : "border-brand-500 bg-brand-500/10";
        return (
          <button key={mappingItem.id} type="button" title={`${mappingItem.id} · ${mappingItem.source}`} onClick={() => onSelectKey(mappingItem.key)}
            className={`absolute rounded-sm border ${colourClasses} ${isSelected ? "ring-2 ring-ink" : ""}`}
            style={{ left: `${left * 100}%`, top: `${top * 100}%`, width: `${(right - left) * 100}%`, height: `${(bottom - top) * 100}%` }} />
        );
      })}
    </div>
  );
}
