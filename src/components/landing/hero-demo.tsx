"use client";

import * as React from "react";
import { Check, Copy, Globe, Hand, Lock, Megaphone, Monitor, MousePointer2, Smile, SquareDashed, Type } from "lucide-react";
import { CursorArrow } from "@/components/canvas/cursors";
import { Pom } from "@/components/canvas/pom";

/** The demo board is drawn at this size, then scaled to fit. */
const W = 1200;
const H = 700;
const LOOP = 24_000;

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

/** What Dev's computer shows, line by line, as it fixes the tests and ships. */
const TERMINAL: { at: number; text: string; tone?: "cmd" | "bad" | "good" | "dim" }[] = [
  { at: 7600, text: "$ npm test", tone: "cmd" },
  { at: 8300, text: "✗ checkout › applies the coupon", tone: "bad" },
  { at: 8500, text: "✗ checkout › adds up the tax", tone: "bad" },
  { at: 9400, text: "$ git commit -am \"Fix checkout totals\"", tone: "cmd" },
  { at: 10_300, text: "$ npm test", tone: "cmd" },
  { at: 11_000, text: "✓ 48 passing (3s)", tone: "good" },
  { at: 11_800, text: "$ vercel deploy --prod", tone: "cmd" },
  { at: 12_500, text: "Building… uploading… ", tone: "dim" },
  { at: 13_600, text: "✓ Live at acme-launch.vercel.app", tone: "good" },
];

/**
 * A scripted board, as Pompi really looks: you write, the right agent's Pom
 * walks over, thinks, asks before anything risky, and works beside you, one on
 * its computer while the others write and design.
 */
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

  // Dev: you ask, it answers and waits for your OK, then works on the computer.
  const q1 = typed("Is the website deployed?", t, 600, 1900);
  const reply1 = typed("Not yet: 2 tests fail on checkout. Fix them first, then deploy?", t, 4300, 5600);
  const approved = at(t, 6500);
  const shipped = at(t, 14_200);
  const done1 = typed("Fixed both tests and it's live.", t, 15_400, 16_200);
  const showScreen = at(t, 7000);
  const site = at(t, 13_900);

  // Juno and Ivy: the post, written and illustrated while Dev works.
  const q2 = typed("Craft the launch post", t, 8000, 9200);
  const reply2 = typed("Here it is. Ivy's adding an image.", t, 11_300, 12_200);
  const post = typed("We're live! 🎉 Pompi puts your AI team on one canvas. Write what you need, and the right teammate does it, right next to you.", t, 12_700, 14_600);
  const showPost = at(t, 12_500);
  const image = at(t, 16_000);

  // Who's walking where (CSS transitions glide them between points).
  const you = t < 2300 ? { x: 760, y: 112 } : t < 6700 ? { x: 548, y: 252 } : t < 9600 ? { x: 760, y: 372 } : { x: 640, y: 560 };
  const dev = t < 2800 ? { x: 1260, y: -40 } : t < 6900 ? { x: 790, y: 168 } : t < 14_700 ? { x: 1010, y: 210 } : { x: 760, y: 336 };
  const copy = t < 9700 ? { x: 1260, y: 760 } : t < 12_300 ? { x: 790, y: 410 } : t < 15_000 ? { x: 1010, y: 468 } : { x: 780, y: 470 };
  const design = t < 14_400 ? { x: -60, y: 760 } : t < 17_400 ? { x: 1020, y: 556 } : { x: 790, y: 540 };

  const devDoing =
    t >= 3300 && t < 4300 ? "think" : at(t, 7000, 9300) ? "Running the tests" : at(t, 9300, 10_200) ? "Fixing checkout" : at(t, 10_200, 11_700) ? "Running the tests" : at(t, 11_700, 14_200) ? "Deploying" : at(t, 14_700, 15_400) ? "think" : null;
  const copyDoing = t >= 10_200 && t < 11_300 ? "think" : at(t, 12_300, 14_600) ? "Writing the post" : null;
  const designDoing = at(t, 14_400, 16_000) ? "Making an image" : null;

  // Under what you wrote: Pompi finding the right agent, then who's on it.
  const pill1 = at(t, 2000, 2800) ? null : at(t, 2800, 4300) ? DEV : undefined;
  const pill2 = at(t, 9300, 9800) ? null : at(t, 9800, 11_300) ? COPY : undefined;

  const status = (a: Agent) => {
    if (a === DEV) return at(t, 2800, 6500) ? "Answering" : at(t, 7000, 14_200) ? "On the computer" : shipped ? "Shipped" : "Idle";
    if (a === COPY) return at(t, 9800, 14_600) ? "Writing" : t >= 14_600 ? "Done" : "Idle";
    return at(t, 14_400, 16_000) ? "Designing" : t >= 16_000 ? "Done" : "Idle";
  };

  return (
    <div ref={box} className="relative w-full overflow-hidden" style={{ height: H * scale }}>
      <div className="pompi-canvas absolute top-0 left-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})`, backgroundSize: "22px 22px" }}>
        {/* Brainstorm */}
        <div className="absolute rounded-[16px] border-2 border-[#7B4DFF]/15 bg-[#F1EBFF]/70" style={{ left: 40, top: 92, width: 380, height: 420 }} />
        <div className="absolute rounded-lg bg-[#D3BDFF] px-3 py-1 text-[15px] font-semibold" style={{ left: 40, top: 56 }}>
          Launch brainstorm
        </div>
        <Sticky x={66} y={120} color="#FFE48C" rot={-2} text="Launch on Friday" by="Maya" />
        <Sticky x={236} y={136} color="#FFBDF2" rot={2} text="Waitlist gets it first" by="Sam" />
        <Sticky x={70} y={300} color="#A6D9FF" rot={1} text="Landing page + launch post" by="Maya" />
        <Sticky x={240} y={312} color="#B3EFBD" rot={-3} text="Price: free to start" by="You" />

        {/* You ask Dev */}
        <div className="absolute text-[26px] font-bold tracking-[-0.02em] text-ink" style={{ left: 470, top: 74 }}>
          {q1}
          {at(t, 600, 2300) ? <Caret /> : null}
        </div>
        <Going agent={pill1} x={472} y={120} />
        {t >= 4300 ? (
          <Reply
            agent={DEV}
            x={472}
            y={122}
            w={340}
            tag={
              !approved ? (
                <span className="ml-auto flex items-center gap-1 rounded-full bg-[#FFF4DB] px-2 py-0.5 text-[11px] font-semibold text-[#A86B00]">
                  <span className="inline-block origin-bottom animate-hand">✋</span> Needs you
                </span>
              ) : null
            }
          >
            <p>{reply1}</p>
            {!approved ? (
              <div className="mt-3 flex gap-2">
                <span className={`rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-white transition-transform ${t > 6200 ? "scale-95" : ""}`}>Fix & deploy</span>
                <span className="rounded-full bg-black/[0.05] px-3.5 py-1.5 text-[12px] font-semibold">Not now</span>
              </div>
            ) : (
              <p className="mt-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-[#0E8A47]">
                <Check className="size-3.5" strokeWidth={3} /> You said yes
              </p>
            )}
            {done1 ? (
              <p className="mt-2.5 border-t border-black/[0.06] pt-2.5">
                {done1}
                {t >= 16_200 ? <span className="ml-1 font-semibold whitespace-nowrap text-[#0D7FD9] underline decoration-[#0D7FD9]/30 underline-offset-2">acme-launch.vercel.app</span> : null}
              </p>
            ) : null}
          </Reply>
        ) : null}
        {/* You ask for a post */}
        <div className="absolute text-[26px] font-bold tracking-[-0.02em] text-ink" style={{ left: 470, top: 348 }}>
          {q2}
          {at(t, 8000, 9600) ? <Caret /> : null}
        </div>
        <Going agent={pill2} x={472} y={394} />
        {t >= 11_300 ? (
          <Reply agent={COPY} x={472} y={396} w={300}>
            <p>{reply2}</p>
          </Reply>
        ) : null}

        {/* The post, beside the reply */}
        {showPost ? (
          <div className="absolute w-[320px] animate-pop overflow-hidden rounded-[22px] bg-white shadow-[0_0_0_1px_rgba(22,21,26,0.06),0_22px_44px_-22px_rgba(22,21,26,0.45)]" style={{ left: 846, top: 352 }}>
            <div className="flex items-center gap-2 px-4 pt-3 pb-2.5" style={{ background: `linear-gradient(180deg, ${COPY.color}1F, ${COPY.color}08)` }}>
              <Byline agent={COPY} />
              <span className="ml-auto flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10.5px] font-semibold text-[#55525F] ring-1 ring-black/[0.05]">
                <Megaphone className="size-3" /> Post
              </span>
            </div>
            <div className="px-4 pt-2.5 pb-3">
              <p className="text-[17px] leading-tight font-bold tracking-[-0.025em]">Launch post</p>
              <div className="mt-2 rounded-2xl bg-[#F7F7FA] px-3 py-2.5 ring-1 ring-black/[0.04]">
                <p className="min-h-[58px] text-[12.5px] leading-[1.5] text-[#2C2B33]">{post}</p>
                <div className={`overflow-hidden rounded-xl transition-all duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${image ? "mt-2.5 h-[78px] opacity-100" : "h-0 opacity-0"}`}>
                  <div className="relative flex h-[78px] items-center gap-3 bg-gradient-to-br from-[#7B4DFF] via-[#C04DFF] to-[#FF6B9A] px-4">
                    <Pom color="#FFE48C" size={46} />
                    <p className="text-[17px] leading-tight font-bold tracking-[-0.02em] text-white">
                      Pompi is live
                      <span className="block text-[10.5px] font-medium text-white/75">Your AI team, on one canvas</span>
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-2.5 flex items-center border-t border-black/[0.05] pt-2 text-[10.5px] font-medium text-[#9A97A6]">
                {post.length} characters
                <span className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 ring-1 ring-black/[0.08]">
                  <Copy className="size-2.5" /> Copy
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Dev's computer, on the board */}
        {showScreen ? (
          <div className="absolute w-[320px] animate-pop overflow-hidden rounded-[18px] bg-[#16151A] shadow-[0_24px_50px_-22px_rgba(0,0,0,0.6)] ring-1 ring-black/10" style={{ left: 846, top: 64 }}>
            <div className="flex items-center gap-2 px-3 py-2 text-white">
              <Monitor className="size-3.5 text-white/60" />
              <span className="text-[11.5px] font-semibold">Team computer</span>
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-white/10 py-0.5 pr-2 pl-0.5 text-[10.5px] font-semibold">
                <span className="flex size-4 items-center justify-center rounded-full bg-white">
                  <Pom color={DEV.color} size={14} head />
                </span>
                {shipped ? "Dev · done" : "Dev is using it"}
              </span>
            </div>
            <div className="relative mx-1.5 aspect-[16/10] overflow-hidden rounded-[10px] bg-[#0E0D12]">
              {!site ? (
                <div className="space-y-[3px] p-3 font-mono text-[10.5px] leading-[1.45]">
                  {TERMINAL.filter((l) => t >= l.at).map((l) => (
                    <p key={l.at} className={`animate-pop ${l.tone === "cmd" ? "text-white" : l.tone === "bad" ? "text-[#FF7A7A]" : l.tone === "good" ? "text-[#4ADE80]" : "text-white/45"}`}>
                      {l.text}
                    </p>
                  ))}
                  <span className="inline-block h-3 w-1.5 animate-blink bg-white/70" />
                </div>
              ) : (
                <div className="absolute inset-0 animate-pop bg-white">
                  <div className="flex items-center gap-1.5 border-b border-black/[0.06] bg-[#FAFAFC] px-2 py-1.5">
                    <span className="size-1.5 rounded-full bg-[#FF5F57]" />
                    <span className="size-1.5 rounded-full bg-[#FEBC2E]" />
                    <span className="size-1.5 rounded-full bg-[#28C840]" />
                    <span className="ml-1.5 flex flex-1 items-center gap-1 truncate rounded bg-white px-1.5 py-px text-[9px] text-muted ring-1 ring-black/[0.05]">
                      <Lock className="size-2" /> acme-launch.vercel.app
                    </span>
                  </div>
                  <div className="bg-gradient-to-b from-[#F6F2FF] to-white px-4 pt-3">
                    <p className="text-[15px] leading-tight font-bold tracking-[-0.02em]">Launch day is Friday.</p>
                    <p className="mt-1 text-[9.5px] text-muted">Join the waitlist and get it first. Free to start.</p>
                    <span className="mt-2 inline-block rounded bg-ink px-2 py-0.5 text-[8.5px] font-semibold text-white">Join waitlist</span>
                    <div className="mt-2.5 grid grid-cols-3 gap-1">
                      {["#FFE48C", "#A6D9FF", "#FFBDF2"].map((c) => (
                        <div key={c} className="h-7 rounded" style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-3 py-2 text-[10.5px]">
              {shipped ? (
                <span className="flex items-center gap-1 font-semibold text-[#4ADE80]">
                  <Globe className="size-3" /> Deployed
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-medium text-white/60">
                  <span className="size-1.5 animate-pulse rounded-full bg-[#4ADE80]" /> Live
                </span>
              )}
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-semibold text-white">Take control</span>
            </div>
          </div>
        ) : null}

        {/* The team */}
        <div className="absolute w-[236px] rounded-2xl border border-black/[0.06] bg-white/95 p-2.5 shadow-[0_12px_30px_-14px_rgba(0,0,0,0.3)] backdrop-blur" style={{ left: 24, top: 540 }}>
          <p className="px-1.5 pt-0.5 text-[10px] font-bold tracking-[0.14em] text-muted">AGENTS ON THIS BOARD</p>
          {[DEV, COPY, DESIGN].map((a) => {
            const s = status(a);
            const busy = s !== "Idle" && s !== "Done" && s !== "Shipped";
            return (
              <div key={a.name} className="mt-1 flex items-center gap-2 rounded-xl px-1 py-1">
                <span className="relative flex size-8 items-center justify-center rounded-full" style={{ background: `${a.color}2e` }}>
                  <Pom color={a.color} size={28} head />
                  {busy ? <span className="absolute -right-0.5 -bottom-0.5 size-2.5 animate-pulse rounded-full border-2 border-white bg-[#14AE5C]" /> : null}
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-[12.5px] font-semibold">{a.name}</p>
                  <p className="truncate text-[11px] text-muted">{a.role}</p>
                </div>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${busy ? "text-white" : s === "Idle" ? "bg-black/[0.04] text-muted" : "bg-[#E3F8EA] text-[#0E8A47]"}`} style={busy ? { background: a.color } : undefined}>
                  {s}
                </span>
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

        <DemoCursor at={design} agent={DESIGN} doing={designDoing} />
        <DemoCursor at={copy} agent={COPY} doing={copyDoing} />
        <DemoCursor at={dev} agent={DEV} doing={devDoing} />
        <DemoCursor at={you} you />
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
  return <span className="ml-0.5 inline-block h-[28px] w-[2px] translate-y-[5px] animate-blink bg-[#0D99FF]" />;
}

function Byline({ agent }: { agent: Agent }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex size-6 items-center justify-center rounded-full" style={{ background: `${agent.color}2e` }}>
        <Pom color={agent.color} size={22} head />
      </span>
      <span className="text-[12.5px] font-semibold text-[#16151A]">{agent.name}</span>
      <span className="text-[11.5px] text-[#6F6C7A]">{agent.role}</span>
    </div>
  );
}

/** An agent's answer under what you wrote, as on the real board. */
function Reply({ agent, x, y, w, tag, children }: { agent: Agent; x: number; y: number; w: number; tag?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="absolute animate-pop rounded-[18px] rounded-tl-[6px] bg-white px-4 pt-3 pb-3.5 text-[14px] leading-[1.45] text-[#2C2B33] shadow-[0_0_0_1px_rgba(22,21,26,0.06),0_10px_28px_-14px_rgba(22,21,26,0.4)]" style={{ left: x, top: y + 8, width: w }}>
      <div className="flex items-center">
        <Byline agent={agent} />
        {tag}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Under what you wrote: Pompi finding the right agent (null), then who's on it. */
function Going({ agent, x, y }: { agent: Agent | null | undefined; x: number; y: number }) {
  if (agent === undefined) return null;
  return (
    <div className="absolute" style={{ left: x, top: y }}>
      {agent ? (
        <span key="on" className="flex animate-pop items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-[12px] font-semibold whitespace-nowrap text-white shadow-md" style={{ background: agent.color }}>
          <span className="flex size-5 items-center justify-center rounded-full bg-white">
            <Pom color={agent.color} size={18} head />
          </span>
          {agent.name} is on it
        </span>
      ) : (
        <span key="finding" className="flex animate-pop items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-semibold whitespace-nowrap text-[#6F6C7A] shadow-md ring-1 ring-black/5">
          <span className="size-1.5 animate-pulse rounded-full bg-[#7B4DFF]" />
          Finding the right agent
        </span>
      )}
    </div>
  );
}

function DemoCursor({ at, agent, you, doing }: { at: { x: number; y: number }; agent?: Agent; you?: boolean; doing?: string | null }) {
  const color = agent?.color ?? YOU.color;
  return (
    <div className="pointer-events-none absolute top-0 left-0 z-10 transition-transform duration-[1100ms] ease-[cubic-bezier(0.45,0,0.2,1)]" style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
      <CursorArrow color={color} />
      <div className="absolute top-[18px] left-[14px] flex flex-col items-start gap-1.5">
        <span className="flex items-center gap-1 rounded-full px-2 py-[3px] text-[12px] font-semibold whitespace-nowrap text-white shadow-sm" style={{ background: color }}>
          {you ? YOU.name : <><span className="text-[10px]">✦</span> {agent?.name}</>}
        </span>
        {doing === "think" ? (
          <span className="flex animate-pop items-center gap-1 rounded-full rounded-tl-[4px] bg-white px-3 py-2 shadow-md ring-1 ring-black/5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-bounce rounded-full" style={{ background: color, animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
        ) : doing ? (
          <span key={doing} className="animate-pop rounded-full rounded-tl-[4px] bg-white px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap text-[#3D3B45] shadow-md ring-1 ring-black/5">
            {doing}…
          </span>
        ) : null}
      </div>
    </div>
  );
}
