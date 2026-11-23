import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type MutationCtx } from "./_generated/server";

/**
 * Product analytics from the server, to PostHog: what agents, computers and
 * payments do, which the browser can't see (and ad blockers can't drop).
 * Events are tied to the same person as in the browser (their Pompi user id,
 * src/components/providers/identify.tsx). Off unless POSTHOG_KEY is set.
 */

type Props = Record<string, string | number | boolean | null | undefined>;

/** Sends one event. Never throws: analytics mustn't break the work. From an action. */
export async function capture(event: string, distinctId: string, properties: Props = {}, set?: Props) {
  const key = process.env.POSTHOG_KEY;
  if (!key || !distinctId) return;
  try {
    await fetch(`${process.env.POSTHOG_HOST ?? "https://us.i.posthog.com"}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, event, distinct_id: distinctId, properties: { ...properties, source: "server", ...(set ? { $set: set } : {}) }, timestamp: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.warn("[analytics]", event, (e as Error).message);
  }
}

export const send = internalAction({
  args: { event: v.string(), distinctId: v.string(), properties: v.optional(v.any()), set: v.optional(v.any()) },
  handler: async (_ctx, { event, distinctId, properties, set }) => capture(event, distinctId, properties ?? {}, set),
});

/** The same, from a mutation: sent just after it commits. */
export async function track(ctx: MutationCtx, event: string, distinctId: string, properties: Props = {}, set?: Props) {
  if (!process.env.POSTHOG_KEY || !distinctId) return;
  await ctx.scheduler.runAfter(0, internal.analytics.send, { event, distinctId, properties, ...(set ? { set } : {}) });
}
