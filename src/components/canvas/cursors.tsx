"use client";

import { toScreen } from "@/lib/canvas/geometry";
import type { Camera, Point } from "@/lib/canvas/types";

export type CursorInfo = { key: string; name: string; color: string; at: Point };

/** Everyone else's cursors with their names, as on FigJam. Moves glide, so a few updates a second look smooth. */
export function Cursors({ cursors, camera }: { cursors: CursorInfo[]; camera: Camera }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {cursors.map((c) => {
        const p = toScreen(c.at, camera);
        return (
          <div key={c.key} className="absolute top-0 left-0 transition-transform duration-100 ease-linear" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
            <CursorArrow color={c.color} />
            <div className="absolute top-[18px] left-[14px] rounded-full px-2 py-[3px] text-[12px] font-semibold whitespace-nowrap text-white shadow-sm" style={{ background: c.color }}>
              {c.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CursorArrow({ color }: { color: string }) {
  return (
    <svg width="20" height="22" viewBox="0 0 20 22" className="-translate-x-[2px] -translate-y-[2px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
      <path d="M2.5 1.8v16.9c0 .5.6.7.9.4l4.4-4.6c.2-.2.5-.3.8-.3h6.6c.5 0 .7-.6.4-.9L3.4 1.4c-.3-.3-.9-.1-.9.4Z" fill={color} stroke="white" strokeWidth="1.5" />
    </svg>
  );
}
