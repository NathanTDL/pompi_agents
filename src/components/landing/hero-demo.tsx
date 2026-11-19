"use client";

import * as React from "react";
import { Check, Globe, Hand, Lock, MousePointer2, Smile, SquareDashed, Type } from "lucide-react";
import { CursorArrow } from "@/components/canvas/cursors";

/** The demo board is drawn at this size, then scaled to fit. */
const W = 1200;
const H = 700;
const LOOP = 19_000;

type Agent = { name: string; role: string; color: string };
const DEV: Agent = { name: "Dev", role: "Engineer", color: "#14AE5C" };
const COPY: Agent = { name: "Juno", role: "Copywriter", color: "#FF24BD" };
const DESIGN: Agent = { name: "Ivy", role: "Designer", color: "#FF8A00" };
const YOU = { name: "You", color: "#0D99FF" };

/** `text` typed out between `from` and `to` (ms into the loop). */
function typed(text: string, t: number, from: number, to: number) {
  if (t < from) return "";
  if (t >= to) return text;
  return text.slice(0, Math.ceil(((t - from) / (to - from)) * text.length));
}
const at = (t: number, from: number, to = Infinity) => t >= from && t < to;

/** A scripted board: you write, the right agent walks over and answers, and the work lands beside it. */
export function HeroDemo() {
  const box = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  const [t, setT] = React.useState(0);

  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // Still: just show the finished board.
      const id = window.setTimeout(() => setT(LOOP - 1500), 0);
      return () => window.clearTimeout(id);
    }
    const start = performance.now();
    const id = window.setInterval(() => setT((performance.now() - start) % LOOP), 50);
    return () => window.clearInterval(id);
  }, []);

  const q1 = typed("Is the website deployed?", t, 700, 2200);
  const reply1 = typed("Not yet. 2 tests are failing on checkout. Fix them first, then deploy?", t, 3900, 5600);
  const q2 = typed("Craft launch post", t, 7300, 8400);
  const post = typed("We're live! 🎉 Pompi puts your AI teammates on one canvas. Write what you want, and the right agent does it.", t, 10_000, 12_000);
  const showReply = at(t, 3500);
  const approved = at(t, 6300);
  const showPost = at(t, 9700);
  const showImage = at(t, 13_300);
  const showSite = at(t, 15_200);
  const deployed = at(t, 17_000);

  // Where each cursor is, and when: they glide between points (CSS transitions).
  const you = t < 2600 ? { x: 520, y: 128 } : t < 6200 ? { x: 690, y: 262 } : t < 8800 ? { x: 520, y: 368 } : { x: 600, y: 610 };
  const dev = t < 3000 ? { x: 1240, y: 760 } : t < 14_800 ? { x: 830, y: 150 } : { x: 1010, y: 300 };
  const copy = t < 8900 ? { x: 1240, y: 520 } : t < 13_000 ? { x: 790, y: 410 } : { x: 760, y: 560 };
  const design = t < 12_600 ? { x: -60, y: 740 } : t < 15_500 ? { x: 610, y: 470 } : { x: 420, y: 560 };

  const status = (a: Agent) => {
    if (a === DEV) return t >= 3000 && t < 6300 ? "Answering" : t >= 14_800 && t < 17_000 ? "Deploying" : deployed ? "Shipped" : "Idle";
    if (a === COPY) return t >= 8900 && t < 12_000 ? "Writing post" : t >= 12_000 ? "Done" : "Idle";
    return t >= 12_600 && t < 15_000 ? "Adding image" : t >= 15_000 ? "Done" : "Idle";
  };

  return (
    <div ref={box} className="relative w-full overflow-hidden" style={{ height: H * scale }}>
      <div className="pompi-canvas absolute top-0 left-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})`, backgroundSize: "22px 22px" }}>
        {/* Brainstorm */}
        <div className="absolute rounded-[14px] border-2 border-[#7B4DFF]/15 bg-[#F1EBFF]/70" style={{ left: 40, top: 92, width: 380, height: 420 }} />
        <div className="absolute rounded-lg bg-[#D3BDFF] px-3 py-1 text-[15px] font-semibold" style={{ left: 40, top: 56 }}>
          Launch brainstorm
        </div>
        <Sticky x={66} y={120} color="#FFE48C" rot={-2} text="Launch on Friday" by="Maya" />
        <Sticky x={236} y={136} color="#FFBDF2" rot={2} text="Waitlist gets it first" by="Sam" />
        <Sticky x={70} y={300} color="#A6D9FF" rot={1} text="Landing page + launch post" by="Maya" />
        <Sticky x={240} y={312} color="#B3EFBD" rot={-3} text="Price: free to start" by="You" />

        {/* You ask Dev */}
        <div className="absolute text-[24px] font-semibold tracking-[-0.01em] text-ink" style={{ left: 470, top: 104 }}>
          {q1}
          {t >= 700 && t < 2600 ? <Caret /> : null}
        </div>
        {showReply ? (
          <div className="absolute w-[330px] animate-pop rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.35)]" style={{ left: 480, top: 160 }}>
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: DEV.color }}>
                D
              </span>
              <span className="text-[13px] font-semibold">Dev</span>
              {!approved ? (
                <span className="ml-auto flex items-center gap-1 rounded-full bg-[#FFF4DB] px-2 py-0.5 text-[11px] font-semibold text-[#A86B00]">
                  <span className="inline-block origin-bottom animate-hand">✋</span> Needs you
                </span>
              ) : (
                <span className="ml-auto flex items-center gap-1 rounded-full bg-[#E3F8EA] px-2 py-0.5 text-[11px] font-semibold text-[#0E8A47]">
                  <Check className="size-3" /> Approved
                </span>
              )}
            </div>
            <p className="mt-2 text-[14px] leading-snug text-ink-2">{reply1}</p>
            {!approved ? (
              <div className="mt-3 flex gap-2">
                <span className={`rounded-lg bg-ink px-3 py-1.5 text-[12px] font-semibold text-white transition-transform ${t > 5900 ? "scale-95" : ""}`}>Fix & deploy</span>
                <span className="rounded-lg border border-black/10 px-3 py-1.5 text-[12px] font-semibold">Not now</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* You ask for a post */}
        <div className="absolute text-[24px] font-semibold tracking-[-0.01em] text-ink" style={{ left: 470, top: 344 }}>
          {q2}
          {t >= 7300 && t < 8800 ? <Caret /> : null}
        </div>
        {showPost ? (
          <div className="absolute w-[300px] animate-pop overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.35)]" style={{ left: 480, top: 398 }}>
            <div className="flex items-center gap-2 px-4 pt-3.5">
              <span className="flex size-7 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-white">P</span>
              <div className="leading-tight">
                <p className="text-[13px] font-semibold">Pompi</p>
                <p className="text-[11px] text-muted">@pompi · Launch post</p>
              </div>
              <span className="ml-auto text-[15px] font-black">𝕏</span>
            </div>
            <p className="px-4 pt-2 pb-3 text-[13.5px] leading-snug">{post}</p>
            <div className={`mx-4 mb-4 h-[86px] rounded-xl bg-gradient-to-br from-[#7B4DFF] via-[#C04DFF] to-[#FF6B9A] transition-all duration-700 ${showImage ? "opacity-100" : "h-0 opacity-0"}`}>
              <div className="flex h-full items-center justify-center text-[18px] font-bold tracking-tight text-white/95">Pompi is live ✦</div>
            </div>
          </div>
        ) : null}

        {/* The website, live on the canvas */}
        {showSite ? (
          <div className="absolute w-[300px] animate-pop overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.35)]" style={{ left: 860, top: 96 }}>
            <div className="flex items-center gap-1.5 border-b border-black/[0.06] bg-[#FAFAFC] px-3 py-2">
              <span className="size-2 rounded-full bg-[#FF5F57]" />
              <span className="size-2 rounded-full bg-[#FEBC2E]" />
              <span className="size-2 rounded-full bg-[#28C840]" />
              <span className="ml-2 flex flex-1 items-center gap-1 truncate rounded-md bg-white px-2 py-0.5 text-[10.5px] text-muted">
                <Lock className="size-2.5" /> acme-launch.pompi.site
              </span>
            </div>
            <div className="bg-gradient-to-b from-[#F6F2FF] to-white px-5 pt-5 pb-4">
              <div className="h-2 w-12 rounded-full bg-[#7B4DFF]/40" />
              <p className="mt-3 text-[19px] leading-tight font-bold tracking-[-0.02em]">Launch day is Friday.</p>
              <p className="mt-1.5 text-[11px] leading-snug text-muted">Join the waitlist and get it first. Free to start.</p>
              <div className="mt-3 flex gap-2">
                <span className="rounded-md bg-ink px-2.5 py-1 text-[10px] font-semibold text-white">Join waitlist</span>
                <span className="rounded-md border border-black/10 px-2.5 py-1 text-[10px] font-semibold">Learn more</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-1.5">
                {["#FFE48C", "#A6D9FF", "#FFBDF2"].map((c) => (
                  <div key={c} className="h-9 rounded-md" style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-black/[0.06] px-3 py-2 text-[11px]">
              <span className="flex items-center gap-1 text-muted">
                <Globe className="size-3" /> Live website
              </span>
              {deployed ? (
                <span className="flex items-center gap-1 font-semibold text-[#0E8A47]">
                  <span className="size-1.5 rounded-full bg-[#14AE5C]" /> Deployed
                </span>
              ) : (
                <span className="flex items-center gap-1 font-semibold text-[#A86B00]">
                  <span className="size-1.5 animate-pulse rounded-full bg-[#FFB020]" /> Deploying…
                </span>
              )}
            </div>
          </div>
        ) : null}

        {/* The team */}
        <div className="absolute w-[230px] rounded-2xl border border-black/[0.06] bg-white/95 p-3 shadow-[0_12px_30px_-14px_rgba(0,0,0,0.3)] backdrop-blur" style={{ left: 24, top: 548 }}>
          <p className="px-1 text-[10px] font-bold tracking-[0.14em] text-muted">AGENTS ON THIS BOARD</p>
          {[DEV, COPY, DESIGN].map((a) => {
            const s = status(a);
            const busy = s !== "Idle" && s !== "Done" && s !== "Shipped";
            return (
              <div key={a.name} className="mt-1.5 flex items-center gap-2 rounded-lg px-1 py-1">
                <span className="relative flex size-7 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: a.color }}>
                  {a.name[0]}
                  {busy ? <span className="absolute -right-0.5 -bottom-0.5 size-2.5 animate-pulse rounded-full border-2 border-white bg-[#14AE5C]" /> : null}
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-[12.5px] font-semibold">{a.name}</p>
                  <p className="truncate text-[11px] text-muted">{a.role}</p>
                </div>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${busy ? "bg-[#E3F8EA] text-[#0E8A47]" : "bg-black/[0.04] text-muted"}`}>{s}</span>
              </div>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="absolute flex items-center gap-1 rounded-2xl border border-black/[0.07] bg-white px-2 py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)]" style={{ left: W / 2 - 170, top: H - 74 }}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#0D99FF] text-white">
            <MousePointer2 className="size-[18px]" />
          </span>
          <span className="flex size-10 items-center justify-center rounded-xl text-ink-2">
            <Hand className="size-[18px]" />
          </span>
          <span className="mx-1 h-6 w-px bg-black/10" />
          <span className="mx-1 flex h-11 w-10 items-end justify-center overflow-hidden">
            <span className="block h-8 w-8 translate-y-1.5 rounded-[3px] bg-[#FFE48C] shadow-[0_2px_4px_rgba(0,0,0,0.2)]" />
          </span>
          <span className="flex size-10 items-center justify-center rounded-xl text-ink-2">
            <Type className="size-[18px]" />
          </span>
          <span className="flex size-10 items-center justify-center rounded-xl text-ink-2">
            <SquareDashed className="size-[18px]" />
          </span>
          <span className="flex size-10 items-center justify-center rounded-xl text-ink-2">
            <Smile className="size-[18px]" />
          </span>
        </div>

        <DemoCursor at={design} color={DESIGN.color} label={`${DESIGN.name} · ${DESIGN.role}`} agent />
        <DemoCursor at={copy} color={COPY.color} label={`${COPY.name} · ${COPY.role}`} agent />
        <DemoCursor at={dev} color={DEV.color} label={`${DEV.name} · ${DEV.role}`} agent />
        <DemoCursor at={you} color={YOU.color} label={YOU.name} />
      </div>
    </div>
  );
}

function Sticky({ x, y, color, rot, text, by }: { x: number; y: number; color: string; rot: number; text: string; by: string }) {
  return (
    <div className="pompi-sticky absolute flex size-[150px] flex-col rounded-[3px] p-4" style={{ left: x, top: y, background: color, transform: `rotate(${rot}deg)` }}>
      <p className="flex-1 text-[18px] leading-[1.25] font-semibold">{text}</p>
      <p className="text-[11px] font-medium opacity-50">{by}</p>
    </div>
  );
}

function Caret() {
  return <span className="ml-0.5 inline-block h-[26px] w-[2px] translate-y-[5px] animate-blink bg-[#0D99FF]" />;
}

function DemoCursor({ at, color, label, agent }: { at: { x: number; y: number }; color: string; label: string; agent?: boolean }) {
  return (
    <div className="pointer-events-none absolute top-0 left-0 z-10 transition-transform duration-[1100ms] ease-[cubic-bezier(0.45,0,0.2,1)]" style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
      <CursorArrow color={color} />
      <span className="absolute top-[18px] left-[14px] flex items-center gap-1 rounded-full px-2 py-[3px] text-[12px] font-semibold whitespace-nowrap text-white shadow-sm" style={{ background: color }}>
        {agent ? <span className="text-[10px]">✦</span> : null}
        {label}
      </span>
    </div>
  );
}
