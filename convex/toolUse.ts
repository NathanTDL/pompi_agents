import { appName } from "./composio";

/**
 * An agent's apps (composio.ts), as its tools: Composio's meta tools search
 * for the app action it needs and run it. Reads run on their own; anything that
 * changes something (sending, posting, creating, deleting…) waits for the
 * team's OK on the board (agent.ts).
 */

export const SEARCH = "COMPOSIO_SEARCH_TOOLS";
export const CONNECT = "COMPOSIO_MANAGE_CONNECTIONS";
export const RUN = "COMPOSIO_MULTI_EXECUTE_TOOL";

export type App = { tool: string; name: string; url: string };

/** App actions that only look (read, list, search…): everything else changes something, and waits for an OK. */
const LOOKS = /^(GET|LIST|SEARCH|FIND|FETCH|READ|RETRIEVE|CHECK|QUERY|LOOKUP|DESCRIBE|COUNT|VIEW|SHOW|DOWNLOAD|EXPORT)(_|$)/;

type Planned = { tool_slug: string; arguments?: Record<string, unknown> };

const actionOf = (slug: string, apps: string[]) => {
  const app = apps.find((a) => slug.startsWith(`${a.toUpperCase()}_`));
  return { app, action: app ? slug.slice(app.length + 1) : slug };
};

/** The planned app actions that change something. */
export function changes(args: Record<string, unknown>, apps: string[]): Planned[] {
  const tools = (Array.isArray(args.tools) ? args.tools : []) as Planned[];
  return tools.filter((t) => !LOOKS.test(actionOf(String(t.tool_slug), apps).action));
}

/** "GitHub: create an issue (“Fix login”)": an app action in plain words, for the OK on the board. */
export function plain(t: Planned, apps: string[]): string {
  const { app, action } = actionOf(String(t.tool_slug), apps);
  const what = action.toLowerCase().replace(/_/g, " ");
  const a = t.arguments ?? {};
  const key = ["title", "subject", "text", "message", "name", "body", "content"].map((k) => a[k]).find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const to = ["to", "recipient_email", "channel", "repo", "repository"].map((k) => a[k]).find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const detail = [to ? `to ${to}` : "", key ? `“${key.trim().slice(0, 80)}${key.trim().length > 80 ? "…" : ""}”` : ""].filter(Boolean).join(", ");
  return `${app ? appName(app) : "An app"}: ${what}${detail ? ` (${detail})` : ""}`;
}

/** What an agent is doing with its apps, for its status on the board. */
export function doing(name: string, args: Record<string, unknown>, apps: string[]): string {
  if (name === SEARCH) return "Looking through its apps";
  if (name === CONNECT) return "Checking its apps";
  if (name === RUN) {
    const t = ((args.tools as Planned[] | undefined) ?? [])[0];
    const app = t ? actionOf(String(t.tool_slug), apps).app : undefined;
    return app ? `Using ${appName(app)}` : "Using its apps";
  }
  return "Using its apps";
}

/** Something short enough for the model to read back. */
export const clipJson = (v: unknown) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 12_000 ? `${s.slice(0, 12_000)}… (cut)` : s;
};
