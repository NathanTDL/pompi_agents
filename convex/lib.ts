import { ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export type Me = { userId: string; name: string; image?: string };

/** The signed-in person, or a ConvexError. */
export async function requireUser(ctx: QueryCtx): Promise<Me> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not signed in");
  return {
    userId: identity.subject,
    name: identity.name ?? identity.email ?? "Someone",
    image: typeof identity.pictureUrl === "string" ? identity.pictureUrl : undefined,
  };
}

/** The signed-in person and the board, if they're a member of it; else a ConvexError. */
export async function requireMember(
  ctx: QueryCtx,
  boardId: Id<"boards">,
): Promise<Me & { board: Doc<"boards">; member: Doc<"boardMembers"> }> {
  const me = await requireUser(ctx);
  const board = await ctx.db.get(boardId);
  if (!board) throw new ConvexError("Board not found");
  const member = await ctx.db
    .query("boardMembers")
    .withIndex("by_board_user", (q) => q.eq("boardId", boardId).eq("userId", me.userId))
    .unique();
  if (!member) throw new ConvexError("You're not on this board");
  return { ...me, board, member };
}

/** A short random code for share links (no look-alike characters). */
export function newInviteCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 10; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
