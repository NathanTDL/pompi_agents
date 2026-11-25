import { ConvexError, v } from "convex/values";
import { Webhook } from "standardwebhooks";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { track } from "./analytics";
import { action, httpAction, internalAction, internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { agentmail, hasAgentMail } from "./agentmail";
import { authComponent } from "./betterAuth/auth";
import { forgetComputer } from "./computer";
import { requireMember, requireUser } from "./lib";
import { PAID_PLANS, PLANS, TRIAL_MS, TRIAL_OPEN, type PaidPlan, type PlanKey } from "./plans";

/**
 * Plans and what they include, paid through Polar (polar.sh). Usage is the
 * board owner's: agents on your boards answer and use the computer on your
 * plan. Answers and computer tasks reset each calendar month (UTC); agents with
 * their own email are counted as they are.
 *
 * Before a plan there's the free trial (plans.ts): three days that start at
 * the first request to one of your agents, with its own limits for the whole
 * trial. When it ends, everything stays; the agents only stop working.
 *
 * Polar knows each person by their Pompi user id (its "external customer id"),
 * so there's no link of ours to go stale. Subscriptions come back on Polar's
 * webhook (`webhook`, at /polar/events) and are kept in `subscriptions`.
 *
 * Setup: POLAR_ORGANIZATION_TOKEN, POLAR_WEBHOOK_SECRET, POLAR_SERVER
 * ("sandbox" or "production"), and the products' ids in POLAR_PRODUCT_SOLO,
 * POLAR_PRODUCT_PRO and POLAR_PRODUCT_MAX.
 */

const PAID = PAID_PLANS;
const productOf = (k: PaidPlan) => process.env[`POLAR_PRODUCT_${k.toUpperCase()}`];
/** A subscription's plan: by its Polar product, or "plan:max" for a granted one (`grant`). */
const planOfProduct = (productId: string): PlanKey =>
  productId.startsWith("plan:") ? (PAID.find((k) => `plan:${k}` === productId) ?? "none") : (PAID.find((k) => productOf(k) === productId) ?? "none");
/** Subscriptions in these states are paid for. */
const LIVE = ["active", "trialing"];

/* ---------------- Polar's API ---------------- */

async function polarApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = process.env.POLAR_ORGANIZATION_TOKEN;
  if (!token) throw new ConvexError("Payments aren't set up on this deployment yet");
  const base = process.env.POLAR_SERVER === "production" ? "https://api.polar.sh" : "https://sandbox-api.polar.sh";
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { detail?: unknown; error?: string };
  if (!res.ok) {
    console.error(`[billing] Polar ${method} ${path.split("?")[0]}: ${res.status}`, JSON.stringify(json.detail ?? json.error ?? "").slice(0, 400));
    throw new PolarError(res.status, JSON.stringify(json.detail ?? json.error ?? ""));
  }
  return json;
}

class PolarError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(`Polar said ${status}: ${detail.slice(0, 200)}`);
    this.status = status;
  }
}

/** A subscription as Polar sends it (only what Pompi keeps). */
type PolarSubscription = {
  id: string;
  status: string;
  product_id: string;
  customer_id: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  customer?: { external_id?: string | null };
};

/* ---------------- who's on what ---------------- */

/** This month, as usage is counted: "2026-11". */
const month = (at = Date.now()) => new Date(at).toISOString().slice(0, 7);

/** Someone's paid subscription, while it's live. */
async function liveSubscription(ctx: QueryCtx, userId: string): Promise<Doc<"subscriptions"> | null> {
  const subs = await ctx.db
    .query("subscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return subs.filter((s) => LIVE.includes(s.status) && planOfProduct(s.productId) !== "none").sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

/** Someone's free trial, if they've started it (ended or not). */
const trialOf = (ctx: QueryCtx, userId: string) =>
  ctx.db
    .query("trials")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

/** The plan someone is on: their live subscription's, else their free trial while it lasts, else none. */
export async function planOf(ctx: QueryCtx | MutationCtx, userId: string): Promise<PlanKey> {
  const sub = await liveSubscription(ctx, userId);
  if (sub) return planOfProduct(sub.productId);
  // While the trial is closed (TRIAL_OPEN), one that's still going doesn't count either.
  const trial = TRIAL_OPEN ? await trialOf(ctx, userId) : null;
  return trial && trial.endsAt > Date.now() ? "trial" : "none";
}

/** Starts someone's free trial, if they've never had one or a plan. */
export async function startTrial(ctx: MutationCtx, userId: string) {
  if (!TRIAL_OPEN) return;
  const subscribed = await ctx.db
    .query("subscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (subscribed || (await trialOf(ctx, userId))) return;
  const now = Date.now();
  await ctx.db.insert("trials", { userId, startedAt: now, endsAt: now + TRIAL_MS, answers: 0, computerTasks: 0 });
  await track(ctx, "trial_started", userId, {}, { plan: "trial" });
}

/** Someone's free trial, for the screens: when it started and ends, or that it's over. */
const trialInfo = (t: Doc<"trials"> | null) => (t ? { startedAt: t.startedAt, endsAt: t.endsAt, ended: t.endsAt <= Date.now() } : null);

const usageRow = (ctx: QueryCtx, userId: string) =>
  ctx.db
    .query("usage")
    .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", month()))
    .unique();

/** What someone has used on their plan: this month's, or the whole trial's. */
async function usedOf(ctx: QueryCtx, userId: string, plan: PlanKey) {
  const row = plan === "trial" ? await trialOf(ctx, userId) : await usageRow(ctx, userId);
  return { answers: row?.answers ?? 0, computerTasks: row?.computerTasks ?? 0 };
}

/** How many of someone's agents (on boards they own) have their own email. */
export async function emailAgentsOf(ctx: QueryCtx, userId: string, except?: Id<"agents">) {
  const boards = await ctx.db
    .query("boards")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .collect();
  let n = 0;
  for (const b of boards) {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_board", (q) => q.eq("boardId", b._id))
      .collect();
    n += agents.filter((a) => a._id !== except && (a.email || a.emailPending)).length;
  }
  return n;
}

/** Your plan, this month's usage and what's left: for the Plan & usage screen. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const sub = await liveSubscription(ctx, me.userId);
    const plan = await planOf(ctx, me.userId);
    return {
      plan,
      limits: PLANS[plan],
      used: { ...(await usedOf(ctx, me.userId, plan)), emailAgents: await emailAgentsOf(ctx, me.userId) },
      /** Their free trial: not started (null), going, or over. */
      trial: sub ? null : trialInfo(await trialOf(ctx, me.userId)),
      /** Usage starts over then. */
      resetsAt: Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
      renews: sub ? { at: sub.currentPeriodEnd ?? null, cancelling: sub.cancelAtPeriodEnd } : null,
      /** Given, not paid for (`grant`): nothing to bill or switch. */
      granted: sub?.customerId === "granted",
      plans: PAID.map((k) => ({ key: k, ...PLANS[k] })),
      configured: PAID.every((k) => !!productOf(k)) && !!process.env.POLAR_ORGANIZATION_TOKEN,
    };
  },
});

/**
 * The plan a board runs on (its owner's) and what's left this month, for the
 * status on the canvas. `mine`: you own the board, so it's your plan.
 */
export const forBoard = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const me = await requireMember(ctx, boardId);
    const owner = me.board.ownerId;
    const plan = await planOf(ctx, owner);
    return {
      plan,
      limits: PLANS[plan],
      used: await usedOf(ctx, owner, plan),
      /** The owner's free trial, while they have no paid plan: not started (null), going, or over. */
      trial: plan === "none" || plan === "trial" ? trialInfo(await trialOf(ctx, owner)) : null,
      resetsAt: Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
      mine: me.userId === owner,
    };
  },
});

/** Who's signed in, for the actions below. */
export const whoami = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const identity = await ctx.auth.getUserIdentity();
    return { userId: me.userId, email: identity?.email ?? "", name: me.name, live: await liveSubscription(ctx, me.userId) };
  },
});

/* ---------------- paying ---------------- */

const planArg = v.union(v.literal("solo"), v.literal("pro"), v.literal("max"));

/** Polar's checkout for a plan, for someone without one: the page to send them to. */
export const checkout = action({
  args: { plan: planArg, origin: v.string() },
  handler: async (ctx, { plan, origin }): Promise<{ url: string }> => {
    const me: { userId: string; email: string; name: string; live: Doc<"subscriptions"> | null } = await ctx.runQuery(api.billing.whoami, {});
    if (me.live) throw new ConvexError("You already have a plan: switch to another one instead");
    const productId = productOf(plan);
    if (!productId) throw new ConvexError("That plan isn't set up yet");
    const create = () =>
      polarApi<{ url: string }>("POST", "/v1/checkouts/", {
        products: [productId],
        external_customer_id: me.userId,
        ...(me.email ? { customer_email: me.email } : {}),
        customer_name: me.name,
        success_url: `${origin}/app?upgraded=1`,
        return_url: `${origin}/app`,
      });
    try {
      return { url: (await create()).url };
    } catch (e) {
      // Someone Polar already knows by their email (but not by their Pompi id): link them, then try again.
      if (!(e instanceof PolarError) || e.status !== 422 || !me.email) throw e;
      const found = await polarApi<{ items: { id: string; external_id?: string | null }[] }>("GET", `/v1/customers/?email=${encodeURIComponent(me.email)}&limit=1`);
      const c = found.items[0];
      if (!c || (c.external_id && c.external_id !== me.userId)) throw e;
      if (!c.external_id) await polarApi("PATCH", `/v1/customers/${c.id}`, { external_id: me.userId });
      return { url: (await create()).url };
    }
  },
});

/** Moves a paid plan to another one, right away (Polar prorates the difference). */
export const changePlan = action({
  args: { plan: planArg },
  handler: async (ctx, { plan }) => {
    const me: { live: Doc<"subscriptions"> | null } = await ctx.runQuery(api.billing.whoami, {});
    if (!me.live) throw new ConvexError("You don't have a plan yet: choose one to subscribe");
    if (me.live.customerId === "granted") throw new ConvexError("Your plan was given to you, so it can't be switched here");
    const productId = productOf(plan);
    if (!productId) throw new ConvexError("That plan isn't set up yet");
    // Set to end? Switching keeps it going.
    if (me.live.cancelAtPeriodEnd) await polarApi("PATCH", `/v1/subscriptions/${me.live.polarId}`, { cancel_at_period_end: false });
    const sub = await polarApi<PolarSubscription>("PATCH", `/v1/subscriptions/${me.live.polarId}`, { product_id: productId, proration_behavior: "prorate" });
    await ctx.runMutation(internal.billing.record, { sub: keep(sub) });
  },
});

/**
 * Cancels your plan at the end of the period you've paid for (you keep it
 * until then), or with `resume`, keeps it going after all.
 */
export const cancel = action({
  args: { resume: v.optional(v.boolean()) },
  handler: async (ctx, { resume }) => {
    const me: { live: Doc<"subscriptions"> | null } = await ctx.runQuery(api.billing.whoami, {});
    if (!me.live) throw new ConvexError("You don't have a plan to cancel");
    if (me.live.customerId === "granted") throw new ConvexError("Your plan was given to you, so there's nothing to cancel");
    const sub = await polarApi<PolarSubscription>("PATCH", `/v1/subscriptions/${me.live.polarId}`, { cancel_at_period_end: !resume });
    await ctx.runMutation(internal.billing.record, { sub: keep(sub) });
  },
});

/** Polar's billing portal (invoices, card, cancelling): the page to send them to. */
export const portal = action({
  args: { returnUrl: v.string() },
  handler: async (ctx, { returnUrl }): Promise<{ url: string }> => {
    const me: { userId: string } = await ctx.runQuery(api.billing.whoami, {});
    const s = await polarApi<{ customer_portal_url: string }>("POST", "/v1/customer-sessions/", { external_customer_id: me.userId, return_url: returnUrl });
    return { url: s.customer_portal_url };
  },
});

/** Asks Polar for your subscriptions now (back from checkout, before its webhook arrives). */
export const refresh = action({
  args: {},
  handler: async (ctx) => {
    const me: { userId: string } = await ctx.runQuery(api.billing.whoami, {});
    const page = await polarApi<{ items: PolarSubscription[] }>("GET", `/v1/subscriptions/?external_customer_id=${encodeURIComponent(me.userId)}&limit=20`);
    for (const sub of page.items) await ctx.runMutation(internal.billing.record, { sub: keep(sub), userId: me.userId });
  },
});

/* ---------------- Polar's webhook ---------------- */

const subV = v.object({ polarId: v.string(), customerId: v.string(), externalId: v.optional(v.string()), productId: v.string(), status: v.string(), currentPeriodEnd: v.optional(v.number()), cancelAtPeriodEnd: v.boolean() });

const keep = (s: PolarSubscription) => ({
  polarId: s.id,
  customerId: s.customer_id,
  ...(s.customer?.external_id ? { externalId: s.customer.external_id } : {}),
  productId: s.product_id,
  status: s.status,
  ...(s.current_period_end ? { currentPeriodEnd: Date.parse(s.current_period_end) } : {}),
  cancelAtPeriodEnd: !!s.cancel_at_period_end,
});

/** A subscription as Polar has it now, for its person (their Pompi id, else whoever had it before). */
export const record = internalMutation({
  args: { sub: subV, userId: v.optional(v.string()) },
  handler: async (ctx, { sub, userId }) => {
    const { externalId, ...fields } = sub;
    const known = await ctx.db
      .query("subscriptions")
      .withIndex("by_polar", (q) => q.eq("polarId", sub.polarId))
      .unique();
    const who = externalId ?? userId ?? known?.userId;
    if (!who) {
      console.warn("[billing] a subscription with no Pompi user", sub.polarId);
      return;
    }
    if (known) await ctx.db.patch(known._id, { ...fields, userId: who, updatedAt: Date.now() });
    else await ctx.db.insert("subscriptions", { ...fields, userId: who, updatedAt: Date.now() });
    // What changed, for analytics: new, a plan switch, cancelling, ending.
    const plan = planOfProduct(fields.productId);
    const live = LIVE.includes(fields.status);
    const change = !known
      ? "started"
      : !live && LIVE.includes(known.status)
        ? "ended"
        : known.productId !== fields.productId
          ? "switched"
          : fields.cancelAtPeriodEnd !== known.cancelAtPeriodEnd
            ? fields.cancelAtPeriodEnd
              ? "cancelling"
              : "resumed"
            : null;
    if (change) await track(ctx, `subscription_${change}`, who, { plan, ...(change === "switched" ? { from: planOfProduct(known!.productId) } : {}), status: fields.status }, { plan: live ? plan : "none", plan_status: fields.cancelAtPeriodEnd ? "cancelling" : fields.status });
  },
});

/** Polar's webhook: subscriptions as they start, change and end. Signed with POLAR_WEBHOOK_SECRET. */
export const webhook = httpAction(async (ctx, request) => {
  const body = await request.text();
  const secret = process.env.POLAR_WEBHOOK_SECRET ?? "";
  try {
    // "whsec_…" is the standard form; Polar's older secrets were plain text.
    new Webhook(secret.startsWith("whsec_") ? secret : btoa(secret)).verify(body, Object.fromEntries(request.headers.entries()));
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const event = JSON.parse(body) as { type: string; data: PolarSubscription };
  if (event.type.startsWith("subscription.")) await ctx.runMutation(internal.billing.record, { sub: keep(event.data) });
  return new Response("Accepted", { status: 202 });
});

/* ---------------- using it ---------------- */

/**
 * Uses one of the board owner's answers or computer tasks this month, if their
 * plan has one left. Says what's left over, or which limit they hit.
 */
export const spend = internalMutation({
  args: { boardId: v.id("boards"), kind: v.union(v.literal("answers"), v.literal("computerTasks")) },
  handler: async (ctx, { boardId, kind }) => {
    const board = await ctx.db.get(boardId);
    if (!board) return { ok: false as const, message: "This board is gone." };
    // No plan and no trial yet: this first request starts the free trial.
    await startTrial(ctx, board.ownerId);
    const plan = await planOf(ctx, board.ownerId);
    const limit = PLANS[plan][kind];
    const trial = plan === "trial" ? await trialOf(ctx, board.ownerId) : null;
    const row = trial ?? (await usageRow(ctx, board.ownerId));
    const used = row?.[kind] ?? 0;
    if (plan === "none" || used >= limit) await track(ctx, "usage_limit_hit", board.ownerId, { kind, plan, limit });
    if (plan === "none") {
      const hadTrial = !!(await trialOf(ctx, board.ownerId));
      return {
        ok: false as const,
        message: hadTrial
          ? "I'd love to help, but this board's free trial is over. Its owner can pick a plan from the button at the top right, and I'll get right back to work."
          : "I'm ready to help, but this board's owner needs a plan first. They can choose one from the plan button at the top right of the board.",
      };
    }
    if (trial) {
      if (used >= limit) {
        const what = kind === "answers" ? "answers" : "computer tasks";
        return { ok: false as const, message: `That's all the ${what} in the free trial (it includes ${limit}). The board's owner can pick a plan from the button at the top right to keep going.` };
      }
      await ctx.db.patch(trial._id, { [kind]: used + 1 });
      return { ok: true as const };
    }
    if (used >= limit) {
      const what = kind === "answers" ? "answers" : "computer tasks";
      const next = plan === "max" ? "It starts over on the 1st." : "The board's owner can upgrade from the plan button at the top right, or it starts over on the 1st.";
      return { ok: false as const, message: `No ${what} left this month: this board is on its owner's ${PLANS[plan].name} plan, which includes ${limit}. ${next}` };
    }
    if (row) await ctx.db.patch(row._id, { [kind]: used + 1 });
    else await ctx.db.insert("usage", { userId: board.ownerId, month: month(), answers: 0, computerTasks: 0, [kind]: 1 });
    return { ok: true as const };
  },
});

/**
 * Support: gives someone a plan without paying, or takes it back with `plan`
 * "none" (`npx convex run billing:grant '{"userId":"…","plan":"max"}'`). It's
 * kept like a Polar subscription (named by its plan, not a Polar product).
 */
export const grant = internalMutation({
  args: { userId: v.string(), plan: v.union(v.literal("none"), v.literal("solo"), v.literal("pro"), v.literal("max")) },
  handler: async (ctx, { userId, plan }) => {
    const polarId = `granted:${userId}`;
    const known = await ctx.db
      .query("subscriptions")
      .withIndex("by_polar", (q) => q.eq("polarId", polarId))
      .unique();
    if (plan === "none") {
      if (known) await ctx.db.delete(known._id);
      return;
    }
    const fields = { userId, polarId, customerId: "granted", productId: `plan:${plan}`, status: "active", cancelAtPeriodEnd: false, updatedAt: Date.now() };
    if (known) await ctx.db.patch(known._id, fields);
    else await ctx.db.insert("subscriptions", fields);
  },
});

/** Support: starts someone's usage this month over (`npx convex run billing:resetUsage '{"userId":"…"}'`). */
export const resetUsage = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const row = await usageRow(ctx, userId);
    if (row) await ctx.db.delete(row._id);
  },
});

/** Whether the board's owner may give one more agent its own email (their plan's limit). */
export const emailAllowed = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get(agentId);
    const board = agent ? await ctx.db.get(agent.boardId) : null;
    if (!agent || !board) return { ok: false as const, message: "" };
    const plan = await planOf(ctx, board.ownerId);
    const limit = PLANS[plan].emailAgents;
    if ((await emailAgentsOf(ctx, board.ownerId, agentId)) >= limit) {
      return { ok: false as const, message: limit ? `The ${PLANS[plan].name} plan includes ${limit} agent${limit > 1 ? "s" : ""} with email` : plan === "trial" ? "Email comes with a plan (not the free trial)" : "Email comes with a plan" };
    }
    // Held while its inbox is made, so two at once can't both pass.
    await ctx.db.patch(agentId, { emailPending: true });
    return { ok: true as const };
  },
});


/* ---------------- the trial's end ---------------- */

/** A trial ended this long ago without a plan: its computer is deleted, so it stops costing storage. */
const CLEAR_AFTER_MS = 7 * 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

/** Trials ending within a day that haven't had their reminder, for `remind`. */
export const endingSoon = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const soon = await ctx.db
      .query("trials")
      .withIndex("by_ends", (q) => q.gt("endsAt", now).lt("endsAt", now + DAY_MS))
      .take(200);
    const out: { trialId: Id<"trials">; email: string; name: string; endsAt: number; answers: number; computerTasks: number }[] = [];
    for (const t of soon) {
      if (t.remindedAt || (await liveSubscription(ctx, t.userId))) continue;
      const user = await authComponent.getAnyUserById(ctx, t.userId);
      if (user?.email) out.push({ trialId: t._id, email: user.email, name: user.name ?? "", endsAt: t.endsAt, answers: t.answers, computerTasks: t.computerTasks });
    }
    return out;
  },
});

export const markReminded = internalMutation({
  args: { trialId: v.id("trials") },
  handler: async (ctx, { trialId }) => {
    await ctx.db.patch(trialId, { remindedAt: Date.now() });
  },
});

/**
 * Emails everyone whose trial ends within a day (hourly, crons.ts): what their
 * team did, and that nothing goes away. Sent from Pompi's own AgentMail inbox,
 * POMPI_MAIL_INBOX; without one there's no email (the app still counts down).
 */
export const remind = internalAction({
  args: {},
  handler: async (ctx) => {
    const from = process.env.POMPI_MAIL_INBOX;
    if (!from || !hasAgentMail()) return;
    const due = await ctx.runQuery(internal.billing.endingSoon, {});
    const site = process.env.SITE_URL ?? "https://pompi.app";
    for (const t of due) {
      const first = t.name.trim().split(/\s+/)[0];
      const left = Math.max(1, Math.round((t.endsAt - Date.now()) / 3_600_000));
      const did = [t.answers ? `${t.answers} answer${t.answers > 1 ? "s" : ""}` : "", t.computerTasks ? `${t.computerTasks} computer task${t.computerTasks > 1 ? "s" : ""}` : ""].filter(Boolean).join(" and ");
      const text = [
        `Hey${first ? ` ${first}` : ""}!`,
        "",
        `Your Pompi free trial ends in about ${left} hour${left > 1 ? "s" : ""}.${did ? ` So far your team has done ${did}.` : ""}`,
        "",
        `Pick a plan to keep them going: ${site}/app`,
        "",
        "Everything they made stays put either way.",
        "",
        "Nathan, who makes Pompi",
      ].join("\n");
      try {
        await agentmail.send(from, { to: [t.email], subject: "Your Pompi team clocks out tomorrow", text });
        await ctx.runMutation(internal.billing.markReminded, { trialId: t.trialId });
      } catch (e) {
        console.error("[billing] couldn't send a trial reminder", (e as Error).message);
      }
    }
  },
});

/**
 * A week after a trial ended without a plan, deletes the person's computer
 * (daily, crons.ts): a stopped one still costs its storage. Their boards,
 * agents and work all stay; a plan later makes them a fresh computer.
 */
export const clearEnded = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ended = await ctx.db
      .query("trials")
      .withIndex("by_ends", (q) => q.lt("endsAt", Date.now() - CLEAR_AFTER_MS))
      .take(200);
    for (const t of ended) {
      if (t.clearedAt) continue;
      if (!(await liveSubscription(ctx, t.userId))) await forgetComputer(ctx, t.userId);
      await ctx.db.patch(t._id, { clearedAt: Date.now() });
    }
  },
});
