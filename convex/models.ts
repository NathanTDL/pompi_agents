import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireMember, requireUser } from "./lib";
import { SOL } from "./ai";

/**
 * The models a board's agents can think with, across providers (Pi talks to
 * each, agent.ts). Pompi's own keys pay for a provider when this deployment
 * has one; anyone can add their own key for a provider, and the agents on the
 * boards they own then use it instead (or use that provider at all).
 */

export const PROVIDERS = {
  openai: { name: "OpenAI", env: "OPENAI_API_KEY", keyHint: "sk-…", keysUrl: "https://platform.openai.com/api-keys" },
  anthropic: { name: "Anthropic", env: "ANTHROPIC_API_KEY", keyHint: "sk-ant-…", keysUrl: "https://console.anthropic.com/settings/keys" },
  google: { name: "Google", env: "GEMINI_API_KEY", keyHint: "AIza…", keysUrl: "https://aistudio.google.com/apikey" },
  openrouter: { name: "OpenRouter", env: "OPENROUTER_API_KEY", keyHint: "sk-or-…", keysUrl: "https://openrouter.ai/keys" },
} as const;
export type Provider = keyof typeof PROVIDERS;
export const isProvider = (p: string): p is Provider => p in PROVIDERS;

/** A model as "provider/id" (OpenRouter's own ids have a slash too: "openrouter/qwen/qwen4-max"). */
export type ModelRef = `${Provider}/${string}`;

export function parseRef(ref: string): { provider: Provider; id: string } | null {
  const at = ref.indexOf("/");
  const provider = ref.slice(0, at);
  if (at < 1 || !isProvider(provider) || !ref.slice(at + 1)) return null;
  return { provider, id: ref.slice(at + 1) };
}

/**
 * The ones to pick from. `vision`: it can see the screen, so it can use the
 * computer's desktop and not only its terminal.
 */
export const MODELS: { ref: ModelRef; name: string; blurb: string; vision: boolean }[] = [
  { ref: "openai/gpt-6.2-sol", name: "GPT-6.2 Sol", blurb: "OpenAI's all-rounder", vision: true },
  { ref: "openai/gpt-6.2-astra", name: "GPT-6.2 Astra", blurb: "OpenAI, for hard work", vision: true },
  { ref: "openai/gpt-6-luna", name: "GPT-6 Luna", blurb: "OpenAI, fast and cheap", vision: true },
  { ref: "anthropic/claude-opus-5-5", name: "Claude Opus 5.5", blurb: "Anthropic's most capable", vision: true },
  { ref: "anthropic/claude-sonnet-5-5", name: "Claude Sonnet 5.5", blurb: "Anthropic, great at code", vision: true },
  { ref: "anthropic/claude-haiku-5-5", name: "Claude Haiku 5.5", blurb: "Anthropic, fast", vision: true },
  { ref: "google/gemini-pro-latest", name: "Gemini Pro", blurb: "Google's latest Pro", vision: true },
  { ref: "google/gemini-flash-latest", name: "Gemini Flash", blurb: "Google, fast and cheap", vision: true },
  { ref: "openrouter/moonshotai/kimi-k3", name: "Kimi K3", blurb: "Moonshot, via OpenRouter", vision: true },
  { ref: "openrouter/qwen/qwen4-max", name: "Qwen 4 Max", blurb: "Alibaba, via OpenRouter", vision: true },
  { ref: "openrouter/x-ai/grok-4.7", name: "Grok 4.7", blurb: "xAI, via OpenRouter", vision: true },
  { ref: "openrouter/deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", blurb: "Via OpenRouter; reads pages as text, no screen", vision: false },
  { ref: "openrouter/z-ai/glm-5.3", name: "GLM 5.3", blurb: "Zhipu, via OpenRouter; reads pages as text, no screen", vision: false },
];

/** What an agent uses when it hasn't been given a model (POMPI_MODEL, as before). */
export const defaultModel = (): ModelRef => `openai/${SOL()}`;

/** This deployment pays for `provider` itself. */
export const hasPompiKey = (provider: Provider) => !!process.env[PROVIDERS[provider].env];

/* ---------------- people's own keys ---------------- */

/*
 * Keys are kept encrypted (AES-GCM, with a key derived from this deployment's
 * BETTER_AUTH_SECRET), and only ever decrypted in the action that runs an agent.
 */

async function cipherKey() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("No BETTER_AUTH_SECRET on this deployment");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:pompi-model-keys`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const toB64 = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function seal(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cipherKey(), new TextEncoder().encode(plain)));
  return `${toB64(iv)}.${toB64(out)}`;
}

export async function unseal(sealed: string): Promise<string> {
  const [iv, data] = sealed.split(".");
  const out = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await cipherKey(), fromB64(data));
  return new TextDecoder().decode(out);
}

async function keysOf(ctx: QueryCtx, userId: string) {
  return ctx.db
    .query("modelKeys")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

/** The keys I've added: which providers, and their last characters (never the keys). */
export const myKeys = query({
  args: {},
  handler: async (ctx) => {
    const me = await ctx.auth.getUserIdentity().then((i) => (i ? { userId: i.subject } : null));
    if (!me) return [];
    return (await keysOf(ctx, me.userId)).map((k) => ({ provider: k.provider, last4: k.last4, updatedAt: k.updatedAt }));
  },
});

export const saveKey = mutation({
  args: { provider: v.string(), key: v.string() },
  handler: async (ctx, { provider, key }) => {
    const me = await requireUser(ctx);
    if (!isProvider(provider)) throw new ConvexError("Pompi doesn't know that provider");
    const k = key.trim();
    if (k.length < 12 || k.length > 400 || /\s/.test(k)) throw new ConvexError(`That doesn't look like a ${PROVIDERS[provider].name} API key`);
    const sealed = await seal(k);
    const existing = (await keysOf(ctx, me.userId)).find((x) => x.provider === provider);
    const row = { sealed, last4: k.slice(-4), updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("modelKeys", { userId: me.userId, provider, ...row });
  },
});

export const removeKey = mutation({
  args: { provider: v.string() },
  handler: async (ctx, { provider }) => {
    const me = await requireUser(ctx);
    const existing = (await keysOf(ctx, me.userId)).find((x) => x.provider === provider);
    if (existing) await ctx.db.delete(existing._id);
  },
});

/**
 * The models a board's agents can use: the ones whose provider this Pompi pays
 * for, or the board's owner has their own key for.
 */
export const options = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const me = await requireMember(ctx, boardId);
    const board = await ctx.db.get(boardId);
    const own = new Set(board ? (await keysOf(ctx, board.ownerId)).map((k) => k.provider) : []);
    const providers = (Object.keys(PROVIDERS) as Provider[]).map((p) => ({ id: p, name: PROVIDERS[p].name, keyHint: PROVIDERS[p].keyHint, keysUrl: PROVIDERS[p].keysUrl, pompi: hasPompiKey(p), own: own.has(p) }));
    const ready = new Set(providers.filter((p) => p.pompi || p.own).map((p) => p.id));
    return {
      isOwner: !!board && board.ownerId === me.userId,
      default: defaultModel(),
      providers,
      models: MODELS.map((m) => ({ ...m, provider: parseRef(m.ref)!.provider, ready: ready.has(parseRef(m.ref)!.provider) })),
    };
  },
});

/** For an agent's run: the board owner's sealed keys, by provider (agent.ts unseals the one it needs). */
export const ownerKeys = internalQuery({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }): Promise<Partial<Record<Provider, string>>> => {
    const board = await ctx.db.get(boardId as Id<"boards">);
    if (!board) return {};
    const out: Partial<Record<Provider, string>> = {};
    for (const k of await keysOf(ctx, board.ownerId)) if (isProvider(k.provider)) out[k.provider] = k.sealed;
    return out;
  },
});
