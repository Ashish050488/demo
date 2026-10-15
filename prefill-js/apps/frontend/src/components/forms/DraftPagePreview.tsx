"use client";
import { getDraftPageImageUrl } from "@/api/form-drafts-api";
import type { DraftField, FormDraft } from "@/types/form-drafts";

interface DraftPagePreviewProps {
  draft: FormDraft;
  pageNumber: number;
  fields: DraftField[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
}

const toPercent = (value: number) => `${Math.max(0, value * 100)}%`;

/** The blank page with every proposed box drawn where its value will be written. Dashed = the same value printed
 * again (one field, several places). Click a box to edit its row. */
export default function DraftPagePreview({ draft, pageNumber, fields, selectedFieldId, onSelectField }: DraftPagePreviewProps) {
  const pageSize = draft.pageSizes[pageNumber - 1];
  const boxStyle = (x: number, y: number, fontSize: number, width: number, height: number) => ({
    left: toPercent(x / pageSize.width), top: toPercent((y - fontSize * 0.85) / pageSize.height),
    width: toPercent(width / pageSize.width), height: toPercent(height / pageSize.height),
  });
  const placedBoxes = fields.flatMap((field) => [
    ...(field.page === pageNumber ? [{ field, isRepeat: false, style: boxStyle(field.x, field.y, field.fontSize, Math.min(field.maxWidth, 260),
      field.type === "multiline" && field.maxY ? field.maxY - field.y + field.fontSize * 0.85 : field.fontSize * 1.15) }] : []),
    ...field.alsoAt.filter((repeat) => repeat.page === pageNumber)
      .map((repeat) => ({ field, isRepeat: true, style: boxStyle(repeat.x, repeat.y, repeat.fontSize, Math.min(repeat.maxWidth || 160, 260), repeat.fontSize * 1.15) })),
  ]);
  return (
    <div className="relative mx-auto h-full" style={{ aspectRatio: String(pageSize.width / pageSize.height), maxWidth: "100%" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a page image from the local API */}
      <img src={getDraftPageImageUrl(draft.draftId, pageNumber)} alt={`Blank form, page ${pageNumber}`} className="block h-full w-full bg-white object-contain shadow" />
      {placedBoxes.map(({ field, isRepeat, style }, index) => {
        const isSelected = field.id === selectedFieldId;
        return (
          <button key={`${field.id}-${index}`} type="button" onClick={() => onSelectField(field.id)} style={style}
            title={`${field.key}${field.nominee ? ` (nominee ${field.nominee})` : ""}${isRepeat ? " - printed again here" : ""}`}
            className={`absolute rounded-sm border text-left text-[9px] leading-none transition-colors ${isRepeat ? "border-dashed" : ""} ${isSelected
              ? "z-10 border-brand-500 bg-brand-500/25 ring-2 ring-brand-500" : "border-sky-500 bg-sky-500/15 hover:bg-sky-500/30"}`}>
            <span className={`absolute -top-3 left-0 whitespace-nowrap rounded px-1 ${isSelected ? "bg-brand-500 text-white" : "bg-sky-600/90 text-white"}`}>
              {field.key}{field.nominee ? `_n${field.nominee}` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
