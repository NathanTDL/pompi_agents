"use client";

import * as React from "react";
import { Globe, LoaderCircle, MonitorSmartphone, MousePointerClick, Power, SquareTerminal, X } from "lucide-react";
import { toast } from "sonner";
import type { Item } from "@/lib/canvas/types";
import { useBoardInfo } from "./board-context";

/** Matches convex/brain.ts SCREEN_HEADER: the computer's picture starts below it. */
const HEADER = 40;
/** The computer's screen, as convex/orgo.ts makes it. */
const SCREEN = { w: 1280, h: 720 };
/** The server ends each screen stream after 4.5 minutes (src/app/api/screen): a new one opens just before. */
const STREAM_MS = 4.3 * 60_000;

/**
 * The board computer's screen, live on the canvas: everyone watches the agents
 * work on it, and anyone can take control and use it themselves.
 */
export function ScreenItem({ item }: { item: Item }) {
  const { boardId, computer, agents, startComputer } = useBoardInfo();
  const on = computer?.status === "on";
  const user = computer?.busy ? agents.find((a) => a._id === computer.busy!.agentId) : undefined;
  const [driving, setDriving] = React.useState(false);
  const live = useScreenStream(on ? `/api/screen/${boardId}` : null);
  const drivingNow = driving && on && !user;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  // The picture keeps the computer's shape, as big as fits under the header (as convex/brain.ts onFrame places agents' cursors).
  const bodyH = item.h - HEADER;
  const pw = Math.min(item.w, (bodyH * SCREEN.w) / SCREEN.h);
  const ph = (pw * SCREEN.h) / SCREEN.w;
  const open = (app: "browser" | "terminal") =>
    fetch(`/api/screen/${boardId}/input`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "open", app }) })
      .then((r) => (r.ok ? undefined : toast.error(app === "browser" ? "Couldn't open a browser" : "Couldn't open a terminal")))
      .catch(() => toast.error("The computer didn't answer"));

  return (
    <div
      data-item-id={item.id}
      className={`absolute top-0 left-0 overflow-hidden rounded-[14px] bg-[#16151A] transition-shadow ${drivingNow ? "shadow-[0_0_0_3px_#0D99FF,0_24px_50px_-22px_rgba(13,153,255,0.7)]" : "shadow-[0_0_0_1px_rgba(22,21,26,0.12),0_24px_50px_-22px_rgba(22,21,26,0.6)]"}`}
      style={{ transform: `translate(${item.x}px, ${item.y}px)`, width: item.w, height: item.h }}
    >
      <div className="flex items-center gap-2 px-3.5 text-white" style={{ height: HEADER }}>
        <MonitorSmartphone className="size-4 text-white/70" />
        <span className="text-[13px] font-semibold">Board computer</span>
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${on ? "bg-[#14AE5C]/20 text-[#5BE39A]" : computer?.status === "starting" ? "bg-[#FFB020]/20 text-[#FFCF6E]" : "bg-white/10 text-white/60"}`}>
          <span className={`size-1.5 rounded-full ${on ? "bg-[#5BE39A]" : computer?.status === "starting" ? "animate-pulse bg-[#FFCF6E]" : "bg-white/40"}`} />
          {on ? "Live" : computer?.status === "starting" ? "Starting" : computer?.status === "error" ? "Problem" : "Off"}
        </span>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {user ? (
            <span className="flex min-w-0 items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-[11.5px] font-semibold text-white" style={{ background: `${user.color}33` }}>
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]" style={{ background: user.color }}>
                {user.emoji}
              </span>
              <span className="truncate">
                {user.name} · {computer?.busy?.doing}
              </span>
            </span>
          ) : null}
          {drivingNow ? (
            <>
              <span className="hidden truncate text-[11px] text-white/50 sm:inline">Esc gives it back</span>
              {(["browser", "terminal"] as const).map((app) => (
                <button
                  key={app}
                  type="button"
                  title={app === "browser" ? "Open a browser" : "Open a terminal"}
                  onPointerDown={stop}
                  onDoubleClick={stop}
                  onClick={() => open(app)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
                >
                  {app === "browser" ? <Globe className="size-3.5" /> : <SquareTerminal className="size-3.5" />}
                </button>
              ))}
            </>
          ) : null}
          {on && !user ? (
            <button
              type="button"
              onPointerDown={stop}
              onDoubleClick={stop}
              onClick={() => setDriving((d) => !d)}
              className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${drivingNow ? "bg-[#0D99FF] text-white hover:bg-[#0A8AE8]" : "bg-white/10 text-white hover:bg-white/20"}`}
            >
              {drivingNow ? <X className="size-3.5" /> : <MousePointerClick className="size-3.5" />}
              {drivingNow ? "Done" : "Take control"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative flex items-center justify-center bg-black" style={{ height: bodyH }}>
        {on ? (
          <div className="relative" style={{ width: pw, height: ph }}>
            {live.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={live.src} alt="The board computer's screen" onLoad={live.onLoad} onError={live.onError} className="pointer-events-none size-full select-none" draggable={false} />
            ) : null}
            {!live.ready ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                <LoaderCircle className="size-7 animate-spin text-white/70" />
                <p className="text-[14px] font-semibold">Connecting…</p>
              </div>
            ) : null}
            {drivingNow && live.ready ? <Driver boardId={boardId} onRelease={() => setDriving(false)} /> : null}
          </div>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 bg-[radial-gradient(60%_60%_at_50%_40%,#2A2440,#121117)] text-center text-white">
            {computer?.status === "starting" || computer?.status === "stopping" ? (
              <>
                <LoaderCircle className="size-7 animate-spin text-white/70" />
                <p className="text-[14px] font-semibold">{computer?.status === "stopping" ? "Stopping the computer…" : "Starting the computer…"}</p>
                {computer?.status === "starting" ? <p className="text-[12px] text-white/50">This takes about a minute the first time.</p> : null}
              </>
            ) : computer?.configured === false ? (
              <p className="max-w-[300px] text-[13px] text-white/70">This deployment has no Orgo key, so the board can&apos;t have a computer yet.</p>
            ) : (
              <>
                <p className="text-[15px] font-semibold">The computer is off</p>
                <p className="max-w-[320px] text-[12.5px] text-white/55">{computer?.status === "error" ? computer.error : "It starts by itself when an agent needs it, or start it to use it yourself. You only pay while it's on."}</p>
                <button type="button" onPointerDown={stop} onClick={startComputer} className="mt-1 flex h-9 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-[#16151A] hover:bg-white/90">
                  <Power className="size-4" /> Start computer
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** X11 key names for the keys a browser reports by name. */
const KEY_NAMES: Record<string, string> = {
  Enter: "Return", Backspace: "BackSpace", Tab: "Tab", Delete: "Delete", Home: "Home", End: "End", PageUp: "Page_Up", PageDown: "Page_Down", Insert: "Insert",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", " ": "space",
};

/**
 * A see-through layer over the live screen while someone drives the computer:
 * it turns their mouse and keys into input for it. Escape gives the board back.
 */
function Driver({ boardId, onRelease }: { boardId: string; onRelease: () => void }) {
  const layer = React.useRef<HTMLDivElement>(null);
  const press = React.useRef<{ x: number; y: number; sx: number; sy: number; button: number } | null>(null);
  const lastClick = React.useRef<{ at: number; x: number; y: number; timer?: number } | null>(null);
  const typed = React.useRef<{ text: string; timer?: number }>({ text: "" });
  const queue = React.useRef(Promise.resolve());
  const warned = React.useRef(0);
  // Where you just clicked, shown at once: the picture of the result takes a moment to come back.
  const [taps, setTaps] = React.useState<{ id: number; x: number; y: number }[]>([]);
  const tap = (p: { x: number; y: number }) => {
    const id = Date.now() + Math.random();
    setTaps((ts) => [...ts, { id, x: (p.x / SCREEN.w) * 100, y: (p.y / SCREEN.h) * 100 }]);
    window.setTimeout(() => setTaps((ts) => ts.filter((t) => t.id !== id)), 650);
  };

  const send = React.useCallback(
    (input: Record<string, unknown>) => {
      // In order, one after another, as the person did them.
      queue.current = queue.current.then(async () => {
        const res = await fetch(`/api/screen/${boardId}/input`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }).catch(() => null);
        if (res && !res.ok && Date.now() - warned.current > 4000) {
          warned.current = Date.now();
          const said = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(said?.error ?? "The computer didn't take that");
        }
      });
    },
    [boardId],
  );

  /** Where on the computer's screen a pointer is. */
  const at = (e: { clientX: number; clientY: number }) => {
    const r = layer.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SCREEN.w, y: ((e.clientY - r.top) / r.height) * SCREEN.h };
  };

  const flushTyping = React.useCallback(() => {
    const t = typed.current;
    if (t.timer) window.clearTimeout(t.timer);
    t.timer = undefined;
    if (t.text) send({ type: "type", text: t.text });
    t.text = "";
  }, [send]);

  React.useEffect(() => {
    layer.current?.focus();
    const t = typed.current;
    return () => {
      if (t.timer) window.clearTimeout(t.timer);
    };
  }, []);

  // Scroll on the screen scrolls the computer, not the board (a native listener, so it can stop the page scrolling).
  React.useEffect(() => {
    const el = layer.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      acc += e.deltaY;
      if (Math.abs(acc) < 60) return;
      const p = at(e);
      send({ type: "scroll", ...p, direction: acc < 0 ? "up" : "down", amount: Math.min(10, Math.round(Math.abs(acc) / 100) || 1) });
      acc = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [send]);

  return (
    <div
      ref={layer}
      tabIndex={0}
      data-ui
      data-driving
      className="absolute inset-0 cursor-default outline-none"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        layer.current?.focus();
        layer.current?.setPointerCapture(e.pointerId);
        const p = at(e);
        press.current = { ...p, sx: e.clientX, sy: e.clientY, button: e.button };
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        const p0 = press.current;
        press.current = null;
        if (!p0) return;
        flushTyping();
        const p = at(e);
        tap(p);
        if (Math.hypot(e.clientX - p0.sx, e.clientY - p0.sy) > 6 && p0.button === 0) {
          send({ type: "drag", x: p0.x, y: p0.y, toX: p.x, toY: p.y });
          return;
        }
        if (p0.button === 2) {
          send({ type: "click", ...p0, button: "right" });
          return;
        }
        // Two clicks in quick succession on the same spot are one double click.
        const last = lastClick.current;
        if (last && Date.now() - last.at < 320 && Math.hypot(last.x - p0.x, last.y - p0.y) < 12) {
          window.clearTimeout(last.timer);
          lastClick.current = null;
          send({ type: "click", x: p0.x, y: p0.y, double: true });
          return;
        }
        const timer = window.setTimeout(() => {
          lastClick.current = null;
          send({ type: "click", x: p0.x, y: p0.y });
        }, 230);
        lastClick.current = { at: Date.now(), x: p0.x, y: p0.y, timer };
      }}
      onPointerMove={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (e.key === "Escape") {
          flushTyping();
          onRelease();
          return;
        }
        const mods = [e.ctrlKey && "ctrl", e.altKey && "alt", e.metaKey && "super"].filter(Boolean) as string[];
        // Plain characters are gathered into one bit of typing; anything else is a key press.
        if (e.key.length === 1 && !mods.length) {
          const t = typed.current;
          t.text += e.key;
          if (t.timer) window.clearTimeout(t.timer);
          t.timer = window.setTimeout(flushTyping, 140);
          return;
        }
        const name = KEY_NAMES[e.key] ?? (/^F\d{1,2}$/.test(e.key) ? e.key : e.key.length === 1 ? e.key.toLowerCase() : null);
        if (!name) return;
        flushTyping();
        send({ type: "key", key: [...mods, ...(e.shiftKey && e.key.length !== 1 ? ["shift"] : []), name].join("+") });
      }}
      onPaste={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        if (text) {
          flushTyping();
          send({ type: "type", text: text.slice(0, 4000) });
        }
      }}
    >
      {taps.map((t) => (
        <span key={t.id} className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 animate-[pompi-tap_600ms_ease-out_forwards] rounded-full border-2 border-[#0D99FF] bg-[#0D99FF]/20" style={{ left: `${t.x}%`, top: `${t.y}%` }} />
      ))}
    </div>
  );
}

/**
 * The live screen at `url` (a stream of pictures the <img> plays), paused while
 * the tab is hidden, reopened when it fails or before the server ends it.
 */
function useScreenStream(url: string | null) {
  const [hidden, setHidden] = React.useState(false);
  const [n, setN] = React.useState(0);
  const [loaded, setLoaded] = React.useState<string | null>(null);
  React.useEffect(() => {
    const seen = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, []);
  const src = url && !hidden ? `${url}?s=${n}` : null;
  React.useEffect(() => {
    if (!src) return;
    const t = window.setTimeout(() => setN((k) => k + 1), STREAM_MS);
    return () => window.clearTimeout(t);
  }, [src]);
  return {
    src,
    // Once it has shown a picture, a reopened stream keeps the last one up meanwhile.
    ready: !!src && loaded === url,
    onLoad: () => setLoaded(url),
    onError: () => window.setTimeout(() => setN((k) => k + 1), 2000),
  };
}
