"use client";

import * as React from "react";
import { connectorEnds, connectorPath } from "@/lib/canvas/geometry";
import { color, type Item, type Point } from "@/lib/canvas/types";

/** Every connector, in world units, above the items they join. */
export function ConnectorLayer({ items, byId, selected }: { items: Item[]; byId: Map<string, Item>; selected: Set<string> }) {
  return (
    <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1}>
      {items.map((it) => (it.kind === "connector" ? <Connector key={it.id} it={it} byId={byId} selected={selected.has(it.id)} /> : null))}
    </svg>
  );
}

function Connector({ it, byId, selected }: { it: Item; byId: Map<string, Item>; selected: boolean }) {
  const [a, b] = connectorEnds(it, byId);
  const ink = color(it.props.color, "black").ink;
  return (
    <g>
      {/* A wide invisible stroke, so a thin line is easy to click. */}
      <path data-item-id={it.id} d={connectorPath(a, b, it.props.curved)} stroke="transparent" strokeWidth={18} fill="none" className="pointer-events-auto" />
      <Line a={a} b={b} curved={it.props.curved} ink={selected ? "#0D99FF" : ink} arrowStart={it.props.arrowStart} arrowEnd={it.props.arrowEnd !== false} />
    </g>
  );
}

/** A line with optional arrowheads (drawn by hand: SVG markers can't take the line's colour everywhere yet). */
export function Line({ a, b, curved, ink, arrowStart, arrowEnd = true, dashed }: { a: Point; b: Point; curved?: boolean; ink: string; arrowStart?: boolean; arrowEnd?: boolean; dashed?: boolean }) {
  const d = connectorPath(a, b, curved);
  // The direction each end comes in from: the curve's control point, or the other end.
  const ctrl = curved ? controlPoint(a, b) : null;
  return (
    <g>
      <path d={d} stroke={ink} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeDasharray={dashed ? "6 6" : undefined} />
      {arrowEnd ? <Head tip={b} from={ctrl ?? a} ink={ink} /> : null}
      {arrowStart ? <Head tip={a} from={ctrl ?? b} ink={ink} /> : null}
    </g>
  );
}

function controlPoint(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: (a.x + b.x) / 2 - dy * 0.2, y: (a.y + b.y) / 2 + dx * 0.2 };
}

function Head({ tip, from, ink }: { tip: Point; from: Point; ink: string }) {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const len = 14;
  const spread = 0.45;
  const p1 = { x: tip.x - len * Math.cos(angle - spread), y: tip.y - len * Math.sin(angle - spread) };
  const p2 = { x: tip.x - len * Math.cos(angle + spread), y: tip.y - len * Math.sin(angle + spread) };
  return <polygon points={`${tip.x},${tip.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill={ink} stroke={ink} strokeWidth={1.5} strokeLinejoin="round" />;
}
