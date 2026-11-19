import type { Item } from "./types";

/** A change to the canvas, as convex/items.ts `apply` takes it. */
export type Op =
  | ({ op: "put" } & Omit<Item, "updatedBy" | "updatedAt">)
  | { op: "patch"; id: string; x?: number; y?: number; w?: number; h?: number; z?: number; props?: Item["props"] }
  | { op: "delete"; id: string };

/** `items` with `ops` applied, back to front. Untouched items keep their identity, so their views don't redraw. */
export function applyOps(items: Item[], ops: Op[]): Item[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  let reorder = false;
  for (const o of ops) {
    const prev = byId.get(o.id);
    if (o.op === "delete") {
      byId.delete(o.id);
    } else if (o.op === "put") {
      const { op: _op, ...item } = o;
      byId.set(o.id, { ...item, updatedBy: prev?.updatedBy, updatedAt: prev?.updatedAt });
      reorder = true;
    } else if (prev) {
      const { op: _op, id: _id, props, ...geometry } = o;
      const defined = Object.fromEntries(Object.entries(geometry).filter(([, v]) => v !== undefined));
      byId.set(o.id, { ...prev, ...defined, ...(props ? { props: { ...prev.props, ...props } } : {}) });
      if (o.z !== undefined) reorder = true;
    }
  }
  const out = [...byId.values()];
  return reorder ? out.sort((a, b) => a.z - b.z) : out;
}

/** What puts things back as they were before `ops`: undo. */
export function invert(ops: Op[], before: Map<string, Item>): Op[] {
  const seen = new Set<string>();
  const back: Op[] = [];
  for (const o of ops) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    const prev = before.get(o.id);
    back.push(prev ? put(prev) : { op: "delete", id: o.id });
  }
  return back.reverse();
}

export const put = ({ updatedBy: _by, updatedAt: _at, ...it }: Item): Op => ({ op: "put", ...it });

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
