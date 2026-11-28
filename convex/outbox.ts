import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { agentmail } from "./agentmail";
import { capture } from "./analytics";

/**
 * An agent's batch of emails (send_emails in agent.ts): one email to each
 * person, written for them, sent from the agent's own address once the team
 * OKs the batch (or straight away, on a board that doesn't ask first). They go
 * out one at a time in the background, and the agent says how it went.
 */

/** Emails in one batch, and how long each may be. */
export const MAX_BATCH = 150;
export const MAX_EMAIL = 3000;
/** Between two sends, so a batch doesn't trip the mail service's limits. */
const GAP_MS = 700;
/** One action's share of a batch; the rest goes on in the next. */
const ACTION_MS = 7 * 60_000;

const emailV = v.object({ to: v.string(), subject: v.string(), text: v.string() });

export const create = internalMutation({
  args: { boardId: v.id("boards"), agentId: v.id("agents"), requestId: v.id("requests"), inbox: v.string(), emails: v.array(emailV) },
  handler: (ctx, a) => ctx.db.insert("emailBatches", { ...a, emails: a.emails.slice(0, MAX_BATCH), status: "waiting", next: 0, sent: 0, failed: [], updatedAt: Date.now() }),
});

/** The team said yes (or didn't need to): send it, and answer under `anchor`. */
export const start = internalMutation({
  args: { batchId: v.id("emailBatches"), anchor: v.string() },
  handler: async (ctx, { batchId, anchor }) => {
    const b = await ctx.db.get(batchId);
    if (!b || b.status !== "waiting") return;
    await ctx.db.patch(batchId, { status: "sending", anchor, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.outbox.send, { batchId });
  },
});

export const decline = internalMutation({
  args: { batchId: v.id("emailBatches") },
  handler: async (ctx, { batchId }) => {
    const b = await ctx.db.get(batchId);
    if (b?.status === "waiting") await ctx.db.patch(batchId, { status: "declined", updatedAt: Date.now() });
  },
});

export const get = internalQuery({
  args: { batchId: v.id("emailBatches") },
  handler: (ctx, { batchId }) => ctx.db.get(batchId),
});

export const progress = internalMutation({
  args: { batchId: v.id("emailBatches"), next: v.number(), sent: v.number(), failed: v.array(v.object({ to: v.string(), why: v.string() })), done: v.boolean() },
  handler: async (ctx, { batchId, done, ...p }) => {
    await ctx.db.patch(batchId, { ...p, ...(done ? { status: "done" as const } : {}), updatedAt: Date.now() });
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends what's left of a batch, one email at a time; carries on in a new action when time's short. */
export const send = internalAction({
  args: { batchId: v.id("emailBatches") },
  handler: async (ctx, { batchId }) => {
    const b = await ctx.runQuery(internal.outbox.get, { batchId });
    if (!b || b.status !== "sending") return;
    const t0 = Date.now();
    let { next, sent } = b;
    const failed = [...b.failed];
    while (next < b.emails.length) {
      if (Date.now() - t0 > ACTION_MS) {
        await ctx.runMutation(internal.outbox.progress, { batchId, next, sent, failed, done: false });
        await ctx.scheduler.runAfter(0, internal.outbox.send, { batchId });
        return;
      }
      const e = b.emails[next];
      const why = await sendOne(b.inbox, e);
      if (why) failed.push({ to: e.to, why });
      else sent++;
      next++;
      if (next % 10 === 0) await ctx.runMutation(internal.outbox.progress, { batchId, next, sent, failed, done: false });
      await sleep(GAP_MS);
    }
    await ctx.runMutation(internal.outbox.progress, { batchId, next, sent, failed, done: true });
    await report(ctx, b, sent, failed);
  },
});

/** One email; on a rate limit it waits and tries again. Returns why it failed, if it did. */
async function sendOne(inbox: string, e: { to: string; subject: string; text: string }): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      await agentmail.send(inbox, { to: [e.to], subject: e.subject, text: e.text });
      return null;
    } catch (err) {
      const m = (err as Error).message;
      if (/\b429\b|rate/i.test(m) && attempt < 3) {
        await sleep(5_000 * (attempt + 1));
        continue;
      }
      return m.replace(/^AgentMail \d+: /, "").slice(0, 120);
    }
  }
}

async function report(
  ctx: ActionCtx,
  b: { _id: Id<"emailBatches">; boardId: Id<"boards">; agentId: Id<"agents">; requestId: Id<"requests">; anchor?: string; emails: unknown[] },
  sent: number,
  failed: { to: string; why: string }[],
) {
  const n = b.emails.length;
  const reply = !failed.length
    ? `All ${n} emails are sent.`
    : sent
      ? `Sent ${sent} of ${n} emails. These didn't go: ${failed
          .slice(0, 5)
          .map((f) => `${f.to} (${f.why})`)
          .join("; ")}${failed.length > 5 ? `, and ${failed.length - 5} more` : ""}.`
      : `None of the ${n} emails went out: ${failed[0]?.why ?? "the mail service refused them"}.`;
  await ctx.runMutation(internal.brain.place, { requestId: b.requestId, agentId: b.agentId, reply, cards: [], failed: !sent, ...(b.anchor ? { anchor: b.anchor } : {}) });
  const owner = await ctx.runQuery(internal.computer.owner, { boardId: b.boardId });
  await capture("agent_emails_sent", owner ?? "", { boardId: b.boardId, sent, failed: failed.length });
}
