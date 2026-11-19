import { ConvexError, v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireMember } from "./lib";
import { itemKind } from "./schema";

/** Everything on a board, back to front. */
export const list = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    await requireMember(ctx, boardId);
    const rows = await ctx.db
      .query("items")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    return rows
      .map(({ cid, kind, x, y, w, h, z, props, updatedBy, updatedAt }) => ({ id: cid, kind, x, y, w, h, z, props, updatedBy, updatedAt }))
      .sort((a, b) => a.z - b.z);
  },
});

const fields = {
  kind: itemKind,
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  z: v.number(),
  props: v.any(),
};

export const op = v.union(
  /** Create the item, or replace it whole (undo puts items back this way). */
  v.object({ op: v.literal("put"), id: v.string(), ...fields }),
  /** Change some of an item's fields; `props` is merged key by key. */
  v.object({
    op: v.literal("patch"),
    id: v.string(),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    w: v.optional(v.number()),
    h: v.optional(v.number()),
    z: v.optional(v.number()),
    props: v.optional(v.any()),
  }),
  v.object({ op: v.literal("delete"), id: v.string() }),
);
export type ItemOp = Infer<typeof op>;

const MAX_OPS = 500;
/** Generous, but stops one item from swallowing the board (a pasted novel, say). */
const MAX_PROPS_BYTES = 64_000;

function checkProps(props: unknown) {
  if (props === undefined) return;
  if (JSON.stringify(props).length > MAX_PROPS_BYTES) throw new ConvexError("That item is too big");
}

/**
 * Applies a batch of changes in one transaction: a move of ten items, a paste,
 * an undo. A patch or delete of an item that's gone is skipped (someone else
 * deleted it first).
 */
export const apply = mutation({
  args: { boardId: v.id("boards"), ops: v.array(op) },
  handler: async (ctx, { boardId, ops }) => {
    const me = await requireMember(ctx, boardId);
    if (ops.length > MAX_OPS) throw new ConvexError("Too many changes at once");
    const now = Date.now();
    const find = (cid: string) =>
      ctx.db
        .query("items")
        .withIndex("by_board_cid", (q) => q.eq("boardId", boardId).eq("cid", cid))
        .unique();

    for (const o of ops) {
      const existing = await find(o.id);
      if (o.op === "delete") {
        if (existing) await ctx.db.delete(existing._id);
        continue;
      }
      checkProps(o.props);
      if (o.op === "put") {
        const { op: _op, id, ...rest } = o;
        const row = { ...rest, props: rest.props ?? {}, updatedBy: me.userId, updatedAt: now };
        if (existing) await ctx.db.replace(existing._id, { ...row, boardId, cid: id, createdBy: existing.createdBy });
        else await ctx.db.insert("items", { ...row, boardId, cid: id, createdBy: me.userId });
        continue;
      }
      if (!existing) continue;
      const { op: _op, id: _id, props, ...geometry } = o;
      await ctx.db.patch(existing._id, {
        ...Object.fromEntries(Object.entries(geometry).filter(([, value]) => value !== undefined)),
        ...(props ? { props: { ...existing.props, ...props } } : {}),
        updatedBy: me.userId,
        updatedAt: now,
      });
    }
    await ctx.db.patch(boardId, { updatedAt: now });
  },
});
