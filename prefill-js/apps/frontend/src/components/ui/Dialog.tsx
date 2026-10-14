"use client";
import { useEffect, type ReactNode } from "react";

interface DialogProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: "medium" | "large";
}

/** A centred modal; Esc or a click on the backdrop closes it. */
export default function Dialog({ title, isOpen, onClose, children, width = "medium" }: DialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`max-h-[90vh] w-full overflow-auto rounded-xl bg-white shadow-xl ${width === "large" ? "max-w-3xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-xl leading-none text-muted hover:bg-canvas">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
