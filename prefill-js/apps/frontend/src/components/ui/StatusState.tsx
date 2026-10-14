import type { ReactNode } from "react";
import Button from "./Button";

interface StatusStateProps {
  tone?: "empty" | "error";
  title: string;
  message?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

/** Centred empty or error message for a panel, with an optional action (e.g. "Try again"). */
export default function StatusState({ tone = "empty", title, message, actionLabel, onAction }: StatusStateProps) {
  const isError = tone === "error";
  return (
    <div role={isError ? "alert" : "status"} className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center">
      <div className={`grid h-10 w-10 place-items-center rounded-full text-lg ${isError ? "bg-red-50 text-red-700" : "bg-canvas text-muted"}`}>{isError ? "!" : "○"}</div>
      <div className={`text-sm font-semibold ${isError ? "text-red-800" : "text-ink"}`}>{title}</div>
      {message ? <div className="max-w-sm text-xs text-muted">{message}</div> : null}
      {actionLabel && onAction ? <Button size="small" className="mt-1" onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  );
}
