"use client";
import Badge from "@/components/ui/Badge";
import type { ReviewSection } from "@/utils/review-sections";

interface SectionRailProps {
  sections: ReviewSection[];
  activeSectionKey: string;
  problemFieldKeys: Set<string>;
  filledFieldKeys: Set<string>;
  onSelectSection: (sectionKey: string) => void;
}

/** The form's outline: one row per section with progress and a red badge for fields still to fix. */
export default function SectionRail({ sections, activeSectionKey, problemFieldKeys, filledFieldKeys, onSelectSection }: SectionRailProps) {
  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {sections.map((section, index) => {
        const problemCount = section.fields.filter((caseField) => problemFieldKeys.has(caseField.field)).length;
        const filledCount = section.fields.filter((caseField) => filledFieldKeys.has(caseField.field)).length;
        const isActive = section.key === activeSectionKey;
        const isComplete = problemCount === 0 && filledCount > 0;
        return (
          <button key={section.key} type="button" onClick={() => onSelectSection(section.key)}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition ${isActive ? "bg-ink text-white" : "text-ink hover:bg-canvas"}`}>
            <Badge isRound tone={problemCount ? "danger" : isComplete ? "success" : isActive ? "inverse" : "neutral"}>
              {problemCount ? problemCount : isComplete ? "✓" : index + 1}
            </Badge>
            <span className="min-w-0 flex-1 truncate">{section.label}</span>
            <span className={`text-[11px] ${isActive ? "text-white/70" : "text-muted"}`}>{filledCount}/{section.fields.length}</span>
          </button>
        );
      })}
    </nav>
  );
}
