/**
 * Composio, for the apps an agent may use (GitHub, Gmail, Slack, …). Each run
 * opens a Composio session limited to that agent's apps, so an agent can only
 * reach what its team ticked for it. A session gives the model a few meta tools:
 * search for the right app action, get its inputs, run it, and connect an app.
 * Connections belong to the board (one Composio user per board), so everyone's
 * agents on a board share the apps someone there connected.
 */

const BASE = "https://backend.composio.dev/api/v3.1";

export const hasComposio = () => !!process.env.COMPOSIO_API_KEY;

/** Our tool ids (src/components/canvas/agent-dialog.tsx TOOL_INFO) where Composio names them differently. */
const SLUG: Record<string, string> = { x: "twitter" };
const OURS: Record<string, string> = Object.fromEntries(Object.entries(SLUG).map(([ours, theirs]) => [theirs, ours]));
export const toolkitOf = (tool: string) => SLUG[tool] ?? tool;
export const toolOf = (toolkit: string) => OURS[toolkit] ?? toolkit;

const NAMES: Record<string, string> = {
  github: "GitHub",
  vercel: "Vercel",
  notion: "Notion",
  slack: "Slack",
  gmail: "Gmail",
  twitter: "X",
  linear: "Linear",
  figma: "Figma",
  googledrive: "Google Drive",
  googlecalendar: "Google Calendar",
  hubspot: "HubSpot",
  stripe: "Stripe",
};
/** An app's name, from its Composio toolkit slug. */
export const appName = (toolkit: string) => NAMES[toolkit] ?? toolkit.charAt(0).toUpperCase() + toolkit.slice(1);

/** The Composio user a board's connections belong to. */
export const boardUser = (boardId: string) => `pompi-board-${boardId}`;

export class ComposioError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, timeoutMs = 60_000): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": process.env.COMPOSIO_API_KEY ?? "", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 300);
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
    } catch {}
    throw new ComposioError(`Composio: ${message}`, res.status);
  }
  return JSON.parse(text) as T;
}

/** A tool for the Responses API. */
export type FunctionTool = { type: "function"; name: string; description: string; parameters: Record<string, unknown>; strict: false };

export type Session = {
  id: string;
  tools: FunctionTool[];
  /** Composio's own guidance for using its meta tools. */
  guide: string;
  /** Toolkits that are on, by Composio slug. */
  apps: string[];
  /** Toolkits this deployment can't connect yet (they need their own developer app on Composio). */
  missing: string[];
};

/**
 * A session for `userId` that can use only `toolkits` (Composio slugs). Toolkits
 * Composio can't connect without setup are left out, and listed in `missing`.
 */
export async function openSession(userId: string, toolkits: string[]): Promise<Session | null> {
  let enable = [...new Set(toolkits)];
  const missing: string[] = [];
  for (let tries = 0; tries < 4 && enable.length; tries++) {
    try {
      const s = await call<{ session_id: string; experimental?: { assistive_prompt?: string } }>("POST", "/tool_router/session", { user_id: userId, toolkits: { enable }, workbench: { enable: false } });
      const list = await call<{ items: { slug: string; description?: string; input_parameters?: Record<string, unknown> }[] }>("GET", `/tool_router/session/${s.session_id}/tools?limit=50`);
      return {
        id: s.session_id,
        tools: list.items.map((t) => ({ type: "function", name: t.slug, description: (t.description ?? "").slice(0, 4000), parameters: t.input_parameters ?? { type: "object", properties: {} }, strict: false })),
        guide: s.experimental?.assistive_prompt ?? "",
        apps: enable,
        missing,
      };
    } catch (e) {
      // "The following toolkits require auth configs but none exist and cannot be auto-created: twitter. …"
      const m = /cannot be auto-created:\s*([a-z0-9_,\s]+)/i.exec((e as Error).message);
      if (!m) throw e;
      const bad = m[1]
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      missing.push(...bad);
      enable = enable.filter((t) => !bad.includes(t));
    }
  }
  return null;
}

export type Executed = { result_type: "completed" | "failed" | "blocked"; data?: unknown; error?: string | null; message?: string };

/** Runs one of the session's tools. */
export function execute(sessionId: string, tool: string, args: Record<string, unknown>): Promise<Executed> {
  return call<Executed>("POST", `/tool_router/session/${sessionId}/execute`, { tool_slug: tool, arguments: args }, 120_000);
}
