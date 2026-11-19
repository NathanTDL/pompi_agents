"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Point } from "./types";

/** Cursor colours for people (agents get their own later). */
const CURSOR_COLORS = ["#F24822", "#FF8A00", "#14AE5C", "#0D99FF", "#9747FF", "#FF24BD", "#0FA394", "#E0A100"];

export function colorFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(h) % CURSOR_COLORS.length];
}

const SEND_MS = 50;
const HEARTBEAT_MS = 8_000;
const TICK_MS = 10_000;

/** Everyone else on the board with their cursors, and a way to share mine. */
export function usePresence(boardId: Id<"boards">, userId: string | undefined) {
  const [sessionId] = React.useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random())));
  const color = userId ? colorFor(userId) : CURSOR_COLORS[0];

  // Rounded so the query's arguments, and so its cache, only change every TICK_MS.
  const [since, setSince] = React.useState(() => Math.floor(Date.now() / TICK_MS) * TICK_MS);
  React.useEffect(() => {
    const t = window.setInterval(() => setSince(Math.floor(Date.now() / TICK_MS) * TICK_MS), TICK_MS);
    return () => window.clearInterval(t);
  }, []);
  const rows = useQuery(api.presence.list, { boardId, since });
  const others = React.useMemo(() => (rows ?? []).filter((r) => r.sessionId !== sessionId), [rows, sessionId]);

  const update = useMutation(api.presence.update);
  const leave = useMutation(api.presence.leave);
  const state = React.useRef<{ cursor?: Point; selection: string[]; timer?: number; last: number }>({ selection: [], last: 0 });

  const flush = React.useCallback(() => {
    const s = state.current;
    s.timer = undefined;
    s.last = Date.now();
    const cursor = s.cursor ? { x: Math.round(s.cursor.x), y: Math.round(s.cursor.y) } : undefined;
    update({ boardId, sessionId, color, cursor, selection: s.selection }).catch(() => {});
  }, [update, boardId, sessionId, color]);

  const schedule = React.useCallback(() => {
    const s = state.current;
    if (s.timer) return;
    s.timer = window.setTimeout(flush, Math.max(0, SEND_MS - (Date.now() - s.last)));
  }, [flush]);

  const setCursor = React.useCallback(
    (p: Point | undefined) => {
      state.current.cursor = p;
      schedule();
    },
    [schedule],
  );
  const setSelection = React.useCallback(
    (ids: string[]) => {
      state.current.selection = ids;
      schedule();
    },
    [schedule],
  );

  React.useEffect(() => {
    const s = state.current;
    flush();
    const beat = window.setInterval(flush, HEARTBEAT_MS);
    const bye = () => void leave({ boardId, sessionId }).catch(() => {});
    window.addEventListener("pagehide", bye);
    return () => {
      window.clearInterval(beat);
      window.removeEventListener("pagehide", bye);
      if (s.timer) window.clearTimeout(s.timer);
      bye();
    };
  }, [flush, leave, boardId, sessionId]);

  return { others, color, setCursor, setSelection };
}

export type Others = ReturnType<typeof usePresence>["others"];
