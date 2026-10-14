"use client";
import type { ReactNode } from "react";

export interface TabItem<TabKey extends string | number> {
  key: TabKey;
  label: ReactNode;
  hasAlert?: boolean;
}

interface TabsProps<TabKey extends string | number> {
  tabs: TabItem<TabKey>[];
  activeKey: TabKey;
  onChange: (tabKey: TabKey) => void;
  trailingAction?: ReactNode;
}

/** Underlined tabs; a red dot marks a tab with something to fix. */
export default function Tabs<TabKey extends string | number>({ tabs, activeKey, onChange, trailingAction }: TabsProps<TabKey>) {
  return (
    <div className="flex items-center gap-1 border-b border-line">
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button key={String(tab.key)} type="button" onClick={() => onChange(tab.key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[13px] ${isActive ? "border-brand-500 font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {tab.label}{tab.hasAlert ? <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> : null}
          </button>
        );
      })}
      {trailingAction}
    </div>
  );
}
