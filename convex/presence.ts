import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireMember } from "./lib";

/** A tab that hasn't checked in for this long has left (closed, slept, lost its connection). */
const GONE_MS = 30_000;

/** Who else is on the board now, with their cursors. */
export const list = query({
  args: { boardId: v.id("boards"), since: v.number() },
  handler: async (ctx, { boardId, since }) => {
    await requireMember(ctx, boardId);
    // `since` is the client's clock rounded to a few seconds, so this query is cached between ticks.
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_board_seen", (q) => q.eq("boardId", boardId).gt("lastSeen", since - GONE_MS))
      .collect();
    return rows.map(({ sessionId, userId, name, image, color, cursor, selection }) => ({ sessionId, userId, name, image, color, cursor, selection }));
  },
});

/** Where my cursor is and what I've selected, sent a few times a second while it moves. */
export const update = mutation({
  args: {
    boardId: v.id("boards"),
    sessionId: v.string(),
    color: v.string(),
    cursor: v.optional(v.object({ x: v.number(), y: v.number() })),
    selection: v.array(v.string()),
  },
  handler: async (ctx, { boardId, sessionId, color, cursor, selection }) => {
    const me = await requireMember(ctx, boardId);
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_board_session", (q) => q.eq("boardId", boardId).eq("sessionId", sessionId))
      .unique();
    const row = { userId: me.userId, name: me.name, image: me.image, color, cursor, selection: selection.slice(0, 200), lastSeen: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("presence", { boardId, sessionId, ...row });
  },
});

/** I closed the board. */
export const leave = mutation({
  args: { boardId: v.id("boards"), sessionId: v.string() },
  handler: async (ctx, { boardId, sessionId }) => {
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_board_session", (q) => q.eq("boardId", boardId).eq("sessionId", sessionId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** Clears rows of tabs that left without saying so (crons.ts). */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 10 * 60_000;
    const stale = await ctx.db
      .query("presence")
      .filter((q) => q.lt(q.field("lastSeen"), cutoff))
      .take(500);
    for (const row of stale) await ctx.db.delete(row._id);
  },
});
