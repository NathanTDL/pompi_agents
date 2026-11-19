"use client";

import * as React from "react";
import { ArrowRight, Bold, Circle, Copy, Diamond, Spline, Square, Trash2, Triangle } from "lucide-react";
import { color, INK_COLORS, STICKY_COLORS, type ColorName, type Item, type ShapeKind, type TextSize } from "@/lib/canvas/types";

type Change = Record<string, unknown>;

/** The bar that floats over a selection (FigJam's contextual toolbar): colour, size, shape, duplicate, delete. */
export function ContextBar({
  items,
  at,
  onProps,
  onDuplicate,
  onDelete,
}: {
  items: Item[];
  at: { x: number; y: number };
  onProps: (change: Change, filter?: (it: Item) => boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const kinds = new Set(items.map((it) => it.kind));
  const only = kinds.size === 1 ? items[0].kind : null;
  const filled = items.filter((it) => it.kind === "sticky" || it.kind === "shape" || it.kind === "section");
  const inked = items.filter((it) => it.kind === "text" || it.kind === "connector");
  const palette: ColorName[] | null = filled.length && !inked.length ? STICKY_COLORS : inked.length && !filled.length ? INK_COLORS : null;
  const current = items[0]?.props.color as ColorName | undefined;

  return (
    <div
      className="absolute z-30 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-xl border border-black/[0.08] bg-[#1E1E1E] px-2 py-1.5 text-white shadow-[0_8px_24px_-6px_rgba(0,0,0,0.4)]"
      style={{ left: at.x, top: at.y - 14 }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {palette ? (
        <div className="flex items-center gap-1 px-1">
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => onProps({ color: c })}
              className={`size-5 rounded-full border border-white/25 transition-transform hover:scale-115 ${current === c ? "ring-2 ring-white ring-offset-1 ring-offset-[#1E1E1E]" : ""}`}
              style={{ background: inked.length ? color(c).ink : color(c).fill }}
            />
          ))}
        </div>
      ) : null}

      {only === "text" ? (
        <>
          <Sep />
          {(["s", "m", "l", "xl"] as TextSize[]).map((s) => (
            <BarButton key={s} active={items.every((it) => (it.props.size ?? "m") === s)} onClick={() => onProps({ size: s })} label={`Size ${s.toUpperCase()}`}>
              <span className="text-[12px] font-bold">{s.toUpperCase()}</span>
            </BarButton>
          ))}
          <BarButton active={items.every((it) => it.props.bold)} onClick={() => onProps({ bold: !items.every((it) => it.props.bold) })} label="Bold">
            <Bold className="size-4" />
          </BarButton>
        </>
      ) : null}

      {only === "shape" ? (
        <>
          <Sep />
          {([
            ["rect", Square],
            ["ellipse", Circle],
            ["diamond", Diamond],
            ["triangle", Triangle],
          ] as [ShapeKind, React.ElementType][]).map(([shape, Icon]) => (
            <BarButton key={shape} active={items.every((it) => it.props.shape === shape)} onClick={() => onProps({ shape })} label={shape}>
              <Icon className="size-4" />
            </BarButton>
          ))}
        </>
      ) : null}

      {only === "connector" ? (
        <>
          <Sep />
          <BarButton active={items.every((it) => it.props.curved)} onClick={() => onProps({ curved: !items.every((it) => it.props.curved) })} label="Curved">
            <Spline className="size-4" />
          </BarButton>
          <BarButton active={items.every((it) => it.props.arrowEnd !== false)} onClick={() => onProps({ arrowEnd: !items.every((it) => it.props.arrowEnd !== false) })} label="Arrowhead">
            <ArrowRight className="size-4" />
          </BarButton>
        </>
      ) : null}

      <Sep />
      <BarButton onClick={onDuplicate} label="Duplicate (Ctrl+D)">
        <Copy className="size-4" />
      </BarButton>
      <BarButton onClick={onDelete} label="Delete">
        <Trash2 className="size-4" />
      </BarButton>
    </div>
  );
}

function Sep() {
  return <div className="mx-0.5 h-5 w-px bg-white/15" />;
}

function BarButton({ active, onClick, label, children }: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" title={label} onClick={onClick} className={`flex size-8 items-center justify-center rounded-lg capitalize transition-colors ${active ? "bg-white/20" : "hover:bg-white/10"}`}>
      {children}
    </button>
  );
}
