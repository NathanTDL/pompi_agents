import type { Camera, End, Item, Point, Rect } from "./types";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const toWorld = (p: Point, c: Camera): Point => ({ x: (p.x - c.x) / c.z, y: (p.y - c.y) / c.z });
export const toScreen = (p: Point, c: Camera): Point => ({ x: p.x * c.z + c.x, y: p.y * c.z + c.y });

/** The camera zoomed to `z`, keeping the world point under screen point `at` where it is. */
export function zoomAt(c: Camera, z: number, at: Point): Camera {
  const next = clamp(z, MIN_ZOOM, MAX_ZOOM);
  const k = next / c.z;
  return { x: at.x - (at.x - c.x) * k, y: at.y - (at.y - c.y) * k, z: next };
}

/** A camera that fits `r` in a viewport of `vw × vh`, with some room around it. */
export function fitRect(r: Rect, vw: number, vh: number, pad = 80): Camera {
  const z = clamp(Math.min((vw - pad * 2) / Math.max(r.w, 1), (vh - pad * 2) / Math.max(r.h, 1)), MIN_ZOOM, 1.5);
  return { z, x: vw / 2 - (r.x + r.w / 2) * z, y: vh / 2 - (r.y + r.h / 2) * z };
}

export const rectFrom = (a: Point, b: Point): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

export const intersects = (a: Rect, b: Rect) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
export const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The smallest rect around all of `rects`, or null for none. */
export function bounds(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w);
    y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Where a connector end is: on the edge of the item it's stuck to (facing `toward`), else its own point. */
export function endPoint(end: End, toward: Point, items: Map<string, Item>, gap = 6): Point {
  const it = end.id ? items.get(end.id) : undefined;
  if (!it) return { x: end.x, y: end.y };
  const c = center(it);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const hw = it.w / 2 + gap;
  const hh = it.h / 2 + gap;
  if (it.kind === "shape" && it.props.shape === "ellipse") {
    const t = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh));
    return { x: c.x + dx * t, y: c.y + dy * t };
  }
  const t = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Both ends of a connector, each facing the other. */
export function connectorEnds(it: Item, items: Map<string, Item>): [Point, Point] {
  const { from, to } = it.props as { from: End; to: End };
  const aim = (e: End): Point => {
    const target = e.id ? items.get(e.id) : undefined;
    return target ? center(target) : { x: e.x, y: e.y };
  };
  return [endPoint(from, aim(to), items), endPoint(to, aim(from), items)];
}

/** A connector's bounds (for marquee selection and hit tests). */
export function connectorRect(it: Item, items: Map<string, Item>): Rect {
  const [a, b] = connectorEnds(it, items);
  return rectFrom(a, b);
}

/** A connector's SVG path; curved ones bow out to one side. */
export function connectorPath(a: Point, b: Point, curved?: boolean): string {
  if (!curved) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const k = 0.2;
  return `M ${a.x} ${a.y} Q ${mx - dy * k} ${my + dx * k} ${b.x} ${b.y}`;
}

/** The rect an item takes up on the canvas. */
export const itemRect = (it: Item, items: Map<string, Item>): Rect => (it.kind === "connector" ? connectorRect(it, items) : { x: it.x, y: it.y, w: it.w, h: it.h });
