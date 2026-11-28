import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { track } from "./analytics";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { hasOpenAI } from "./ai";
import { SCREEN } from "./computerUse";
import { requireMember } from "./lib";
import { parseAddress } from "./agentmail";

/**
 * How a board's agents answer what people write on it:
 *
 * 1. Someone finishes writing a text or sticky; the canvas calls `wrote`.
 * 2. agent.ts asks the judge who it's for (ai.ts). A note for people is left alone.
 * 3. That agent's cursor walks over to the text (agentStates) and works on it
 *    with its tools (the web, its apps, the computer): its cards land beside
 *    the text as it goes, and its reply under it (`place`).
 * 4. Part of the job that's a teammate's work is handed over: that agent walks
 *    over to it and does its part beside it (`handOff`).
 *
 * This file is the board's side of it; agent.ts is the thinking.
 */

const MAX_TEXT = 20000;
const PER_MINUTE = 20;
/** How long a chain of hand-offs may get (Juno asks Dev, Dev asks Ivy, and that's it). */
const MAX_DEPTH = 2;

export const wrote = mutation({
  args: { boardId: v.id("boards"), itemId: v.string(), text: v.string(), tz: v.optional(v.string()) },
  handler: async (ctx, { boardId, itemId, text, tz }) => {
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
    const requestId = await ctx.db.insert("requests", { boardId, itemId, text: said, by: me.userId, byName: me.name, status: "routing", ...(tz && tz.length < 64 ? { tz } : {}), updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.agent.run, { requestId });
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
  /** How much the board's agents may do without asking (schema.ts boards.approvals). */
  approvals: "ask" | "auto" | "never";
  /** What the board's agents did lately, newest first: what was asked, and what they replied. */
  recent: { agentId: Id<"agents">; asked: string; replied: string; status: string; at: number }[];
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
      .slice(0, 30)
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
    const board = await ctx.db.get(request.boardId);
    const ownerId = board?.ownerId ?? "";
    // Each request's latest reply (a run that carried on after an answer has more than one).
    const replied = new Map<string, string>();
    for (const it of all) if (it.kind === "reply" && it.props?.requestId) replied.set(String(it.props.requestId), String(it.props.text ?? ""));
    const recent = (
      await ctx.db
        .query("requests")
        .withIndex("by_board", (q) => q.eq("boardId", request.boardId))
        .order("desc")
        .take(60)
    )
      .filter((r) => r._id !== requestId && r.agentId && (r.status === "done" || r.status === "failed"))
      .slice(0, 30)
      .map((r) => ({ agentId: r.agentId!, asked: r.text.slice(0, 300), replied: (replied.get(r._id) ?? "").slice(0, 300), status: r.status, at: r.updatedAt }));
    return { request, item, agents, nearby, focus, states, ownerId, approvals: board?.approvals ?? "ask", recent };
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
    const request = requestId ? await ctx.db.get(requestId) : null;
    const stopped = !!request && rest.status !== "idle" && request.status === "stopped";
    // Its heartbeat: a request working with none for a while had its action die (recover).
    if (request && request.status === "working" && Date.now() - request.updatedAt > 30_000) await ctx.db.patch(request._id, { updatedAt: Date.now() });
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
  /** The paused run (agent.ts) that carries on once they answer. */
  runId: v.optional(v.id("runs")),
  /** From before agent.ts: the OpenAI response a paused run was at. */
  responseId: v.optional(v.string()),
  callId: v.optional(v.string()),
  checks: v.optional(v.array(v.object({ id: v.string(), code: v.optional(v.union(v.string(), v.null())), message: v.optional(v.union(v.string(), v.null())) }))),
  /** What's paused: the agent's own ask (request_ok), an app action or app to connect, or an email draft. ("computer": from before agent.ts.) */
  kind: v.optional(v.union(v.literal("agent"), v.literal("computer"), v.literal("tools"), v.literal("email"))),
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
 *
 * With `replyCid`, the reply is already there (an agent says what it's about
 * to do, then gets on with it): it's updated in place. With `noReply`, only the
 * cards go down, beside the reply if there is one (an agent's work, as it goes).
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
    /** The email goes without asking (the board's setting): returned as `sendNow`, to send once it's down. */
    sendNow: v.optional(v.boolean()),
    defer: v.optional(v.boolean()),
    /** Questions for the team to answer on the reply before the work. */
    questions: v.optional(v.array(v.string())),
    replyCid: v.optional(v.string()),
    noReply: v.optional(v.boolean()),
  },
  handler: async (ctx, { requestId, agentId, reply, cards, failed, anchor, ask: asked, email, sendNow, defer, questions, replyCid, noReply }) => {
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
    const draft = email && draftCid ? JSON.stringify({ card: draftCid, to: email.to, subject: email.subject, replyTo: email.replyTo }) : undefined;
    const ask = asked ?? (draft && !sendNow ? { kind: "email" as const, action: `Send this email to ${email!.to}?`, goal: "", status: "waiting" as const, responseId: "", pending: draft } : undefined);

    const base = item ?? { x: 0, y: 0, w: 320, h: 40 };
    const existing = replyCid ? all.find((it) => it.cid === replyCid && it.kind === "reply") : undefined;
    const replyProps = { text: reply, failed: !!failed, ...(ask ? { ask } : {}), ...(questions?.length ? { questions: questions.map((q) => ({ q, a: "" })), answered: false } : {}) };
    const replySize = { w: questions?.length ? 400 : 360, h: 74 + Math.ceil(reply.length / 42) * 22 + (ask ? 64 : 0) + (questions?.length ? 70 + questions.reduce((h, q) => h + Math.ceil(q.length / 44) * 21 + 58, 0) : 0) };
    let cid = existing?.cid ?? "";
    let replyBox: Box | null = existing ? { x: existing.x, y: existing.y, w: existing.w, h: existing.h } : null;
    if (!noReply && existing) {
      await ctx.db.patch(existing._id, { ...replySize, props: { ...existing.props, ...replyProps }, updatedBy: `agent:${agentId}`, updatedAt: now });
      replyBox = { x: existing.x, y: existing.y, ...replySize };
      blocks.push(replyBox);
    } else if (!noReply) {
      const replyAt = nearestFree(blocks, { x: base.x, y: base.y + base.h + 18, ...replySize });
      cid = crypto.randomUUID();
      await ctx.db.insert("items", { boardId, cid, kind: "reply", ...replyAt, ...replySize, z: z++, props: { ...who, ...replyProps }, createdBy: `agent:${agentId}`, updatedBy: `agent:${agentId}`, updatedAt: now });
      replyBox = { ...replyAt, ...replySize };
      blocks.push(replyBox);
    }

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
      const origin = nearestFree(blocks, { x: Math.max(base.x + base.w, replyBox ? replyBox.x + replyBox.w : base.x + 360) + 48, y: Math.min(base.y, replyBox?.y ?? base.y), ...cluster });
      work.forEach((it, i) => {
        const doc = { boardId, cid: it.cid, kind: "card" as const, x: origin.x + rel[i].x, y: origin.y + rel[i].y, w: it.w, h: it.h, z: z++, props: it.props, createdBy: `agent:${agentId}`, updatedBy: `agent:${agentId}`, updatedAt: now };
        later.push(doc as Doc<"items">);
      });
      if (!defer) for (const doc of later) await ctx.db.insert("items", doc);
    }
    await ctx.db.patch(boardId, { updatedAt: now });
    const box = replyBox ?? { x: base.x, y: base.y, w: base.w, h: base.h };
    return { cid, x: box.x, y: box.y, w: box.w, h: box.h, later: defer ? later : [], ...(sendNow && draft ? { sendNow: draft } : {}) };
  },
});

/** About how tall `text` draws: each line wrapped at `perLine` characters, plus the gaps between paragraphs. */
function textHeight(text: string, perLine: number, lineH: number) {
  const lines = text.split("\n");
  return lines.reduce((h, l) => h + (l.trim() ? Math.ceil(l.length / perLine) * lineH : lineH / 2), 0);
}

/** What's in the way of a new item. Sections are where things go, so only their title bars block. */
export function blocking(all: Doc<"items">[]): Box[] {
  return all
    .filter((it) => it.kind !== "connector")
    .map((it) => (it.kind === "section" ? { x: it.x, y: it.y - 44, w: Math.min(it.w, 260), h: 40 } : { x: it.x, y: it.y, w: it.w, h: it.h }));
}

const overlaps = (a: Box, b: Box, gap = 12) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

export const CARD_W = 400;
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
export function nearestFree(blocks: Box[], want: Box): { x: number; y: number } {
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
export const onFrame = (f: Box, p: { x: number; y: number }) => {
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
    await ctx.scheduler.runAfter(0, internal.agent.run, { requestId: id });
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
    await ctx.scheduler.runAfter(0, internal.agent.resume, { boardId, itemId, approve });
    await track(ctx, "ask_answered", me.userId, { boardId, approve, kind: (ask as { kind?: string }).kind ?? "computer" });
  },
});


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
      await ctx.scheduler.runAfter(600 + asked.length * 900, internal.agent.run, { requestId: id });
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

export const askContext = internalQuery({
  args: { boardId: v.id("boards"), itemId: v.string() },
  handler: async (ctx, { boardId, itemId }) => {
    const item = await ctx.db
      .query("items")
      .withIndex("by_board_cid", (q) => q.eq("boardId", boardId).eq("cid", itemId))
      .unique();
    const p = item?.props as
      | { agentId?: Id<"agents">; requestId?: Id<"requests">; ask?: { kind?: "agent" | "computer" | "tools" | "email"; goal: string; runId?: Id<"runs">; pending?: string } }
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

/* ---------------- saved runs (agent.ts) ---------------- */

export const getRun = internalQuery({
  args: { requestId: v.id("requests") },
  handler: (ctx, { requestId }) =>
    ctx.db
      .query("runs")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .first(),
});

export const runById = internalQuery({
  args: { runId: v.id("runs") },
  handler: (ctx, { runId }) => ctx.db.get(runId),
});

/** Saves where a run is (its transcript, already in storage), replacing what it saved before. */
export const saveRun = internalMutation({
  args: {
    requestId: v.id("requests"),
    agentId: v.id("agents"),
    boardId: v.id("boards"),
    transcript: v.id("_storage"),
    replyCid: v.optional(v.string()),
    appSession: v.optional(v.string()),
    pending: v.optional(v.string()),
    round: v.number(),
    computer: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("runs")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .first();
    if (old) {
      if (old.transcript !== args.transcript) await ctx.storage.delete(old.transcript);
      await ctx.db.replace(old._id, { ...args, ...(old.recovered ? { recovered: old.recovered } : {}), updatedAt: Date.now() });
      return old._id;
    }
    return ctx.db.insert("runs", { ...args, updatedAt: Date.now() });
  },
});

/** No heartbeat for this long: its action is gone (Convex stops one at ten minutes). */
const STALE_MS = 11 * 60_000;
/** Stale for this long, it's too late to pick up or reply to. */
const LONG_GONE_MS = 60 * 60_000;
/** Times a run is picked up again after its action died, at most. */
const MAX_RECOVERIES = 2;

/**
 * Work whose action died (a deploy, a crash, the ten minutes running out)
 * carries on from its last checkpoint, or says it was cut off (crons.ts).
 */
export const recover = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = Date.now() - STALE_MS;
    const stale = [
      ...(await ctx.db
        .query("requests")
        .withIndex("by_status", (q) => q.eq("status", "working").lt("updatedAt", old))
        .take(20)),
      ...(await ctx.db
        .query("requests")
        .withIndex("by_status", (q) => q.eq("status", "routing").lt("updatedAt", old))
        .take(20)),
    ];
    for (const r of stale) {
      // Stuck for long before anyone noticed (from before this check): closed quietly, with no reply out of the blue.
      if (Date.now() - r.updatedAt > LONG_GONE_MS) {
        await ctx.db.patch(r._id, { status: "failed", note: "Interrupted", updatedAt: Date.now() });
        continue;
      }
      await ctx.db.patch(r._id, { updatedAt: Date.now() });
      const run = await ctx.db
        .query("runs")
        .withIndex("by_request", (q) => q.eq("requestId", r._id))
        .first();
      if (r.status === "working" && r.agentId && run && (run.recovered ?? 0) < MAX_RECOVERIES) {
        await ctx.db.patch(run._id, { recovered: (run.recovered ?? 0) + 1 });
        await ctx.scheduler.runAfter(0, internal.agent.carryOn, { runId: run._id, interrupted: true });
      } else await ctx.scheduler.runAfter(0, internal.agent.interrupted, { requestId: r._id });
    }
  },
});

/** Clears saved runs nobody carried on (crons.ts): a week after their last step. */
export const forgetRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = (await ctx.db.query("runs").take(200)).filter((r) => r.updatedAt < Date.now() - 7 * 24 * 60 * 60_000);
    for (const r of old) {
      await ctx.storage.delete(r.transcript);
      await ctx.db.delete(r._id);
    }
  },
});
