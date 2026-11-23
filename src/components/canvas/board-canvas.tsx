"use client";

import * as React from "react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { bounds, clamp, contains, fitRect, intersects, itemRect, rectFrom, toScreen, toWorld, zoomAt } from "@/lib/canvas/geometry";
import { newId, put, type Op } from "@/lib/canvas/ops";
import { STICKY_SIZE, type Camera, type End, type Item, type Kind, type Point, type Rect, type Tool } from "@/lib/canvas/types";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useBoard } from "@/lib/canvas/use-board";
import { usePresence } from "@/lib/canvas/use-presence";
import { AgentsPanel } from "./agents-panel";
import { BoardInfoProvider, type BoardInfo } from "./board-context";
import { CanvasHelp, EmptyHint } from "./canvas-help";
import { ConnectorLayer } from "./connector-layer";
import { ContextBar } from "./context-bar";
import { AgentCursors } from "./agent-cursors";
import { Cursors } from "./cursors";
import { ItemView, markFresh } from "./item-view";
import { SelectionLayer, type Handle } from "./selection-layer";
import { Toolbar, type ToolOptions } from "./toolbar";
import { TopBar } from "./top-bar";
import { useVoice, VoicePill } from "./voice";
import { ZoomControls } from "./zoom-controls";

/** Pixels the pointer moves before a press becomes a drag. */
const DRAG_PX = 3;
const DEFAULT_SIZE: Partial<Record<Kind, { w: number; h: number }>> = {
  shape: { w: 200, h: 200 },
  section: { w: 640, h: 440 },
  stamp: { w: 56, h: 56 },
};
const CLIPBOARD_MARK = "pompi/items";

type Gesture =
  | { type: "pan"; start: Point; cam: Camera }
  | { type: "marquee"; start: Point; base: string[] }
  | {
      type: "move";
      start: Point;
      screen: Point;
      ids: string[];
      before: Map<string, Item>;
      started: boolean;
      duplicate: boolean;
      ops: Op[];
      /** Everything that moves (the dragged items and what's in dragged sections), and its box at the start, for snapping. */
      moving?: Set<string>;
      box?: Rect | null;
    }
  | { type: "resize"; id: string; handle: Handle; start: Point; rect: Rect; before: Map<string, Item>; ops: Op[]; h?: number }
  | { type: "create"; kind: "shape" | "section"; start: Point; id: string; before: Map<string, Item>; ops: Op[] }
  | { type: "connect"; from: End; id: string; existing: boolean; end: "from" | "to"; before: Map<string, Item>; ops: Op[] };

export type Me = { userId: string; name: string; image?: string | null };

export function BoardCanvas({ boardId, me }: { boardId: Id<"boards">; me: Me }) {
  const board = useBoard(boardId);
  const wrote = useMutation(api.brain.wrote);
  const activity = useQuery(api.brain.activity, { boardId });
  const agents = useQuery(api.agents.list, { boardId });
  const computer = useQuery(api.computer.state, { boardId });
  const startComputer = useMutation(api.computer.start);
  const stopComputer = useMutation(api.computer.stop);
  const answerAsk = useMutation(api.brain.answerAsk);
  const info = React.useMemo<BoardInfo>(
    () => ({
      boardId,
      computer,
      agents: agents ?? [],
      startComputer: () => void startComputer({ boardId }).catch((e: unknown) => toast.error(e instanceof ConvexError ? String(e.data) : "Couldn't start the computer")),
      stopComputer: () => void stopComputer({ boardId }).catch((e: unknown) => toast.error(e instanceof ConvexError ? String(e.data) : "Couldn't stop the computer")),
      answerAsk: (itemId, approve) => void answerAsk({ boardId, itemId, approve }).catch((e: unknown) => toast.error(e instanceof ConvexError ? String(e.data) : "Couldn't send your answer")),
    }),
    [boardId, computer, agents, startComputer, stopComputer, answerAsk],
  );
  const { current, commit, preview, live, cancelLive } = board;
  const presence = usePresence(boardId, me.userId);
  const { setSelection } = presence;
  const root = React.useRef<HTMLDivElement>(null);

  const [camera, setCamera] = React.useState<Camera>(() => loadCamera(boardId) ?? { x: 0, y: 0, z: 1 });
  const [tool, setTool] = React.useState<Tool>("select");
  const [options, setOptionsState] = React.useState<ToolOptions>({ stickyColor: "yellow", shape: "rect", stamp: "👍" });
  const [selected, setSelected] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [marquee, setMarquee] = React.useState<Rect | null>(null);
  const [panning, setPanning] = React.useState(false);
  const [spaceHeld, setSpaceHeld] = React.useState(false);
  /** The item being resized: it reports its drawn height meanwhile (text rewraps). */
  const [resizing, setResizing] = React.useState<string | null>(null);
  /** Items are being dragged: the bar over the selection hides meanwhile. */
  const [moving, setMoving] = React.useState(false);
  /** The item under the pointer, outlined as on FigJam. */
  const [hover, setHover] = React.useState<string | null>(null);
  /** Alignment guides while dragging (world units). */
  const [guides, setGuides] = React.useState<Guide[]>([]);
  const [help, setHelp] = React.useState(false);

  const gesture = React.useRef<Gesture | null>(null);
  const editState = React.useRef<{ id: string; before: Map<string, Item>; ops: Op[] } | null>(null);
  const clipboard = React.useRef<Item[]>([]);

  // The latest state, for handlers attached once (keyboard, wheel) or called mid-gesture.
  const s = React.useRef({ camera, tool, options, selected, editing, spaceHeld });
  React.useLayoutEffect(() => {
    s.current = { camera, tool, options, selected, editing, spaceHeld };
  });

  const setOptions = React.useCallback((o: Partial<ToolOptions>) => setOptionsState((prev) => ({ ...prev, ...o })), []);

  /* ---------------- camera ---------------- */

  const viewport = () => root.current?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = viewport();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const worldAt = (e: { clientX: number; clientY: number }) => toWorld(local(e), s.current.camera);

  React.useEffect(() => {
    const t = window.setTimeout(() => saveCamera(boardId, camera), 300);
    return () => window.clearTimeout(t);
  }, [boardId, camera]);

  // First visit: once the items are in, fit them (the canvas fills the window).
  const [fitted, setFitted] = React.useState(() => loadCamera(boardId) !== null);
  if (!fitted && !board.loading) {
    setFitted(true);
    const box = bounds(board.items.map((it) => itemRect(it, board.byId)));
    setCamera(box ? fitRect(box, window.innerWidth, window.innerHeight) : { x: window.innerWidth / 2, y: window.innerHeight / 2, z: 1 });
  }

  // Zoom buttons, shortcuts and fit glide there; scrolling and dragging move at once (and stop a glide).
  const glide = React.useRef(0);
  const animateTo = React.useCallback((target: Camera, ms = 260) => {
    cancelAnimationFrame(glide.current);
    const from = s.current.camera;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setCamera({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e });
      if (k < 1) glide.current = requestAnimationFrame(step);
    };
    glide.current = requestAnimationFrame(step);
  }, []);
  const stopGlide = () => cancelAnimationFrame(glide.current);

  const zoomBy = React.useCallback(
    (factor: number) => {
      const r = viewport();
      const c = s.current.camera;
      animateTo(zoomAt(c, c.z * factor, { x: r.width / 2, y: r.height / 2 }));
    },
    [animateTo],
  );
  const zoomTo = React.useCallback(
    (z: number) => {
      const r = viewport();
      animateTo(zoomAt(s.current.camera, z, { x: r.width / 2, y: r.height / 2 }));
    },
    [animateTo],
  );
  const fitAll = React.useCallback(() => {
    const box = bounds(board.items.map((it) => itemRect(it, board.byId)));
    const r = viewport();
    if (box) animateTo(fitRect(box, r.width, r.height));
  }, [board.items, board.byId, animateTo]);

  // The view follows an agent's work as it lands, like looking over its
  // shoulder: agents put cards down one by one (convex/brain.ts land), and each
  // time the view glides just enough to show the new piece, at a zoom you can
  // read. Too big to show whole, you see its top. Work landing far away on the
  // board leaves your view alone. Replies and cards often draw taller than the
  // size they were placed with, so this waits for them to draw and measures
  // them; and if you're dragging or typing, it waits until you're done.
  const seen = React.useRef<Set<string> | null>(null);
  const showing = React.useRef<{ ids: string[]; timer: number; frame: number }>({ ids: [], timer: 0, frame: 0 });
  const show = React.useCallback(
    function show(tries = 0) {
      const q = showing.current;
      window.clearTimeout(q.timer);
      cancelAnimationFrame(q.frame);
      if (!q.ids.length) return;
      if (gesture.current || s.current.editing) {
        if (tries < 40) q.timer = window.setTimeout(() => show(tries + 1), 500);
        else q.ids = [];
        return;
      }
      // Two frames: the new items are on the page and laid out.
      q.frame = requestAnimationFrame(() => {
        q.frame = requestAnimationFrame(() => {
          const ids = q.ids;
          q.ids = [];
          const work = ids.map((id) => board.byId.get(id)).filter((it): it is Item => !!it);
          if (!work.length) return;
          const rects = work.map((it) => {
            const rect = itemRect(it, board.byId);
            const el = document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(it.id)}"]`);
            return el ? { ...rect, w: Math.max(rect.w, el.offsetWidth), h: Math.max(rect.h, el.offsetHeight) } : rect;
          });
          const all = bounds(rects);
          if (!all) return;
          const r = viewport();
          const c = s.current.camera;
          const view = { x: -c.x / c.z, y: -c.y / c.z, w: r.width / c.z, h: r.height / c.z };
          const mx = Math.max(view.w * 0.75, 900);
          const my = Math.max(view.h * 0.75, 700);
          const near = { x: view.x - mx, y: view.y - my, w: view.w + mx * 2, h: view.h + my * 2 };
          if (!rects.some((rect) => intersects(near, rect))) return;
          const pad = 72;
          // A zoom you can read at: yours, unless you're zoomed far out (or right in).
          const z = Math.min(Math.max(c.z, 0.6), 1.25);
          const roomW = r.width - pad * 2;
          const roomH = r.height - pad * 2;
          const fits = (b: Rect) => b.w * z <= roomW && b.h * z <= roomH;
          // All of it if it fits; else the newest piece; at least its top left.
          const box = fits(all) ? all : rects[rects.length - 1];
          // The view at the new zoom, around the same middle.
          let x = r.width / 2 - ((r.width / 2 - c.x) / c.z) * z;
          let y = r.height / 2 - ((r.height / 2 - c.y) / c.z) * z;
          const left = box.x * z + x;
          const right = Math.min(box.x + box.w, box.x + roomW / z) * z + x;
          const top = box.y * z + y;
          const bottom = Math.min(box.y + box.h, box.y + roomH / z) * z + y;
          x += left < pad ? pad - left : right > r.width - pad ? r.width - pad - right : 0;
          y += top < pad ? pad - top : bottom > r.height - pad ? r.height - pad - bottom : 0;
          if (Math.abs(x - c.x) > 1 || Math.abs(y - c.y) > 1 || Math.abs(z - c.z) > 0.001) animateTo({ x, y, z }, 650);
        });
      });
    },
    [board.byId, animateTo],
  );
  React.useEffect(() => {
    if (board.loading) return;
    if (!seen.current) {
      seen.current = new Set(board.items.map((it) => it.id));
      return;
    }
    const landed = board.items.filter((it) => !seen.current!.has(it.id));
    for (const it of landed) seen.current.add(it.id);
    const work = landed.filter((it) => (it.kind === "reply" || it.kind === "card") && it.props.agentId);
    if (!work.length) return;
    showing.current.ids.push(...work.map((it) => it.id));
    show();
  }, [board.items, board.loading, show]);
  React.useEffect(() => {
    const q = showing.current;
    return () => {
      window.clearTimeout(q.timer);
      cancelAnimationFrame(q.frame);
    };
  }, []);

  /** Glides to someone's cursor (click their avatar to follow them there). */
  const follow = (sessionId: string) => {
    const o = presence.others.find((x) => x.sessionId === sessionId);
    if (!o?.cursor) return;
    const r = viewport();
    const z = Math.max(s.current.camera.z, 0.8);
    animateTo({ z, x: r.width / 2 - o.cursor.x * z, y: r.height / 2 - o.cursor.y * z });
  };

  // Wheel: pinch or Ctrl zooms, anything else pans (as FigJam does on a trackpad).
  React.useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Text being edited and panels over the canvas scroll as themselves.
      if ((e.target as HTMLElement).closest("[data-editing],[data-ui]")) return;
      e.preventDefault();
      cancelAnimationFrame(glide.current);
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-clamp(e.deltaY, -50, 50) * 0.012);
        setCamera((c) => zoomAt(c, c.z * factor, p));
      } else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        setCamera((c) => ({ ...c, x: c.x - dx, y: c.y - dy }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ---------------- making changes ---------------- */

  const topZ = () => {
    let z = 0;
    for (const it of board.current().values()) z = Math.max(z, it.z);
    return z + 1;
  };

  const select = React.useCallback(
    (ids: string[]) => {
      setSelected(ids);
      setSelection(ids);
    },
    [setSelection],
  );

  const beginEdit = React.useCallback(
    (id: string) => {
      editState.current = { id, before: new Map(current()), ops: [] };
      setEditing(id);
    },
    [current],
  );

  /** Adds an item, selects it and (for things with text) starts editing it. */
  const create = (kind: Kind, at: Point, props: Item["props"], opts: { edit?: boolean; size?: { w: number; h: number } } = {}) => {
    const size = opts.size ?? (kind === "sticky" ? { w: STICKY_SIZE, h: STICKY_SIZE } : kind === "text" ? { w: 40, h: 32 } : DEFAULT_SIZE[kind] ?? { w: 200, h: 200 });
    const centered = kind !== "text";
    const item: Item = {
      id: newId(),
      kind,
      x: Math.round(centered ? at.x - size.w / 2 : at.x),
      y: Math.round(centered ? at.y - size.h / 2 : at.y - size.h / 2),
      w: size.w,
      h: size.h,
      z: topZ(),
      props,
    };
    markFresh([item.id]);
    board.commit([put(item)]);
    select([item.id]);
    if (opts.edit) beginEdit(item.id);
    return item;
  };

  const onText = React.useCallback(
    (id: string, text: string, field?: string) => {
      const st = editState.current;
      if (!st || st.id !== id) return;
      const it = current().get(id);
      if (!it) return;
      const key = field ?? (it.kind === "section" ? "title" : it.kind === "card" ? "body" : "text");
      const prev = st.ops[0];
      // Keeps what was typed in the item's other fields (a card's title and body).
      const op: Op = { op: "patch", id, props: { ...(prev?.op === "patch" ? prev.props : {}), [key]: text }, ...(prev?.op === "patch" ? { w: prev.w, h: prev.h } : {}) };
      st.ops = [op];
      preview(st.ops);
      live(st.ops);
    },
    [current, preview, live],
  );

  const onMeasure = React.useCallback(
    (id: string, w: number, h: number) => {
      const it = current().get(id);
      if (!it) return;
      const st = editState.current;
      const fixedW = it.kind === "sticky" || it.kind === "reply" || it.kind === "card" || it.props.fixedWidth;
      const nw = fixedW ? it.w : Math.ceil(w);
      // A sticky is at least square, and grows down as its text does.
      const nh = Math.ceil(it.kind === "sticky" ? Math.max(h, it.w) : h);
      if (st && st.id === id) {
        if (Math.abs(nw - it.w) < 1 && Math.abs(nh - it.h) < 1) return;
        const prev = st.ops[0];
        const op: Op = { op: "patch", id, w: nw, h: nh, ...(prev?.op === "patch" && prev.props ? { props: prev.props } : {}) };
        st.ops = [op];
        preview(st.ops);
        live(st.ops);
        return;
      }
      const g = gesture.current;
      if (g?.type === "resize" && g.id === id) g.h = nh;
    },
    [current, preview, live],
  );

  const endEdit = React.useCallback(() => {
    const st = editState.current;
    editState.current = null;
    setEditing(null);
    if (!st) return;
    cancelLive();
    const it = current().get(st.id);
    // An empty text box is gone once you click away, as on FigJam.
    if (it?.kind === "text" && !String(it.props.text ?? "").trim()) {
      commit([{ op: "delete", id: st.id }], { before: st.before });
      select([]);
      return;
    }
    if (!st.ops.length) return;
    commit(st.ops, { before: st.before });
    // Finished writing a text or sticky: the agents see it, and the right one may answer.
    const said = String(it?.props.text ?? "").trim();
    if ((it?.kind === "text" || it?.kind === "sticky") && said && said !== String(st.before.get(st.id)?.props.text ?? "").trim()) {
      wrote({ boardId, itemId: st.id, text: said }).catch((e: unknown) => toast.error(e instanceof ConvexError ? String(e.data) : "Your agents couldn't see that"));
    }
  }, [current, commit, cancelLive, select, wrote, boardId]);

  /** What someone said (voice.tsx): text where their pointer is, which the right agent picks up. */
  const lastPointer = React.useRef<Point | null>(null);
  const said = (text: string) => {
    const r = viewport();
    const at = lastPointer.current ?? toWorld({ x: r.width / 2, y: r.height / 2 }, s.current.camera);
    // Sized to the words (24px text), as typing it would have made it.
    const w = Math.min(520, Math.max(120, Math.round(text.length * 12.5 + 12)));
    const h = Math.ceil((text.length * 12.5 + 12) / 520) * 32;
    const it = create("text", at, { text, size: "m", fixedWidth: w >= 520 ? true : undefined, voice: true }, { size: { w, h } });
    select([]);
    wrote({ boardId, itemId: it.id, text }).catch((e: unknown) => toast.error(e instanceof ConvexError ? String(e.data) : "Your agents couldn't hear that"));
  };
  const voice = useVoice(boardId, said);
  const voiceRef = React.useRef(voice);
  const mDown = React.useRef(0);
  React.useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  const removeSelected = () => {
    const ids = new Set(s.current.selected);
    if (!ids.size) return;
    const ops: Op[] = [];
    for (const it of board.current().values()) {
      const attached = it.kind === "connector" && (ids.has(it.props.from?.id) || ids.has(it.props.to?.id));
      if (ids.has(it.id) || attached) ops.push({ op: "delete", id: it.id });
    }
    board.commit(ops);
    select([]);
  };

  /**
   * Copies of `source`, moved by `shift`. A copied connector stays joined to an
   * item only if that item was copied too; otherwise that end comes loose.
   */
  const copies = (source: Item[], shift: Point) => {
    const ids = new Map(source.map((it) => [it.id, newId()]));
    let z = topZ();
    return source.map((it): Item => {
      const props = structuredClone(it.props);
      if (it.kind === "connector") {
        for (const key of ["from", "to"] as const) {
          const e = props[key] as End;
          const mapped = e.id ? ids.get(e.id) : undefined;
          props[key] = { ...(mapped ? { id: mapped } : {}), x: e.x + shift.x, y: e.y + shift.y };
        }
      }
      return { id: ids.get(it.id)!, kind: it.kind, x: it.x + shift.x, y: it.y + shift.y, w: it.w, h: it.h, z: z++, props };
    });
  };
  /** Copies that pop in (a paste or Ctrl+D; not an Alt-drag, which is already under the pointer). */
  const popIn = (made: Item[]) => {
    markFresh(made.map((it) => it.id));
    return made;
  };

  const duplicateSelected = () => {
    const src = s.current.selected.map((id) => board.current().get(id)).filter(Boolean) as Item[];
    if (!src.length) return;
    const made = popIn(copies(src, { x: 24, y: 24 }));
    board.commit(made.map(put));
    select(made.map((it) => it.id));
  };

  const setProps = (change: Record<string, unknown>) => {
    const ops: Op[] = s.current.selected.map((id) => ({ op: "patch", id, props: change }));
    board.commit(ops);
  };

  /* ---------------- pointer ---------------- */

  /** The item under a screen point other than connectors (for joining a connector to it). */
  const itemUnder = (e: { clientX: number; clientY: number }, except?: string): Item | undefined => {
    for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
      const id = (el as HTMLElement).closest?.("[data-item-id],[data-section-body]");
      const key = id?.getAttribute("data-item-id") ?? id?.getAttribute("data-section-body");
      const it = key ? board.current().get(key) : undefined;
      if (it && it.kind !== "connector" && it.id !== except) return it;
    }
    return undefined;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-editing]")) return;
    // No focus change from the press: a text box it makes keeps the caret.
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (s.current.editing) endEdit();
    stopGlide();
    root.current?.setPointerCapture(e.pointerId);
    const world = worldAt(e);
    const st = s.current;

    if (e.button === 1 || st.tool === "hand" || st.spaceHeld) {
      gesture.current = { type: "pan", start: local(e), cam: st.camera };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;

    const before = () => new Map(board.current());
    const handle = target.closest("[data-handle]")?.getAttribute("data-handle") as Handle | null;
    const endKey = target.closest("[data-end]")?.getAttribute("data-end") as "from" | "to" | null;
    const hitId = target.closest("[data-item-id]")?.getAttribute("data-item-id") ?? null;

    switch (st.tool) {
      case "sticky":
        create("sticky", world, { text: "", color: st.options.stickyColor, author: me.name }, { edit: true });
        setTool("select");
        return;
      case "text":
        create("text", world, { text: "", size: "m" }, { edit: true });
        setTool("select");
        return;
      case "stamp": {
        const size = DEFAULT_SIZE.stamp!;
        const item: Item = { id: newId(), kind: "stamp", x: world.x - size.w / 2, y: world.y - size.h / 2, ...size, z: topZ(), props: { emoji: st.options.stamp } };
        board.commit([put(item)]);
        return;
      }
      case "shape":
      case "section": {
        const id = newId();
        gesture.current = { type: "create", kind: st.tool, start: world, id, before: before(), ops: [] };
        return;
      }
      case "connector": {
        const on = itemUnder(e);
        const from: End = on ? { id: on.id, x: world.x, y: world.y } : { x: world.x, y: world.y };
        gesture.current = { type: "connect", from, id: newId(), existing: false, end: "to", before: before(), ops: [] };
        return;
      }
    }

    // The select tool.
    if (handle && st.selected.length === 1) {
      const it = board.current().get(st.selected[0]);
      if (it) {
        gesture.current = { type: "resize", id: it.id, handle, start: world, rect: { x: it.x, y: it.y, w: it.w, h: it.h }, before: before(), ops: [] };
        setResizing(it.id);
      }
      return;
    }
    if (endKey && st.selected.length === 1) {
      const it = board.current().get(st.selected[0]);
      if (it?.kind === "connector") {
        const other: End = it.props[endKey === "from" ? "to" : "from"];
        gesture.current = { type: "connect", from: other, id: it.id, existing: true, end: endKey, before: before(), ops: [] };
      }
      return;
    }
    if (hitId) {
      let ids = st.selected;
      if (e.shiftKey) {
        ids = ids.includes(hitId) ? ids.filter((x) => x !== hitId) : [...ids, hitId];
        select(ids);
        if (!ids.includes(hitId)) return;
      } else if (!ids.includes(hitId)) {
        ids = [hitId];
        select(ids);
      }
      gesture.current = { type: "move", start: world, screen: local(e), ids, before: before(), started: false, duplicate: e.altKey, ops: [] };
      return;
    }
    const base = e.shiftKey ? st.selected : [];
    if (!e.shiftKey) select([]);
    gesture.current = { type: "marquee", start: world, base };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const world = worldAt(e);
    lastPointer.current = world;
    presence.setCursor(world);
    const g = gesture.current;
    if (!g) {
      const over = s.current.tool === "select" ? ((e.target as HTMLElement).closest("[data-item-id]")?.getAttribute("data-item-id") ?? null) : null;
      setHover(over);
      return;
    }
    const items = board.current();

    switch (g.type) {
      case "pan": {
        const p = local(e);
        setCamera({ ...g.cam, x: g.cam.x + p.x - g.start.x, y: g.cam.y + p.y - g.start.y });
        return;
      }
      case "marquee": {
        const r = rectFrom(g.start, world);
        setMarquee(r);
        const hit = [...items.values()].filter((it) => {
          const ir = itemRect(it, items);
          return it.kind === "section" ? contains(r, ir) : intersects(r, ir);
        });
        select([...new Set([...g.base, ...hit.map((it) => it.id)])]);
        return;
      }
      case "move": {
        const p = local(e);
        if (!g.started) {
          if (Math.hypot(p.x - g.screen.x, p.y - g.screen.y) < DRAG_PX) return;
          g.started = true;
          setMoving(true);
          setHover(null);
          if (g.duplicate) {
            const made = copies(g.ids.map((id) => g.before.get(id)).filter(Boolean) as Item[], { x: 0, y: 0 });
            g.ids = made.map((it) => it.id);
            for (const it of made) g.before.set(`copy:${it.id}`, it);
            select(g.ids);
          }
          g.moving = movingSet(g);
          const source = (id: string) => g.before.get(`copy:${id}`) ?? g.before.get(id);
          g.box = bounds([...g.moving].map((id) => source(id)).filter((it): it is Item => !!it && it.kind !== "connector"));
        }
        let dx = Math.round(world.x - g.start.x);
        let dy = Math.round(world.y - g.start.y);
        // Line up with what's around, as FigJam does; hold Ctrl to move freely.
        if (g.box && !e.ctrlKey && !e.metaKey) {
          const others = [...g.before.values()].filter((it) => !it.id.startsWith("copy:") && it.kind !== "connector" && !g.moving!.has(it.id));
          const snap = snapping(g.box, dx, dy, others, 6 / s.current.camera.z);
          dx = snap.dx;
          dy = snap.dy;
          setGuides(snap.guides);
        } else setGuides([]);
        g.ops = moveOps(g, dx, dy);
        board.preview(g.ops);
        board.live(g.ops);
        return;
      }
      case "resize": {
        const it = items.get(g.id);
        if (!it) return;
        const r = resized(g.rect, g.handle, world.x - g.start.x, world.y - g.start.y, it.kind === "sticky" || it.kind === "stamp" || it.kind === "screen");
        const op: Op =
          it.kind === "text"
            ? { op: "patch", id: it.id, x: r.x, w: r.w, ...(g.h ? { h: g.h } : {}), props: { fixedWidth: true } }
            : it.kind === "reply" || it.kind === "card"
              ? { op: "patch", id: it.id, x: r.x, w: r.w, ...(g.h ? { h: g.h } : {}) }
              : { op: "patch", id: it.id, ...r };
        g.ops = [op];
        board.preview(g.ops);
        board.live(g.ops);
        return;
      }
      case "create": {
        const r = rectFrom(g.start, world);
        if (r.w * s.current.camera.z < DRAG_PX && r.h * s.current.camera.z < DRAG_PX) return;
        g.ops = [put(newRectItem(g.kind, g.id, r, topZ(), s.current.options))];
        board.preview(g.ops);
        return;
      }
      case "connect": {
        const on = itemUnder(e);
        const to: End = on && on.id !== g.from.id ? { id: on.id, x: world.x, y: world.y } : { x: world.x, y: world.y };
        if (g.existing) {
          const it = g.before.get(g.id);
          if (!it) return;
          g.ops = [{ op: "patch", id: g.id, props: { [g.end]: to } }];
          board.preview(g.ops);
        } else {
          const item: Item = { id: g.id, kind: "connector", x: 0, y: 0, w: 0, h: 0, z: topZ(), props: { from: g.from, to, color: "black", arrowEnd: true } };
          g.ops = [put(item)];
          board.preview(g.ops);
        }
        return;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    root.current?.releasePointerCapture?.(e.pointerId);
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    switch (g.type) {
      case "pan":
        setPanning(false);
        return;
      case "marquee":
        setMarquee(null);
        return;
      case "move":
        if (!g.started) return;
        setMoving(false);
        setGuides([]);
        board.cancelLive();
        board.commit(g.ops, { before: g.before });
        return;
      case "resize":
        setResizing(null);
        board.cancelLive();
        if (g.ops.length) board.commit(g.ops, { before: g.before });
        return;
      case "create": {
        const world = worldAt(e);
        let ops = g.ops;
        if (!ops.length) {
          // A click, not a drag: the default size, centred on the click.
          const size = DEFAULT_SIZE[g.kind]!;
          ops = [put(newRectItem(g.kind, g.id, { x: world.x - size.w / 2, y: world.y - size.h / 2, ...size }, topZ(), s.current.options))];
        }
        board.commit(ops, { before: g.before });
        select([g.id]);
        if (g.kind === "section") beginEdit(g.id);
        setTool("select");
        return;
      }
      case "connect": {
        const op = g.ops[0];
        const tooShort = op?.op === "put" && !op.props.to.id && !op.props.from.id && Math.hypot(op.props.to.x - op.props.from.x, op.props.to.y - op.props.from.y) < 10;
        if (!op || tooShort) {
          board.preview([]);
          return;
        }
        board.commit(g.ops, { before: g.before });
        select([g.id]);
        setTool("select");
        return;
      }
    }
  };

  /** What a drag moves: the dragged items and what's inside dragged sections (a copy of a section doesn't take its contents). */
  function movingSet(g: Extract<Gesture, { type: "move" }>): Set<string> {
    const items = g.before;
    const source = (id: string) => items.get(`copy:${id}`) ?? items.get(id);
    const moving = new Set(g.ids);
    for (const id of g.duplicate ? [] : g.ids) {
      const sec = source(id);
      if (sec?.kind !== "section") continue;
      for (const it of items.values()) {
        if (it.id.startsWith("copy:") || it.kind === "connector" || it.kind === "section" || moving.has(it.id)) continue;
        if (contains(sec, it)) moving.add(it.id);
      }
    }
    return moving;
  }

  /** Moves for a drag: everything moving, and the loose ends of dragged connectors. */
  function moveOps(g: Extract<Gesture, { type: "move" }>, dx: number, dy: number): Op[] {
    const items = g.before;
    const source = (id: string) => items.get(`copy:${id}`) ?? items.get(id);
    const moving = g.moving ?? movingSet(g);
    const ops: Op[] = [];
    for (const id of moving) {
      const it = source(id);
      if (!it) continue;
      if (it.kind === "connector") {
        const shift = (end: End): End => (end.id && moving.has(end.id) ? end : end.id ? end : { x: end.x + dx, y: end.y + dy });
        const moved = { ...it, props: { ...it.props, from: shift(it.props.from), to: shift(it.props.to) } };
        ops.push(g.duplicate ? put(moved) : { op: "patch", id, props: { from: moved.props.from, to: moved.props.to } });
        continue;
      }
      ops.push(g.duplicate ? put({ ...it, x: it.x + dx, y: it.y + dy }) : { op: "patch", id, x: it.x + dx, y: it.y + dy });
    }
    return ops;
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    // The board captures the pointer on press (for drags), so the event's target is often the
    // board itself: what's really under the pointer is what to edit.
    const under = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null) ?? (e.target as HTMLElement);
    if (under.closest("[data-editing]") || (e.target as HTMLElement).closest("[data-editing]") || s.current.tool !== "select") return;
    const p = worldAt(e);
    const items = board.current();
    const hitId =
      under.closest("[data-item-id]")?.getAttribute("data-item-id") ??
      // Under an overlay (the selection outline): the topmost item there.
      [...items.values()]
        .filter((it) => it.kind !== "connector" && it.kind !== "section" && contains(itemRect(it, items), { x: p.x, y: p.y, w: 0, h: 0 }))
        .sort((a, b) => b.z - a.z)[0]?.id;
    const it = hitId ? board.current().get(hitId) : undefined;
    if (it && it.kind !== "connector" && it.kind !== "stamp" && it.kind !== "screen") {
      select([it.id]);
      beginEdit(it.id);
      return;
    }
    // Write anywhere: a double-click on empty canvas starts a text there.
    if (!it) create("text", worldAt(e), { text: "", size: "m" }, { edit: true });
  };

  /* ---------------- keyboard and clipboard ---------------- */

  React.useEffect(() => {
    const typing = (e: Event) => {
      const t = e.target as HTMLElement | null;
      // Typing in a field, driving the board computer, or a dialog is open over the canvas: its shortcuts are off.
      return (!!t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || !!t.closest?.("[data-driving]"))) || !!document.querySelector('[role="dialog"]');
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (e.code === "Space") {
        setSpaceHeld(true);
        e.preventDefault();
        return;
      }
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) board.redo();
        else board.undo();
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        board.redo();
        return;
      }
      if (mod && k === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod && k === "a") {
        e.preventDefault();
        select([...board.current().keys()]);
        return;
      }
      if (mod && (k === "=" || k === "+")) {
        e.preventDefault();
        zoomBy(1.25);
        return;
      }
      if (mod && k === "-") {
        e.preventDefault();
        zoomBy(0.8);
        return;
      }
      if (mod && k === "0") {
        e.preventDefault();
        zoomTo(1);
        return;
      }
      if (e.shiftKey && e.code === "Digit1") {
        fitAll();
        return;
      }
      if (mod) return;
      if (e.key === "?") {
        setHelp(true);
        return;
      }
      if (k === "delete" || k === "backspace") {
        e.preventDefault();
        removeSelected();
        return;
      }
      if (k === "escape" && voiceRef.current.state === "listening") {
        voiceRef.current.cancel();
        return;
      }
      if (k === "m" && !e.repeat) {
        const v = voiceRef.current;
        if (v.state === "listening") v.stop();
        else if (v.state === "idle") {
          mDown.current = Date.now();
          void v.start();
        }
        return;
      }
      if (k === "escape") {
        select([]);
        setTool("select");
        return;
      }
      if (k === "enter" && s.current.selected.length === 1) {
        const it = board.current().get(s.current.selected[0]);
        if (it && it.kind !== "connector" && it.kind !== "stamp") {
          e.preventDefault();
          beginEdit(it.id);
        }
        return;
      }
      if (k.startsWith("arrow") && s.current.selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === "arrowleft" ? -step : k === "arrowright" ? step : 0;
        const dy = k === "arrowup" ? -step : k === "arrowdown" ? step : 0;
        const ops: Op[] = [];
        for (const id of s.current.selected) {
          const it = board.current().get(id);
          if (it && it.kind !== "connector") ops.push({ op: "patch", id, x: it.x + dx, y: it.y + dy });
        }
        board.commit(ops);
        return;
      }
      const tools: Record<string, Tool> = { v: "select", h: "hand", t: "text", r: "shape", x: "connector", e: "stamp" };
      if (k === "s") setTool(e.shiftKey ? "section" : "sticky");
      else if (k === "o") {
        setOptions({ shape: "ellipse" });
        setTool("shape");
      } else if (tools[k]) setTool(tools[k]);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
      // Held M down a while: letting go is done talking. A quick tap keeps listening until M again.
      if (e.key.toLowerCase() === "m" && mDown.current && Date.now() - mDown.current > 400) voiceRef.current.stop();
      if (e.key.toLowerCase() === "m") mDown.current = 0;
    };
    const onCopy = (e: ClipboardEvent) => {
      if (typing(e) || !s.current.selected.length) return;
      const src = s.current.selected.map((id) => board.current().get(id)).filter(Boolean) as Item[];
      clipboard.current = src;
      e.clipboardData?.setData("text/plain", src.map((it) => it.props.text ?? it.props.title ?? "").filter(Boolean).join("\n"));
      e.clipboardData?.setData("application/x-pompi", JSON.stringify({ mark: CLIPBOARD_MARK, items: src }));
      e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => {
      onCopy(e);
      if (!typing(e)) removeSelected();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (typing(e)) return;
      e.preventDefault();
      const r = viewport();
      const mid = toWorld({ x: r.width / 2, y: r.height / 2 }, s.current.camera);
      let src: Item[] = [];
      try {
        const raw = e.clipboardData?.getData("application/x-pompi");
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed?.mark === CLIPBOARD_MARK) src = parsed.items;
      } catch {
        src = [];
      }
      if (!src.length && clipboard.current.length && !e.clipboardData?.getData("text/plain")) src = clipboard.current;
      if (src.length) {
        const box = bounds(src.filter((it) => it.kind !== "connector"));
        const shift = box ? { x: Math.round(mid.x - (box.x + box.w / 2)), y: Math.round(mid.y - (box.y + box.h / 2)) } : { x: 24, y: 24 };
        const made = popIn(copies(src, shift));
        board.commit(made.map(put));
        select(made.map((it) => it.id));
        return;
      }
      // Plain text from elsewhere lands as a sticky in the middle of the view.
      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (text) create("sticky", mid, { text: text.slice(0, 5000), color: s.current.options.stickyColor, author: me.name });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCut);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCut);
      window.removeEventListener("paste", onPaste);
    };
  });

  /* ---------------- drawing ---------------- */

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const selectedItems = selected.map((id) => board.byId.get(id)).filter(Boolean) as Item[];
  const selBox = bounds(selectedItems.map((it) => itemRect(it, board.byId)));
  const barAt = selBox && !moving && !resizing && !marquee ? toScreen({ x: selBox.x + selBox.w / 2, y: selBox.y - (selectedItems.some((it) => it.kind === "section") ? 44 : 0) }, camera) : null;
  const sections = board.items.filter((it) => it.kind === "section");
  const things = board.items.filter((it) => it.kind !== "section" && it.kind !== "connector");
  const remoteCursors = presence.others.filter((o) => o.cursor).map((o) => ({ key: o.sessionId, name: o.name, color: o.color, at: o.cursor! }));

  const cursor = panning ? "grabbing" : tool === "hand" || spaceHeld ? "grab" : tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";
  // The dot grid gets sparser as you zoom out, so it never turns into a grey haze.
  let grid = 24 * camera.z;
  while (grid < 12) grid *= 4;

  return (
    <BoardInfoProvider value={info}>
    <div
      ref={root}
      className="pompi-canvas relative h-full w-full touch-none overflow-clip select-none"
      // The board never scrolls: typing past the edge would otherwise slide everything over.
      onScroll={(e) => {
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
      style={{ cursor, backgroundPosition: `${camera.x}px ${camera.y}px`, backgroundSize: `${grid}px ${grid}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => presence.setCursor(undefined)}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})` }}>
        {[...sections, ...things].map((it) => (
          <ItemView key={it.id} item={it} editing={editing === it.id} measure={editing === it.id || resizing === it.id} onText={onText} onDone={endEdit} onMeasure={onMeasure} />
        ))}
        <ConnectorLayer items={board.items} byId={board.byId} selected={selectedSet} />
        <AgentCursors agents={agents ?? []} states={activity?.states ?? []} going={activity?.going ?? []} byId={board.byId} zoom={camera.z} />
        {guides.length ? (
          <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1}>
            {guides.map((g, i) =>
              g.axis === "x" ? (
                <line key={i} x1={g.at} x2={g.at} y1={g.from} y2={g.to} stroke="#F24822" strokeWidth={1 / camera.z} />
              ) : (
                <line key={i} y1={g.at} y2={g.at} x1={g.from} x2={g.to} stroke="#F24822" strokeWidth={1 / camera.z} />
              ),
            )}
          </svg>
        ) : null}
      </div>

      <SelectionLayer
        camera={camera}
        byId={board.byId}
        selected={selected}
        hover={hover && !selectedSet.has(hover) && !moving && !editing ? hover : null}
        marquee={marquee}
        editing={editing}
        remote={presence.others.map((o) => ({ color: o.color, name: o.name, selection: o.selection }))}
      />

      {!board.loading && board.items.length === 0 && !editing ? <EmptyHint /> : null}

      {barAt && selectedItems.length && !editing ? (
        <ContextBar items={selectedItems} at={barAt} onProps={setProps} onDuplicate={duplicateSelected} onDelete={removeSelected} />
      ) : null}

      <Cursors cursors={remoteCursors} camera={camera} />

      <TopBar boardId={boardId} others={presence.others} me={{ name: me.name, color: presence.color, image: me.image }} onFollow={follow} onHelp={() => setHelp(true)} />
      <CanvasHelp open={help} onClose={() => setHelp(false)} />
      <AgentsPanel boardId={boardId} />
      <Toolbar tool={tool} setTool={setTool} options={options} setOptions={setOptions} voice={voice.state} onVoice={() => (voice.state === "listening" ? voice.stop() : void voice.start())} />
      <VoicePill state={voice.state} level={voice.level} startedAt={voice.startedAt} onStop={voice.stop} onCancel={voice.cancel} />
      <ZoomControls zoom={camera.z} onZoomIn={() => zoomBy(1.25)} onZoomOut={() => zoomBy(0.8)} onReset={() => zoomTo(1)} onFit={fitAll} />

      {board.loading ? (
        <div className="absolute inset-0 grid place-items-center">
          <div className="size-8 animate-spin rounded-full border-[3px] border-black/10 border-t-[#0D99FF]" />
        </div>
      ) : null}
    </div>
    </BoardInfoProvider>
  );
}

type Guide = { axis: "x" | "y"; at: number; from: number; to: number };

/**
 * Snaps a dragged box (`box` moved by dx, dy) to the edges and centres of
 * `others` within `tol` world units, and the guide lines to draw for it.
 */
function snapping(box: Rect, dx: number, dy: number, others: Item[], tol: number): { dx: number; dy: number; guides: Guide[] } {
  const best = { x: { d: tol + 1, shift: 0, at: 0, r: null as Rect | null }, y: { d: tol + 1, shift: 0, at: 0, r: null as Rect | null } };
  const mx = [box.x + dx, box.x + box.w / 2 + dx, box.x + box.w + dx];
  const my = [box.y + dy, box.y + box.h / 2 + dy, box.y + box.h + dy];
  for (const r of others) {
    for (const t of [r.x, r.x + r.w / 2, r.x + r.w])
      for (const m of mx) {
        const d = Math.abs(t - m);
        if (d < best.x.d) best.x = { d, shift: t - m, at: t, r };
      }
    for (const t of [r.y, r.y + r.h / 2, r.y + r.h])
      for (const m of my) {
        const d = Math.abs(t - m);
        if (d < best.y.d) best.y = { d, shift: t - m, at: t, r };
      }
  }
  const sx = best.x.d <= tol ? best.x.shift : 0;
  const sy = best.y.d <= tol ? best.y.shift : 0;
  const moved = { x: box.x + dx + sx, y: box.y + dy + sy, w: box.w, h: box.h };
  const guides: Guide[] = [];
  if (best.x.d <= tol && best.x.r) {
    const r = best.x.r;
    guides.push({ axis: "x", at: best.x.at, from: Math.min(r.y, moved.y) - 16, to: Math.max(r.y + r.h, moved.y + moved.h) + 16 });
  }
  if (best.y.d <= tol && best.y.r) {
    const r = best.y.r;
    guides.push({ axis: "y", at: best.y.at, from: Math.min(r.x, moved.x) - 16, to: Math.max(r.x + r.w, moved.x + moved.w) + 16 });
  }
  return { dx: Math.round(dx + sx), dy: Math.round(dy + sy), guides };
}

/** A new shape or section filling `r` (at least a little bigger than nothing). */
function newRectItem(kind: "shape" | "section", id: string, r: Rect, z: number, options: ToolOptions): Item {
  const w = Math.max(24, Math.round(r.w));
  const h = Math.max(24, Math.round(r.h));
  const props = kind === "shape" ? { shape: options.shape, color: "blue", text: "" } : { title: "Section", color: "gray" };
  return { id, kind, x: Math.round(r.x), y: Math.round(r.y), w, h, z, props };
}

/** `rect` resized by dragging `handle` by (dx, dy); `square` keeps its proportions. */
function resized(rect: Rect, handle: Handle, dx: number, dy: number, square: boolean): Rect {
  const MIN = 24;
  let { x, y, w, h } = rect;
  if (handle.includes("e")) w = rect.w + dx;
  if (handle.includes("w")) {
    w = rect.w - dx;
    x = rect.x + dx;
  }
  if (handle.includes("s")) h = rect.h + dy;
  if (handle.startsWith("n")) {
    h = rect.h - dy;
    y = rect.y + dy;
  }
  if (square) {
    const k = Math.max(w / rect.w, h / rect.h);
    w = rect.w * k;
    h = rect.h * k;
    if (handle.includes("w")) x = rect.x + rect.w - w;
    if (handle.startsWith("n")) y = rect.y + rect.h - h;
  }
  if (w < MIN) {
    if (handle.includes("w")) x -= MIN - w;
    w = MIN;
  }
  if (h < MIN) {
    if (handle.startsWith("n")) y -= MIN - h;
    h = MIN;
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

const cameraKey = (boardId: string) => `pompi:camera:${boardId}`;
function loadCamera(boardId: string): Camera | null {
  if (typeof window === "undefined") return null;
  try {
    const c = JSON.parse(window.localStorage.getItem(cameraKey(boardId)) ?? "null");
    return c && Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z) ? c : null;
  } catch {
    return null;
  }
}
function saveCamera(boardId: string, c: Camera) {
  try {
    window.localStorage.setItem(cameraKey(boardId), JSON.stringify(c));
  } catch {}
}
