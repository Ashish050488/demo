import type { ReactNode } from "react";

type NoticeTone = "error" | "success" | "info";

const TONE_CLASSES: Record<NoticeTone, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  success: "border-brand-100 bg-brand-50 text-brand-700",
  info: "border-line bg-canvas text-muted",
};

export default function Notice({ tone = "info", children }: { tone?: NoticeTone; children: ReactNode }) {
  return <div className={`rounded-lg border px-4 py-3 text-sm ${TONE_CLASSES[tone]}`}>{children}</div>;
}
