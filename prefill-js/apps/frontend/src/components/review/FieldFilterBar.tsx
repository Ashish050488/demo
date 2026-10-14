import type { FieldFilter } from "@/utils/review-field-helpers";

const FILTER_CHOICES: { key: FieldFilter; label: string; hint: string }[] = [
  { key: "all", label: "All", hint: "Every field on the form" },
  { key: "filled", label: "Filled", hint: "Already filled - read, typed, or automatic" },
  { key: "empty", label: "Not filled yet", hint: "Fields with no value yet" },
  { key: "mustFix", label: "Must fix", hint: "Required and empty, or breaking a rule - the form can't be saved until these are fixed" },
];

interface FieldFilterBarProps {
  activeFilter: FieldFilter;
  countByFilter: Record<FieldFilter, number>;
  onFilterChange: (fieldFilter: FieldFilter) => void;
}

export default function FieldFilterBar({ activeFilter, countByFilter, onFilterChange }: FieldFilterBarProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTER_CHOICES.map((filterChoice) => {
        const isActive = filterChoice.key === activeFilter;
        const isMustFix = filterChoice.key === "mustFix" && countByFilter.mustFix > 0;
        return (
          <button key={filterChoice.key} type="button" title={filterChoice.hint} onClick={() => onFilterChange(filterChoice.key)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${isActive ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:text-ink"}`}>
            {filterChoice.label}
            <span className={`rounded-full px-1.5 text-[10px] font-semibold ${isMustFix ? "bg-red-500 text-white" : isActive ? "bg-white/20" : "bg-canvas"}`}>
              {countByFilter[filterChoice.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
