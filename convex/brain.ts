import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx } from "./_generated/server";
import { hasOpenAI, judge, respondJson, SOL } from "./ai";
import { ensureOn } from "./computer";
import { SCREEN, runOnComputer, type Resume } from "./computerUse";
import { requireMember } from "./lib";
import { hasOrgo } from "./orgo";

/**
 * How a board's agents answer what people write on it:
 *
 * 1. Someone finishes writing a text or sticky; the canvas calls `wrote`.
 * 2. `run` asks the judge who it's for (ai.ts). A note for people is left alone.
 * 3. That agent's cursor walks over to the text (agentStates), thinks, and
 *    writes its reply beside it, with any work (a post, a note) as cards next to it.
 */

const MAX_TEXT = 2000;
const PER_MINUTE = 20;
/** How long the cursor takes to walk over; the canvas animates the move over about this long. */
const WALK_MS = 1100;

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

/* ---------------- the run ---------------- */

type Context = {
  request: Doc<"requests">;
  item: Doc<"items"> | null;
  agents: Doc<"agents">[];
  nearby: string;
  states: Doc<"agentStates">[];
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
    return { request, item, agents, nearby, states };
  },
});

function describe(it: Doc<"items">): string {
  const p = it.props ?? {};
  const t = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ").slice(0, 280);
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
  },
  handler: async (ctx, { boardId, agentId, ...rest }) => {
    const row = { ...rest, x: Math.round(rest.x), y: Math.round(rest.y), updatedAt: Date.now() };
    const existing = await ctx.db
      .query("agentStates")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("agentStates", { boardId, agentId, ...row });
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
});

/**
 * Puts an agent's reply on the board, under `anchor` (an item's id; else what
 * the request was written on), and its cards beside it, each in a free spot.
 * Returns the reply's id and box.
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
  },
  handler: async (ctx, { requestId, agentId, reply, cards, failed, anchor, ask }) => {
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

    const base = item ?? { x: 0, y: 0, w: 320, h: 40 };
    const replySize = { w: 360, h: 74 + Math.ceil(reply.length / 42) * 22 + (ask ? 64 : 0) };
    const replyAt = freeSpot(blocks, { x: base.x, y: base.y + base.h + 18, ...replySize });
    const cid = crypto.randomUUID();
    await ctx.db.insert("items", { boardId, cid, kind: "reply", ...replyAt, ...replySize, z: z++, props: { ...who, text: reply, failed: !!failed, ...(ask ? { ask } : {}) }, createdBy: `agent:${agentId}`, updatedBy: `agent:${agentId}`, updatedAt: now });
    blocks.push({ ...replyAt, ...replySize });

    let cy = base.y;
    const cx = base.x + Math.max(base.w, replySize.w) + 48;
    for (const c of cards.slice(0, 6) as Card[]) {
      const size = { w: 380, h: (c.type === "post" ? 132 : 118) + Math.ceil(c.body.length / 46) * 21 };
      const at = freeSpot(blocks, { x: cx, y: cy, ...size });
      await ctx.db.insert("items", { boardId, cid: crypto.randomUUID(), kind: "card", ...at, ...size, z: z++, props: { ...who, type: c.type, title: c.title.slice(0, 120), body: c.body.slice(0, 6000) }, createdBy: `agent:${agentId}`, updatedBy: `agent:${agentId}`, updatedAt: now });
      blocks.push({ ...at, ...size });
      cy = at.y + size.h + 24;
    }
    await ctx.db.patch(boardId, { updatedAt: now });
    return { cid, ...replyAt, ...replySize };
  },
});

/** What's in the way of a new item. Sections are where things go, so only their title bars block. */
function blocking(all: Doc<"items">[]): Box[] {
  return all
    .filter((it) => it.kind !== "connector")
    .map((it) => (it.kind === "section" ? { x: it.x, y: it.y - 44, w: Math.min(it.w, 260), h: 40 } : { x: it.x, y: it.y, w: it.w, h: it.h }));
}

const overlaps = (a: Box, b: Box, gap = 12) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

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
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const run = internalAction({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const c = await ctx.runQuery(internal.brain.context, { requestId });
    if (!c || !c.item) return;
    const { request, item, agents } = c;

    // 1. Who is it for?
    let pick: { agentId: string | null; why: string };
    try {
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
    if (!agent) {
      await ctx.runMutation(internal.brain.setRequest, { requestId, status: "ignored", note: pick.why });
      return;
    }
    await ctx.runMutation(internal.brain.setRequest, { requestId, status: "working", agentId: agent._id, note: pick.why });

    // 2. Walk over: appear where it last was (or off to the side), then glide to the text.
    const state = c.states.find((s) => s.agentId === agent._id);
    const fresh = !state || Date.now() - state.updatedAt > 10 * 60_000;
    const target = { x: item.x + item.w + 14, y: item.y + Math.min(item.h, 60) * 0.6 };
    const boardId = request.boardId;
    const say = (s: { x: number; y: number }, status: "walking" | "thinking" | "writing" | "idle", doing?: string) => ctx.runMutation(internal.brain.setAgent, { boardId, agentId: agent._id, ...s, status, doing });
    if (fresh) {
      await say({ x: item.x - 380, y: item.y + 260 }, "walking", "Coming over");
      await sleep(120);
    }
    await say(target, "walking", "Coming over");
    await sleep(WALK_MS);
    await say(target, "thinking", "Thinking");

    // 3. Answer, and say whether it needs the computer.
    let answer: { reply: string; cards: Card[]; computer_task: string };
    let failed = false;
    try {
      answer = await respondJson<{ reply: string; cards: Card[]; computer_task: string }>({
        model: SOL(),
        effort: "low",
        name: "answer",
        instructions: persona(agent, agents),
        input: JSON.stringify({ written_by: request.byName, written: request.text, on_the_board_nearby: c.nearby || "(nothing else nearby)" }),
        schema: ANSWER_SCHEMA,
      });
    } catch (e) {
      failed = true;
      const msg = (e as Error).message;
      answer = {
        reply: msg.includes("OPENAI_API_KEY") ? "I can't think yet: this board has no OpenAI key. Ask whoever runs Pompi to add one." : "Sorry, I hit a problem answering that. Try writing it again in a moment.",
        cards: [],
        computer_task: "",
      };
      console.error("[brain] answer failed", msg);
    }
    const task = hasOrgo() && !failed ? answer.computer_task.trim() : "";
    await say(target, "writing", answer.cards.length ? `Writing ${answer.cards[0].title || "it"}` : "Replying");
    const first = await ctx.runMutation(internal.brain.place, { requestId, agentId: agent._id, reply: answer.reply.trim() || "On it.", cards: answer.cards, failed });
    if (!task || !first) {
      await sleep(900);
      if (first) await say({ x: first.x + first.w - 24, y: first.y + first.h + 10 }, "idle");
      await ctx.runMutation(internal.brain.setRequest, { requestId, status: failed ? "failed" : "done" });
      return;
    }

    // 4. Work on the board's computer, where everyone can watch.
    await onComputer(ctx, { boardId, requestId, agent, agents, goal: task, anchor: first.cid, from: first });
  },
});

/** Carries an agent's work on after the user answered its raised hand. */
export const resume = internalAction({
  args: { boardId: v.id("boards"), itemId: v.string(), approve: v.boolean() },
  handler: async (ctx, { boardId, itemId, approve }) => {
    const r = await ctx.runQuery(internal.brain.askContext, { boardId, itemId });
    if (!r) return;
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
  },
});

export const askContext = internalQuery({
  args: { boardId: v.id("boards"), itemId: v.string() },
  handler: async (ctx, { boardId, itemId }) => {
    const item = await ctx.db
      .query("items")
      .withIndex("by_board_cid", (q) => q.eq("boardId", boardId).eq("cid", itemId))
      .unique();
    const p = item?.props as { agentId?: Id<"agents">; requestId?: Id<"requests">; ask?: { goal: string; responseId: string; callId?: string; checks?: Resume["checks"] } } | undefined;
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
  o: { boardId: Id<"boards">; requestId: Id<"requests">; agent: Doc<"agents">; agents: Doc<"agents">[]; goal: string; anchor: string; from: Box; resume?: Resume; approved?: boolean },
) {
  const { boardId, requestId, agent } = o;
  const say = (s: { x: number; y: number }, status: "walking" | "thinking" | "writing" | "idle", doing?: string) => ctx.runMutation(internal.brain.setAgent, { boardId, agentId: agent._id, ...s, status, doing });
  const finish = async (reply: string, failed = false, ask?: { text: string; resume: Resume }) => {
    const placed = await ctx.runMutation(internal.brain.place, {
      requestId,
      agentId: agent._id,
      reply,
      cards: [],
      failed,
      anchor: o.anchor,
      ...(ask ? { ask: { action: ask.text, goal: o.goal, status: "waiting" as const, responseId: ask.resume.responseId, ...(ask.resume.callId ? { callId: ask.resume.callId } : {}), ...(ask.resume.checks ? { checks: ask.resume.checks.map((c) => ({ id: c.id, code: c.code ?? null, message: c.message ?? null })) } : {}) } } : {}),
    });
    if (placed) await say({ x: placed.x + placed.w - 24, y: placed.y + placed.h + 10 }, "idle");
    await ctx.runMutation(internal.brain.setRequest, { requestId, status: failed ? "failed" : "done" });
  };

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
    if (Date.now() - t0 > 4 * 60_000) return finish("The computer's still busy with a teammate's work. Write it again in a few minutes and I'll pick it up.", true);
    await say({ x: frame.x + frame.w / 2, y: frame.y + 20 }, "thinking", "Waiting for the computer");
    await sleep(4000);
  }

  try {
    await say({ x: frame.x + frame.w / 2, y: frame.y + 20 }, "thinking", "Starting the computer");
    const orgoId = await ensureOn(ctx, boardId);
    await say({ x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 }, "writing", "Using the computer");
    const result = await runOnComputer({
      orgoId,
      model: SOL(),
      instructions: computerPersona(agent, o.agents),
      goal: o.goal,
      resume: o.resume,
      approved: o.approved,
      onStep: async (s) => {
        await say(s.at ? onFrame(frame, s.at) : { x: frame.x + frame.w - 40, y: frame.y + 20 }, "writing", s.doing);
        await ctx.runMutation(internal.computer.patch, { boardId, touch: true });
      },
    });
    if (result.kind === "ask") return await finish(result.text, false, { text: result.text, resume: result.resume });
    await finish(result.text, result.kind === "failed");
  } catch (e) {
    console.error("[brain] computer work failed", (e as Error).message);
    await finish(`I couldn't use the computer: ${(e as Error).message.slice(0, 160)}`, true);
  } finally {
    await ctx.runMutation(internal.computer.release, { boardId, requestId });
  }
}

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "cards", "computer_task"],
  properties: {
    reply: { type: "string", description: "What you say on the board, beside their text: one to three short sentences, plain words, no markdown." },
    cards: {
      type: "array",
      description: "Work you made for them, each as a card on the board. Empty when they only asked a question, or when the work happens on the computer.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "body"],
        properties: {
          type: { type: "string", enum: ["post", "note"], description: "post: a social post ready to publish. note: anything else (copy, a plan, a list, research, a summary)." },
          title: { type: "string", description: "A short title for the card." },
          body: { type: "string", description: "The work itself. Plain text; line breaks and '- ' bullets are fine." },
        },
      },
    },
    computer_task: {
      type: "string",
      description:
        "If doing this needs your computer (browsing or checking a website, research on the live web, writing or running code, building or deploying a site, using a web app), the task for yourself, fully spelled out with everything from the board you'll need. Otherwise an empty string. When set, your reply is a short line saying you're on it.",
    },
  },
};

function persona(agent: Doc<"agents">, team: Doc<"agents">[]) {
  const others = team.filter((a) => a._id !== agent._id).map((a) => `${a.name} (${a.role})`);
  return [
    `You are ${agent.name}, the ${agent.role} on a team working on a shared Pompi board: an infinite canvas like FigJam, where people and AI agents work side by side.`,
    agent.instructions ? `How you work, in your team's words:\n${agent.instructions}` : "",
    others.length ? `Your agent teammates on this board: ${others.join(", ")}.` : "",
    "Someone just wrote something on the board meant for you. Your cursor walked over, and you answer right beside it.",
    "Reply like a teammate standing at the whiteboard: one to three short sentences, warm and direct, no markdown, no preamble.",
    "When they ask you to make something you can write yourself (a post, copy, a plan, a list, a summary of what's on the board), put the work in cards and keep the reply to a line about it. Questions you can answer from the board get a reply and no cards.",
    hasOrgo()
      ? "The board has a shared computer (a Linux desktop with a browser and a terminal) you can use. When the request needs it (checking a live site, browsing, research on the web, code, building or deploying), set computer_task and say in your reply that you're on it. Never claim you did something before you've done it."
      : "The board's computer isn't connected yet, so you can't browse, run code or deploy. If the request needs that, say so plainly in one sentence, and what you'd do once it is. Never claim you did something you didn't.",
    "Use what's written nearby on the board as context: it's what they're looking at.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function computerPersona(agent: Doc<"agents">, team: Doc<"agents">[]) {
  return [
    persona(agent, team),
    `Now you're at the board's shared computer: a Linux desktop (${SCREEN.w}×${SCREEN.h}) with a web browser and a terminal. Everyone on the board is watching its screen, and your cursor.`,
    "Do the task. Use run_shell for terminal work (files, git, npm, building and running code, CLIs); use the screen for websites and apps. If a browser isn't open and you need one, open it from the desktop or run `nohup firefox >/dev/null 2>&1 &` (or chromium).",
    "Before anything that publishes, deploys to production, sends, posts, buys, pays, deletes, or can't easily be undone, stop and answer with a message that starts with NEED_OK: and then one or two sentences saying exactly what you're about to do and anything they should know first (like failing tests). Don't do it until they say yes.",
    "When you're done, answer in one to three short sentences: what you did or found, in plain words. Include any link that matters.",
  ].join("\n\n");
}
