import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx } from "./_generated/server";
import { requireMember } from "./lib";
import { hasOrgo, orgo, OrgoError } from "./orgo";

/**
 * Each board's one computer, shared by all its agents. It's off until someone
 * starts it or an agent needs it, and stops itself after a while unused, so a
 * board only costs anything while its computer is on.
 */

/** Unused this long, a computer stops itself. */
const IDLE_MS = 7 * 60_000;
/** How long a start may take before it counts as failed. */
const BOOT_MS = 5 * 60_000;

export const state = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    await requireMember(ctx, boardId);
    const c = await ctx.db
      .query("computers")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .unique();
    return { status: c?.status ?? "off", error: c?.error, busy: c?.busy ?? null, configured: hasOrgo() };
  },
});

export const start = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    await requireMember(ctx, boardId);
    if (!hasOrgo()) throw new ConvexError("This deployment has no Orgo key yet");
    const c = await ctx.db
      .query("computers")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .unique();
    if (c && (c.status === "on" || c.status === "starting")) return;
    const now = Date.now();
    if (c) await ctx.db.patch(c._id, { status: "starting", error: undefined, lastUsedAt: now, updatedAt: now });
    else await ctx.db.insert("computers", { boardId, status: "starting", lastUsedAt: now, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.computer.boot, { boardId });
  },
});

export const stop = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    await requireMember(ctx, boardId);
    const c = await ctx.db
      .query("computers")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .unique();
    if (!c || c.status === "off" || c.status === "stopping") return;
    if (c.busy) throw new ConvexError("An agent is using the computer right now");
    await ctx.db.patch(c._id, { status: "stopping", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.computer.halt, { boardId });
  },
});

/** For the screen route (src/app/api/screen): the Orgo computer to show, for a member, while it's on. */
export const forScreen = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    await requireMember(ctx, boardId);
    const c = await ctx.db
      .query("computers")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .unique();
    return c?.status === "on" && c.orgoId ? c.orgoId : null;
  },
});

/**
 * The live desktop, for a member watching or using the computer on the board:
 * its Orgo id and its password for the desktop stream (VNC over a websocket,
 * straight from the browser to Orgo, so it's real time and sharp). Only while
 * it's on. The password changes whenever the computer restarts.
 */
export const connect = action({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }): Promise<{ id: string; password: string } | null> => {
    const id: string | null = await ctx.runQuery(api.computer.forScreen, { boardId });
    if (!id) return null;
    const r = await orgo.vncPassword(id).catch((e: unknown) => {
      console.warn("[computer] no desktop password", (e as Error).message);
      return null;
    });
    return r?.password ? { id, password: r.password } : null;
  },
});

/**
 * For the input route (src/app/api/screen/[boardId]/input): the Orgo computer a
 * member may drive, and the agent on it now, if any (then the person waits).
 * Marks the computer used, so it doesn't stop while someone's at it.
 */
export const forInput = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    await requireMember(ctx, boardId);
    const c = await ctx.db
      .query("computers")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .unique();
    if (c?.status !== "on" || !c.orgoId) return { orgoId: null, agent: null };
    const busy = c.busy && Date.now() - c.busy.since < 15 * 60_000 ? await ctx.db.get(c.busy.agentId) : null;
    if (!busy) await ctx.db.patch(c._id, { lastUsedAt: Date.now() });
    return { orgoId: c.orgoId, agent: busy ? busy.name : null };
  },
});

/* ---------------- internal ---------------- */

export const row = internalQuery({
  args: { boardId: v.id("boards") },
  handler: (ctx, { boardId }) =>
    ctx.db
      .query("computers")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .unique(),
});

export const patch = internalMutation({
  args: {
    boardId: v.id("boards"),
    orgoId: v.optional(v.string()),
    status: v.optional(v.union(v.literal("off"), v.literal("starting"), v.literal("on"), v.literal("stopping"), v.literal("error"))),
    error: v.optional(v.string()),
    clearError: v.optional(v.boolean()),
    touch: v.optional(v.boolean()),
  },
  handler: async (ctx, { boardId, clearError, touch, ...fields }) => {
    const now = Date.now();
    const set = { ...Object.fromEntries(Object.entries(fields).filter(([, x]) => x !== undefined)), ...(clearError ? { error: undefined } : {}), ...(touch ? { lastUsedAt: now } : {}), updatedAt: now };
    const c = await ctx.db
      .query("computers")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .unique();
    if (c) await ctx.db.patch(c._id, set);
    else await ctx.db.insert("computers", { boardId, status: "off", lastUsedAt: now, ...set });
  },
});

/** Takes the computer for a request, or says who has it. A hold older than 15 minutes is stale (its run died). */
export const claim = internalMutation({
  args: { boardId: v.id("boards"), requestId: v.id("requests"), agentId: v.id("agents"), doing: v.string() },
  handler: async (ctx, { boardId, requestId, agentId, doing }) => {
    const c = await ctx.db
      .query("computers")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .unique();
    if (!c) return { ok: false as const, reason: "no computer" };
    if (c.busy && c.busy.requestId !== requestId && Date.now() - c.busy.since < 15 * 60_000) return { ok: false as const, reason: "busy", agentId: c.busy.agentId };
    await ctx.db.patch(c._id, { busy: { requestId, agentId, doing, since: Date.now() }, lastUsedAt: Date.now() });
    return { ok: true as const };
  },
});

/** An agent's latest action on the computer, for the screen to show (and the computer stays awake meanwhile). */
export const step = internalMutation({
  args: { boardId: v.id("boards"), requestId: v.id("requests"), doing: v.string(), kind: v.string(), x: v.optional(v.number()), y: v.optional(v.number()), dir: v.optional(v.string()) },
  handler: async (ctx, { boardId, requestId, doing, ...step }) => {
    const c = await ctx.db
      .query("computers")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .unique();
    if (!c) return;
    const now = Date.now();
    await ctx.db.patch(c._id, { lastUsedAt: now, ...(c.busy?.requestId === requestId ? { busy: { ...c.busy, doing, step: { ...step, at: now } } } : {}) });
  },
});

export const release = internalMutation({
  args: { boardId: v.id("boards"), requestId: v.id("requests") },
  handler: async (ctx, { boardId, requestId }) => {
    const c = await ctx.db
      .query("computers")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .unique();
    if (c?.busy?.requestId === requestId) await ctx.db.patch(c._id, { busy: undefined, lastUsedAt: Date.now() });
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Makes sure the board's computer is on, making it the first time; returns its Orgo id.
 * Used by `boot` and by an agent that needs the computer (brain.ts).
 */
export async function ensureOn(ctx: ActionCtx, boardId: Id<"boards">): Promise<string> {
  let c = await ctx.runQuery(internal.computer.row, { boardId });
  if (c?.status === "on" && c.orgoId) {
    // Trust but check: Orgo may have stopped it meanwhile.
    const now = await orgo.get(c.orgoId).catch(() => null);
    if (now?.status === "running") return c.orgoId;
  }
  await ctx.runMutation(internal.computer.patch, { boardId, status: "starting", clearError: true, touch: true });
  c = await ctx.runQuery(internal.computer.row, { boardId });
  let id = c?.orgoId;
  try {
    if (id) {
      const gone = await orgo.get(id).then(
        () => false,
        (e: unknown) => e instanceof OrgoError && e.status === 404,
      );
      if (gone) id = undefined;
    }
    if (!id) {
      const made = await orgo.create(`pompi-${boardId}`);
      id = made.id;
      await ctx.runMutation(internal.computer.patch, { boardId, orgoId: id });
    } else {
      await orgo.start(id);
    }
    const t0 = Date.now();
    for (;;) {
      const now = await orgo.get(id).catch(() => null);
      if (now?.status === "running") break;
      if (Date.now() - t0 > BOOT_MS) throw new Error("The computer took too long to start");
      await sleep(3000);
    }
    await ctx.runMutation(internal.computer.patch, { boardId, status: "on", touch: true });
    return id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.runMutation(internal.computer.patch, { boardId, status: "error", error: msg.slice(0, 300) });
    throw e;
  }
}

export const boot = internalAction({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    await ensureOn(ctx, boardId).catch((e: unknown) => console.error("[computer] boot failed", (e as Error).message));
  },
});

export const halt = internalAction({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const c = await ctx.runQuery(internal.computer.row, { boardId });
    try {
      if (c?.orgoId) await orgo.stop(c.orgoId);
      await ctx.runMutation(internal.computer.patch, { boardId, status: "off", clearError: true });
    } catch (e) {
      await ctx.runMutation(internal.computer.patch, { boardId, status: "error", error: (e as Error).message.slice(0, 300) });
    }
  },
});

/** Stops computers nobody has used for a while (crons.ts), so they stop costing money. */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const idle = await ctx.db
      .query("computers")
      .withIndex("by_status", (q) => q.eq("status", "on").lt("lastUsedAt", Date.now() - IDLE_MS))
      .take(50);
    for (const c of idle) {
      if (c.busy) continue;
      await ctx.db.patch(c._id, { status: "stopping", updatedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.computer.halt, { boardId: c.boardId });
    }
  },
});
