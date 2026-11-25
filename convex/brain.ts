import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { capture, track } from "./analytics";
import type { FunctionArgs } from "convex/server";
import { readLinks } from "./links";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx } from "./_generated/server";
import { hasOpenAI, judge, respondJson, SOL } from "./ai";
import { ensureOn } from "./computer";
import { SCREEN, runOnComputer, type Resume } from "./computerUse";
import { requireMember } from "./lib";
import { agentmail, parseAddress } from "./agentmail";
import { boardUser, hasComposio, toolkitOf } from "./composio";
import { hasOrgo } from "./orgo";
import { answerWithTools, type ToolResume, type ToolRun } from "./toolUse";

/**
 * How a board's agents answer what people write on it:
 *
 * 1. Someone finishes writing a text or sticky; the canvas calls `wrote`.
 * 2. `run` asks the judge who it's for (ai.ts). A note for people is left alone.
 * 3. That agent's cursor walks over to the text (agentStates), thinks, and
 *    writes its reply beside it, with any work (a post, a note) as cards next to it.
 *    Agents with apps use them on the way (toolUse.ts), and agents that need the
 *    computer go and work on it (onComputer).
 * 4. Part of the job that's a teammate's work is handed over: that agent walks
 *    over to it and does its part beside it (`handOff`).
 */

const MAX_TEXT = 2000;
const PER_MINUTE = 20;
/** How long the cursor takes to walk over; the canvas animates the move over about this long. */
const WALK_MS = 1100;
/** Hand-offs per answer, and how long a chain of them may get (Juno asks Dev, Dev asks Ivy, and that's it). */
const MAX_HANDOFFS = 3;
/** Someone pressed Stop: thrown at the agent's next step, and caught where its run started. */
class Stopped extends Error {}
const quietly = async (f: () => Promise<void>) => {
  try {
    await f();
  } catch (e) {
    if (!(e instanceof Stopped)) throw e;
  }
};
/** Built-in web search: research and reading pages, without the computer. */
const WEB = [{ type: "web_search" }];
const MAX_DEPTH = 2;

export const wrote = mutation({
  args: { boardId: v.id("boards"), itemId: v.string(), text: v.string() },
  handler: async (ctx, { boardId, itemId, text }) => {
    const me = await requireMember(ctx, boardId);
    const said = text.trim().slice(0, MAX_TEXT);
    if (said.length < 2) return null;
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .first();
    if (!agent) return null;
    // The same words on the same item were handled already (an edit that changed nothing).
    const last = await ctx.db
      .query("requests")
      .withIndex("by_item", (q) => q.eq("boardId", boardId).eq("itemId", itemId))
      .order("desc")
      .first();
    if (last && last.text === said) return null;
    const recent = await ctx.db
      .query("requests")
      .withIndex("by_board", (q) => q.eq("boardId", boardId).gt("updatedAt", Date.now() - 60_000))
      .take(PER_MINUTE + 1);
    if (recent.length > PER_MINUTE) throw new ConvexError("Your agents are busy. Give them a moment.");
    const requestId = await ctx.db.insert("requests", { boardId, itemId, text: said, by: me.userId, byName: me.name, status: "routing", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.brain.run, { requestId });
    return requestId;
  },
});

/** What the agents are up to: their cursors, and the requests still going. */
export const activity = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    await requireMember(ctx, boardId);
    const states = await ctx.db
      .query("agentStates")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    const going = (
      await ctx.db
        .query("requests")
        .withIndex("by_board", (q) => q.eq("boardId", boardId).gt("updatedAt", Date.now() - 10 * 60_000))
        .order("desc")
        .take(50)
    ).filter((r) => r.status === "routing" || r.status === "working");
    return {
      states: states.map(({ agentId, x, y, status, doing, updatedAt }) => ({ agentId, x, y, status, doing, updatedAt })),
      going: going.map(({ _id, itemId, status, agentId }) => ({ _id, itemId, status, agentId })),
      ai: hasOpenAI(),
    };
  },
});

/**
 * Stop an agent's work on a request. The run checks at each step (walking, an
 * app call, a click on the computer), so it stops at the next one, frees the
 * computer and goes idle.
 */
export const stop = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) return;
    const me = await requireMember(ctx, request.boardId);
    if (request.status !== "routing" && request.status !== "working") return;
    await ctx.db.patch(requestId, { status: "stopped", note: `Stopped by ${me.name}`, updatedAt: Date.now() });
    await track(ctx, "agent_stopped", me.userId, { boardId: request.boardId });
    if (request.agentId) {
      const state = await ctx.db
        .query("agentStates")
        .withIndex("by_agent", (q) => q.eq("agentId", request.agentId!))
        .unique();
      if (state) await ctx.db.patch(state._id, { status: "idle", doing: undefined, updatedAt: Date.now() });
    }
  },
});

/* ---------------- the run ---------------- */

type Context = {
  request: Doc<"requests">;
  item: Doc<"items"> | null;
  agents: Doc<"agents">[];
  nearby: string;
  /** What the request points at (or sits next to), in full. */
  focus: string;
  states: Doc<"agentStates">[];
  /** Who pays for the board's agents (and whose analytics their work counts toward). */
  ownerId: string;
};

export const context = internalQuery({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }): Promise<Context | null> => {
    const request = await ctx.db.get(requestId);
    if (!request) return null;
    const item = await ctx.db
      .query("items")
      .withIndex("by_board_cid", (q) => q.eq("boardId", request.boardId).eq("cid", request.itemId))
      .unique();
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_board", (q) => q.eq("boardId", request.boardId))
      .collect();
    const states = await ctx.db
      .query("agentStates")
      .withIndex("by_board", (q) => q.eq("boardId", request.boardId))
      .collect();
    const all = await ctx.db
      .query("items")
      .withIndex("by_board", (q) => q.eq("boardId", request.boardId))
      .collect();
    // What's written near it, closest first: the context a person standing there would see.
    const cx = item ? item.x + item.w / 2 : 0;
    const cy = item ? item.y + item.h / 2 : 0;
    const nearby = all
      .filter((it) => it.cid !== request.itemId)
      .map((it) => ({ it, words: describe(it), d: Math.hypot(it.x + it.w / 2 - cx, it.y + it.h / 2 - cy) }))
      .filter((x) => x.words)
      .sort((a, b) => a.d - b.d)
      .slice(0, 40)
      .map((x) => `- ${x.words}`)
      .join("\n");
    // What it points at (joined by an arrow or line), or else the closest writing: in full, as they wrote it, for "improve this", "rewrite it".
    const joined = new Set(all.filter((it) => it.kind === "connector").flatMap((it) => (it.props?.from?.id === request.itemId ? [it.props?.to?.id] : it.props?.to?.id === request.itemId ? [it.props?.from?.id] : [])));
    const closest = all
      .filter((it) => it.cid !== request.itemId && it.kind !== "connector" && it.kind !== "reply" && describe(it))
      .sort((a, b) => Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) - Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy));
    const pointed = closest.filter((it) => joined.has(it.cid));
    const focus = (pointed.length ? pointed : closest.slice(0, 1))
      .slice(0, 4)
      .map((it) => describe(it, 8000))
      .join("\n\n");
    const ownerId = (await ctx.db.get(request.boardId))?.ownerId ?? "";
    return { request, item, agents, nearby, focus, states, ownerId };
  },
});

function describe(it: Doc<"items">, max = 280): string {
  const p = it.props ?? {};
  const t = (s: unknown) => (max > 280 ? String(s ?? "").trim() : String(s ?? "").trim().replace(/\s+/g, " ")).slice(0, max);
  switch (it.kind) {
    case "sticky":
      return t(p.text) ? `Sticky${p.author ? ` by ${p.author}` : ""}: ${t(p.text)}` : "";
    case "text":
      return t(p.text) ? `Text: ${t(p.text)}` : "";
    case "section":
      return t(p.title) ? `Section titled "${t(p.title)}"` : "";
    case "shape":
      return t(p.text) ? `Shape: ${t(p.text)}` : "";
    case "reply":
      return t(p.text) ? `${p.agentName ?? "An agent"} replied: ${t(p.text)}` : "";
    case "card":
      return `${p.agentName ?? "An agent"}'s ${p.type ?? "card"} "${t(p.title)}": ${t(p.body)}`;
    default:
      return "";
  }
}

export const setRequest = internalMutation({
  args: { requestId: v.id("requests"), status: v.union(v.literal("working"), v.literal("done"), v.literal("ignored"), v.literal("failed")), agentId: v.optional(v.id("agents")), note: v.optional(v.string()) },
  handler: async (ctx, { requestId, ...patch }) => {
    const request = await ctx.db.get(requestId);
    if (!request || request.status === "stopped") return;
    await ctx.db.patch(requestId, { ...patch, updatedAt: Date.now() });
  },
});

export const setAgent = internalMutation({
  args: {
    boardId: v.id("boards"),
    agentId: v.id("agents"),
    x: v.number(),
    y: v.number(),
    status: v.union(v.literal("idle"), v.literal("walking"), v.literal("thinking"), v.literal("writing")),
    doing: v.optional(v.string()),
    /** The request it's working on: if that's been stopped, nothing moves and it says so. */
    requestId: v.optional(v.id("requests")),
  },
  handler: async (ctx, { boardId, agentId, requestId, ...rest }): Promise<"stopped" | undefined> => {
    const stopped = !!requestId && rest.status !== "idle" && (await ctx.db.get(requestId))?.status === "stopped";
    // Stopped: it stays where it is, idle.
    const row = stopped ? { status: "idle" as const, doing: undefined, updatedAt: Date.now() } : { ...rest, x: Math.round(rest.x), y: Math.round(rest.y), updatedAt: Date.now() };
    const existing = await ctx.db
      .query("agentStates")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, row);
    else if (!stopped) await ctx.db.insert("agentStates", { boardId, agentId, ...rest, x: Math.round(rest.x), y: Math.round(rest.y), updatedAt: Date.now() });
    if (stopped) return "stopped";
  },
});

type Card = { type: "post" | "note"; title: string; body: string };
type Box = { x: number; y: number; w: number; h: number };

/** What an agent is asking the user's OK for, kept on its reply until they answer. */
const askV = v.object({
  action: v.string(),
  goal: v.string(),
  status: v.union(v.literal("waiting"), v.literal("approved"), v.literal("declined")),
  responseId: v.string(),
  callId: v.optional(v.string()),
  checks: v.optional(v.array(v.object({ id: v.string(), code: v.optional(v.union(v.string(), v.null())), message: v.optional(v.union(v.string(), v.null())) }))),
  /** What's paused: work on the computer (the default), or with the agent's apps. */
  kind: v.optional(v.union(v.literal("computer"), v.literal("tools"), v.literal("email"))),
  sessionId: v.optional(v.string()),
  /** The app actions waiting for the OK, as the model asked for them. */
  pending: v.optional(v.string()),
  /** Apps to connect first, each with its Composio link. */
  apps: v.optional(v.array(v.object({ tool: v.string(), name: v.string(), url: v.string() }))),
});

/**
 * Puts an agent's reply on the board, under `anchor` (an item's id; else what
 * the request was written on), and its cards beside it: in reading order down
 * a column or a few (so lots of work stays a block, not a tower), in the
 * nearest clear space. Returns the reply's id and box; with `defer`, the cards
 * come back unplaced in `later`, for the agent to put down one by one (land).
 */
export const place = internalMutation({
  args: {
    requestId: v.id("requests"),
    agentId: v.id("agents"),
    reply: v.string(),
    cards: v.array(v.object({ type: v.union(v.literal("post"), v.literal("note")), title: v.string(), body: v.string() })),
    failed: v.optional(v.boolean()),
    anchor: v.optional(v.string()),
    ask: v.optional(askV),
    /** An email the agent drafted: a card beside the reply, sent once the team OKs it on the reply. */
    email: v.optional(v.object({ to: v.string(), subject: v.string(), text: v.string(), replyTo: v.optional(v.string()) })),
    defer: v.optional(v.boolean()),
    /** Questions for the team to answer on the reply before the work. */
    questions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { requestId, agentId, reply, cards, failed, anchor, ask: asked, email, defer, questions }) => {
    const request = await ctx.db.get(requestId);
    const agent = await ctx.db.get(agentId);
    if (!request || !agent) return null;
    const boardId = request.boardId;
    const all = await ctx.db
      .query("items")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    const item = all.find((it) => it.cid === (anchor ?? request.itemId)) ?? all.find((it) => it.cid === request.itemId);
    const blocks = blocking(all);
    let z = Math.max(0, ...all.map((it) => it.z)) + 1;
    const now = Date.now();
    const who = { agentId, agentName: agent.name, role: agent.role, color: agent.color, emoji: agent.emoji, requestId, at: now };
    const draftCid = email ? crypto.randomUUID() : undefined;
    const ask = asked ?? (email && draftCid ? { kind: "email" as const, action: `Send this email to ${email.to}?`, goal: "", status: "waiting" as const, responseId: "", pending: JSON.stringify({ card: draftCid, to: email.to, subject: email.subject, replyTo: email.replyTo }) } : undefined);

    const base = item ?? { x: 0, y: 0, w: 320, h: 40 };
    const replySize = { w: questions?.length ? 400 : 360, h: 74 + Math.ceil(reply.length / 42) * 22 + (ask ? 64 : 0) + (questions?.length ? 70 + questions.reduce((h, q) => h + Math.ceil(q.length / 44) * 21 + 58, 0) : 0) };
    const replyAt = nearestFree(blocks, { x: base.x, y: base.y + base.h + 18, ...replySize });
    const cid = crypto.randomUUID();
    await ctx.db.insert("items", { boardId, cid, kind: "reply", ...replyAt, ...replySize, z: z++, props: { ...who, text: reply, failed: !!failed, ...(ask ? { ask } : {}), ...(questions?.length ? { questions: questions.map((q) => ({ q, a: "" })), answered: false } : {}) }, createdBy: `agent:${agentId}`, updatedBy: `agent:${agentId}`, updatedAt: now });
    blocks.push({ ...replyAt, ...replySize });

    const work: { cid: string; w: number; h: number; props: Record<string, unknown> }[] = [];
    if (email && draftCid) work.push({ cid: draftCid, w: CARD_W, h: 170 + Math.ceil(email.text.length / 48) * 21, props: { ...who, type: "email", draft: true, to: email.to, title: email.subject || "(no subject)", body: email.text.slice(0, 6000) } });
    for (const c of cards.slice(0, 8) as Card[]) {
      work.push({ cid: crypto.randomUUID(), w: CARD_W, h: (c.type === "post" ? 176 : 150) + (c.title ? Math.ceil(c.title.length / 30) * 26 : 0) + textHeight(c.body, 44, 24), props: { ...who, type: c.type, title: c.title.slice(0, 120), body: c.body.slice(0, 6000) } });
    }
    const later: Doc<"items">[] = [];
    if (work.length) {
      // Columns of about even height, filled in order, so the work reads top to bottom, left to right.
      const total = work.reduce((h, it) => h + it.h + CARD_GAP, 0);
      const cols = Math.min(work.length, Math.max(1, Math.ceil(total / 1300)), 3);
      const target = total / cols;
      const rel: { x: number; y: number }[] = [];
      let col = 0;
      let y = 0;
      let tallest = 0;
      for (const it of work) {
        if (y > 0 && y + it.h / 2 > target && col < cols - 1) {
          col++;
          y = 0;
        }
        rel.push({ x: col * (CARD_W + CARD_GAP), y });
        y += it.h + CARD_GAP;
        tallest = Math.max(tallest, y - CARD_GAP);
      }
      const cluster = { w: cols * CARD_W + (cols - 1) * CARD_GAP, h: tallest };
      const origin = nearestFree(blocks, { x: Math.max(base.x + base.w, replyAt.x + replySize.w) + 48, y: Math.min(base.y, replyAt.y), ...cluster });
      work.forEach((it, i) => {
        const doc = { boardId, cid: it.cid, kind: "card" as const, x: origin.x + rel[i].x, y: origin.y + rel[i].y, w: it.w, h: it.h, z: z++, props: it.props, createdBy: `agent:${agentId}`, updatedBy: `agent:${agentId}`, updatedAt: now };
        later.push(doc as Doc<"items">);
      });
      if (!defer) for (const doc of later) await ctx.db.insert("items", doc);
    }
    await ctx.db.patch(boardId, { updatedAt: now });
    return { cid, ...replyAt, ...replySize, later: defer ? later : [] };
  },
});

/** About how tall `text` draws: each line wrapped at `perLine` characters, plus the gaps between paragraphs. */
function textHeight(text: string, perLine: number, lineH: number) {
  const lines = text.split("\n");
  return lines.reduce((h, l) => h + (l.trim() ? Math.ceil(l.length / perLine) * lineH : lineH / 2), 0);
}

/** What's in the way of a new item. Sections are where things go, so only their title bars block. */
function blocking(all: Doc<"items">[]): Box[] {
  return all
    .filter((it) => it.kind !== "connector")
    .map((it) => (it.kind === "section" ? { x: it.x, y: it.y - 44, w: Math.min(it.w, 260), h: 40 } : { x: it.x, y: it.y, w: it.w, h: it.h }));
}

const overlaps = (a: Box, b: Box, gap = 12) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

const CARD_W = 400;
const CARD_GAP = 24;

/** One of an agent's cards, put down where place() planned it. */
export const putItem = internalMutation({
  args: { item: v.any() },
  handler: async (ctx, { item }) => {
    const doc = item as Omit<Doc<"items">, "_id" | "_creationTime">;
    await ctx.db.insert("items", { ...doc, updatedAt: Date.now() });
    await ctx.db.patch(doc.boardId, { updatedAt: Date.now() });
  },
});

/**
 * The clear spot nearest `want`, as a person would pick one: looking outward
 * ring by ring, rather to the right and below than to the left and above.
 */
function nearestFree(blocks: Box[], want: Box): { x: number; y: number } {
  const clear = (x: number, y: number) => !blocks.some((b) => overlaps({ ...want, x, y }, b));
  if (clear(want.x, want.y)) return { x: Math.round(want.x), y: Math.round(want.y) };
  const step = 40;
  for (let r = 1; r <= 50; r++) {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let i = -r; i <= r; i++) {
      for (const [dx, dy] of [
        [i, -r],
        [i, r],
        [-r, i],
        [r, i],
      ]) {
        const d = Math.hypot(dx * (dx < 0 ? 1.8 : 1), dy * (dy < 0 ? 1.4 : 1));
        if (d >= bestD) continue;
        const x = want.x + dx * step;
        const y = want.y + dy * step;
        if (clear(x, y)) {
          best = { x, y };
          bestD = d;
        }
      }
    }
    if (best) return { x: Math.round(best.x), y: Math.round(best.y) };
  }
  return freeSpot(blocks, want);
}

/** The first spot at or below `want` that overlaps nothing. */
function freeSpot(blocks: Box[], want: Box): { x: number; y: number } {
  let y = want.y;
  for (let i = 0; i < 80; i++) {
    const hit = blocks.find((b) => overlaps({ ...want, y }, b));
    if (!hit) return { x: Math.round(want.x), y: Math.round(y) };
    y = hit.y + hit.h + 16;
  }
  return { x: Math.round(want.x), y: Math.round(y) };
}

/** The computer's screen frame on the board, so everyone can watch: the one there, else a new one beside `near`. */
export const ensureScreen = internalMutation({
  args: { boardId: v.id("boards"), near: v.string() },
  handler: async (ctx, { boardId, near }) => {
    const all = await ctx.db
      .query("items")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    const existing = all.find((it) => it.kind === "screen");
    if (existing) return { x: existing.x, y: existing.y, w: existing.w, h: existing.h };
    const n = all.find((it) => it.cid === near);
    const size = { w: SCREEN_W, h: SCREEN_H };
    // To the right of what's around the request, clear of everything.
    const right = Math.max(...all.filter((it) => n && Math.abs(it.y - n.y) < 700 && it.kind !== "section" && it.kind !== "connector").map((it) => it.x + it.w), n ? n.x + n.w : 0);
    const at = freeSpot(blocking(all), { x: right + 80, y: n ? n.y - 40 : 0, ...size });
    await ctx.db.insert("items", { boardId, cid: crypto.randomUUID(), kind: "screen", ...at, ...size, z: Math.max(0, ...all.map((it) => it.z)) + 1, props: {}, createdBy: "pompi", updatedBy: "pompi", updatedAt: Date.now() });
    return { ...at, ...size };
  },
});

/** The screen frame's size on the board: a header, then the computer's 1280×720 screen at half size. */
const SCREEN_HEADER = 40;
const SCREEN_W = SCREEN.w / 2;
const SCREEN_H = SCREEN.h / 2 + SCREEN_HEADER;
/**
 * A point on the computer's screen, on the board: the frame shows the screen at its
 * own shape, as big as fits under the header and centred (src/components/canvas/screen-item.tsx).
 */
const onFrame = (f: Box, p: { x: number; y: number }) => {
  const bodyH = f.h - SCREEN_HEADER;
  const w = Math.min(f.w, (bodyH * SCREEN.w) / SCREEN.h);
  const h = (w * SCREEN.h) / SCREEN.w;
  return { x: f.x + (f.w - w) / 2 + (p.x / SCREEN.w) * w, y: f.y + SCREEN_HEADER + (bodyH - h) / 2 + (p.y / SCREEN.h) * h };
};

/**
 * Someone answered an agent's questions on its reply (or said to go ahead
 * without): the same agent takes the job again, with what they asked first
 * and the answers, and its work lands under the reply.
 */
export const answerQuestions = mutation({
  args: { boardId: v.id("boards"), itemId: v.string(), answers: v.array(v.string()), skip: v.optional(v.boolean()) },
  handler: async (ctx, { boardId, itemId, answers, skip }) => {
    const me = await requireMember(ctx, boardId);
    const item = await ctx.db
      .query("items")
      .withIndex("by_board_cid", (q) => q.eq("boardId", boardId).eq("cid", itemId))
      .unique();
    const p = item?.props as { questions?: { q: string; a: string }[]; answered?: boolean; requestId?: Id<"requests">; agentId?: Id<"agents"> } | undefined;
    if (!item || !p?.questions?.length || !p.agentId) throw new ConvexError("There's nothing to answer here");
    if (p.answered) return;
    const agent = await ctx.db.get(p.agentId);
    if (!agent) throw new ConvexError("This agent isn't on the board any more");
    const first = p.requestId ? await ctx.db.get(p.requestId) : null;
    const qa = p.questions.map((x, i) => ({ q: x.q, a: (answers[i] ?? "").trim().slice(0, 1000) }));
    if (!skip && !qa.some((x) => x.a)) throw new ConvexError("Answer at least one question, or tell them to go ahead");
    const now = Date.now();
    await ctx.db.patch(item._id, { props: { ...item.props, questions: qa, answered: true, answeredBy: me.name, skipped: !!skip }, updatedAt: now });
    const text = [
      first ? `What they asked: ${first.text}` : "",
      skip
        ? "You asked a few questions first, and they said to go ahead without answering: do your best with what you know, and say briefly what you assumed."
        : `You asked a few questions first. Their answers:\n${qa.map((x) => `- ${x.q}\n  ${x.a || "(skipped)"}`).join("\n")}\n\nNow give them what they asked for, using their answers, at the size they asked (a question gets an answer in your reply, not cards). Don't ask more questions.`,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 6000);
    const id = await ctx.db.insert("requests", { boardId, itemId, text, by: me.userId, byName: me.name, status: "working", agentId: agent._id, note: "Answered its questions", updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.brain.run, { requestId: id });
    await track(ctx, "questions_answered", me.userId, { boardId, skipped: !!skip, answered: qa.filter((x) => x.a).length, asked: qa.length });
  },
});

/** The user answered an agent's raised hand on its reply. A yes carries the work on. */
export const answerAsk = mutation({
  args: { boardId: v.id("boards"), itemId: v.string(), approve: v.boolean() },
  handler: async (ctx, { boardId, itemId, approve }) => {
    const me = await requireMember(ctx, boardId);
    const item = await ctx.db
      .query("items")
      .withIndex("by_board_cid", (q) => q.eq("boardId", boardId).eq("cid", itemId))
      .unique();
    const ask = item?.props?.ask as { status: string } | undefined;
    if (!item || !ask) throw new ConvexError("There's nothing to answer here");
    if (ask.status !== "waiting") return;
    await ctx.db.patch(item._id, { props: { ...item.props, ask: { ...ask, status: approve ? "approved" : "declined", by: me.name } }, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.brain.resume, { boardId, itemId, approve });
    await track(ctx, "ask_answered", me.userId, { boardId, approve, kind: (ask as { kind?: string }).kind ?? "computer" });
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const run = internalAction({
  args: { requestId: v.id("requests") },
  handler: (ctx, { requestId }) => quietly(() => runRequest(ctx, requestId)),
});

async function runRequest(ctx: ActionCtx, requestId: Id<"requests">) {
  {
    const c = await ctx.runQuery(internal.brain.context, { requestId });
    if (c?.request.status === "stopped") return;
    if (!c || !c.item) return;
    const { request, item, agents } = c;

    // 1. Who is it for? (An email is for the agent it was sent to.)
    let pick: { agentId: string | null; why: string };
    if (request.agentId) pick = { agentId: request.agentId, why: request.note ?? "Sent to it" };
    else try {
      pick = await judge(
        request.text,
        agents.map((a) => ({ id: a._id, name: a.name, role: a.role, instructions: a.instructions })),
        c.nearby,
      );
    } catch (e) {
      // Without the judge, the first agent answers (and says what's wrong, below).
      pick = { agentId: agents[0]?._id ?? null, why: `Judge failed: ${(e as Error).message}` };
    }
    const agent = agents.find((a) => a._id === pick.agentId);
    const who = request.by.startsWith("agent:") || request.by === "email" ? c.ownerId : request.by;
    const via = request.email ? "email" : request.from ? "handoff" : "board";
    if (!agent) {
      await capture("request_ignored", who, { boardId: request.boardId, via });
      await ctx.runMutation(internal.brain.setRequest, { requestId, status: "ignored", note: pick.why });
      return;
    }
    if (!request.agentId) await ctx.runMutation(internal.brain.setRequest, { requestId, status: "working", agentId: agent._id, note: pick.why });

    // 2. Walk over: appear where it last was (or off to the side), then glide to the text.
    const state = c.states.find((s) => s.agentId === agent._id);
    const fresh = !state || Date.now() - state.updatedAt > 10 * 60_000;
    const target = { x: item.x + item.w + 14, y: item.y + Math.min(item.h, 60) * 0.6 };
    const boardId = request.boardId;
    const say = async (s: { x: number; y: number }, status: "walking" | "thinking" | "writing" | "idle", doing?: string) => {
    if ((await ctx.runMutation(internal.brain.setAgent, { boardId, agentId: agent._id, ...s, status, doing, requestId })) === "stopped") throw new Stopped();
  };
    if (fresh) {
      await say({ x: item.x - 380, y: item.y + 260 }, "walking", "Coming over");
      await sleep(120);
    }
    await say(target, "walking", "Coming over");
    await sleep(WALK_MS);
    await say(target, "thinking", "Thinking");

    // On the board owner's plan: one answer (billing.ts). None left: it says so instead.
    const paid = await ctx.runMutation(internal.billing.spend, { boardId, kind: "answers" });
    if (!paid.ok) {
      await capture("agent_refused", who, { boardId, via, reason: paid.message.startsWith("I'm ready") ? "no plan" : paid.message.includes("trial is over") ? "trial ended" : "limit" });
      await deliver(ctx, { boardId, requestId, agent, agents, run: { kind: "failed", answer: { reply: paid.message, cards: [], computer_task: "", email: NO_EMAIL, handoffs: [], questions: [] } }, at: target });
      return;
    }

    // 3. Answer (with its apps, if it has any), then deliver: reply, cards, maybe the computer.
    // Links in what they wrote, or right beside it ("research this post" under a pasted link).
    const linked = await readLinks([request.text, ...c.nearby.split("\n").slice(0, 3)].join("\n"));
    if (linked) await say(target, "thinking", "Reading the post");
    const asked: Record<string, string> =
      request.email
        ? { emailed_to_you_by: request.email.from, subject: request.email.subject, email: request.text, on_the_board_nearby: c.nearby || "(nothing else nearby)" }
        : request.from
        ? { your_teammate_asked_you: request.byName, task: request.text, on_the_board_nearby: c.nearby || "(nothing else nearby)" }
        : { written_by: request.byName, written: request.text, on_the_board_nearby: c.nearby || "(nothing else nearby)" };
    if (c.focus && !request.email) asked["what it points at or sits beside, in full as they wrote it (when they say this/it/improve/rewrite, this is what they mean)"] = c.focus;
    const input = JSON.stringify(linked ? { ...asked, "the X posts they linked (fetched for you just now: this is their full text, so work from it and never say X blocked you)": linked } : asked);
    const t0 = Date.now();
    const r = await think(ctx, { boardId, agent, agents, input, onStep: (doing) => say(target, "thinking", doing) });
    const a = r.kind === "done" || r.kind === "failed" ? r.answer : null;
    await capture("agent_answered", who, {
      boardId,
      via,
      role: agent.role,
      outcome: r.kind === "done" ? (a?.questions?.length ? "questions" : a?.computer_task.trim() ? "computer" : "answer") : r.kind,
      cards: a?.cards.length ?? 0,
      questions: a?.questions?.length ?? 0,
      handoffs: a?.handoffs?.length ?? 0,
      email: !!a?.email?.text.trim(),
      linked: !!linked,
      seconds: Math.round((Date.now() - t0) / 1000),
    });
    await deliver(ctx, { boardId, requestId, agent, agents, run: r, at: target });
  }
}

type Email = { to: string; subject: string; text: string };
type Handoff = { teammate: string; task: string };
type Answer = { reply: string; cards: Card[]; computer_task: string; email: Email; handoffs: Handoff[]; questions: string[] };

/**
 * The agent's answer: with its apps when it has some (and Composio's set up),
 * else a plain one. A run with apps can stop to ask the team first.
 */
async function think(
  ctx: ActionCtx,
  o: { boardId: Id<"boards">; agent: Doc<"agents">; agents: Doc<"agents">[]; input: string; resume?: ToolResume; approved?: boolean; onStep: (doing: string) => Promise<unknown> },
): Promise<ToolRun<Answer> | { kind: "failed"; answer: Answer }> {
  const failed = (msg: string): { kind: "failed"; answer: Answer } => ({
    kind: "failed",
    answer: {
      reply: msg.includes("OPENAI_API_KEY") ? "I can't think yet: this board has no OpenAI key. Ask whoever runs Pompi to add one." : "Sorry, I hit a problem answering that. Try writing it again in a moment.",
      cards: [],
      computer_task: "",
      email: NO_EMAIL,
      handoffs: [],
      questions: [],
    },
  });
  if (!hasOpenAI()) return failed("No OPENAI_API_KEY");
  if (hasComposio() && o.agent.tools.length) {
    try {
      return await answerWithTools<Answer>({
        model: SOL(),
        instructions: persona(o.agent, o.agents),
        input: o.input,
        schema: ANSWER_SCHEMA,
        userId: boardUser(o.boardId),
        toolkits: o.agent.tools.map(toolkitOf),
        resume: o.resume,
        approved: o.approved,
        onStep: async (d) => void (await o.onStep(d)),
      });
    } catch (e) {
      if (e instanceof Stopped) throw e;
      console.error("[brain] answer with apps failed", (e as Error).message);
      // A paused run can't be answered without its apps; a new one can, plainly.
      if (o.resume) return { kind: "failed", answer: { reply: `I couldn't carry on with the apps: ${(e as Error).message.slice(0, 160)}`, cards: [], computer_task: "", email: NO_EMAIL, handoffs: [], questions: [] } };
    }
  }
  if (o.resume) return failed("Nothing to resume");
  try {
    const answer = await respondJson<Answer>({ model: SOL(), effort: "low", name: "answer", instructions: persona(o.agent, o.agents), input: o.input, schema: ANSWER_SCHEMA, tools: WEB, timeoutMs: 150_000 });
    return { kind: "done", answer };
  } catch (e) {
    console.error("[brain] answer failed", (e as Error).message);
    return failed((e as Error).message);
  }
}

/**
 * Puts what came of the agent's thinking on the board: its reply and cards, or
 * its raised hand (an app to connect, an action to OK), then goes to the
 * computer if the work needs it.
 */
async function deliver(
  ctx: ActionCtx,
  o: { boardId: Id<"boards">; requestId: Id<"requests">; agent: Doc<"agents">; agents: Doc<"agents">[]; run: ToolRun<Answer> | { kind: "failed"; answer: Answer }; at: { x: number; y: number }; anchor?: string },
) {
  const { boardId, requestId, agent, run: r } = o;
  // Stopped while it was thinking: nothing lands (and its cursor goes idle).
  if ((await ctx.runMutation(internal.brain.setAgent, { boardId, agentId: agent._id, ...o.at, status: "thinking", requestId })) === "stopped") throw new Stopped();
  const say = async (s: { x: number; y: number }, status: "walking" | "thinking" | "writing" | "idle", doing?: string) => {
    if ((await ctx.runMutation(internal.brain.setAgent, { boardId, agentId: agent._id, ...s, status, doing, requestId })) === "stopped") throw new Stopped();
  };

  if (r.kind === "connect" || r.kind === "ask") {
    await say(o.at, "writing", "Asking the team");
    const placed = await ctx.runMutation(internal.brain.place, {
      requestId,
      agentId: agent._id,
      reply: r.text,
      cards: [],
      anchor: o.anchor,
      ask: {
        kind: "tools",
        action: r.text,
        goal: "",
        status: "waiting",
        responseId: r.resume.responseId,
        callId: r.resume.callId,
        sessionId: r.resume.sessionId,
        ...(r.resume.pending ? { pending: r.resume.pending } : {}),
        ...(r.kind === "connect" ? { apps: r.apps } : {}),
      },
    });
    if (placed) await say({ x: placed.x + placed.w - 24, y: placed.y + placed.h + 10 }, "idle");
    await ctx.runMutation(internal.brain.setRequest, { requestId, status: "done", note: "Waiting for the team" });
    return;
  }

  const answer = r.answer;
  const failed = r.kind === "failed";
  // Questions first: they answer on the reply (answerQuestions), and the work comes after.
  const questions = failed ? [] : (answer.questions ?? []).map((q) => q.trim()).filter(Boolean).slice(0, 4);
  if (questions.length) {
    await say(o.at, "writing", "Asking a few questions");
    const placed = await land(ctx, say, { requestId, agentId: agent._id, reply: answer.reply.trim() || "A few questions first, so I get this right:", cards: [], anchor: o.anchor, questions });
    if (placed) await say({ x: placed.x + placed.w - 24, y: placed.y + placed.h + 10 }, "idle");
    await ctx.runMutation(internal.brain.setRequest, { requestId, status: "done", note: "Asked questions" });
    return;
  }
  const task = hasOrgo() && !failed ? answer.computer_task.trim() : "";
  await say(o.at, "writing", answer.cards.length ? `Writing ${answer.cards[0].title || "it"}` : answer.email?.text.trim() ? "Drafting an email" : "Replying");
  const draft = !failed && agent.email && answer.email?.text.trim() ? await ctx.runQuery(internal.brain.emailTarget, { requestId, to: answer.email.to, subject: answer.email.subject }) : null;
  const first = await land(ctx, say, {
    requestId,
    agentId: agent._id,
    reply: answer.reply.trim() || "On it.",
    cards: answer.cards,
    failed,
    anchor: o.anchor,
    ...(draft ? { email: { ...draft, text: answer.email.text.trim() } } : {}),
  });
  if (first && !failed && answer.handoffs?.length) await ctx.runMutation(internal.brain.handOff, { requestId, agentId: agent._id, anchor: first.cid, handoffs: answer.handoffs.slice(0, MAX_HANDOFFS) });
  if (!task || !first) {
    await sleep(900);
    if (first) await say({ x: first.x + first.w - 24, y: first.y + first.h + 10 }, "idle");
    await ctx.runMutation(internal.brain.setRequest, { requestId, status: failed ? "failed" : "done" });
    return;
  }

  // Work on the board's computer, where everyone can watch.
  await onComputer(ctx, { boardId, requestId, agent, agents: o.agents, goal: task, anchor: first.cid, from: first });
}

/**
 * An agent hands parts of its job to teammates: each gets a request at the
 * agent's reply, so its cursor walks over there and it works beside it. The
 * reply shows who was asked. Chains stop at MAX_DEPTH, and nobody asks itself
 * or hands back to whoever asked it.
 */
export const handOff = internalMutation({
  args: { requestId: v.id("requests"), agentId: v.id("agents"), anchor: v.string(), handoffs: v.array(v.object({ teammate: v.string(), task: v.string() })) },
  handler: async (ctx, { requestId, agentId, anchor, handoffs }) => {
    const request = await ctx.db.get(requestId);
    const from = await ctx.db.get(agentId);
    if (!request || !from) return;
    const depth = (request.from?.depth ?? 0) + 1;
    if (depth > MAX_DEPTH) return;
    const team = await ctx.db
      .query("agents")
      .withIndex("by_board", (q) => q.eq("boardId", request.boardId))
      .collect();
    const norm = (s: string) => s.trim().toLowerCase().replace(/^@/, "");
    const asked: Doc<"agents">[] = [];
    for (const h of handoffs) {
      const to = team.find((a) => norm(a.name) === norm(h.teammate));
      const task = h.task.trim().slice(0, MAX_TEXT);
      if (!to || to._id === agentId || to._id === request.from?.agentId || asked.some((a) => a._id === to._id) || task.length < 2) continue;
      asked.push(to);
      const id = await ctx.db.insert("requests", {
        boardId: request.boardId,
        itemId: anchor,
        text: task,
        by: `agent:${agentId}`,
        byName: from.name,
        status: "working",
        agentId: to._id,
        note: `Handed over by ${from.name}`,
        from: { agentId, depth },
        updatedAt: Date.now(),
      });
      // One after another, so you can see each walk over.
      await ctx.scheduler.runAfter(600 + asked.length * 900, internal.brain.run, { requestId: id });
    }
    if (!asked.length) return;
    const reply = await ctx.db
      .query("items")
      .withIndex("by_board_cid", (q) => q.eq("boardId", request.boardId).eq("cid", anchor))
      .unique();
    if (reply) await ctx.db.patch(reply._id, { props: { ...reply.props, handoffs: asked.map((a) => ({ agentId: a._id, name: a.name, color: a.color, emoji: a.emoji })) }, updatedAt: Date.now() });
  },
});

/** Where an agent's email goes: a reply to the email it was answering, or to who it named. */
export const emailTarget = internalQuery({
  args: { requestId: v.id("requests"), to: v.string(), subject: v.string() },
  handler: async (ctx, { requestId, to, subject }) => {
    const request = await ctx.db.get(requestId);
    const named = to
      .split(/[,;\s]+/)
      .map((t) => t.trim())
      .filter((t) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t));
    if (request?.email && !named.length) return { to: parseAddress(request.email.from).address, subject: `Re: ${request.email.subject}`.replace(/^Re: Re: /i, "Re: "), replyTo: request.email.messageId };
    if (!named.length) return null;
    return { to: named.join(", "), subject: subject.trim() || "(no subject)" };
  },
});

/** Sends an agent's email draft once the team said yes: what the card says now, so their edits go out. */
async function sendDraft(ctx: ActionCtx, o: { boardId: Id<"boards">; itemId: string; agent: Doc<"agents">; pending: string }) {
  const p = JSON.parse(o.pending) as { card: string; to: string; subject: string; replyTo?: string };
  const card = await ctx.runQuery(internal.brain.cardText, { boardId: o.boardId, cid: p.card });
  const text = card?.body ?? "";
  if (!o.agent.email || !text.trim()) return "There was nothing to send.";
  try {
    if (p.replyTo) await agentmail.reply(o.agent.email, p.replyTo, text);
    else await agentmail.send(o.agent.email, { to: p.to.split(/,\s*/), subject: card?.title || p.subject, text });
    await ctx.runMutation(internal.brain.markSent, { boardId: o.boardId, cid: p.card });
    await capture("agent_email_sent", (await ctx.runQuery(internal.computer.owner, { boardId: o.boardId })) ?? "", { boardId: o.boardId, reply: !!p.replyTo });
    return null;
  } catch (e) {
    console.error("[brain] email failed", (e as Error).message);
    return `I couldn't send it: ${(e as Error).message.slice(0, 140)}`;
  }
}

export const cardText = internalQuery({
  args: { boardId: v.id("boards"), cid: v.string() },
  handler: async (ctx, { boardId, cid }) => {
    const it = await ctx.db
      .query("items")
      .withIndex("by_board_cid", (q) => q.eq("boardId", boardId).eq("cid", cid))
      .unique();
    return it ? { body: String(it.props?.body ?? ""), title: String(it.props?.title ?? "") } : null;
  },
});

export const markSent = internalMutation({
  args: { boardId: v.id("boards"), cid: v.string() },
  handler: async (ctx, { boardId, cid }) => {
    const it = await ctx.db
      .query("items")
      .withIndex("by_board_cid", (q) => q.eq("boardId", boardId).eq("cid", cid))
      .unique();
    if (it) await ctx.db.patch(it._id, { props: { ...it.props, draft: false, sent: true }, updatedAt: Date.now() });
  },
});

/** Carries an agent's work on after the team answered its raised hand. */
export const resume = internalAction({
  args: { boardId: v.id("boards"), itemId: v.string(), approve: v.boolean() },
  handler: (ctx, args) => quietly(() => resumeAsk(ctx, args)),
});

async function resumeAsk(ctx: ActionCtx, { boardId, itemId, approve }: { boardId: Id<"boards">; itemId: string; approve: boolean }) {
  {
    const r = await ctx.runQuery(internal.brain.askContext, { boardId, itemId });
    if (!r) return;
    if (r.ask.kind === "email") {
      // A no leaves the draft on the board; a yes sends it, and says so only if it failed.
      if (!approve || !r.ask.pending) return;
      const problem = await sendDraft(ctx, { boardId, itemId, agent: r.agent, pending: r.ask.pending });
      if (problem) await ctx.runMutation(internal.brain.place, { requestId: r.requestId, agentId: r.agent._id, reply: problem, cards: [], failed: true, anchor: itemId });
      return;
    }
    if (r.ask.kind === "tools") {
      const at = { x: r.item.x + r.item.w - 24, y: r.item.y + r.item.h + 10 };
      await ctx.runMutation(internal.brain.setRequest, { requestId: r.requestId, status: "working" });
      await ctx.runMutation(internal.brain.setAgent, { boardId, agentId: r.agent._id, ...at, status: "thinking", doing: approve ? "Carrying on" : "Wrapping up" });
      const run = await think(ctx, {
        boardId,
        agent: r.agent,
        agents: r.agents,
        input: "",
        resume: { responseId: r.ask.responseId, callId: r.ask.callId ?? "", sessionId: r.ask.sessionId ?? "", pending: r.ask.pending },
        approved: approve,
        onStep: (doing) => ctx.runMutation(internal.brain.setAgent, { boardId, agentId: r.agent._id, ...at, status: "thinking", doing }),
      });
      await deliver(ctx, { boardId, requestId: r.requestId, agent: r.agent, agents: r.agents, run, at, anchor: itemId });
      return;
    }
    await onComputer(ctx, {
      boardId,
      requestId: r.requestId,
      agent: r.agent,
      agents: r.agents,
      goal: r.ask.goal,
      anchor: itemId,
      from: r.item,
      resume: { responseId: r.ask.responseId, callId: r.ask.callId, checks: r.ask.checks },
      approved: approve,
    });
  }
}

export const askContext = internalQuery({
  args: { boardId: v.id("boards"), itemId: v.string() },
  handler: async (ctx, { boardId, itemId }) => {
    const item = await ctx.db
      .query("items")
      .withIndex("by_board_cid", (q) => q.eq("boardId", boardId).eq("cid", itemId))
      .unique();
    const p = item?.props as
      | { agentId?: Id<"agents">; requestId?: Id<"requests">; ask?: { kind?: "computer" | "tools" | "email"; goal: string; responseId: string; callId?: string; checks?: Resume["checks"]; sessionId?: string; pending?: string } }
      | undefined;
    if (!item || !p?.agentId || !p.requestId || !p.ask) return null;
    const agent = await ctx.db.get(p.agentId);
    if (!agent) return null;
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    return { item: { x: item.x, y: item.y, w: item.w, h: item.h }, agent, agents, requestId: p.requestId, ask: p.ask };
  },
});

/**
 * An agent's turn on the board's computer: wait for it if a teammate has it,
 * start it if it's off, put its screen on the board, work with the cursor on
 * that screen, then reply with what came of it (or raise its hand).
 */
async function onComputer(
  ctx: ActionCtx,
  o: { boardId: Id<"boards">; requestId: Id<"requests">; agent: Doc<"agents">; agents: Doc<"agents">[]; goal: string; anchor: string; from: Box; resume?: Resume; approved?: boolean; round?: number },
) {
  const { boardId, requestId, agent } = o;
  const say = async (s: { x: number; y: number }, status: "walking" | "thinking" | "writing" | "idle", doing?: string) => {
    if ((await ctx.runMutation(internal.brain.setAgent, { boardId, agentId: agent._id, ...s, status, doing, requestId })) === "stopped") throw new Stopped();
  };
  const finish = async (said: string, failed = false, ask?: { text: string; resume: Resume }) => {
    // A short reply, then "# Title" and the rest: the rest becomes a note card (computerPersona).
    const at = ask ? -1 : said.search(/\n#\s+\S/);
    const reply = at < 0 ? said : said.slice(0, at).trim() || "Here's what I found.";
    const cards: Card[] = [];
    if (at >= 0) {
      const [title, ...rest] = said.slice(at).trim().replace(/^#\s+/, "").split("\n");
      const body = rest.join("\n").trim();
      if (body) cards.push({ type: "note", title: title.trim().slice(0, 120), body });
    }
    const placed = await land(ctx, say, {
      requestId,
      agentId: agent._id,
      reply,
      cards,
      failed,
      anchor: o.anchor,
      ...(ask ? { ask: { action: ask.text, goal: o.goal, status: "waiting" as const, responseId: ask.resume.responseId, ...(ask.resume.callId ? { callId: ask.resume.callId } : {}), ...(ask.resume.checks ? { checks: ask.resume.checks.map((c) => ({ id: c.id, code: c.code ?? null, message: c.message ?? null })) } : {}) } } : {}),
    });
    if (placed) await say({ x: placed.x + placed.w - 24, y: placed.y + placed.h + 10 }, "idle");
    await ctx.runMutation(internal.brain.setRequest, { requestId, status: failed ? "failed" : "done" });
  };

  // A new task on the computer is one of the owner's computer tasks (billing.ts); carrying one on after an OK isn't.
  if (!o.resume) {
    const paid = await ctx.runMutation(internal.billing.spend, { boardId, kind: "computerTasks" });
    if (!paid.ok) return finish(paid.message, true);
  }
  await ctx.runMutation(internal.computer.patch, { boardId, touch: true });
  const frame = await ctx.runMutation(internal.brain.ensureScreen, { boardId, near: o.anchor });
  await say({ x: frame.x + frame.w / 2, y: frame.y + 20 }, "walking", "Going to the computer");

  // One agent on the computer at a time.
  const t0 = Date.now();
  for (;;) {
    const got = await ctx.runMutation(internal.computer.claim, { boardId, requestId, agentId: agent._id, doing: o.goal.slice(0, 80) });
    if (got.ok) break;
    if (got.reason === "no computer") {
      await ctx.runMutation(internal.computer.patch, { boardId, status: "starting", touch: true });
      continue;
    }
    if (Date.now() - t0 > 4 * 60_000) return finish(got.elsewhere ? "The computer's still busy with work from another board. Write it again in a few minutes and I'll pick it up." : "The computer's still busy with a teammate's work. Write it again in a few minutes and I'll pick it up.", true);
    await say({ x: frame.x + frame.w / 2, y: frame.y + 20 }, "thinking", got.elsewhere ? "Waiting: the computer's busy on another board" : "Waiting for the computer");
    await sleep(4000);
  }

  const round = o.round ?? 0;
  let keep = false;
  try {
    if (!round) await say({ x: frame.x + frame.w / 2, y: frame.y + 20 }, "thinking", "Starting the computer");
    const orgoId = await ensureOn(ctx, boardId);
    await say({ x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 }, "writing", "Using the computer");
    const owner = (await ctx.runQuery(internal.computer.owner, { boardId })) ?? "";
    const t0 = Date.now();
    const done = (outcome: string) => capture("computer_task_finished", owner, { boardId, role: agent.role, outcome, round: round + 1, seconds: Math.round((Date.now() - t0) / 1000) });
    if (!round && !o.resume) await capture("computer_task_started", owner, { boardId, role: agent.role });
    const result = await runOnComputer({
      orgoId,
      model: SOL(),
      instructions: computerPersona(agent, o.agents),
      goal: o.goal,
      resume: o.resume,
      approved: o.approved,
      onStep: async (s) => {
        await say(s.at ? onFrame(frame, s.at) : { x: frame.x + frame.w - 40, y: frame.y + 20 }, "writing", s.doing);
        await ctx.runMutation(internal.computer.step, { boardId, requestId, doing: s.doing, kind: s.kind, ...(s.at ?? {}), ...(s.dir ? { dir: s.dir } : {}) });
      },
    });
    if (result.kind === "ask") {
      await done("asked");
      return await finish(result.text, false, { text: result.text, resume: result.resume });
    }
    if (result.kind === "more") {
      // Long work goes on in a fresh action (each has ten minutes), keeping the computer.
      if (round + 1 >= MAX_ROUNDS) await done("hit the time cap");
      if (round + 1 >= MAX_ROUNDS) return await finish("This has taken over an hour, so I've paused here. Write \"keep going\" and I'll carry on from where I am.", true);
      keep = true;
      await say({ x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 }, "writing", "Still working");
      await ctx.scheduler.runAfter(0, internal.brain.carryOn, { boardId, requestId, agentId: agent._id, goal: o.goal, anchor: o.anchor, from: o.from, resume: { responseId: result.resume.responseId, pending: result.resume.pending ?? [] }, round: round + 1 });
      return;
    }
    await done(result.kind);
    await finish(result.text, result.kind === "failed");
  } catch (e) {
    if (e instanceof Stopped) throw e;
    console.error("[brain] computer work failed", (e as Error).message);
    await capture("computer_task_finished", (await ctx.runQuery(internal.computer.owner, { boardId })) ?? "", { boardId, role: agent.role, outcome: "error", error: (e as Error).message.slice(0, 200), round: round + 1 });
    await finish(`I couldn't use the computer: ${(e as Error).message.slice(0, 160)}`, true);
  } finally {
    if (!keep) await ctx.runMutation(internal.computer.release, { boardId, requestId });
  }
}

/** Runs of one long computer task, at most (each up to about five minutes of work). */
const MAX_ROUNDS = 14;

const pendingV = v.array(v.object({ callId: v.string(), kind: v.union(v.literal("computer"), v.literal("shell")), output: v.optional(v.string()) }));

/** The next run of long computer work (onComputer), unless it was stopped meanwhile. */
export const carryOn = internalAction({
  args: {
    boardId: v.id("boards"),
    requestId: v.id("requests"),
    agentId: v.id("agents"),
    goal: v.string(),
    anchor: v.string(),
    from: v.object({ x: v.number(), y: v.number(), w: v.number(), h: v.number() }),
    resume: v.object({ responseId: v.string(), pending: pendingV }),
    round: v.number(),
  },
  handler: (ctx, { agentId, ...o }) =>
    quietly(async () => {
      const team = await ctx.runQuery(internal.brain.stillOn, { requestId: o.requestId, agentId });
      if (!team) return void (await ctx.runMutation(internal.computer.release, { boardId: o.boardId, requestId: o.requestId }));
      await ctx.runMutation(internal.brain.setRequest, { requestId: o.requestId, status: "working" });
      await onComputer(ctx, { ...o, agent: team.agent, agents: team.agents });
    }),
});

export const stillOn = internalQuery({
  args: { requestId: v.id("requests"), agentId: v.id("agents") },
  handler: async (ctx, { requestId, agentId }) => {
    const request = await ctx.db.get(requestId);
    const agent = await ctx.db.get(agentId);
    if (!request || !agent || request.status !== "working") return null;
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_board", (q) => q.eq("boardId", request.boardId))
      .collect();
    return { agent, agents };
  },
});

/**
 * Puts the agent's work down as a person would: the reply, then each card in
 * turn, its cursor going to where the card goes first (and the board's view
 * follows, board-canvas.tsx).
 */
async function land(
  ctx: ActionCtx,
  say: (s: { x: number; y: number }, status: "walking" | "thinking" | "writing" | "idle", doing?: string) => Promise<void>,
  args: FunctionArgs<typeof internal.brain.place>,
) {
  const placed = await ctx.runMutation(internal.brain.place, { ...args, defer: true });
  if (!placed) return null;
  for (const it of placed.later) {
    const title = String((it.props as { title?: string }).title ?? "");
    await say({ x: it.x + 28, y: it.y + 22 }, "writing", title ? `Writing ${title.slice(0, 40)}` : "Writing");
    await sleep(650);
    await ctx.runMutation(internal.brain.putItem, { item: it });
    await sleep(250);
  }
  return placed;
}

const NO_EMAIL: Email = { to: "", subject: "", text: "" };

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "cards", "computer_task", "email", "handoffs", "questions"],
  properties: {
    questions: {
      type: "array",
      description:
        "Questions to ask before you do the work, when doing it well depends on things only they know and can't be found on the board or the web (who it's for, what they've already tried, their goal, their offer, tone, limits). Two to four, short and specific, each answerable in a line, most important first. Then your reply is a line saying you'd like to know a few things first, and there are no cards, no computer_task, no email and no handoffs. Empty when you have what you need, for quick or simple asks, for emails you were sent, and always when they've just answered your questions: then do the work with what you know.",
      items: { type: "string" },
    },
    reply: { type: "string", description: "What you say on the board, beside their text, plain words, no markdown: one to three short sentences. When they asked a question or for advice, this is the answer itself: direct and specific, up to five short sentences." },
    cards: {
      type: "array",
      description:
        "Work you made for them to keep, each as a card on the board: only when they asked you to make or write something (a post, a draft, a plan, a list). Empty when they asked a question or for advice (answer in the reply), and when the work happens on the computer. One card unless they asked for several things (two versions = two cards). Keep each as short as does the job, usually under 150 words: no filler sections, no restating their ask, no extras they didn't ask for. But when they ask you to improve, rewrite or edit their writing, each card is the whole piece rewritten, start to finish, about as long as theirs (tighter is fine), keeping everything that matters: never a shortened summary or just the opening.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "body"],
        properties: {
          type: { type: "string", enum: ["post", "note"], description: "post: a social post ready to publish. note: anything else (copy, a plan, a list, research, a summary)." },
          title: { type: "string", description: "A short title for the card." },
          body: { type: "string", description: "The work itself. For a note, light Markdown reads best: short paragraphs, '## ' subheadings, '- ' or '1. ' lists, **bold** for the key bits, links as [name](url). For a post, exactly the text to publish, no Markdown." },
        },
      },
    },
    computer_task: {
      type: "string",
      description:
        "Only if the work needs you to operate a computer yourself: logging in to a site, clicking through or filling in a web app, writing and running code, building or deploying a site. Then the task for yourself, fully spelled out with everything from the board you'll need, and your reply is a short line saying you're on it. Never for research, reading a link or looking something up: search the web yourself and answer with the findings. Otherwise an empty string.",
    },
    handoffs: {
      type: "array",
      description:
        "Parts of this job that are clearly a teammate's work (their role), not yours: each goes to that teammate, who walks over and does it beside your work. Only when they asked for work that needs that teammate; never for a question, advice, or something you could offer to do later. Almost always empty. Never yourself, and never the teammate who asked you. Say in your reply who you asked.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["teammate", "task"],
        properties: {
          teammate: { type: "string", description: "The teammate's name, exactly as listed." },
          task: { type: "string", description: "What you need from them, fully spelled out: they'll see your work beside it." },
        },
      },
    },
    email: {
      type: "object",
      additionalProperties: false,
      required: ["to", "subject", "text"],
      description: "An email to send from your own address, drafted for the team to OK first. Leave text empty when there's nothing to send.",
      properties: {
        to: { type: "string", description: "Who it goes to (addresses, comma-separated). Empty when you're replying to the email you were sent." },
        subject: { type: "string", description: "The subject. Empty when replying." },
        text: { type: "string", description: "The email itself, plain text, signed with your name. Empty for no email." },
      },
    },
  },
};

function persona(agent: Doc<"agents">, team: Doc<"agents">[]) {
  const others = team.filter((a) => a._id !== agent._id).map((a) => `${a.name} (${a.role})`);
  return [
    `You are ${agent.name}, the ${agent.role} on a team working on a shared Pompi board: an infinite canvas like FigJam, where people and AI agents work side by side.`,
    agent.instructions ? `How you work, in your team's words:\n${agent.instructions}` : "",
    others.length
      ? `Your agent teammates on this board: ${others.join(", ")}. When part of a job is clearly one of theirs (by their role), do your part and hand theirs over in \`handoffs\`: they'll walk over and do it beside your work. Don't hand over what you can do yourself, and don't hand work back to whoever handed it to you.`
      : "",
    "Someone just wrote something on the board meant for you. Your cursor walked over, and you answer right beside it.",
    "Reply like a teammate standing at the whiteboard: one to three short sentences, warm and direct, no markdown, no preamble.",
    "When they ask you to make something you can write yourself (a post, copy, a plan, a list, a summary of what's on the board), put the work in a card and keep the reply to a line about it. Questions and asks for advice get a straight answer in the reply and no cards.",
    "Be brief: the board is everyone's shared space, and every card costs them room and attention. Do exactly what was asked, at the size it was asked. Don't add drafts, examples, templates, trackers or hand-offs they didn't ask for; if one would help, offer it in a few words at the end of your reply, and do it only if they say yes.",
    "You can search the web: for research, news, facts, or reading a link, search and answer from what you found (research findings go in a note card, with the sources). X posts they link are fetched for you and included in full: work from that text, and don't search for the post itself. Only go to the computer for work that needs clicking around a site or app, or code.",
    hasOrgo()
      ? "You can use the board owner's computer (a Linux desktop with a browser and a terminal) you can use. When the request needs it (checking a live site, browsing, research on the web, code, building or deploying), set computer_task and say in your reply that you're on it. Never claim you did something before you've done it."
      : "The board's computer isn't connected yet, so you can't browse, run code or deploy. If the request needs that, say so plainly in one sentence, and what you'd do once it is. Never claim you did something you didn't.",
    "Use what's written nearby on the board as context: it's what they're looking at.",
    "Work like a good consultant: when a request is open-ended and the right answer depends on their situation (a plan, outreach, pricing, a strategy, copy for a specific audience), and the board doesn't tell you enough, ask your questions first in `questions` rather than guessing. When they've answered, do what they asked, using their answers, at the size they asked: a question still gets an answer in the reply, not a stack of cards.",
    agent.email
      ? `You have your own email address, ${agent.email}. When an email comes to you, its card is on the board's Inbox section: answer on the board, and when it deserves a reply, draft one in \`email\` (to empty). When the team asks you to email someone, draft that in \`email\` too. The team OKs every email before it's sent, so your reply on the board should say it's ready for them to check, not that it's sent.`
      : "You don't have an email address, so you can't send email.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function computerPersona(agent: Doc<"agents">, team: Doc<"agents">[]) {
  return [
    persona(agent, team),
    `Now you're at the board owner's computer: a Linux desktop (${SCREEN.w}×${SCREEN.h}) with a web browser and a terminal. Everyone on the board is watching its screen, and your cursor. It's theirs for all their boards, so the sites they've logged in to stay logged in: use those sessions, and don't log out.`,
    "The owner may jump in and use the screen while you work. If it changed in a way you didn't cause (a new tab, a moved window, text typed), that's them: work with it, don't undo it, and carry on from what's there.",
    `Agents from the owner's other boards use this computer too. Keep this board's files in ~/boards/${agent.boardId} (make it if it's missing), and leave other folders alone.`,
    "Do the task. Use run_shell for terminal work (files, git, npm, building and running code, CLIs); use the screen for websites and apps. If a browser isn't open and you need one, open it from the desktop or run `nohup firefox >/dev/null 2>&1 &` (or chromium).",
    "Before anything that publishes, deploys to production, sends, posts, buys, pays, deletes, or can't easily be undone, stop and answer with a message that starts with NEED_OK: and then one or two sentences saying exactly what you're about to do and anything they should know first (like failing tests). Don't do it until they say yes.",
    "When you're done, your answer goes on the board beside the request. Start with one to three short sentences: what you did or found, in plain words, with any link that matters. If there's more worth keeping (research findings, a summary, steps, a list of links), add a blank line, then a line starting with '# ' giving it a short title, then the full text in plain words ('- ' bullets are fine): it becomes a card on the board.",
    "The team can't see files on this computer, and you can put things on the board only through your answer. So never leave results in a file for them, and never say you couldn't put something on the board: put it in your answer.",
  ].join("\n\n");
}
