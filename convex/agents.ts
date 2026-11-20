import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireMember } from "./lib";

const MAX_AGENTS = 24;

/** The agents on a board, oldest first. */
export const list = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    await requireMember(ctx, boardId);
    const rows = await ctx.db
      .query("agents")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    return rows.map(({ _id, _creationTime, name, role, color, emoji, instructions, tools, handle, email, emailError }) => ({ _id, _creationTime, name, role, color, emoji, instructions, tools, handle, email, emailError }));
  },
});

const fields = {
  name: v.string(),
  role: v.string(),
  color: v.string(),
  emoji: v.string(),
  instructions: v.string(),
  tools: v.array(v.string()),
};

type Fields = { name: string; role: string; color: string; emoji: string; instructions: string; tools: string[] };

function clean(f: Fields): Fields {
  const name = f.name.trim().slice(0, 32);
  if (!name) throw new ConvexError("Give your agent a name");
  if (!/^#[0-9a-f]{6}$/i.test(f.color)) throw new ConvexError("Pick a colour");
  return {
    name,
    role: f.role.trim().slice(0, 48) || "Teammate",
    color: f.color,
    emoji: [...f.emoji.trim()].slice(0, 2).join("") || name[0].toUpperCase(),
    instructions: f.instructions.trim().slice(0, 4000),
    tools: [...new Set(f.tools.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 40),
  };
}

/** A handle for the agent's email address, unique on the board: "juno", then "juno-2"… */
async function uniqueHandle(ctx: MutationCtx, boardId: Id<"boards">, name: string, except?: Id<"agents">) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 24) || "agent";
  const taken = new Set(
    (
      await ctx.db
        .query("agents")
        .withIndex("by_board", (q) => q.eq("boardId", boardId))
        .collect()
    )
      .filter((a) => a._id !== except)
      .map((a) => a.handle),
  );
  let handle = base;
  for (let i = 2; taken.has(handle); i++) handle = `${base}-${i}`;
  return handle;
}

export const create = mutation({
  args: { boardId: v.id("boards"), ...fields },
  handler: async (ctx, { boardId, ...f }) => {
    const me = await requireMember(ctx, boardId);
    const count = (
      await ctx.db
        .query("agents")
        .withIndex("by_board", (q) => q.eq("boardId", boardId))
        .collect()
    ).length;
    if (count >= MAX_AGENTS) throw new ConvexError(`A board can have up to ${MAX_AGENTS} agents`);
    const c = clean(f);
    const agentId = await ctx.db.insert("agents", { ...c, boardId, handle: await uniqueHandle(ctx, boardId, c.name), createdBy: me.userId, updatedAt: Date.now() });
    // Its own email address (email.ts).
    await ctx.scheduler.runAfter(0, internal.email.provision, { agentId });
    return agentId;
  },
});

export const update = mutation({
  args: { agentId: v.id("agents"), ...fields },
  handler: async (ctx, { agentId, ...f }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent) throw new ConvexError("That agent is gone");
    await requireMember(ctx, agent.boardId);
    const c = clean(f);
    const handle = c.name === agent.name ? agent.handle : await uniqueHandle(ctx, agent.boardId, c.name, agentId);
    await ctx.db.patch(agentId, { ...c, handle, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent) return;
    await requireMember(ctx, agent.boardId);
    const state = await ctx.db
      .query("agentStates")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .unique();
    if (state) await ctx.db.delete(state._id);
    // Whatever it's in the middle of stops at its next step (brain.ts), and frees the computer.
    const going = await ctx.db
      .query("requests")
      .withIndex("by_board", (q) => q.eq("boardId", agent.boardId).gt("updatedAt", Date.now() - 60 * 60_000))
      .collect();
    for (const r of going) {
      if (r.agentId === agentId && (r.status === "routing" || r.status === "working")) await ctx.db.patch(r._id, { status: "stopped", note: `${agent.name} was deleted`, updatedAt: Date.now() });
    }
    if (agent.email) await ctx.scheduler.runAfter(0, internal.email.release, { email: agent.email });
    await ctx.db.delete(agentId);
  },
});
