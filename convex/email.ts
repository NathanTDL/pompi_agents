import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { httpAction, internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { requireMember } from "./lib";
import { agentmail, hasAgentMail, parseAddress, verifySvix } from "./agentmail";

/**
 * Agents' email. Making an agent gives it an inbox; mail to it comes in on the
 * webhook (`incoming`), lands as a card in the board's Inbox section, and the
 * agent picks it up like anything written on the board (brain.ts). Its replies
 * are drafts the team OKs before they're sent.
 *
 * Setup, once per deployment: `npx convex run email:setup`, then set the secret
 * it returns as AGENTMAIL_WEBHOOK_SECRET.
 */

/** Gives an agent its inbox: name-board@agentmail.to. */
export const provision = internalAction({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    if (!hasAgentMail()) return;
    const agent = await ctx.runQuery(internal.email.agent, { agentId });
    if (!agent || agent.email) return;
    // The board owner's plan says how many of their agents get email.
    const allowed = await ctx.runMutation(internal.billing.emailAllowed, { agentId });
    if (!allowed.ok) {
      if (allowed.message) await ctx.runMutation(internal.email.setEmail, { agentId, error: allowed.message });
      return;
    }
    await ctx.runMutation(internal.email.setEmail, { agentId, pending: true });
    const username = `${agent.handle}-${agent.boardId.slice(-6)}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
    try {
      // Display names take letters, digits and spaces only.
      const display = `${agent.name.replace(/[^\p{L}\p{N} ]+/gu, " ").trim() || "Agent"} from Pompi`;
      const inbox = await agentmail.createInbox(username, display, `pompi-${agentId}`);
      await ctx.runMutation(internal.email.setEmail, { agentId, email: inbox.inbox_id || inbox.email });
    } catch (e) {
      const msg = (e as Error).message;
      console.error("[email] couldn't make an inbox", msg);
      await ctx.runMutation(internal.email.setEmail, { agentId, error: /limit|403|402/i.test(msg) ? "No more inboxes on this AgentMail plan" : "Couldn't make its inbox" });
    }
  },
});

/** Closes an inbox when its agent leaves. */
export const release = internalAction({
  args: { email: v.string() },
  handler: async (_ctx, { email }) => {
    if (!hasAgentMail()) return;
    await agentmail.deleteInbox(email).catch((e: unknown) => console.error("[email] couldn't delete inbox", (e as Error).message));
  },
});

export const agent = internalQuery({
  args: { agentId: v.id("agents") },
  handler: (ctx, { agentId }) => ctx.db.get(agentId),
});

export const setEmail = internalMutation({
  args: { agentId: v.id("agents"), email: v.optional(v.string()), error: v.optional(v.string()), pending: v.optional(v.boolean()) },
  handler: async (ctx, { agentId, email, error, pending }) => {
    if (await ctx.db.get(agentId)) await ctx.db.patch(agentId, { email, emailError: error, emailPending: pending });
  },
});

/** Tries again to give an agent its email (after an upgrade, say). */
export const retry = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent) return;
    await requireMember(ctx, agent.boardId);
    if (agent.email || agent.emailPending) return;
    await ctx.db.patch(agentId, { emailError: undefined });
    await ctx.scheduler.runAfter(0, internal.email.provision, { agentId });
  },
});

/** The webhook AgentMail calls when mail comes in (http.ts routes /agentmail here). */
export const incoming = httpAction(async (ctx, req) => {
  const body = await req.text();
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret || !(await verifySvix(secret, req.headers, body))) return new Response("Bad signature", { status: 401 });
  const e = JSON.parse(body) as {
    event_type?: string;
    message?: { inbox_id: string; message_id: string; from: string; subject?: string; extracted_text?: string; text?: string; preview?: string };
  };
  if (e.event_type !== "message.received" || !e.message) return new Response("ok");
  const m = e.message;
  await ctx.runMutation(internal.email.received, {
    inbox: m.inbox_id,
    messageId: m.message_id,
    from: m.from,
    subject: (m.subject ?? "").slice(0, 300),
    text: (m.extracted_text || m.text || m.preview || "").trim().slice(0, 6000),
  });
  return new Response("ok");
});

const CARD_W = 380;

/** An email to an agent: a card in the board's Inbox section, and a request for that agent. */
export const received = internalMutation({
  args: { inbox: v.string(), messageId: v.string(), from: v.string(), subject: v.string(), text: v.string() },
  handler: async (ctx, a) => {
    // Retries carry the same message.
    const seen = await ctx.db
      .query("requests")
      .withIndex("by_email", (q) => q.eq("email.messageId", a.messageId))
      .first();
    if (seen) return;
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_email", (q) => q.eq("email", a.inbox))
      .unique();
    if (!agent) return;
    const boardId = agent.boardId;
    const all = await ctx.db
      .query("items")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    const now = Date.now();
    let z = Math.max(0, ...all.map((it) => it.z)) + 1;

    // The Inbox section: the board's own, or a new one to the right of everything.
    let inbox = all.find((it) => it.kind === "section" && String(it.props?.title ?? "").trim().toLowerCase() === "inbox");
    if (!inbox) {
      const right = all.length ? Math.max(...all.map((it) => it.x + it.w)) + 120 : 0;
      const top = all.length ? Math.min(...all.map((it) => it.y)) : 0;
      const doc = { boardId, cid: crypto.randomUUID(), kind: "section" as const, x: right, y: top, w: CARD_W + 40, h: 320, z: 0, props: { title: "Inbox", color: "gray" }, createdBy: "pompi", updatedBy: "pompi", updatedAt: now };
      const id = await ctx.db.insert("items", doc);
      inbox = (await ctx.db.get(id)) as Doc<"items">;
    }

    // Newest at the bottom of what's already in it; the section grows to fit.
    const inside = all.filter((it) => it._id !== inbox._id && it.kind !== "connector" && it.x >= inbox.x && it.x < inbox.x + inbox.w && it.y >= inbox.y && it.y < inbox.y + inbox.h);
    const y = inside.length ? Math.max(...inside.map((it) => it.y + it.h)) + 16 : inbox.y + 40;
    const from = parseAddress(a.from);
    const size = { w: Math.min(CARD_W, inbox.w - 40), h: 150 + Math.ceil(Math.min(a.text.length, 900) / 46) * 21 };
    const cid = crypto.randomUUID();
    await ctx.db.insert("items", {
      boardId,
      cid,
      kind: "card",
      x: inbox.x + 20,
      y,
      ...size,
      z: z++,
      props: { agentId: agent._id, agentName: agent.name, role: agent.role, color: agent.color, emoji: agent.emoji, at: now, type: "email", title: a.subject || "(no subject)", body: a.text || "(empty email)", from: a.from },
      createdBy: "email",
      updatedBy: "email",
      updatedAt: now,
    });
    if (y + size.h + 24 > inbox.y + inbox.h) await ctx.db.patch(inbox._id, { h: y + size.h + 24 - inbox.y, updatedAt: now });
    await ctx.db.patch(boardId, { updatedAt: now });

    // The agent it was sent to picks it up.
    const requestId = await ctx.db.insert("requests", {
      boardId,
      itemId: cid,
      text: `An email to you from ${a.from}\nSubject: ${a.subject || "(no subject)"}\n\n${a.text}`.slice(0, 4000),
      by: "email",
      byName: from.name,
      status: "working",
      agentId: agent._id,
      note: "Emailed to it",
      email: { inbox: a.inbox, messageId: a.messageId, from: a.from, subject: a.subject },
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.agent.run, { requestId });
  },
});

/** Once per deployment: points AgentMail's incoming-mail webhook at this deployment. Returns the signing secret to set. */
export const setup = internalAction({
  args: {},
  handler: async () => {
    const site = process.env.CONVEX_SITE_URL;
    if (!site) throw new Error("No CONVEX_SITE_URL");
    const hook = await agentmail.createWebhook(`${site}/agentmail`);
    return { webhookId: hook.webhook_id, secret: hook.secret };
  },
});
