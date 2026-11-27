import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { requireMember } from "./lib";

/**
 * What agents remember between requests: each agent's own notes, and the
 * board's team memory that every agent on it reads and keeps up to date. One
 * short fact a line, at most MAX characters each, so it stays cheap to read
 * on every request. The agents keep them current (agent.ts: remember, forget);
 * people can read and edit both in the agent's settings.
 */

export const MAX = 4000;
const MAX_NOTE = 300;

export type Scope = "me" | "team";

const notes = (text: string | undefined) =>
  (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const norm = (s: string) => s.toLowerCase().replace(/^[-*•]\s*/, "").replace(/\s+/g, " ").trim();

/** Looks like a password, key or token: memory isn't the place for those. */
const SECRET = /(\bsk-[a-z0-9_-]{8,}|\b(api[ _-]?key|password|passwd|secret|token|otp|2fa code)\b\s*[:=]|\b[A-Za-z0-9_+/=-]{40,}\b)/i;

/** The note in `lines` that `like` means: the same text, or the only one containing it. */
function find(lines: string[], like: string): number {
  const want = norm(like);
  if (!want) return -1;
  const exact = lines.findIndex((l) => norm(l) === want);
  if (exact >= 0) return exact;
  const partial = lines.map((l, i) => (norm(l).includes(want) ? i : -1)).filter((i) => i >= 0);
  return partial.length === 1 ? partial[0] : -1;
}

/** Both memories, for an agent's run. */
export const memoryFor = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get(agentId);
    const board = agent ? await ctx.db.get(agent.boardId) : null;
    return { mine: agent?.memory ?? "", team: board?.memory ?? "" };
  },
});

async function save(ctx: MutationCtx, target: { agent: Doc<"agents">; scope: Scope }, text: string) {
  if (target.scope === "me") await ctx.db.patch(target.agent._id, { memory: text, updatedAt: Date.now() });
  else await ctx.db.patch(target.agent.boardId, { memory: text });
}

/**
 * An agent's change to a memory: a note added (or put in place of `replaces`),
 * or one forgotten. Says what went wrong in words the agent can act on.
 */
export const change = internalMutation({
  args: { agentId: v.id("agents"), scope: v.union(v.literal("me"), v.literal("team")), note: v.optional(v.string()), replaces: v.optional(v.string()), forget: v.optional(v.string()) },
  handler: async (ctx, { agentId, scope, note, replaces, forget }): Promise<{ ok: boolean; message: string }> => {
    const agent = await ctx.db.get(agentId);
    if (!agent) return { ok: false, message: "This agent is gone." };
    const board = await ctx.db.get(agent.boardId);
    const lines = notes(scope === "me" ? agent.memory : board?.memory);
    const where = scope === "me" ? "your notes" : "the team memory";

    if (forget !== undefined) {
      const i = find(lines, forget);
      if (i < 0) return { ok: false, message: `There's no single note like that in ${where}. They are:\n${lines.join("\n") || "(none)"}` };
      lines.splice(i, 1);
      await save(ctx, { agent, scope }, lines.join("\n"));
      return { ok: true, message: `Forgotten. ${where[0].toUpperCase()}${where.slice(1)} now:\n${lines.join("\n") || "(none)"}` };
    }

    const text = (note ?? "").replace(/\s+/g, " ").replace(/^[-*•]\s*/, "").trim();
    if (!text) return { ok: false, message: "The note was empty." };
    if (text.length > MAX_NOTE) return { ok: false, message: `Keep a note under ${MAX_NOTE} characters: one fact.` };
    if (SECRET.test(text)) return { ok: false, message: "That looks like a password, key or code. Don't keep secrets in memory." };
    const at = replaces ? find(lines, replaces) : -1;
    if (replaces && at < 0) return { ok: false, message: `There's no single note like "${replaces}" in ${where}. They are:\n${lines.join("\n") || "(none)"}` };
    if (at < 0 && lines.some((l) => norm(l) === norm(text))) return { ok: true, message: "You remember that already." };
    const next = [...lines];
    if (at >= 0) next[at] = text;
    else next.push(text);
    if (next.join("\n").length > MAX) return { ok: false, message: `${where[0].toUpperCase()}${where.slice(1)} are full (${MAX} characters). Merge or drop notes first: replace one with a shorter note that covers both, or forget one that no longer matters. They are:\n${lines.join("\n")}` };
    await save(ctx, { agent, scope }, next.join("\n"));
    return { ok: true, message: at >= 0 ? "Updated." : "Remembered." };
  },
});

/* ---------------- for people ---------------- */

/** The board's team memory. */
export const team = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const { board } = await requireMember(ctx, boardId);
    return board.memory ?? "";
  },
});

const clean = (text: string) => {
  const t = notes(text).join("\n");
  if (t.length > MAX) throw new ConvexError(`Keep memory under ${MAX} characters`);
  return t;
};

/** Someone edited an agent's notes, or the team memory (empty clears it). */
export const edit = mutation({
  args: { boardId: v.id("boards"), agentId: v.optional(v.id("agents")), text: v.string() },
  handler: async (ctx, { boardId, agentId, text }) => {
    await requireMember(ctx, boardId);
    const t = clean(text);
    if (!agentId) return void (await ctx.db.patch(boardId, { memory: t }));
    const agent = await ctx.db.get(agentId as Id<"agents">);
    if (!agent || agent.boardId !== boardId) throw new ConvexError("That agent isn't on this board");
    await ctx.db.patch(agent._id, { memory: t, updatedAt: Date.now() });
  },
});
