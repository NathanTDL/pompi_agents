"use client";

import * as React from "react";
import { bounds, connectorEnds, itemRect, toScreen } from "@/lib/canvas/geometry";
import type { Camera, Item, Rect } from "@/lib/canvas/types";

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const CURSORS: Record<Handle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };

const BLUE = "#0D99FF";

const screenRect = (r: Rect, c: Camera): Rect => {
  const p = toScreen(r, c);
  return { x: p.x, y: p.y, w: r.w * c.z, h: r.h * c.z };
};

/** Which handles an item can be resized by: stickies keep their shape, text grows by its width. */
function handlesFor(it: Item): Handle[] {
  if (it.kind === "sticky" || it.kind === "stamp" || it.kind === "screen") return ["nw", "ne", "se", "sw"];
  if (it.kind === "text" || it.kind === "reply" || it.kind === "card") return ["e", "w"];
  return HANDLES;
}

/** The selection box and its handles, others' selections, and the marquee: drawn in screen space over the canvas. */
export function SelectionLayer({
  camera,
  byId,
  selected,
  hover,
  marquee,
  editing,
  remote,
}: {
  camera: Camera;
  byId: Map<string, Item>;
  selected: string[];
  hover: string | null;
  marquee: Rect | null;
  editing: string | null;
  remote: { color: string; name: string; selection: string[] }[];
}) {
  const items = selected.map((id) => byId.get(id)).filter(Boolean) as Item[];
  const single = items.length === 1 ? items[0] : null;
  const box = bounds(items.filter((it) => it.kind !== "connector").map((it) => itemRect(it, byId)));
  const hovered = hover ? byId.get(hover) : undefined;
  // Shapes and sections show their size under the box, as on FigJam.
  const sized = single && (single.kind === "shape" || single.kind === "section") && !editing ? single : null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {hovered && hovered.kind !== "connector" ? (
        (() => {
          const h = screenRect(itemRect(hovered, byId), camera);
          return <div className="absolute rounded-[3px] border-2" style={{ left: h.x - 2, top: h.y - 2, width: h.w + 4, height: h.h + 4, borderColor: `${BLUE}80` }} />;
        })()
      ) : null}
      {sized && box ? (
        (() => {
          const r = screenRect(box, camera);
          return (
            <div className="absolute -translate-x-1/2 rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums" style={{ left: r.x + r.w / 2, top: r.y + r.h + 10, background: BLUE }}>
              {Math.round(sized.w)} × {Math.round(sized.h)}
            </div>
          );
        })()
      ) : null}
      {remote.map((r) =>
        r.selection.map((id) => {
          const it = byId.get(id);
          if (!it || it.kind === "connector") return null;
          const s = screenRect(itemRect(it, byId), camera);
          return (
            <div key={`${r.name}-${id}`} className="absolute rounded-[3px] border-2" style={{ left: s.x - 3, top: s.y - 3, width: s.w + 6, height: s.h + 6, borderColor: r.color }} />
          );
        }),
      )}

      {single?.kind === "connector" ? (
        <ConnectorHandles it={single} byId={byId} camera={camera} />
      ) : box && !editing ? (
        <SelectionBox rect={screenRect(box, camera)} handles={single ? handlesFor(single) : []} multiple={items.length > 1} />
      ) : null}

      {items.length > 1
        ? items.map((it) => {
            if (it.kind === "connector") return null;
            const s = screenRect(itemRect(it, byId), camera);
            return <div key={it.id} className="absolute border" style={{ left: s.x, top: s.y, width: s.w, height: s.h, borderColor: `${BLUE}99` }} />;
          })
        : null}

      {marquee ? (
        <div
          className="absolute border"
          style={{ ...(() => { const s = screenRect(marquee, camera); return { left: s.x, top: s.y, width: s.w, height: s.h }; })(), borderColor: BLUE, background: `${BLUE}14` }}
        />
      ) : null}
    </div>
  );
}

function SelectionBox({ rect, handles, multiple }: { rect: Rect; handles: Handle[]; multiple: boolean }) {
  const pad = multiple ? 4 : 2;
  const r = { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
  return (
    <>
      <div className="absolute border-[1.5px]" style={{ left: r.x, top: r.y, width: r.w, height: r.h, borderColor: BLUE }} />
      {handles.map((h) => {
        const x = h.includes("w") ? r.x : h.includes("e") ? r.x + r.w : r.x + r.w / 2;
        const y = h.startsWith("n") ? r.y : h.startsWith("s") ? r.y + r.h : r.y + r.h / 2;
        const side = h.length === 1;
        return (
          <div
            key={h}
            data-handle={h}
            className={`pointer-events-auto absolute border-[1.5px] bg-white ${side ? "rounded-full" : "rounded-[2px]"}`}
            style={{ left: x - 5, top: y - 5, width: 10, height: 10, borderColor: BLUE, cursor: CURSORS[h] }}
          />
        );
      })}
    </>
  );
}

function ConnectorHandles({ it, byId, camera }: { it: Item; byId: Map<string, Item>; camera: Camera }) {
  const [a, b] = connectorEnds(it, byId).map((p) => toScreen(p, camera));
  return (
    <>
      {([
        ["from", a],
        ["to", b],
      ] as const).map(([end, p]) => (
        <div
          key={end}
          data-end={end}
          className="pointer-events-auto absolute cursor-move rounded-full border-2 bg-white"
          style={{ left: p.x - 6, top: p.y - 6, width: 12, height: 12, borderColor: BLUE }}
        />
      ))}
    </>
  );
}
