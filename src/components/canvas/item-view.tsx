"use client";

import * as React from "react";
import { ArrowUpRight, Check, Mail, X } from "lucide-react";
import { ToolLogo } from "./agent-dialog";
import { useBoardInfo } from "./board-context";
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
  if (a.editing !== b.editing || a.measure !== b.measure || a.onText !== b.onText || a.onDone !== b.onDone || a.onMeasure !== b.onMeasure) return false;
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

function Sticky({ item, editing, measure, onText, onDone, onMeasure }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const report = React.useCallback((w: number, h: number) => onMeasure(item.id, w, h), [onMeasure, item.id]);
  useMeasure(ref, measure, report);
  const text: string = item.props.text ?? "";
  const fill = color(item.props.color).fill;
  const dark = item.props.color === "black";
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
      <EditableText
        value={text}
        editing={editing}
        onChange={(t) => onText(item.id, t)}
        onDone={onDone}
        placeholder="Write something…"
        className="flex-1 leading-[1.28] font-semibold tracking-[-0.01em]"
        style={{ fontSize: stickyFont(text) }}
      />
      {item.props.author ? <div className="mt-3 truncate text-[13px] font-medium opacity-50">{item.props.author}</div> : null}
    </div>
  );
}

/** Long notes get smaller text, as on FigJam, so they keep fitting the note. */
function stickyFont(text: string) {
  const n = text.length;
  return n <= 30 ? 26 : n <= 80 ? 22 : n <= 160 ? 18 : 15;
}

function TextItem({ item, editing, measure, onText, onDone, onMeasure }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const report = React.useCallback((w: number, h: number) => onMeasure(item.id, w, h), [onMeasure, item.id]);
  useMeasure(ref, measure, report);
  const size = TEXT_SIZES[(item.props.size as TextSize) ?? "m"] ?? 24;
  const fixed = !!item.props.fixedWidth;
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
      <EditableText value={item.props.text ?? ""} editing={editing} onChange={(t) => onText(item.id, t)} onDone={onDone} placeholder="Type something" />
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
        {p.ask ? <AskButtons itemId={item.id} ask={p.ask} color={p.color} /> : null}
        {p.handoffs?.length ? <Handoffs to={p.handoffs} /> : null}
      </div>
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
          <span className="flex size-[18px] items-center justify-center rounded-full bg-white text-[10px]">{a.emoji}</span>
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

/** Work an agent made: a post ready to publish, or a note. */
function Card({ item, editing, measure, onText, onDone, onMeasure }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const report = React.useCallback((w: number, h: number) => onMeasure(item.id, w, h), [onMeasure, item.id]);
  useMeasure(ref, measure, report);
  const p = item.props;
  const post = p.type === "post";
  const email = p.type === "email";
  // An email that came in, an agent's draft waiting for an OK, or one that went out.
  const label = email ? (p.sent ? "Sent" : p.draft ? "Draft" : "Email") : post ? "Post" : "Note";
  return (
    <div ref={ref} data-item-id={item.id} style={place(item, { minHeight: item.h })} className="group/card flex flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_0_0_1px_rgba(22,21,26,0.07),0_16px_36px_-18px_rgba(22,21,26,0.45)]">
      <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${p.color}, ${p.color}66)` }} />
      <div className="flex flex-1 flex-col px-5 pt-4 pb-5">
        <div className="flex items-center gap-2">
          <AgentByline mark={p} />
          <span className={`ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${p.sent ? "bg-[#E3F8EA] text-[#0E8A47]" : p.draft ? "bg-[#FFF4DB] text-[#A86B00]" : "bg-black/[0.045] text-[#6F6C7A]"}`}>
            {email ? <Mail className="size-3" /> : null}
            {label}
          </span>
        </div>
        {email ? (
          <p className="mt-3 truncate text-[12.5px] text-[#6F6C7A]">
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
            className={`${email ? "mt-1" : "mt-3"} text-[19px] leading-tight font-bold tracking-[-0.02em] text-[#16151A]`}
          />
        ) : null}
        <EditableText
          value={p.body ?? ""}
          editing={editing}
          onChange={(t) => onText(item.id, t)}
          onDone={onDone}
          placeholder="Write something"
          className={`mt-2 text-[15.5px] leading-[1.5] text-[#2C2B33] ${post ? "rounded-xl bg-[#FAFAFC] p-3.5 ring-1 ring-black/[0.05]" : ""}`}
          typeFrom={p.at}
        />
        {editing ? null : (
          <span className="pointer-events-none mt-3 -mb-2 self-end text-[11px] font-medium text-[#9A97A6] opacity-0 transition-opacity group-hover/card:opacity-100">Double-click to edit</span>
        )}
      </div>
    </div>
  );
}

function AgentByline({ mark }: { mark: Item["props"] }) {
  const waiting = mark.ask?.status === "waiting";
  return (
    <div className="flex items-center gap-2">
      {waiting ? <span className="order-last ml-auto flex items-center gap-1 rounded-full bg-[#FFF4DB] px-2 py-0.5 text-[11px] font-semibold text-[#A86B00]"><span className="inline-block origin-bottom animate-hand">✋</span> Needs you</span> : null}
      <span className="flex size-6 items-center justify-center rounded-full text-[12px]" style={{ background: mark.color }}>
        {mark.emoji}
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
      <div key="view" className={`wrap-anywhere whitespace-pre-wrap ${className}`} style={style}>
        {shown || (placeholder ? <span className="opacity-40">{placeholder}</span> : "​")}
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
