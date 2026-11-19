"use client";

import { Maximize, Minus, Plus } from "lucide-react";

/** Bottom-right zoom: out, the level (click for 100%), in, and fit everything. */
export function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset, onFit }: { zoom: number; onZoomIn: () => void; onZoomOut: () => void; onReset: () => void; onFit: () => void }) {
  const btn = "flex size-8 items-center justify-center rounded-lg text-[#1E1E1E] transition-colors hover:bg-black/[0.05]";
  return (
    <div
      className="absolute right-4 bottom-4 z-30 flex items-center gap-0.5 rounded-xl border border-black/[0.08] bg-white p-1 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.2)]"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button type="button" className={btn} onClick={onZoomOut} title="Zoom out (Ctrl -)">
        <Minus className="size-4" />
      </button>
      <button type="button" className="h-8 min-w-12 rounded-lg px-1 text-[12px] font-semibold tabular-nums hover:bg-black/[0.05]" onClick={onReset} title="Zoom to 100% (Ctrl 0)">
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" className={btn} onClick={onZoomIn} title="Zoom in (Ctrl +)">
        <Plus className="size-4" />
      </button>
      <button type="button" className={btn} onClick={onFit} title="Fit everything (Shift 1)">
        <Maximize className="size-4" />
      </button>
    </div>
  );
}
