"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { applyOps, invert, type Op } from "./ops";
import type { Item } from "./types";

type Entry = { undo: Op[]; redo: Op[] };
/** How often a drag or a burst of typing reaches everyone else. */
const LIVE_MS = 80;
const MAX_HISTORY = 200;

/**
 * A board's items, live from Convex, with my own changes drawn at once (an
 * optimistic update) and an undo history of my changes.
 *
 * A drag or an edit in progress is a `preview`: drawn here at once, sent to
 * everyone else a few times a second (`live`), and kept out of the history
 * until it ends in one `commit`, with the items as they were before it began.
 */
export function useBoard(boardId: Id<"boards">) {
  const server = useQuery(api.items.list, { boardId }) as Item[] | undefined;
  const apply = useMutation(api.items.apply).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.items.list, { boardId: args.boardId });
    if (current) store.setQuery(api.items.list, { boardId: args.boardId }, applyOps(current as Item[], args.ops as Op[]) as typeof current);
  });

  const [overrides, setOverrides] = React.useState<Op[]>([]);
  const items = React.useMemo(() => (server ? (overrides.length ? applyOps(server, overrides) : server) : []), [server, overrides]);
  const byId = React.useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const serverById = React.useMemo(() => new Map((server ?? []).map((it) => [it.id, it])), [server]);

  const latest = React.useRef({ byId, serverById });
  React.useEffect(() => {
    latest.current = { byId, serverById };
  }, [byId, serverById]);

  const history = React.useRef<{ undo: Entry[]; redo: Entry[] }>({ undo: [], redo: [] });

  const send = React.useCallback(
    (ops: Op[]) => {
      if (!ops.length) return;
      // Through JSON: fields left undefined are dropped, as Convex wants.
      apply({ boardId, ops: JSON.parse(JSON.stringify(ops)) }).catch((e: unknown) => {
        toast.error("Couldn't save that change", { description: e instanceof Error ? e.message : undefined });
      });
    },
    [apply, boardId],
  );

  /** Makes a change for good: saved, and one step of undo. `before`: the items as they were, when a preview already moved them. */
  const commit = React.useCallback(
    (ops: Op[], opts: { before?: Map<string, Item>; record?: boolean } = {}) => {
      if (!ops.length) return;
      if (opts.record !== false) {
        const h = history.current;
        h.undo.push({ undo: invert(ops, opts.before ?? latest.current.serverById), redo: ops });
        if (h.undo.length > MAX_HISTORY) h.undo.shift();
        h.redo = [];
      }
      send(ops);
      setOverrides([]);
    },
    [send],
  );

  /** Draws a change in progress here only. An empty list ends the preview. */
  const preview = React.useCallback((ops: Op[]) => setOverrides(ops), []);

  const lastLive = React.useRef(0);
  const pendingLive = React.useRef<{ ops: Op[]; timer?: number }>({ ops: [] });
  /** Sends a change in progress to everyone else, at most every LIVE_MS; the latest one always goes. */
  const live = React.useCallback(
    (ops: Op[]) => {
      const p = pendingLive.current;
      p.ops = ops;
      if (p.timer) return;
      const wait = Math.max(0, LIVE_MS - (Date.now() - lastLive.current));
      p.timer = window.setTimeout(() => {
        p.timer = undefined;
        lastLive.current = Date.now();
        const toSend = p.ops;
        p.ops = [];
        send(toSend);
      }, wait);
    },
    [send],
  );
  /** Drops a change in progress that hasn't been sent yet (the commit carries the final state). */
  const cancelLive = React.useCallback(() => {
    const p = pendingLive.current;
    if (p.timer) window.clearTimeout(p.timer);
    p.timer = undefined;
    p.ops = [];
  }, []);

  const undo = React.useCallback(() => {
    const h = history.current;
    const entry = h.undo.pop();
    if (!entry) return false;
    h.redo.push(entry);
    send(entry.undo);
    return true;
  }, [send]);

  const redo = React.useCallback(() => {
    const h = history.current;
    const entry = h.redo.pop();
    if (!entry) return false;
    h.undo.push(entry);
    send(entry.redo);
    return true;
  }, [send]);

  /** The items now, for event handlers that mustn't wait on a render. */
  const current = React.useCallback(() => latest.current.byId, []);

  return { loading: server === undefined, items, byId, current, commit, preview, live, cancelLive, undo, redo };
}

export type Board = ReturnType<typeof useBoard>;
