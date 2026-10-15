"use client";
import { useState } from "react";
import { formatFieldLabel } from "@prefill/shared";
import { getBlankPageImageUrl } from "@/api/forms-api";
import Skeleton from "@/components/ui/Skeleton";
import type { FormMappingItem } from "@/types/forms";

interface BlankFormOverlayProps {
  formId: string;
  pageNumber: number;
  mappingItems: FormMappingItem[];
  requiredFields: Set<string>;
  selectedKey: string | null;
  onSelectKey: (fieldKey: string) => void;
}

/** The blank form page with every mapped box drawn on it: red = required, orange = optional. Click a box to find its row. */
export default function BlankFormOverlay({ formId, pageNumber, mappingItems, requiredFields, selectedKey, onSelectKey }: BlankFormOverlayProps) {
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const isLoaded = loadedPage === pageNumber;
  return (
    <div className="relative mx-auto aspect-[0.707] h-full max-w-full">
      {!isLoaded ? <Skeleton className="absolute inset-0 bg-white" /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the local API */}
      <img key={pageNumber} src={getBlankPageImageUrl(formId, pageNumber)} alt={`Blank form page ${pageNumber}`} onLoad={() => setLoadedPage(pageNumber)}
        className={`h-full w-full rounded border border-line bg-white object-contain shadow-sm transition-opacity ${isLoaded ? "opacity-100" : "opacity-0"}`} />
      {isLoaded ? mappingItems.filter((mappingItem) => mappingItem.page === pageNumber).map((mappingItem) => {
        const [left, top, right, bottom] = mappingItem.box;
        const isSelected = mappingItem.key === selectedKey;
        const colourClasses = requiredFields.has(mappingItem.key) ? "border-red-500 bg-red-500/10 hover:bg-red-500/25" : "border-brand-500 bg-brand-500/10 hover:bg-brand-500/25";
        return (
          <button key={mappingItem.id} type="button" title={`${formatFieldLabel(mappingItem.key)}${mappingItem.option ? ` - ${mappingItem.option}` : ""} · ${mappingItem.source}`}
            onClick={() => onSelectKey(mappingItem.key)}
            className={`absolute rounded-sm border ${colourClasses} ${isSelected ? "z-10 ring-2 ring-ink" : ""}`}
            style={{ left: `${left * 100}%`, top: `${top * 100}%`, width: `${Math.max(right - left, 0.012) * 100}%`, height: `${Math.max(bottom - top, 0.01) * 100}%` }} />
        );
      }) : null}
    </div>
  );
}
