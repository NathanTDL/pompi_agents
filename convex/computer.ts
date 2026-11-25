import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { planOf, startTrial } from "./billing";
import { requireMember } from "./lib";
import { hasOrgo, orgo, OrgoError } from "./orgo";

/**
 * Each person's one computer, used by the agents on all their boards: they log
 * in to their accounts once, and every board's agents can use them. A board
 * uses its owner's computer. One agent at a time has it (the others wait); it's
 * off until someone starts it or an agent needs it, and stops itself after a
 * while unused, so it only costs anything while it's on.
 *
 * It's the owner's: only they take control of it or get its password (which is
 * root on it). Others on the board see its screen only while one of that
 * board's agents is working on it, never what the owner does elsewhere.
 */

/** Unused this long, a computer stops itself. */
const IDLE_MS = 30 * 60_000;
/** Unused this long, a computer is deleted (with its files and logins): a stopped one still costs its storage. The next use makes a fresh one. */
const FORGET_MS = 30 * 24 * 60 * 60_000;
/** How long a start may take before it counts as failed. */
const BOOT_MS = 5 * 60_000;
/** Orgo statuses of a computer that's up or on its way up: nothing to do but wait. */
const WAKING = ["running", "creating", "resuming", "restarting", "updating"];
/** An agent's hold on the computer older than this is stale (its run died). */
const HOLD_MS = 15 * 60_000;

/** The computer of `userId`, if they've had one. */
/**
 * Someone's computer. It's only busy while the work holding it is still going:
 * once that request is stopped or over, it's free at once, even before the
 * agent's run notices and lets go (release).
 */
async function computerOf(ctx: QueryCtx, userId: string) {
  const c = await ctx.db
    .query("computers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!c?.busy) return c;
  const request = await ctx.db.get(c.busy.requestId);
  return request && (request.status === "routing" || request.status === "working") ? c : { ...c, busy: undefined };
}

/** The board's owner, whose computer its agents use. */
async function ownerOf(ctx: QueryCtx, boardId: Id<"boards">) {
  const board = await ctx.db.get(boardId);
  if (!board) throw new ConvexError("Board not found");
  return board.ownerId;
}

/** Whether an agent from `boardId` is on the computer now. */
const busyHere = (c: Doc<"computers"> | null, boardId: Id<"boards">) => !!c?.busy && c.busy.boardId === boardId && Date.now() - c.busy.since < HOLD_MS;
const busyAnywhere = (c: Doc<"computers"> | null) => !!c?.busy && Date.now() - c.busy.since < HOLD_MS;

export const state = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const me = await requireMember(ctx, boardId);
    const c = await computerOf(ctx, me.board.ownerId);
    const here = busyHere(c, boardId);
    return {
      status: c?.status ?? "off",
      error: c?.error,
      // What another board's agent does there isn't this board's business: only that it's busy.
      busy: here ? c!.busy! : null,
      elsewhere: !here && busyAnywhere(c),
      /** It's yours (you own this board): you can use it, not only watch it. */
      mine: me.userId === me.board.ownerId,
      configured: hasOrgo(),
    };
  },
});

export const start = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const me = await requireMember(ctx, boardId);
    if (!hasOrgo()) throw new ConvexError("This deployment has no Orgo key yet");
    const userId = me.board.ownerId;
    // Starting it is using Pompi: without a plan, it starts the free trial (if they haven't had it).
    await startTrial(ctx, userId);
    if ((await planOf(ctx, userId)) === "none") throw new ConvexError(me.userId === userId ? "Choose a plan to use your computer" : "The board's owner needs a plan for the computer");
    const c = await computerOf(ctx, userId);
    if (c && (c.status === "on" || c.status === "starting")) return;
    const now = Date.now();
    if (c) await ctx.db.patch(c._id, { status: "starting", error: undefined, lastUsedAt: now, updatedAt: now });
    else await ctx.db.insert("computers", { userId, status: "starting", lastUsedAt: now, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.computer.boot, { userId });
  },
});

export const stop = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const me = await requireMember(ctx, boardId);
    if (me.userId !== me.board.ownerId) throw new ConvexError("Only the board's owner can stop their computer");
    const c = await computerOf(ctx, me.userId);
    if (!c || c.status === "off" || c.status === "stopping") return;
    if (busyAnywhere(c)) throw new ConvexError("An agent is using the computer right now");
    await ctx.db.patch(c._id, { status: "stopping", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.computer.halt, { userId: me.userId });
  },
});

/**
 * For the screen route (src/app/api/screen): the Orgo computer to show, while
 * it's on: to its owner always, to others on the board only while one of the
 * board's agents works on it.
 */
export const forScreen = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const me = await requireMember(ctx, boardId);
    const c = await computerOf(ctx, me.board.ownerId);
    if (c?.status !== "on" || !c.orgoId) return null;
    return me.userId === me.board.ownerId || busyHere(c, boardId) ? c.orgoId : null;
  },
});

/** For `connect`: the owner's own computer, while it's on. */
export const ownComputer = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const me = await requireMember(ctx, boardId);
    if (me.userId !== me.board.ownerId) return null;
    const c = await computerOf(ctx, me.userId);
    return c?.status === "on" && c.orgoId ? c.orgoId : null;
  },
});

/**
 * The live desktop, for the owner watching or using their computer on the
 * board: its Orgo id and its password for the desktop stream (VNC over a
 * websocket, straight from the browser to Orgo, so it's real time and sharp).
 * Only while it's on. The password changes whenever the computer restarts.
 */
export const connect = action({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }): Promise<{ id: string; password: string } | null> => {
    const id: string | null = await ctx.runQuery(api.computer.ownComputer, { boardId });
    if (!id) return null;
    const r = await orgo.vncPassword(id).catch((e: unknown) => {
      console.warn("[computer] no desktop password", (e as Error).message);
      return null;
    });
    return r?.password ? { id, password: r.password } : null;
  },
});

/**
 * For the input route (src/app/api/screen/[boardId]/input): the owner's Orgo
 * computer to drive (even while an agent works on it: they work side by side),
 * and the agent on it now, if any. Marks the computer used, so it doesn't stop
 * while they're at it.
 */
export const forInput = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const me = await requireMember(ctx, boardId);
    if (me.userId !== me.board.ownerId) throw new ConvexError("Only the board's owner can use their computer");
    const c = await computerOf(ctx, me.userId);
    if (c?.status !== "on" || !c.orgoId) return { orgoId: null, agent: null };
    const busy = busyAnywhere(c) ? await ctx.db.get(c.busy!.agentId) : null;
    await ctx.db.patch(c._id, { lastUsedAt: Date.now() });
    return { orgoId: c.orgoId, agent: busy ? busy.name : null };
  },
});

/* ---------------- internal ---------------- */

export const owner = internalQuery({
  args: { boardId: v.id("boards") },
  handler: (ctx, { boardId }) => ownerOf(ctx, boardId),
});

export const row = internalQuery({
  args: { userId: v.string() },
  handler: (ctx, { userId }) => computerOf(ctx, userId),
});

/** Changes the computer of `userId`, or of the owner of `boardId`. */
export const patch = internalMutation({
  args: {
    userId: v.optional(v.string()),
    boardId: v.optional(v.id("boards")),
    orgoId: v.optional(v.string()),
    status: v.optional(v.union(v.literal("off"), v.literal("starting"), v.literal("on"), v.literal("stopping"), v.literal("error"))),
    error: v.optional(v.string()),
    clearError: v.optional(v.boolean()),
    touch: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId: given, boardId, clearError, touch, ...fields }) => {
    const userId = given ?? (boardId ? await ownerOf(ctx, boardId) : null);
    if (!userId) throw new Error("computer.patch needs a userId or a boardId");
    const now = Date.now();
    const set = { ...Object.fromEntries(Object.entries(fields).filter(([, x]) => x !== undefined)), ...(clearError ? { error: undefined } : {}), ...(touch ? { lastUsedAt: now } : {}), updatedAt: now };
    const c = await computerOf(ctx, userId);
    if (c) await ctx.db.patch(c._id, set);
    else await ctx.db.insert("computers", { userId, status: "off", lastUsedAt: now, ...set });
  },
});

/** Takes the board owner's computer for a request, or says who has it. */
export const claim = internalMutation({
  args: { boardId: v.id("boards"), requestId: v.id("requests"), agentId: v.id("agents"), doing: v.string() },
  handler: async (ctx, { boardId, requestId, agentId, doing }) => {
    const c = await computerOf(ctx, await ownerOf(ctx, boardId));
    if (!c) return { ok: false as const, reason: "no computer" };
    if (busyAnywhere(c) && c.busy!.requestId !== requestId) return { ok: false as const, reason: "busy", agentId: c.busy!.agentId, elsewhere: c.busy!.boardId !== boardId };
    await ctx.db.patch(c._id, { busy: { requestId, agentId, boardId, doing, since: Date.now() }, lastUsedAt: Date.now() });
    return { ok: true as const };
  },
});

/** An agent's latest action on the computer, for the screen to show (and the computer stays awake meanwhile). */
export const step = internalMutation({
  args: { boardId: v.id("boards"), requestId: v.id("requests"), doing: v.string(), kind: v.string(), x: v.optional(v.number()), y: v.optional(v.number()), dir: v.optional(v.string()) },
  handler: async (ctx, { boardId, requestId, doing, ...step }) => {
    const c = await computerOf(ctx, await ownerOf(ctx, boardId));
    if (!c) return;
    const now = Date.now();
    await ctx.db.patch(c._id, { lastUsedAt: now, ...(c.busy?.requestId === requestId ? { busy: { ...c.busy, doing, step: { ...step, at: now } } } : {}) });
  },
});

export const release = internalMutation({
  args: { boardId: v.id("boards"), requestId: v.id("requests") },
  handler: async (ctx, { boardId, requestId }) => {
    const c = await computerOf(ctx, await ownerOf(ctx, boardId));
    if (c?.busy?.requestId === requestId) await ctx.db.patch(c._id, { busy: undefined, lastUsedAt: Date.now() });
  },
});

/**
 * Once, after computers moved from boards to people: each board's computer
 * becomes its owner's. Someone with computers on several boards keeps the one
 * with an Orgo computer, used most recently; the others are deleted at Orgo.
 */
export const adoptBoardComputers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = (await ctx.db.query("computers").collect()).filter((c) => !c.userId);
    const removed: string[] = [];
    for (const c of rows) {
      const board = c.boardId ? await ctx.db.get(c.boardId) : null;
      if (!board) {
        if (c.orgoId) removed.push(c.orgoId);
        await ctx.db.delete(c._id);
        continue;
      }
      const theirs = await computerOf(ctx, board.ownerId);
      const better = (a: Doc<"computers">, b: Doc<"computers">) => (!!a.orgoId === !!b.orgoId ? a.lastUsedAt > b.lastUsedAt : !!a.orgoId);
      if (!theirs) {
        await ctx.db.patch(c._id, { userId: board.ownerId, boardId: undefined, busy: undefined });
      } else if (better(c, theirs)) {
        if (theirs.orgoId) removed.push(theirs.orgoId);
        await ctx.db.delete(theirs._id);
        await ctx.db.patch(c._id, { userId: board.ownerId, boardId: undefined, busy: undefined });
      } else {
        if (c.orgoId) removed.push(c.orgoId);
        await ctx.db.delete(c._id);
      }
    }
    for (const id of removed) await ctx.scheduler.runAfter(0, internal.computer.discard, { orgoId: id });
    return { moved: rows.length, discarded: removed.length };
  },
});

/** Deletes an Orgo computer nobody uses any more. */
export const discard = internalAction({
  args: { orgoId: v.string() },
  handler: async (_ctx, { orgoId }) => {
    await orgo.remove(orgoId).catch((e: unknown) => console.warn("[computer] couldn't delete", orgoId, (e as Error).message));
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Makes sure the computer of the board's owner is on, making it the first time;
 * returns its Orgo id. Used by `boot` and by an agent that needs it (brain.ts).
 */
export async function ensureOn(ctx: ActionCtx, boardId: Id<"boards">): Promise<string> {
  return ensureOnFor(ctx, await ctx.runQuery(internal.computer.owner, { boardId }));
}

async function ensureOnFor(ctx: ActionCtx, userId: string): Promise<string> {
  let c = await ctx.runQuery(internal.computer.row, { userId });
  if (c?.status === "on" && c.orgoId) {
    // Trust but check: Orgo may have stopped it meanwhile.
    const now = await orgo.get(c.orgoId).catch(() => null);
    if (now?.status === "running") return c.orgoId;
  }
  await ctx.runMutation(internal.computer.patch, { userId, status: "starting", clearError: true, touch: true });
  c = await ctx.runQuery(internal.computer.row, { userId });
  let id = c?.orgoId;
  try {
    let status: string | undefined;
    if (id) {
      const now = await orgo.get(id).catch((e: unknown) => (e instanceof OrgoError && e.status === 404 ? null : { status: undefined }));
      if (now === null) id = undefined;
      else status = now.status;
    }
    // A slow start isn't a failed one, nor one Orgo says isn't needed (409): the wait below sees when it's running.
    const slowOk = (e: unknown) => {
      if (!(e instanceof OrgoError && (e.code === "timeout" || e.status === 409))) throw e;
    };
    if (!id) {
      const made = await orgo.create(`pompi-${userId}`);
      id = made.id;
      await ctx.runMutation(internal.computer.patch, { userId, orgoId: id });
    } else {
      // Its desktop's address changes when it restarts.
      orgo.forget(id);
      // Asleep (Orgo's idle timer) wakes with resume; stopped (frozen, stopped, error) boots with start; on its way up, it's waited for.
      if (status === "suspended" || status === "suspending") await orgo.resume(id).catch(slowOk);
      else if (!status || !WAKING.includes(status)) await orgo.start(id).catch(slowOk);
    }
    const t0 = Date.now();
    for (;;) {
      const now = await orgo.get(id).catch(() => null);
      if (now?.status === "running") break;
      if (Date.now() - t0 > BOOT_MS) throw new Error("The computer took too long to start");
      await sleep(3000);
    }
    await ctx.runMutation(internal.computer.patch, { userId, status: "on", touch: true });
    return id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.runMutation(internal.computer.patch, { userId, status: "error", error: msg.slice(0, 300) });
    throw e;
  }
}

export const boot = internalAction({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await ensureOnFor(ctx, userId).catch((e: unknown) => console.error("[computer] boot failed", (e as Error).message));
  },
});

export const halt = internalAction({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const c = await ctx.runQuery(internal.computer.row, { userId });
    try {
      if (c?.orgoId) await orgo.stop(c.orgoId);
      await ctx.runMutation(internal.computer.patch, { userId, status: "off", clearError: true });
    } catch (e) {
      await ctx.runMutation(internal.computer.patch, { userId, status: "error", error: (e as Error).message.slice(0, 300) });
    }
  },
});

/**
 * Deletes computers nobody has used for FORGET_MS (crons.ts), at Orgo and here.
 * Whoever comes back gets a new one the next time it's needed.
 */
export const forget = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("computers")
      .withIndex("by_last_used", (q) => q.lt("lastUsedAt", Date.now() - FORGET_MS))
      .take(100);
    for (const c of old) await discardComputer(ctx, c);
  },
});

/** Deletes a computer, at Orgo and here, unless it's in use (busy, or mid-start or -stop). */
async function discardComputer(ctx: MutationCtx, c: Doc<"computers">) {
  if (busyAnywhere(c) || c.status === "starting" || c.status === "stopping") return;
  if (c.orgoId) await ctx.scheduler.runAfter(0, internal.computer.discard, { orgoId: c.orgoId });
  await ctx.db.delete(c._id);
}

/** Deletes someone's computer (billing.ts, a week after a free trial ended without a plan). */
export async function forgetComputer(ctx: MutationCtx, userId: string) {
  const c = await ctx.db
    .query("computers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (c) await discardComputer(ctx, c);
}

/** Stops computers nobody has used for a while (crons.ts), so they stop costing money. */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const idle = await ctx.db
      .query("computers")
      .withIndex("by_status", (q) => q.eq("status", "on").lt("lastUsedAt", Date.now() - IDLE_MS))
      .take(50);
    for (const c of idle) {
      if (busyAnywhere(c) || !c.userId) continue;
      await ctx.db.patch(c._id, { status: "stopping", updatedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.computer.halt, { userId: c.userId });
    }
  },
});
