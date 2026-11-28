"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Copy, FileText, LoaderCircle, Mail, Megaphone, Pause, Play, Repeat, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ToolLogo } from "./agent-dialog";
import { useBoardInfo } from "./board-context";
import { Pom } from "./pom";
import { ScreenItem } from "./screen-item";
import { color, TEXT_SIZES, type Item, type ShapeKind, type TextSize } from "@/lib/canvas/types";

type Props = {
  item: Item;
  editing: boolean;
  /** Report the drawn size (onMeasure): while it's edited or resized. */
  measure: boolean;
  /** Text typed so far while editing. */
  /** New text for the item: its main text, or `field` (a card's title). */
  onText: (id: string, text: string, field?: string) => void;
  /** Editing ended (Escape, or a click elsewhere). */
  onDone: () => void;
  /** The item's drawn size, while it's being edited (text and stickies grow to fit). */
  onMeasure: (id: string, w: number, h: number) => void;
  /** Its drawn height once long text folds up (Fold), so its box fits what shows. */
  onSettle?: (id: string, h: number) => void;
};

/** Items just made here: they pop in when first drawn. */
const fresh = new Set<string>();
export function markFresh(ids: string[]) {
  for (const id of ids) fresh.add(id);
  window.setTimeout(() => ids.forEach((id) => fresh.delete(id)), 1000);
}

/** One thing on the canvas, drawn in world units inside the camera's layer. */
export const ItemView = React.memo(function ItemView(p: Props) {
  const [pop] = React.useState(() => fresh.has(p.item.id));
  const view = render(p);
  return pop ? <div className="pompi-item-new contents">{view}</div> : view;
}, same);

function render(p: Props) {
  switch (p.item.kind) {
    case "sticky":
      return <Sticky {...p} />;
    case "text":
      return <TextItem {...p} />;
    case "shape":
      return <Shape {...p} />;
    case "section":
      return <Section {...p} />;
    case "stamp":
      return <Stamp {...p} />;
    case "reply":
      return <Reply {...p} />;
    case "card":
      return <Card {...p} />;
    case "screen":
      return <ScreenItem item={p.item} />;
    default:
      return null;
  }
}

function same(a: Props, b: Props) {
  if (a.editing !== b.editing || a.measure !== b.measure || a.onText !== b.onText || a.onDone !== b.onDone || a.onMeasure !== b.onMeasure || a.onSettle !== b.onSettle) return false;
  if (a.item === b.item) return true;
  const x = a.item;
  const y = b.item;
  return x.x === y.x && x.y === y.y && x.w === y.w && x.h === y.h && x.z === y.z && x.kind === y.kind && JSON.stringify(x.props) === JSON.stringify(y.props);
}

function place(it: Item, extra?: React.CSSProperties): React.CSSProperties {
  return { position: "absolute", left: 0, top: 0, transform: `translate(${it.x}px, ${it.y}px)`, width: it.w, ...extra };
}

/** Reports an element's size in world units while `on`. */
function useMeasure(ref: React.RefObject<HTMLElement | null>, on: boolean, report: (w: number, h: number) => void) {
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const ro = new ResizeObserver(() => report(el.offsetWidth, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, on, report]);
}

function Sticky({ item, editing, measure, onText, onDone, onMeasure, onSettle }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const report = React.useCallback((w: number, h: number) => onMeasure(item.id, w, h), [onMeasure, item.id]);
  useMeasure(ref, measure, report);
  const text: string = item.props.text ?? "";
  const fill = color(item.props.color).fill;
  const dark = item.props.color === "black";
  const long = !editing && isLong(text);
  const [open, setOpen] = React.useState(false);
  useSettle(ref, long && !open && !measure, item.id, onSettle);
  return (
    <div
      ref={ref}
      data-item-id={item.id}
      className="pompi-sticky flex flex-col rounded-[4px] p-[22px] pb-3.5"
      style={place(item, {
        minHeight: item.w,
        backgroundColor: fill,
        backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.025) 100%)",
        color: dark ? "#fff" : "#1E1E1E",
      })}
    >
      <Fold on={long} open={open} onToggle={() => setOpen((o) => !o)} maxHeight={Math.max(200, item.w - 100)} dark={dark}>
        <EditableText
          value={text}
          editing={editing}
          onChange={(t) => onText(item.id, t)}
          onDone={onDone}
          placeholder="Write something…"
          className="flex-1 leading-[1.28] font-semibold tracking-[-0.01em]"
          style={{ fontSize: stickyFont(text) }}
        />
      </Fold>
      {item.props.author ? <div className="mt-3 truncate text-[13px] font-medium opacity-50">{item.props.author}</div> : null}
    </div>
  );
}

/** Long text (a long paste, say): it shows its first lines, with Show more. */
const FOLD_CHARS = 600;
const FOLD_LINES = 12;
const isLong = (text: string) => text.length > FOLD_CHARS || text.split("\n").length > FOLD_LINES;

function Fold({ on, open, onToggle, maxHeight, dark, children }: { on: boolean; open: boolean; onToggle: () => void; maxHeight: number; dark?: boolean; children: React.ReactNode }) {
  if (!on) return children;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const fade = "linear-gradient(to bottom, #000 calc(100% - 56px), transparent)";
  return (
    <>
      <div className="flex flex-1 flex-col" style={open ? undefined : { maxHeight, overflow: "hidden", maskImage: fade, WebkitMaskImage: fade }}>
        {children}
      </div>
      <button
        type="button"
        onPointerDown={stop}
        onDoubleClick={stop}
        onClick={onToggle}
        className={`mt-2.5 flex h-8 shrink-0 items-center gap-1 self-start rounded-full px-3 text-[13px] font-semibold tracking-normal transition-colors ${dark ? "bg-white/15 hover:bg-white/25" : "bg-black/[0.07] hover:bg-black/[0.12]"}`}
      >
        {open ? "Show less" : "Show more"}
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </>
  );
}

/** Reports a folded item's drawn height, so its box (and what's placed below it) fits it. */
function useSettle(ref: React.RefObject<HTMLElement | null>, on: boolean, id: string, onSettle?: (id: string, h: number) => void) {
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el || !onSettle) return;
    const ro = new ResizeObserver(() => onSettle(id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, on, id, onSettle]);
}

/** Long notes get smaller text, as on FigJam, so they keep fitting the note. */
function stickyFont(text: string) {
  const n = text.length;
  return n <= 30 ? 26 : n <= 80 ? 22 : n <= 160 ? 18 : 15;
}

function TextItem({ item, editing, measure, onText, onDone, onMeasure, onSettle }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const report = React.useCallback((w: number, h: number) => onMeasure(item.id, w, h), [onMeasure, item.id]);
  useMeasure(ref, measure, report);
  const size = TEXT_SIZES[(item.props.size as TextSize) ?? "m"] ?? 24;
  const fixed = !!item.props.fixedWidth;
  const text: string = item.props.text ?? "";
  const long = !editing && isLong(text);
  const [open, setOpen] = React.useState(false);
  useSettle(ref, long && !open && !measure, item.id, onSettle);
  return (
    <div
      ref={ref}
      data-item-id={item.id}
      style={{
        ...place(item),
        width: fixed ? item.w : "max-content",
        minWidth: 24,
        maxWidth: fixed ? undefined : 1200,
        color: color(item.props.color, "black").ink,
        fontSize: size,
        fontWeight: item.props.bold ? 700 : 500,
        lineHeight: 1.3,
      }}
    >
      <Fold on={long} open={open} onToggle={() => setOpen((o) => !o)} maxHeight={Math.round(size * 1.3 * 8)}>
        <EditableText value={text} editing={editing} onChange={(t) => onText(item.id, t)} onDone={onDone} placeholder="Type something" />
      </Fold>
    </div>
  );
}

function Shape({ item, editing, onText, onDone }: Props) {
  const c = color(item.props.color, "blue");
  const shape = (item.props.shape as ShapeKind) ?? "rect";
  const dark = item.props.color === "black";
  return (
    <div data-item-id={item.id} style={place(item, { height: item.h })}>
      <svg className="absolute inset-0 overflow-visible" width={item.w} height={item.h}>
        <ShapePath shape={shape} w={item.w} h={item.h} fill={c.fill} stroke={c.ink} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-4 text-center" style={{ color: dark ? "#fff" : "#1E1E1E" }}>
        <EditableText value={item.props.text ?? ""} editing={editing} onChange={(t) => onText(item.id, t)} onDone={onDone} className="w-full text-[20px] leading-[1.3] font-medium" />
      </div>
    </div>
  );
}

export function ShapePath({ shape, w, h, fill, stroke }: { shape: ShapeKind; w: number; h: number; fill: string; stroke: string }) {
  const common = { fill, stroke, strokeWidth: 2, vectorEffect: "non-scaling-stroke" as const };
  switch (shape) {
    case "ellipse":
      return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />;
    case "diamond":
      return <polygon points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} {...common} strokeLinejoin="round" />;
    case "triangle":
      return <polygon points={`${w / 2},0 ${w},${h} 0,${h}`} {...common} strokeLinejoin="round" />;
    default:
      return <rect x={0} y={0} width={w} height={h} rx={8} {...common} />;
  }
}

function Section({ item, editing, onText, onDone }: Props) {
  const c = color(item.props.color, "gray");
  return (
    <>
      {/* The body is canvas: a click in it selects by marquee or writes, as outside it. */}
      <div
        data-section-body={item.id}
        className="rounded-[12px] border-2"
        style={place(item, { height: item.h, background: c.section, borderColor: item.props.color === "white" ? "#E6E6E6" : `${c.ink}33` })}
      />
      <div
        data-item-id={item.id}
        className="absolute top-0 left-0 max-w-[600px] rounded-[8px] px-3 py-1 text-[18px] font-semibold whitespace-nowrap"
        style={{ transform: `translate(${item.x}px, ${item.y - 40}px)`, background: item.props.color === "white" || item.props.color === "gray" ? "#E6E6E6" : c.fill, color: "#1E1E1E" }}
      >
        <EditableText value={item.props.title ?? ""} editing={editing} onChange={(t) => onText(item.id, t)} onDone={onDone} placeholder="Section" singleLine />
      </div>
    </>
  );
}

/** An agent's answer, as a speech bubble with who said it. */
function Reply({ item, editing, measure, onText, onDone, onMeasure }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const report = React.useCallback((w: number, h: number) => onMeasure(item.id, w, h), [onMeasure, item.id]);
  useMeasure(ref, measure, report);
  const p = item.props;
  return (
    <div ref={ref} data-item-id={item.id} style={place(item, { minHeight: item.h })} className="flex flex-col">
      <div className="relative rounded-[18px] rounded-tl-[6px] bg-white px-4 pt-3 pb-3.5 shadow-[0_0_0_1px_rgba(22,21,26,0.06),0_10px_28px_-14px_rgba(22,21,26,0.4)]">
        <AgentByline mark={p} />
        <EditableText
          value={p.text ?? ""}
          editing={editing}
          onChange={(t) => onText(item.id, t)}
          onDone={onDone}
          className={`mt-2 text-[16px] leading-[1.45] ${p.failed ? "text-[#B4261E]" : "text-[#2C2B33]"}`}
          typeFrom={p.at}
        />
        {p.questions?.length ? <Questions itemId={item.id} questions={p.questions} answered={!!p.answered} skipped={!!p.skipped} by={p.answeredBy} color={p.color} /> : null}
        {p.ask ? <AskButtons itemId={item.id} ask={p.ask} color={p.color} /> : null}
        {p.handoffs?.length ? <Handoffs to={p.handoffs} /> : null}
      </div>
    </div>
  );
}

/**
 * An agent's questions before it does the work: answer each right here (Enter
 * goes to the next; Ctrl+Enter sends), or let it go ahead without.
 */
function Questions({ itemId, questions, answered, skipped, by, color: c }: { itemId: string; questions: { q: string; a: string }[]; answered: boolean; skipped: boolean; by?: string; color: string }) {
  const { answerQuestions } = useBoardInfo();
  const [answers, setAnswers] = React.useState<string[]>(() => questions.map((x) => x.a ?? ""));
  const [sending, setSending] = React.useState(false);
  const fields = React.useRef<(HTMLTextAreaElement | null)[]>([]);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const send = async (skip = false) => {
    if (sending) return;
    setSending(true);
    const ok = await answerQuestions(itemId, answers, skip);
    if (!ok) setSending(false);
  };
  const ready = answers.some((a) => a.trim());

  return (
    <div className="mt-3" onPointerDown={stop} onDoubleClick={stop} onWheel={stop} onKeyDown={stop}>
      <ol className="space-y-2.5">
        {questions.map((x, i) => (
          <li key={i} className="rounded-xl bg-[#F7F7F9] p-2.5">
            <p className="flex gap-2 text-[13.5px] leading-snug font-semibold text-[#2C2B33]">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: c }}>
                {i + 1}
              </span>
              {x.q}
            </p>
            {answered ? (
              <p className={`mt-1.5 pl-7 text-[13.5px] leading-snug ${x.a ? "text-[#3D3B45]" : "text-[#9A97A6] italic"}`}>{x.a || "No answer"}</p>
            ) : (
              <textarea
                ref={(el) => void (fields.current[i] = el)}
                value={answers[i] ?? ""}
                onChange={(e) => setAnswers((all) => all.map((a, j) => (j === i ? e.target.value : a)))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void send();
                  } else if (e.key === "Enter" && !e.shiftKey && i < questions.length - 1) {
                    e.preventDefault();
                    fields.current[i + 1]?.focus();
                  }
                }}
                disabled={sending}
                rows={1}
                placeholder="Your answer"
                className="mt-1.5 field-sizing-content min-h-9 w-full resize-none rounded-lg bg-white px-2.5 py-2 text-[13.5px] leading-snug text-[#2C2B33] ring-1 ring-black/10 outline-none placeholder:text-[#A9A6B4] focus:ring-2 focus:ring-[#0D99FF]/50"
              />
            )}
          </li>
        ))}
      </ol>
      {answered ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0E8A47]">
          <Check className="size-3.5" /> {skipped ? "Told to go ahead" : "Answered"}
          {by ? ` by ${by}` : ""}
        </p>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => void send()} disabled={!ready || sending} className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40" style={{ background: c }}>
            {sending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Send answers
          </button>
          <button type="button" onClick={() => void send(true)} disabled={sending} className="flex h-9 items-center rounded-full px-3.5 text-[13px] font-semibold text-[#3D3B45] ring-1 ring-black/10 transition-colors hover:bg-black/[0.04] disabled:opacity-40">
            Just go ahead
          </button>
        </div>
      )}
    </div>
  );
}

/** An agent's raised hand: it waits for a yes before doing something risky. */
/** The teammates an agent handed part of the work to (brain.ts handOff). */
function Handoffs({ to }: { to: { agentId: string; name: string; color: string; emoji: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-[#6F6C7A]">
      Asked
      {to.map((a) => (
        <span key={a.agentId} className="flex items-center gap-1 rounded-full py-0.5 pr-2 pl-0.5" style={{ background: `${a.color}22`, color: a.color }}>
          <span className="flex size-[18px] items-center justify-center rounded-full bg-white">
            <Pom color={a.color} size={16} head />
          </span>
          {a.name}
        </span>
      ))}
    </div>
  );
}

type Ask = { status: "waiting" | "approved" | "declined"; by?: string; apps?: { tool: string; name: string; url: string }[] };

/** The answers to an agent's raised hand: an OK for what it's about to do, or apps to connect first. */
function AskButtons({ itemId, ask, color: c }: { itemId: string; ask: Ask; color: string }) {
  const { answerAsk } = useBoardInfo();
  const connecting = !!ask.apps?.length;
  if (ask.status !== "waiting") {
    return (
      <p className={`mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold ${ask.status === "approved" ? "text-[#0E8A47]" : "text-[#6F6C7A]"}`}>
        {ask.status === "approved" ? <Check className="size-3.5" /> : <X className="size-3.5" />}
        {ask.status === "approved" ? (connecting ? "Connected" : "Approved") : connecting ? "Skipped" : "Declined"}
        {ask.by ? ` by ${ask.by}` : ""}
      </p>
    );
  }
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();
  return (
    <div className="mt-3" onPointerDown={stop} onDoubleClick={stop}>
      {connecting ? (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {ask.apps!.map((a) => (
            <a
              key={a.tool}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 items-center gap-2 rounded-full bg-white pr-3.5 pl-2 text-[13px] font-semibold text-[#16151A] shadow-sm ring-1 ring-black/10 transition-colors hover:bg-black/[0.03]"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06]">
                <ToolLogo tool={a.tool} size={14} />
              </span>
              Connect {a.name}
              <ArrowUpRight className="size-3.5 text-[#6F6C7A]" />
            </a>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => answerAsk(itemId, true)} className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90" style={{ background: c }}>
          <Check className="size-4" /> {connecting ? "Done, carry on" : "Go ahead"}
        </button>
        <button type="button" onClick={() => answerAsk(itemId, false)} className="flex h-9 items-center rounded-full px-3.5 text-[13px] font-semibold text-[#3D3B45] ring-1 ring-black/10 transition-colors hover:bg-black/[0.04]">
          Not now
        </button>
      </div>
    </div>
  );
}

/** Work an agent made: a post ready to publish, a note, or an email. */
function Card(props: Props) {
  return props.item.props.type === "routine" ? <RoutineCard {...props} /> : <WorkCard {...props} />;
}

function WorkCard({ item, editing, measure, onText, onDone, onMeasure }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const report = React.useCallback((w: number, h: number) => onMeasure(item.id, w, h), [onMeasure, item.id]);
  useMeasure(ref, measure, report);
  const p = item.props;
  const post = p.type === "post";
  const email = p.type === "email";
  // An email that came in, an agent's draft waiting for an OK, or one that went out.
  const label = email ? (p.sent ? "Sent" : p.draft ? "Draft" : "Email") : post ? "Post" : "Note";
  const Icon = email ? Mail : post ? Megaphone : FileText;
  const body: string = p.body ?? "";
  return (
    <div
      ref={ref}
      data-item-id={item.id}
      style={place(item, { minHeight: item.h, ["--agent" as string]: p.color })}
      className="group/card flex flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_0_0_1px_rgba(22,21,26,0.06),0_2px_4px_-2px_rgba(22,21,26,0.08),0_22px_44px_-22px_rgba(22,21,26,0.4)]"
    >
      {/* Who made it, on a wash of their colour. */}
      <div className="flex items-center gap-2 px-5 pt-4 pb-3.5" style={{ background: `linear-gradient(180deg, ${p.color}1F, ${p.color}08)` }}>
        <AgentByline mark={p} />
        <span className={`ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em] ${p.sent ? "bg-[#E3F8EA] text-[#0E8A47]" : p.draft ? "bg-[#FFF4DB] text-[#A86B00]" : "bg-white/80 text-[#55525F] ring-1 ring-black/[0.05]"}`}>
          <Icon className="size-3" />
          {label}
        </span>
      </div>
      <div className="flex flex-1 flex-col px-5 pt-3.5 pb-4">
        {email ? (
          <p className="mb-1 truncate text-[12.5px] text-[#6F6C7A]">
            <span className="font-semibold text-[#3D3B45]">{p.from ? "From" : "To"}</span> {p.from ?? p.to}
          </p>
        ) : null}
        {p.title || editing ? (
          <EditableText
            value={p.title ?? ""}
            editing={editing}
            focus={false}
            singleLine
            placeholder="Title"
            onChange={(t) => onText(item.id, t, "title")}
            onDone={onDone}
            className="text-[21px] leading-[1.2] font-bold tracking-[-0.025em] text-[#16151A]"
          />
        ) : null}
        <EditableText
          value={body}
          editing={editing}
          rich={!post}
          onChange={(t) => onText(item.id, t)}
          onDone={onDone}
          placeholder="Write something"
          className={`mt-2.5 text-[15.5px] leading-[1.55] text-[#2C2B33] ${post ? "rounded-2xl bg-[#F7F7FA] px-4 py-3.5 ring-1 ring-black/[0.04]" : ""}`}
          typeFrom={p.at}
        />
        {editing ? null : (
          <div className="mt-3.5 flex items-center gap-2 border-t border-black/[0.05] pt-3 text-[11.5px] font-medium text-[#9A97A6]">
            {post ? <span className={body.length > 280 ? "text-[#B4261E]" : ""}>{body.length} characters</span> : <span>{words(body)} words</span>}
            <span className="ml-auto opacity-0 transition-opacity group-hover/card:opacity-100">Double-click to edit</span>
            <CopyButton text={[p.title, body].filter(Boolean).join("\n\n")} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A routine (convex/routines.ts): what an agent does on a schedule, and when it
 * runs next. Each run's work lands beside it. The team can pause it, run it now
 * or delete it here.
 */
function RoutineCard({ item, measure, onMeasure }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const report = React.useCallback((w: number, h: number) => onMeasure(item.id, w, h), [onMeasure, item.id]);
  useMeasure(ref, measure, report);
  const p = item.props;
  const { boardId } = useBoardInfo();
  const routineId = p.routineId as Id<"routines">;
  const setEnabled = useMutation(api.routines.setEnabled);
  const runNow = useMutation(api.routines.runNow);
  const remove = useMutation(api.routines.remove);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const act = (what: string, f: () => Promise<unknown>, ok?: string) => {
    setBusy(what);
    f().then(
      () => {
        setBusy(null);
        if (ok) toast.success(ok);
      },
      (e: unknown) => {
        setBusy(null);
        toast.error(e instanceof ConvexError ? String(e.data) : "Couldn't do that");
      },
    );
  };
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();
  const on = !!p.enabled;
  const button = "flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold ring-1 ring-black/[0.08] transition-colors hover:bg-black/[0.04] disabled:opacity-50";
  return (
    <div
      ref={ref}
      data-item-id={item.id}
      style={place(item, { minHeight: item.h, ["--agent" as string]: p.color })}
      className="flex flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_0_0_1px_rgba(22,21,26,0.06),0_2px_4px_-2px_rgba(22,21,26,0.08),0_22px_44px_-22px_rgba(22,21,26,0.4)]"
    >
      <div className="flex items-center gap-2 px-5 pt-4 pb-3.5" style={{ background: `linear-gradient(180deg, ${p.color}1F, ${p.color}08)` }}>
        <AgentByline mark={p} />
        <span className={`ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em] ${on ? "bg-[#E3F8EA] text-[#0E8A47]" : "bg-white/80 text-[#55525F] ring-1 ring-black/[0.05]"}`}>
          <Repeat className="size-3" />
          {on ? "Routine" : "Paused"}
        </span>
      </div>
      <div className="flex flex-1 flex-col px-5 pt-3.5 pb-4">
        <p className="text-[19px] leading-[1.25] font-bold tracking-[-0.02em] text-[#16151A]">{p.title}</p>
        <p className="mt-0.5 text-[12px] text-[#9A97A6]">{p.tz}</p>
        <p className="mt-2.5 rounded-2xl bg-[#F7F7FA] px-4 py-3 text-[14.5px] leading-[1.5] whitespace-pre-wrap text-[#2C2B33] ring-1 ring-black/[0.04]">{p.body}</p>
        <p className="mt-3 text-[12.5px] font-medium text-[#55525F]">{on ? (p.next ? `Next run: ${p.next}` : "Running") : (p.note ?? "Paused")}</p>
        <div className="mt-3 flex items-center gap-1.5 border-t border-black/[0.05] pt-3" onPointerDown={stop} onDoubleClick={stop}>
          <button type="button" disabled={!!busy} onClick={() => act("run", () => runNow({ boardId, routineId }), `${p.agentName} is on it`)} className={button}>
            {busy === "run" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Run now
          </button>
          <button type="button" disabled={!!busy} onClick={() => act("toggle", () => setEnabled({ boardId, routineId, enabled: !on }))} className={button}>
            {busy === "toggle" ? <LoaderCircle className="size-3.5 animate-spin" /> : on ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {on ? "Pause" : "Resume"}
          </button>
          {confirm ? (
            <span className="ml-auto flex items-center gap-1">
              <button type="button" disabled={!!busy} onClick={() => act("delete", () => remove({ boardId, routineId }), "Routine deleted")} className="flex h-8 items-center gap-1 rounded-full bg-[#E5484D] px-3 text-[12.5px] font-semibold text-white hover:bg-[#D93D42]">
                {busy === "delete" ? <LoaderCircle className="size-3.5 animate-spin" /> : null} Delete
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="h-8 rounded-full px-2.5 text-[12.5px] font-semibold text-[#55525F] hover:bg-black/[0.04]">
                Keep
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="ml-auto flex size-8 items-center justify-center rounded-full text-[#9A97A6] hover:bg-[#FFF0F0] hover:text-[#E5484D]" aria-label="Delete routine">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = React.useState(false);
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();
  return (
    <button
      type="button"
      onPointerDown={stop}
      onDoubleClick={stop}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        });
      }}
      className="flex h-7 items-center gap-1 rounded-full px-2.5 font-semibold text-[#55525F] ring-1 ring-black/[0.08] transition-colors hover:bg-black/[0.04]"
    >
      {done ? <Check className="size-3.5 text-[#0E8A47]" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * An agent's writing, formatted: headings, lists, quotes, bold, code and links
 * (the bits of Markdown they use). Anything else stays plain text.
 */
function Prose({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  const LIST = /^([-*•]|\d+[.)])\s+/;
  const RULE = /^(-{3,}|\*{3,}|_{3,})$/;
  const HEAD = /^(#{1,4})\s+(.*)$/;
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) {
      i++;
      continue;
    }
    const h = HEAD.exec(t);
    if (h) {
      blocks.push(
        <p key={i} className={`${h[1].length <= 2 ? "text-[17px]" : "text-[15.5px]"} mt-4 mb-1 leading-snug font-bold tracking-[-0.015em] text-[#16151A] first:mt-0`}>
          {inline(h[2])}
        </p>,
      );
      i++;
      continue;
    }
    if (RULE.test(t)) {
      blocks.push(<hr key={i} className="my-3 border-black/[0.07]" />);
      i++;
      continue;
    }
    if (LIST.test(t)) {
      const ordered = /^\d/.test(t);
      const items: string[] = [];
      while (i < lines.length && LIST.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(LIST, ""));
        i++;
        // A wrapped item's next lines (indented, not a new item).
        while (i < lines.length && lines[i].trim() && /^\s{2,}/.test(lines[i]) && !LIST.test(lines[i].trim())) items[items.length - 1] += " " + lines[i++].trim();
      }
      blocks.push(
        <ul key={i} className="my-2 space-y-1.5 first:mt-0 last:mb-0">
          {items.map((it, n) => (
            <li key={n} className="flex gap-2.5">
              {ordered ? (
                <span className="mt-[2px] flex size-[20px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: "var(--agent, #6F6C7A)" }}>
                  {n + 1}
                </span>
              ) : (
                <span className="mt-[0.6em] size-[6px] shrink-0 rounded-full" style={{ background: "var(--agent, #6F6C7A)" }} />
              )}
              <span className="min-w-0 flex-1">{inline(it)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }
    if (t.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) quote.push(lines[i++].trim().replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={i} className="my-2 border-l-[3px] pl-3 text-[#55525F] italic first:mt-0" style={{ borderColor: "var(--agent, #D0CFD6)" }}>
          {inline(quote.join(" "))}
        </blockquote>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l || HEAD.test(l) || RULE.test(l) || LIST.test(l) || l.startsWith(">")) break;
      para.push(l);
      i++;
    }
    blocks.push(
      <p key={i} className="my-2 first:mt-0 last:mb-0">
        {para.map((l, n) => (
          <React.Fragment key={n}>
            {n ? <br /> : null}
            {inline(l)}
          </React.Fragment>
        ))}
      </p>,
    );
  }
  return <>{blocks}</>;
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+|\*[^*\s][^*]*\*)/g;

/** Bold, italics, code and links in a line. */
function inline(s: string): React.ReactNode[] {
  return s.split(INLINE).map((part, i) => {
    if (!part) return null;
    if (part.length > 4 && ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))))
      return (
        <strong key={i} className="font-semibold text-[#16151A]">
          {part.slice(2, -2)}
        </strong>
      );
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="rounded-md bg-black/[0.05] px-1.5 py-0.5 font-mono text-[0.86em]">
          {part.slice(1, -1)}
        </code>
      );
    const md = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    const href = md ? md[2] : /^https?:\/\//.test(part) ? part : null;
    if (href) {
      const label = md ? md[1] : part.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
      if (!/^https?:\/\//.test(href)) return <React.Fragment key={i}>{label}</React.Fragment>;
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer" onPointerDown={(e) => e.stopPropagation()} className="font-medium wrap-anywhere underline decoration-current/30 underline-offset-2 hover:decoration-current" style={{ color: "var(--agent, #0D8BE0)" }}>
          {label}
        </a>
      );
    }
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function AgentByline({ mark }: { mark: Item["props"] }) {
  const waiting = mark.ask?.status === "waiting";
  return (
    <div className="flex items-center gap-2">
      {waiting ? <span className="order-last ml-auto flex items-center gap-1 rounded-full bg-[#FFF4DB] px-2 py-0.5 text-[11px] font-semibold text-[#A86B00]"><span className="inline-block origin-bottom animate-hand">✋</span> Needs you</span> : null}
      <span className="flex size-6 items-center justify-center rounded-full" style={{ background: `${mark.color}2e` }}>
        <Pom color={mark.color} size={22} head />
      </span>
      <span className="text-[13px] font-semibold text-[#16151A]">{mark.agentName}</span>
      <span className="text-[12px] text-[#6F6C7A]">{mark.role}</span>
    </div>
  );
}

function Stamp({ item }: Props) {
  return (
    <div
      data-item-id={item.id}
      className="flex items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
      style={place(item, { height: item.h, fontSize: item.w * 0.6 })}
    >
      <span className="select-none">{item.props.emoji}</span>
    </div>
  );
}

/**
 * Text that turns editable in place, so it looks the same while typing. The
 * DOM holds the text while editing (no re-render per key, so the caret stays
 * put); every change is reported up.
 */
function EditableText({
  value,
  editing,
  onChange,
  onDone,
  placeholder,
  className = "",
  style,
  singleLine,
  typeFrom,
  focus = true,
  rich,
}: {
  value: string;
  editing: boolean;
  onChange: (text: string) => void;
  onDone: () => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  singleLine?: boolean;
  /** When an agent wrote it: if that was just now, it types itself out. */
  typeFrom?: number;
  /** Whether it takes the caret when editing starts (one field of several doesn't). */
  focus?: boolean;
  /** Shown formatted (an agent's Markdown); edited as plain text. */
  rich?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const shown = useTypewriter(value, typeFrom);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!editing || !el) return;
    el.innerText = value;
    if (!focus) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // Only when editing starts: afterwards the DOM is the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) {
    return (
      <div key="view" className={`wrap-anywhere ${rich && shown ? "" : "whitespace-pre-wrap"} ${className}`} style={style}>
        {shown && rich ? <Prose text={shown} /> : shown || (placeholder ? <span className="opacity-40">{placeholder}</span> : "​")}
        {shown.length < value.length ? <span className="ml-px inline-block h-[1em] w-[2px] translate-y-[2px] animate-blink bg-current opacity-60" /> : null}
      </div>
    );
  }
  return (
    <div
      key="edit"
      ref={ref}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      data-editing
      className={`cursor-text wrap-anywhere whitespace-pre-wrap outline-none ${className}`}
      style={style}
      onInput={(e) => onChange((e.currentTarget as HTMLDivElement).innerText.replace(/\n$/, ""))}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (singleLine && e.key === "Enter") || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          onDone();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => {
        // Moving to another field of the same item (a card's title and body) keeps editing.
        const next = e.relatedTarget as HTMLElement | null;
        if (next?.closest("[data-editing]") && next.closest("[data-item-id]") === e.currentTarget.closest("[data-item-id]")) return;
        onDone();
      }}
    />
  );
}

/** `text` typed out over a few seconds when `from` was just now (an agent writing), else all of it. */
function useTypewriter(text: string, from?: number) {
  const [start] = React.useState(() => (from && Date.now() - from < 15_000 ? Date.now() : 0));
  const [now, setNow] = React.useState(start);
  const perSecond = Math.max(45, text.length / 3.5);
  const done = !start || ((now - start) / 1000) * perSecond >= text.length;
  React.useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => setNow(Date.now()), 33);
    return () => window.clearInterval(id);
  }, [done]);
  return done ? text : text.slice(0, Math.floor(((now - start) / 1000) * perSecond));
}
