"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useAction } from "convex/react";
import type RFB from "@novnc/novnc";
import { ChevronDown, Globe, Keyboard, LoaderCircle, Maximize, Maximize2, MonitorSmartphone, MousePointerClick, Power, SquareTerminal, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Item } from "@/lib/canvas/types";
import { useBoardInfo, type AgentLite, type ComputerStep } from "./board-context";

/** Matches convex/brain.ts SCREEN_HEADER: the computer's picture starts below it. */
const HEADER = 40;
/** The computer's screen, as convex/orgo.ts makes it. */
const SCREEN = { w: 1280, h: 720 };
/** The server ends each picture stream (the fallback) after 4.5 minutes (src/app/api/screen): a new one opens just before. */
const STREAM_MS = 4.3 * 60_000;

/**
 * The board computer's screen, live on the canvas: everyone watches the agents
 * work on it (each click, scroll and keystroke shows), and anyone can open it
 * in a window and use it like their own computer.
 *
 * The screen is the computer's real desktop (VNC, straight from the browser to
 * Orgo): real time and sharp. One connection, moved between the board and the
 * window. If it can't connect, a stream of pictures through the server stands in.
 */
export function ScreenItem({ item }: { item: Item }) {
  const { boardId, computer, agents, startComputer } = useBoardInfo();
  const on = computer?.status === "on";
  const user = computer?.busy ? agents.find((a) => a._id === computer.busy!.agentId) : undefined;
  /** The computer's window: open to watch, or to use it. */
  const [open, setOpen] = React.useState<null | "watch" | "drive">(null);
  // While an agent works on it, you watch (it gets the computer back after).
  const driving = open === "drive" && on && !user;
  // Where the live screen goes: the window while it's open, else the board.
  const [boardSlot, setBoardSlot] = React.useState<HTMLDivElement | null>(null);
  const [windowSlot, setWindowSlot] = React.useState<HTMLDivElement | null>(null);
  const desk = useDesktop(boardId, on, driving, open && on ? windowSlot : boardSlot);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  // The picture keeps the computer's shape, as big as fits under the header (as convex/brain.ts onFrame places agents' cursors).
  const bodyH = item.h - HEADER;
  const pw = Math.min(item.w, (bodyH * SCREEN.w) / SCREEN.h);
  const ph = (pw * SCREEN.h) / SCREEN.w;
  const fallback = useScreenStream(on && desk.status === "fallback" && !open ? `/api/screen/${boardId}` : null);

  return (
    <div
      data-item-id={item.id}
      className="absolute top-0 left-0 overflow-hidden rounded-[14px] bg-[#16151A] shadow-[0_0_0_1px_rgba(22,21,26,0.12),0_24px_50px_-22px_rgba(22,21,26,0.6)]"
      style={{ transform: `translate(${item.x}px, ${item.y}px)`, width: item.w, height: item.h }}
    >
      <div className="flex items-center gap-2 px-3.5 text-white" style={{ height: HEADER }}>
        <MonitorSmartphone className="size-4 text-white/70" />
        <span className="text-[13px] font-semibold">Board computer</span>
        <Status computer={computer} />
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {user ? <AgentChip agent={user} doing={computer?.busy?.doing} /> : null}
          {on ? (
            <>
              <button
                type="button"
                title="Watch in a big window"
                onPointerDown={stop}
                onDoubleClick={stop}
                onClick={() => setOpen("watch")}
                className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
              >
                <Maximize2 className="size-3.5" />
              </button>
              {!user ? (
                <button
                  type="button"
                  onPointerDown={stop}
                  onDoubleClick={stop}
                  onClick={() => setOpen("drive")}
                  className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/20"
                >
                  <MousePointerClick className="size-3.5" />
                  Take control
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="relative flex items-center justify-center bg-black" style={{ height: bodyH }}>
        {on ? (
          <div className="relative" style={{ width: pw, height: ph }}>
            {desk.status === "fallback" && !open ? (
              fallback.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fallback.src} alt="The board computer's screen" onLoad={fallback.onLoad} onError={fallback.onError} className="pointer-events-none size-full select-none" draggable={false} />
              ) : null
            ) : (
              <div ref={setBoardSlot} className="pointer-events-none absolute inset-0" />
            )}
            {open ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#121117] text-white">
                <p className="text-[14px] font-semibold">{driving ? "You're using the computer" : "Open in a window"}</p>
                <button type="button" onPointerDown={stop} onClick={() => setOpen(null)} className="rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-semibold hover:bg-white/20">
                  Bring it back here
                </button>
              </div>
            ) : (desk.status === "fallback" ? !fallback.ready : desk.status !== "live") ? (
              <Connecting />
            ) : (
              <Marks step={computer?.busy?.step} agent={user} doing={computer?.busy?.doing} />
            )}
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

      {open && on ? (
        <ComputerWindow
          boardId={boardId}
          desk={desk}
          slot={setWindowSlot}
          mode={open}
          driving={driving}
          user={user}
          computer={computer}
          onMode={setOpen}
        />
      ) : null}
    </div>
  );
}

function Status({ computer }: { computer: ReturnType<typeof useBoardInfo>["computer"] }) {
  const on = computer?.status === "on";
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${on ? "bg-[#14AE5C]/20 text-[#5BE39A]" : computer?.status === "starting" ? "bg-[#FFB020]/20 text-[#FFCF6E]" : "bg-white/10 text-white/60"}`}>
      <span className={`size-1.5 rounded-full ${on ? "bg-[#5BE39A]" : computer?.status === "starting" ? "animate-pulse bg-[#FFCF6E]" : "bg-white/40"}`} />
      {on ? "Live" : computer?.status === "starting" ? "Starting" : computer?.status === "error" ? "Problem" : "Off"}
    </span>
  );
}

function AgentChip({ agent, doing }: { agent: AgentLite; doing?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-[11.5px] font-semibold text-white" style={{ background: `${agent.color}33` }}>
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]" style={{ background: agent.color }}>
        {agent.emoji}
      </span>
      <span className="truncate">
        {agent.name}
        {doing ? ` · ${doing}` : ""}
      </span>
    </span>
  );
}

function Connecting() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
      <LoaderCircle className="size-7 animate-spin text-white/70" />
      <p className="text-[14px] font-semibold">Connecting…</p>
    </div>
  );
}

/* ---------------- the window ---------------- */

/**
 * The computer, big, over the board: to use it like your own (mouse, keys,
 * scrolling, copy and paste go straight to it) or to watch an agent closely.
 */
function ComputerWindow({
  boardId,
  desk,
  slot,
  mode,
  driving,
  user,
  computer,
  onMode,
}: {
  boardId: Id<"boards">;
  desk: Desktop;
  slot: (el: HTMLDivElement | null) => void;
  mode: "watch" | "drive";
  driving: boolean;
  user?: AgentLite;
  computer: ReturnType<typeof useBoardInfo>["computer"];
  onMode: (m: null | "watch" | "drive") => void;
}) {
  const stage = React.useRef<HTMLDivElement>(null);
  const root = React.useRef<HTMLDivElement>(null);
  const box = useFit(stage);
  const fallback = useScreenStream(desk.status === "fallback" ? `/api/screen/${boardId}` : null);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  // Watching: Escape closes. Using it: Escape is the computer's (the Done button closes).
  React.useEffect(() => {
    if (driving) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onMode(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [driving, onMode]);

  // Pasting: what's on your clipboard goes to the computer's first, so Ctrl+V pastes it there.
  React.useEffect(() => {
    const el = root.current;
    if (!el || !driving || desk.status !== "live") return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "v" || e.altKey) return;
      const rfb = desk.rfb.current;
      if (!rfb || !navigator.clipboard?.readText) return;
      e.preventDefault();
      e.stopPropagation();
      const press = () => {
        rfb.sendKey(XK_v, "KeyV", true);
        rfb.sendKey(XK_v, "KeyV", false);
      };
      navigator.clipboard.readText().then(
        (text) => {
          if (text) rfb.clipboardPasteFrom(text);
          window.setTimeout(press, 60);
        },
        press,
      );
    };
    el.addEventListener("keydown", onKey, true);
    return () => el.removeEventListener("keydown", onKey, true);
  }, [driving, desk.status, desk.rfb]);

  const launch = (app: "browser" | "terminal") =>
    fetch(`/api/screen/${boardId}/input`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "open", app }) })
      .then((r) => (r.ok ? undefined : toast.error(app === "browser" ? "Couldn't open a browser" : "Couldn't open a terminal")))
      .catch(() => toast.error("The computer didn't answer"));

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-label="Board computer"
      data-ui
      data-driving
      className="fixed inset-0 z-[60] flex bg-[#0B0A10]/75 p-3 backdrop-blur-sm sm:p-5"
      // The board underneath doesn't see any of this (the window is part of an item on it).
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerMove={stop}
      onClick={stop}
      onDoubleClick={stop}
      onKeyDown={stop}
      onKeyUp={stop}
      onWheel={stop}
      onContextMenu={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <div className="mx-auto flex size-full max-w-[1700px] flex-col overflow-hidden rounded-2xl bg-[#16151A] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
        <div className="flex h-12 shrink-0 items-center gap-2.5 px-4 text-white">
          <MonitorSmartphone className="size-4 text-white/70" />
          <span className="text-[14px] font-semibold">Board computer</span>
          <Status computer={computer} />
          {driving ? (
            <span className="rounded-full bg-[#0D99FF]/20 px-2.5 py-0.5 text-[11.5px] font-semibold text-[#6CC4FF]">You&apos;re in control</span>
          ) : user ? (
            <AgentChip agent={user} doing={computer?.busy?.doing} />
          ) : (
            <span className="text-[12px] text-white/50">Watching</span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {driving ? (
              <>
                {(["browser", "terminal"] as const).map((app) => (
                  <button key={app} type="button" onClick={() => launch(app)} className="flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-[12.5px] font-semibold hover:bg-white/20">
                    {app === "browser" ? <Globe className="size-3.5" /> : <SquareTerminal className="size-3.5" />}
                    {app === "browser" ? "Browser" : "Terminal"}
                  </button>
                ))}
                <span className="mx-1 h-5 w-px bg-white/10" />
              </>
            ) : null}
            {mode === "watch" && !user ? (
              <button type="button" onClick={() => onMode("drive")} className="flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-[12.5px] font-semibold hover:bg-white/20">
                <MousePointerClick className="size-3.5" /> Take control
              </button>
            ) : null}
            <button type="button" title="Full screen" onClick={() => void root.current?.requestFullscreen?.().catch(() => undefined)} className="flex size-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20">
              <Maximize className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
                onMode(null);
              }}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold ${driving ? "bg-[#0D99FF] hover:bg-[#0A8AE8]" : "bg-white/10 hover:bg-white/20"}`}
            >
              <X className="size-3.5" /> {driving ? "Done" : "Close"}
            </button>
          </div>
        </div>
        <div ref={stage} className="relative min-h-0 flex-1 bg-black">
          {box ? (
            <div className="absolute" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
              {desk.status === "fallback" ? (
                <>
                  {fallback.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fallback.src} alt="The board computer's screen" onLoad={fallback.onLoad} onError={fallback.onError} className="pointer-events-none size-full select-none" draggable={false} />
                  ) : null}
                  {driving && fallback.ready ? <Driver boardId={boardId} /> : null}
                </>
              ) : (
                <div ref={slot} className={`absolute inset-0 ${driving ? "" : "pointer-events-none"}`} />
              )}
              {(desk.status === "fallback" ? !fallback.ready : desk.status !== "live") ? <Connecting /> : <Marks step={computer?.busy?.step} agent={user} doing={computer?.busy?.doing} pointer />}
            </div>
          ) : null}
        </div>
        {driving ? (
          <p className="shrink-0 px-4 py-2 text-[11.5px] text-white/45">Your mouse, keyboard, scrolling and Ctrl+V go straight to the computer. Press Done to give the board back.</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** The biggest 16:9 box that fits in `ref`, centred. */
function useFit(ref: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      const w = Math.min(W, (H * SCREEN.w) / SCREEN.h);
      const h = (w * SCREEN.h) / SCREEN.w;
      setBox({ x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w: Math.round(w), h: Math.round(h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/* ---------------- what an agent does, shown ---------------- */

/**
 * An agent's latest action, drawn over the screen: a ripple where it clicks,
 * arrows where it scrolls, what it types. With `pointer`, its own pointer too
 * (on the board, its cursor is already there).
 */
function Marks({ step, agent, doing, pointer }: { step?: ComputerStep; agent?: AgentLite; doing?: string; pointer?: boolean }) {
  if (!step || !agent) return null;
  const at = step.x !== undefined && step.y !== undefined ? { left: `${(step.x / SCREEN.w) * 100}%`, top: `${(step.y / SCREEN.h) * 100}%` } : null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <Effect key={step.at} step={step} at={at} color={agent.color} doing={doing} />
      {pointer && at ? (
        <div className="absolute transition-[left,top] duration-500 ease-out" style={at}>
          <svg width="22" height="22" viewBox="0 0 24 24" className="-translate-x-[3px] -translate-y-[2px] drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]">
            <path d="M4 2.5 20 11l-7.2 1.9L9.6 20z" fill={agent.color} stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <span className="absolute top-5 left-4 flex items-center gap-1 rounded-full py-0.5 pr-2 pl-0.5 text-[11.5px] font-semibold whitespace-nowrap text-white shadow-md" style={{ background: agent.color }}>
            <span className="flex size-[18px] items-center justify-center rounded-full bg-white/25 text-[10px]">{agent.emoji}</span>
            {doing ?? agent.name}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Effect({ step, at, color, doing }: { step: ComputerStep; at: { left: string; top: string } | null; color: string; doing?: string }) {
  // Only when it just happened (not an old action, replayed when the screen opens).
  const [fresh] = React.useState(() => Date.now() - step.at < 4000);
  if (!fresh) return null;
  const where = at ?? { left: "50%", top: "50%" };
  switch (step.kind) {
    case "click":
    case "double_click":
    case "drag":
      return (
        <>
          {(step.kind === "double_click" ? [0, 160] : [0]).map((delay) => (
            <span
              key={delay}
              className="absolute size-12 -translate-x-1/2 -translate-y-1/2 animate-[pompi-tap_700ms_ease-out_forwards] rounded-full border-[3px] opacity-0"
              style={{ ...where, borderColor: color, background: `${color}30`, animationDelay: `${delay}ms` }}
            />
          ))}
        </>
      );
    case "scroll":
      return (
        <span className="absolute -translate-x-1/2 -translate-y-1/2" style={where}>
          <span className={`flex flex-col items-center ${step.dir === "up" ? "rotate-180" : ""}`}>
            {[0, 1, 2].map((i) => (
              <ChevronDown key={i} className="-my-2 size-9 animate-[pompi-scroll_900ms_ease-out_forwards] opacity-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" style={{ color, animationDelay: `${i * 90}ms` }} strokeWidth={3} />
            ))}
          </span>
        </span>
      );
    case "type":
    case "keypress":
    case "shell":
      return (
        <span className="absolute bottom-[6%] left-1/2 flex max-w-[80%] -translate-x-1/2 animate-[pompi-fade_2200ms_ease-out_forwards] items-center gap-2 rounded-xl px-3.5 py-2 text-[15px] font-semibold text-white shadow-lg" style={{ background: color }}>
          {step.kind === "shell" ? <SquareTerminal className="size-4 shrink-0" /> : <Keyboard className="size-4 shrink-0" />}
          <span className="truncate">{doing}</span>
        </span>
      );
    default:
      return null;
  }
}

/* ---------------- the connection ---------------- */

type Desktop = { status: "connecting" | "live" | "fallback"; rfb: React.RefObject<RFB | null> };

/** X11's keysym for "v" (pasting). */
const XK_v = 0x76;

/**
 * The computer's live desktop over VNC, while it's on: one connection, drawn in
 * `host` (which the screen moves between the board and its window). It
 * reconnects when dropped; if it can't connect at all, it says "fallback".
 */
function useDesktop(boardId: Id<"boards">, on: boolean, driving: boolean, slot: HTMLDivElement | null): Desktop {
  const connect = useAction(api.computer.connect);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  /** The element the desktop draws in, made once. */
  const host = React.useCallback(() => {
    if (!hostRef.current) {
      hostRef.current = document.createElement("div");
      hostRef.current.style.cssText = "position:absolute;inset:0;";
    }
    return hostRef.current;
  }, []);
  const rfb = React.useRef<RFB | null>(null);
  const [status, setStatus] = React.useState<Desktop["status"]>("connecting");
  const viewOnly = React.useRef(!driving);

  React.useEffect(() => {
    viewOnly.current = !driving;
    if (rfb.current) rfb.current.viewOnly = !driving;
  }, [driving]);

  // Into its slot (on the board the slot lets clicks through, to select the screen as anything there).
  React.useLayoutEffect(() => {
    if (!slot) return;
    const el = host();
    if (el.parentElement !== slot) slot.appendChild(el);
    if (driving) window.setTimeout(() => rfb.current?.focus({ preventScroll: true }), 0);
  }, [host, slot, driving]);

  React.useEffect(() => {
    if (!on) return;
    const el = host();
    let gone = false;
    let timer: number | undefined;
    let fails = 0;
    const open = async () => {
      const creds = await connect({ boardId }).catch(() => null);
      if (gone) return;
      if (!creds) {
        if (++fails >= 3) setStatus("fallback");
        else timer = window.setTimeout(open, 2000);
        return;
      }
      const { default: Client } = await import("@novnc/novnc");
      if (gone) return;
      el.replaceChildren();
      const r = new Client(el, `wss://www.orgo.ai/desktops/${creds.id}/ws/websockify?token=${encodeURIComponent(creds.password)}`, { credentials: { password: creds.password } });
      r.scaleViewport = true;
      r.resizeSession = false;
      r.qualityLevel = 8;
      r.compressionLevel = 2;
      r.background = "#000";
      r.viewOnly = viewOnly.current;
      let shown = false;
      r.addEventListener("connect", () => {
        shown = true;
        fails = 0;
        setStatus("live");
        if (!viewOnly.current) r.focus({ preventScroll: true });
      });
      r.addEventListener("credentialsrequired", () => r.sendCredentials({ password: creds.password }));
      // Copied on the computer: on your clipboard too.
      r.addEventListener("clipboard", (e) => void navigator.clipboard?.writeText((e as CustomEvent<{ text: string }>).detail.text).catch(() => undefined));
      r.addEventListener("disconnect", () => {
        if (rfb.current === r) rfb.current = null;
        if (gone) return;
        if (!shown && ++fails >= 8) {
          setStatus("fallback");
          return;
        }
        setStatus("connecting");
        timer = window.setTimeout(open, shown ? 600 : 2000);
      });
      rfb.current = r;
    };
    void open();
    return () => {
      gone = true;
      window.clearTimeout(timer);
      rfb.current?.disconnect();
      rfb.current = null;
      el.replaceChildren();
    };
  }, [on, host, boardId, connect]);

  return { status, rfb };
}

/* ---------------- the fallback: pictures, and input through the server ---------------- */

/** X11 key names for the keys a browser reports by name. */
const KEY_NAMES: Record<string, string> = {
  Enter: "Return", Backspace: "BackSpace", Tab: "Tab", Delete: "Delete", Home: "Home", End: "End", PageUp: "Page_Up", PageDown: "Page_Down", Insert: "Insert",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Escape: "Escape", " ": "space",
};

/**
 * A see-through layer over the picture stream while someone uses the computer
 * without a live desktop: it turns their mouse and keys into input for it.
 */
function Driver({ boardId }: { boardId: string }) {
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

  // Scrolling here scrolls the computer (a native listener, so it can stop the page scrolling).
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
      className="absolute inset-0 cursor-default outline-none"
      onPointerDown={(e) => {
        e.preventDefault();
        layer.current?.focus();
        layer.current?.setPointerCapture(e.pointerId);
        const p = at(e);
        press.current = { ...p, sx: e.clientX, sy: e.clientY, button: e.button };
      }}
      onPointerUp={(e) => {
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
      onKeyDown={(e) => {
        e.preventDefault();
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
