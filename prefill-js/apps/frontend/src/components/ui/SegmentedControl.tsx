"use client";

interface SegmentedControlProps<OptionKey extends string> {
  options: { key: OptionKey; label: string }[];
  activeKey: OptionKey;
  onChange: (optionKey: OptionKey) => void;
}

/** A small pill switch between a few views (e.g. Filled form / Field mapping, Focus / Whole page). */
export default function SegmentedControl<OptionKey extends string>({ options, activeKey, onChange }: SegmentedControlProps<OptionKey>) {
  return (
    <div className="inline-flex rounded-full bg-canvas p-0.5 text-xs">
      {options.map((option) => (
        <button key={option.key} type="button" onClick={() => onChange(option.key)}
          className={`whitespace-nowrap rounded-full px-3 py-1 transition ${activeKey === option.key ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
