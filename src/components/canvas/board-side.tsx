"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowUpRight, Check, ChevronDown, ChevronUp, FileText, Hand, LoaderCircle, Mail, Megaphone, MessageCircleQuestion, Newspaper, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Post } from "@/convex/feed";
import { useBoardInfo } from "./board-context";
import { Prose } from "./item-view";
import { Pom } from "./pom";
import { Tip } from "./toolbar";

const card = "pointer-events-auto rounded-2xl bg-white shadow-[0_0_0_1px_rgba(22,21,26,0.07),0_12px_32px_-14px_rgba(22,21,26,0.28)]";
const stop = { "data-ui": "", onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(), onWheel: (e: React.WheelEvent) => e.stopPropagation() };

/** Remembered per board, in this browser. */
function useStored<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = React.useState<T>(initial);
  React.useEffect(() => {
    const s = window.localStorage.getItem(key) as T | null;
    // Read once on mount: the server render can't know it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s) setV(s);
  }, [key]);
  const set = React.useCallback(
    (next: T) => {
      setV(next);
      window.localStorage.setItem(key, next);
    },
    [key],
  );
  return [v, set];
}

type Feed = NonNullable<ReturnType<typeof useFeed>>;
const useFeed = (boardId: Id<"boards">) => useQuery(api.feed.list, { boardId });

/** What's waiting on the team: agents' raised hands and questions, newest first. */
function waiting(feed: Feed | undefined) {
  return (feed?.threads ?? []).flatMap((t) => t.filter((p) => p.ask?.status === "waiting" || p.questions));
}

/**
 * The board at a glance, top right: what's waiting on you (answer it right
 * here), who's working, and a short summary. It folds down to a pill; the
 * feed opens from it.
 */
export function BoardSide({ boardId, onGoTo }: { boardId: Id<"boards">; onGoTo: (id: string) => void }) {
  const feed = useFeed(boardId);
  const [mode, setMode] = useStored<"open" | "closed" | "feed">(`pompi:side:${boardId}`, "open");
  const needs = waiting(feed);

  if (mode === "feed") return <BoardFeed feed={feed} onClose={() => setMode("open")} onGoTo={onGoTo} />;

  if (mode === "closed") {
    return (
      <div className="pointer-events-none absolute top-[76px] right-3 z-30 flex gap-2" {...stop}>
        <button type="button" onClick={() => setMode("feed")} className={`${card} flex h-10 items-center gap-2 px-3.5 text-[13px] font-semibold text-ink-2 hover:text-ink`}>
          <Newspaper className="size-4" /> Feed
        </button>
        <button type="button" onClick={() => setMode("open")} className={`${card} flex h-10 items-center gap-2 pr-3 pl-3.5 text-[13px] font-semibold`}>
          Board
          {needs.length ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F24822] px-1.5 text-[11px] font-bold text-white">{needs.length}</span> : null}
          <ChevronDown className="size-4 text-muted" />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute top-[76px] right-3 bottom-24 z-30 flex w-[330px] flex-col items-end" {...stop}>
      <div className={`${card} flex max-h-full w-full flex-col overflow-hidden`}>
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
          <h2 className="text-[14.5px] font-bold tracking-[-0.015em]">This board</h2>
          <div className="ml-auto flex items-center gap-0.5">
            <button type="button" onClick={() => setMode("feed")} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-ink-2 hover:bg-black/[0.05] hover:text-ink">
              <Newspaper className="size-4" /> Feed
            </button>
            <Tip label="Fold up" side="bottom">
              <button type="button" onClick={() => setMode("closed")} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-black/[0.05] hover:text-ink" aria-label="Fold up">
                <ChevronUp className="size-4" />
              </button>
            </Tip>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
          {needs.length ? (
            <Section title="Needs you" count={needs.length} tone="alert">
              {needs.map((p) => (
                <Waiting key={p.id} post={p} onGoTo={onGoTo} />
              ))}
            </Section>
          ) : null}
          <Working onGoTo={onGoTo} />
          <Summary boardId={boardId} feed={feed} />
        </div>
      </div>
    </div>
  );
}

function Section({ title, count, tone, action, children }: { title: string; count?: number; tone?: "alert"; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="px-2 pt-2 pb-1">
      <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
        <h3 className="text-[11.5px] font-bold tracking-[0.04em] text-muted uppercase">{title}</h3>
        {count ? <span className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${tone === "alert" ? "bg-[#F24822] text-white" : "bg-black/[0.06] text-muted"}`}>{count}</span> : null}
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}

/** One thing waiting on the team, answerable here. */
function Waiting({ post, onGoTo }: { post: Post; onGoTo: (id: string) => void }) {
  const { answerAsk } = useBoardInfo();
  const color = post.color ?? "#7B4DFF";
  const connect = post.ask?.apps ?? [];
  return (
    <div className="mb-1.5 rounded-xl bg-[#FFF6F2] p-3 ring-1 ring-[#F24822]/15">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full" style={{ background: `${color}22` }}>
          <Pom color={color} size={22} head />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-muted">
            <span style={{ color }}>{post.who}</span> {post.questions ? "has questions" : connect.length ? "needs an app" : "asks"}
          </p>
          <p className="mt-0.5 line-clamp-3 text-[13px] leading-snug font-medium text-ink">{post.questions ? post.text : (post.ask?.action ?? post.text)}</p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-[38px]">
        {post.questions ? (
          <button type="button" onClick={() => onGoTo(post.id)} className="flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[12.5px] font-semibold text-white hover:bg-black">
            <MessageCircleQuestion className="size-3.5" /> Answer
          </button>
        ) : (
          <>
            {connect.map((a) => (
              <a key={a.tool} href={a.url} target="_blank" rel="noopener noreferrer" className="flex h-8 items-center gap-1 rounded-full bg-white px-3 text-[12.5px] font-semibold ring-1 ring-black/10 hover:bg-black/[0.03]">
                Connect {a.name} <ArrowUpRight className="size-3.5 text-muted" />
              </a>
            ))}
            <button type="button" onClick={() => answerAsk(post.id, true)} className="flex h-8 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold text-white hover:opacity-90" style={{ background: color }}>
              <Check className="size-3.5" /> {connect.length ? "Done" : "Go ahead"}
            </button>
            <button type="button" onClick={() => answerAsk(post.id, false)} className="flex h-8 items-center rounded-full px-3 text-[12.5px] font-semibold text-ink-2 ring-1 ring-black/10 hover:bg-black/[0.04]">
              Not now
            </button>
          </>
        )}
        <button type="button" onClick={() => onGoTo(post.id)} className="ml-auto flex h-8 items-center rounded-full px-2 text-[12px] font-semibold text-muted hover:text-ink">
          Show
        </button>
      </div>
    </div>
  );
}

/** Agents at work right now, and what they're doing. */
function Working({ onGoTo }: { onGoTo: (id: string) => void }) {
  const { boardId, agents } = useBoardInfo();
  const activity = useQuery(api.brain.activity, { boardId });
  const busy = (activity?.going ?? [])
    .map((g) => ({ g, agent: agents.find((a) => a._id === g.agentId), state: activity?.states.find((s) => s.agentId === g.agentId) }))
    .filter((x) => x.agent);
  if (!busy.length) return null;
  return (
    <Section title="Working now">
      {busy.map(({ g, agent, state }) => (
        <button key={g._id} type="button" onClick={() => onGoTo(g.itemId)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-black/[0.04]">
          <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full" style={{ background: `${agent!.color}22` }}>
            <Pom color={agent!.color} size={22} head />
            <span className="absolute -right-0.5 -bottom-0.5 size-2.5 animate-pulse rounded-full border-2 border-white bg-[#14AE5C]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px]">
            <span className="font-semibold">{agent!.name}</span> <span className="text-muted">{state?.doing ?? "Working"}</span>
          </span>
        </button>
      ))}
    </Section>
  );
}

function Summary({ boardId, feed }: { boardId: Id<"boards">; feed: Feed | undefined }) {
  const summarize = useMutation(api.feed.summarize);
  const s = feed?.summary;
  const run = () => void summarize({ boardId }).catch((e: unknown) => toast.error(e instanceof ConvexError ? String(e.data) : "Couldn't summarize the board"));
  const c = feed?.counts;
  const empty = c && !c.notes && !c.replies && !c.cards;
  return (
    <Section
      title="Summary"
      action={
        s && !empty ? (
          <Tip label="Write it again" side="bottom">
            <button type="button" disabled={s.busy} onClick={run} className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-black/[0.05] hover:text-ink disabled:opacity-50" aria-label="Refresh the summary">
              <RefreshCw className={`size-3.5 ${s.busy ? "animate-spin" : ""}`} />
            </button>
          </Tip>
        ) : null
      }
    >
      <div className="rounded-xl bg-[#F7F6FA] px-3 py-2.5">
        {empty ? (
          <p className="text-[12.5px] text-muted">Nothing here yet. Write something and your agents will pick it up.</p>
        ) : s?.points.length ? (
          <ul className="space-y-1.5">
            {s.points.map((p, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug text-ink-2">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-2/50" />
                {p}
              </li>
            ))}
          </ul>
        ) : s?.busy ? (
          <p className="flex items-center gap-2 text-[12.5px] text-muted">
            <LoaderCircle className="size-3.5 animate-spin" /> Reading the board…
          </p>
        ) : (
          <button type="button" onClick={run} className="flex items-center gap-1.5 text-[13px] font-semibold text-ink hover:opacity-80">
            <Sparkles className="size-4 text-[#7B4DFF]" /> Summarize this board
          </button>
        )}
        {c && !empty ? (
          <p className="mt-2.5 border-t border-black/[0.06] pt-2 text-[11.5px] text-muted">
            {[plural(c.notes, "note"), plural(c.replies, "reply", "replies"), plural(c.cards, "card"), c.sections ? plural(c.sections, "section") : ""].filter(Boolean).join(" · ")}
            {s?.at && s.points.length ? ` · summary ${ago(s.at)}` : ""}
          </p>
        ) : null}
      </div>
    </Section>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ago(at: number) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ---------------- the feed ---------------- */

const FILTERS = [
  { id: "all", name: "All" },
  { id: "people", name: "People" },
  { id: "agents", name: "Agents" },
  { id: "work", name: "Work" },
  { id: "needs", name: "Needs you" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

/** Everything on the board, as a feed to scroll: each message with what it got, newest first. */
function BoardFeed({ feed, onClose, onGoTo }: { feed: Feed | undefined; onClose: () => void; onGoTo: (id: string) => void }) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [q, setQ] = React.useState("");
  const needs = waiting(feed).length;
  const words = q.trim().toLowerCase();
  const threads = (feed?.threads ?? [])
    .map((t) => {
      const keep = (p: Post) =>
        (filter === "all" ||
          (filter === "people" && !p.agent) ||
          (filter === "agents" && p.agent) ||
          (filter === "work" && p.kind === "card") ||
          (filter === "needs" && (p.ask?.status === "waiting" || !!p.questions))) &&
        (!words || `${p.who ?? ""} ${p.title ?? ""} ${p.text}`.toLowerCase().includes(words));
      // A thread shows whole when any of it matches, so a reply keeps what it answers.
      return t.some(keep) ? (filter === "all" && !words ? t : t.filter((p, i) => keep(p) || (i === 0 && filter !== "work"))) : [];
    })
    .filter((t) => t.length);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="pointer-events-none absolute top-[76px] right-3 bottom-20 z-30 flex w-[440px] max-w-[calc(100vw-24px)]" {...stop}>
      <div className={`${card} flex w-full animate-pop flex-col overflow-hidden`}>
        <div className="border-b border-line px-4 pt-3.5 pb-3">
          <div className="flex items-center gap-2">
            <Newspaper className="size-[18px]" />
            <h2 className="text-[15px] font-bold tracking-[-0.015em]">Feed</h2>
            <span className="text-[12px] text-muted">everything on the board, newest first</span>
            <button type="button" onClick={onClose} className="ml-auto flex size-8 items-center justify-center rounded-lg text-muted hover:bg-black/[0.05] hover:text-ink" aria-label="Close the feed">
              <X className="size-4" />
            </button>
          </div>
          <label className="mt-3 flex h-9 items-center gap-2 rounded-full bg-[#F4F3F7] px-3 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#0D99FF]/40">
            <Search className="size-4 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Search the board" className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted" />
            {q ? (
              <button type="button" onClick={() => setQ("")} className="text-muted hover:text-ink" aria-label="Clear">
                <X className="size-3.5" />
              </button>
            ) : null}
          </label>
          <div className="mt-2.5 flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold transition-colors ${filter === f.id ? "bg-ink text-white" : "text-ink-2 hover:bg-black/[0.05]"}`}
              >
                {f.name}
                {f.id === "needs" && needs ? <span className={`rounded-full px-1.5 text-[10.5px] font-bold ${filter === f.id ? "bg-white/20" : "bg-[#F24822] text-white"}`}>{needs}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
          {feed === undefined ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-black/[0.04]" />
              ))}
            </div>
          ) : threads.length ? (
            threads.map((t) => <Thread key={t[0].id} posts={t} onGoTo={onGoTo} />)
          ) : (
            <p className="px-6 py-16 text-center text-[13px] text-muted">{words || filter !== "all" ? "Nothing matches." : "Nothing on the board yet."}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** A message and what it got, as a thread: a line down from each avatar to the next. */
function Thread({ posts, onGoTo }: { posts: Post[]; onGoTo: (id: string) => void }) {
  return (
    <article className="border-b border-line px-4 pt-3.5 pb-1.5">
      {posts.map((p, i) => (
        <Entry key={p.id} post={p} last={i === posts.length - 1} onGoTo={onGoTo} />
      ))}
    </article>
  );
}

function Entry({ post: p, last, onGoTo }: { post: Post; last: boolean; onGoTo: (id: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const long = p.text.length > 280 || p.text.split("\n").length > 6;
  const color = p.color ?? colorFor(p.who ?? "?");
  const isCard = p.kind === "card";
  const Icon = p.type === "post" ? Megaphone : p.type === "email" ? Mail : FileText;
  return (
    <div className="group relative flex gap-3 pb-2.5">
      <div className="flex flex-col items-center">
        {p.agent ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: `${color}1F` }}>
            <Pom color={color} size={28} head />
          </span>
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white" style={{ background: color }}>
            {(p.who ?? "?").trim().charAt(0).toUpperCase() || "?"}
          </span>
        )}
        {!last ? <span className="mt-1 w-0.5 flex-1 rounded-full bg-line" /> : null}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-center gap-1.5 text-[13px]">
          <span className="truncate font-bold">{p.who ?? (p.agent ? "Agent" : "Someone")}</span>
          {p.agent ? <span className="rounded px-1 py-px text-[10px] font-bold tracking-wide uppercase" style={{ background: `${color}1F`, color }}>Agent</span> : null}
          <span className="shrink-0 text-muted">· {ago(p.at)}</span>
          <button
            type="button"
            onClick={() => onGoTo(p.id)}
            className="ml-auto flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11.5px] font-semibold text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/[0.05] hover:text-ink focus:opacity-100"
          >
            Show on board <ArrowUpRight className="size-3" />
          </button>
        </div>
        {isCard ? (
          <button type="button" onClick={() => onGoTo(p.id)} className="mt-1.5 block w-full overflow-hidden rounded-xl text-left ring-1 ring-line transition-colors hover:bg-black/[0.015]">
            <div className="flex items-center gap-1.5 border-b border-line bg-[#FAFAFC] px-3 py-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
              <Icon className="size-3.5" /> {p.type === "post" ? "Post" : p.type === "email" ? "Email" : p.type === "routine" ? "Routine" : "Note"}
            </div>
            <div className="px-3 py-2.5">
              {p.title ? <p className="text-[14px] font-bold tracking-[-0.01em]">{p.title}</p> : null}
              <div className={`mt-1 text-[13px] leading-relaxed text-ink-2 ${open ? "" : "line-clamp-4"}`}>
                <Prose text={p.text} />
              </div>
            </div>
          </button>
        ) : (
          <div className={`mt-0.5 text-[14px] leading-[1.45] break-words ${p.failed ? "text-[#B42318]" : "text-ink"} ${open || !long ? "" : "line-clamp-6"}`}>
            {p.agent ? <Prose text={p.text} /> : <p className="whitespace-pre-wrap">{p.text}</p>}
          </div>
        )}
        {long || (isCard && p.text.length > 200) ? (
          <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-[12.5px] font-semibold text-[#0D8BE0] hover:underline">
            {open ? "Show less" : "Show more"}
          </button>
        ) : null}
        {p.ask?.status === "waiting" || p.questions ? <WaitingChip post={p} onGoTo={onGoTo} /> : null}
      </div>
    </div>
  );
}

function WaitingChip({ post, onGoTo }: { post: Post; onGoTo: (id: string) => void }) {
  const { answerAsk } = useBoardInfo();
  if (post.questions)
    return (
      <button type="button" onClick={() => onGoTo(post.id)} className="mt-2 flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[12.5px] font-semibold text-white hover:bg-black">
        <MessageCircleQuestion className="size-3.5" /> Answer its questions
      </button>
    );
  return (
    <div className="mt-2 rounded-xl bg-[#FFF6F2] p-2.5 ring-1 ring-[#F24822]/15">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
        <Hand className="size-3.5 text-[#F24822]" /> {post.ask?.action}
      </p>
      <div className="mt-2 flex gap-1.5">
        <button type="button" onClick={() => answerAsk(post.id, true)} className="flex h-7 items-center gap-1 rounded-full px-3 text-[12px] font-semibold text-white hover:opacity-90" style={{ background: post.color ?? "#16151A" }}>
          <Check className="size-3.5" /> Go ahead
        </button>
        <button type="button" onClick={() => answerAsk(post.id, false)} className="flex h-7 items-center rounded-full px-3 text-[12px] font-semibold text-ink-2 ring-1 ring-black/10 hover:bg-black/[0.04]">
          Not now
        </button>
      </div>
    </div>
  );
}

const PEOPLE = ["#0D99FF", "#14AE5C", "#F24822", "#9747FF", "#FFA629", "#E8459C", "#0FA394"];
function colorFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PEOPLE[h % PEOPLE.length];
}
