"use client";
import { useEffect, type ReactNode } from "react";

interface DrawerProps {
  title: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** A panel that slides in from the right over the page; Esc or a click outside closes it. */
export default function Drawer({ title, isOpen, onClose, children }: DrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div className={`fixed inset-0 z-50 ${isOpen ? "" : "pointer-events-none"}`}>
      <div onClick={onClose} className={`absolute inset-0 bg-ink/30 transition-opacity ${isOpen ? "opacity-100" : "opacity-0"}`} />
      <aside className={`absolute right-0 top-0 flex h-full w-[26rem] max-w-full flex-col bg-white shadow-2xl transition-transform duration-200 ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="text-sm font-semibold">{title}</div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1 text-xl leading-none text-muted hover:bg-canvas">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </aside>
    </div>
  );
}
