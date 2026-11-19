import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { newInviteCode, requireMember, requireUser } from "./lib";
import { TEMPLATE_NAMES, TEMPLATES, templateItems } from "./templates";

/** Items read per board for its thumbnail on the board list. */
const PREVIEW_ITEMS = 80;

/** The boards I'm on, most recently opened first. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const memberships = await ctx.db
      .query("boardMembers")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .take(200);
    const boards = await Promise.all(memberships.map((m) => ctx.db.get(m.boardId)));
    return Promise.all(
      boards.flatMap((b, i) => (b ? [{ b, m: memberships[i] }] : [])).map(async ({ b, m }) => {
        // Enough of the board to draw a thumbnail: where things are and their colours.
        const items = await ctx.db
          .query("items")
          .withIndex("by_board", (q) => q.eq("boardId", b._id))
          .take(PREVIEW_ITEMS);
        const members = await ctx.db
          .query("boardMembers")
          .withIndex("by_board", (q) => q.eq("boardId", b._id))
          .take(50);
        return {
          _id: b._id,
          name: b.name,
          role: m.role,
          lastOpenedAt: m.lastOpenedAt,
          updatedAt: b.updatedAt,
          members: members.length,
          preview: items.map((it) => ({ kind: it.kind, x: it.x, y: it.y, w: it.w, h: it.h, color: typeof it.props?.color === "string" ? it.props.color : undefined, shape: it.props?.shape })),
        };
      }),
    );
  },
});

/** One board, for its members. */
export const get = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const board = await ctx.db.get(boardId);
    if (!board) return null;
    const member = await ctx.db
      .query("boardMembers")
      .withIndex("by_board_user", (q) => q.eq("boardId", boardId).eq("userId", identity.subject))
      .unique();
    if (!member) return null;
    return { _id: board._id, name: board.name, role: member.role, inviteCode: board.inviteCode };
  },
});

export const create = mutation({
  args: { name: v.optional(v.string()), template: v.optional(v.union(...TEMPLATES.map((t) => v.literal(t)))) },
  handler: async (ctx, { name, template = "blank" }) => {
    const me = await requireUser(ctx);
    const now = Date.now();
    const boardId = await ctx.db.insert("boards", {
      name: name?.trim() || TEMPLATE_NAMES[template],
      ownerId: me.userId,
      inviteCode: newInviteCode(),
      updatedAt: now,
    });
    await ctx.db.insert("boardMembers", { boardId, userId: me.userId, role: "owner", lastOpenedAt: now });
    let z = 1;
    for (const seed of templateItems(template, me.name.split(" ")[0])) {
      await ctx.db.insert("items", { ...seed, boardId, cid: crypto.randomUUID(), z: z++, createdBy: me.userId, updatedBy: me.userId, updatedAt: now });
    }
    return boardId;
  },
});

export const rename = mutation({
  args: { boardId: v.id("boards"), name: v.string() },
  handler: async (ctx, { boardId, name }) => {
    await requireMember(ctx, boardId);
    const trimmed = name.trim().slice(0, 120);
    if (!trimmed) throw new ConvexError("A board needs a name");
    await ctx.db.patch(boardId, { name: trimmed, updatedAt: Date.now() });
  },
});

/** Deletes the board and everything on it. Owner only. */
export const remove = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const { member } = await requireMember(ctx, boardId);
    if (member.role !== "owner") throw new ConvexError("Only the board's owner can delete it");
    for (const table of ["items", "boardMembers", "agents", "agentStates", "requests"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_board", (q) => q.eq("boardId", boardId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_board_seen", (q) => q.eq("boardId", boardId))
      .collect();
    for (const row of presence) await ctx.db.delete(row._id);
    await ctx.db.delete(boardId);
  },
});

/** Marks the board as opened now, so it rises to the top of my list. */
export const opened = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const { member } = await requireMember(ctx, boardId);
    await ctx.db.patch(member._id, { lastOpenedAt: Date.now() });
  },
});

/** Joins the board a share link points to; returns its id. Joining twice is fine. */
export const join = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requireUser(ctx);
    const board = await ctx.db
      .query("boards")
      .withIndex("by_invite", (q) => q.eq("inviteCode", code.trim()))
      .unique();
    if (!board) throw new ConvexError("This invite link doesn't work any more");
    const existing = await ctx.db
      .query("boardMembers")
      .withIndex("by_board_user", (q) => q.eq("boardId", board._id).eq("userId", me.userId))
      .unique();
    if (!existing) {
      await ctx.db.insert("boardMembers", { boardId: board._id, userId: me.userId, role: "editor", lastOpenedAt: Date.now() });
    }
    return board._id;
  },
});

/** A new share link; the old one stops working. Owner only. */
export const resetInvite = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const { member } = await requireMember(ctx, boardId);
    if (member.role !== "owner") throw new ConvexError("Only the board's owner can reset the link");
    const inviteCode = newInviteCode();
    await ctx.db.patch(boardId, { inviteCode });
    return inviteCode;
  },
});
