"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** A small centred dialog: Escape or a click outside closes it. */
export function Dialog({ open, onClose, title, children, width = 420 }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div data-ui className="fixed inset-0 z-[100] flex items-center justify-center p-4" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
        // Keys typed in a dialog are the dialog's, not the canvas's shortcuts.
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}>
      <div className="absolute inset-0 animate-[fade-up_0.2s_ease_both] bg-[#16151a]/30 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal aria-label={title} className="relative max-h-[calc(100dvh-2rem)] w-full animate-pop overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] ring-1 ring-black/5" style={{ maxWidth: width }}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[17px] font-bold tracking-[-0.02em]">{title}</h2>
          <button type="button" onClick={onClose} className="-mt-1 -mr-2 flex size-8 items-center justify-center rounded-lg text-muted hover:bg-black/[0.05] hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
