"use client";

import { Dialog } from "@/components/ui/dialog";

const GROUPS: { title: string; rows: [string, string[]][] }[] = [
  {
    title: "Tools",
    rows: [
      ["Select", ["V"]],
      ["Hand", ["H"]],
      ["Sticky note", ["S"]],
      ["Text", ["T"]],
      ["Rectangle / ellipse", ["R", "O"]],
      ["Connector", ["X"]],
      ["Section", ["⇧", "S"]],
      ["Stamp", ["E"]],
    ],
  },
  {
    title: "Canvas",
    rows: [
      ["Write anywhere", ["Double-click"]],
      ["Talk to your agents", ["Hold", "M"]],
      ["Pan", ["Space", "Drag"]],
      ["Zoom", ["Ctrl", "Scroll"]],
      ["Zoom in / out", ["Ctrl", "+ / −"]],
      ["Zoom to 100%", ["Ctrl", "0"]],
      ["Fit everything", ["⇧", "1"]],
    ],
  },
  {
    title: "Editing",
    rows: [
      ["Undo / redo", ["Ctrl", "Z / ⇧Z"]],
      ["Duplicate", ["Ctrl", "D"]],
      ["Duplicate by dragging", ["Alt", "Drag"]],
      ["Copy / paste", ["Ctrl", "C / V"]],
      ["Select all", ["Ctrl", "A"]],
      ["Edit text", ["Enter"]],
      ["Nudge", ["Arrows"]],
      ["Delete", ["Del"]],
    ],
  },
];

export function CanvasHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" width={760}>
      <div className="mt-5 grid gap-6 sm:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="text-[11px] font-bold tracking-[0.14em] text-muted uppercase">{g.title}</p>
            <ul className="mt-2.5 space-y-2">
              {g.rows.map(([label, keys]) => (
                <li key={label} className="flex items-center justify-between gap-3 text-[13.5px]">
                  <span className="text-ink-2">{label}</span>
                  <span className="flex shrink-0 gap-1">
                    {keys.map((k) => (
                      <kbd key={k} className="rounded-md border border-line bg-[#FAFAFC] px-1.5 py-0.5 font-sans text-[11.5px] font-semibold text-ink-2 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/** What an empty board says, in the middle of the view, until something is on it. */
export function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex animate-fade-up flex-col items-center text-center">
        <div className="relative h-24 w-40">
          <span className="pompi-sticky absolute top-2 left-4 size-16 -rotate-6 rounded-[3px] bg-[#FFE48C]" />
          <span className="pompi-sticky absolute top-0 left-[58px] size-16 rotate-3 rounded-[3px] bg-[#A6D9FF]" />
          <span className="pompi-sticky absolute top-4 left-[100px] size-16 rotate-[8deg] rounded-[3px] bg-[#FFBDF2]" />
        </div>
        <p className="mt-4 text-[20px] font-bold tracking-[-0.02em] text-ink">Your board is ready</p>
        <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted">Double-click anywhere to write, or grab a sticky from the toolbar.</p>
        <div className="mt-4 flex items-center gap-2 text-[12px] text-muted">
          <Key>S</Key> sticky
          <span className="text-black/15">·</span>
          <Key>T</Key> text
          <span className="text-black/15">·</span>
          <Key>?</Key> shortcuts
        </div>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-line bg-white px-1.5 py-0.5 font-sans text-[11.5px] font-semibold text-ink-2 shadow-[0_1px_0_rgba(0,0,0,0.06)]">{children}</kbd>;
}
