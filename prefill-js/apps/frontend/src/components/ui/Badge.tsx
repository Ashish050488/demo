import type { ReactNode } from "react";

export type BadgeTone = "danger" | "warning" | "success" | "neutral" | "inverse";

const TONE_CLASSES: Record<BadgeTone, string> = {
  danger: "bg-red-500 text-white",
  warning: "bg-amber-50 text-amber-800",
  success: "bg-emerald-600 text-white",
  neutral: "bg-canvas text-muted",
  inverse: "bg-white/20 text-white",
};
const SOFT_TONE_CLASSES: Record<BadgeTone, string> = {
  danger: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-800",
  success: "bg-emerald-50 text-emerald-700",
  neutral: "bg-canvas text-muted",
  inverse: "bg-white/20 text-white",
};

interface BadgeProps {
  tone?: BadgeTone;
  isSoft?: boolean;
  isRound?: boolean;
  children: ReactNode;
}

/** Counts and status labels: "7 left", "Not filled", a section's ✓. */
export default function Badge({ tone = "neutral", isSoft = false, isRound = false, children }: BadgeProps) {
  const shapeClasses = isRound ? "grid h-5 w-5 place-items-center rounded-full text-[10px]" : "rounded-full px-2 py-0.5 text-[11px]";
  return <span className={`shrink-0 font-semibold ${shapeClasses} ${(isSoft ? SOFT_TONE_CLASSES : TONE_CLASSES)[tone]}`}>{children}</span>;
}
