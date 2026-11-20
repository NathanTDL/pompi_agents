import { appName, execute, openSession, toolOf, type Session } from "./composio";

/**
 * An agent answering with its apps (composio.ts): the model searches for the
 * app actions it needs and runs them through Composio, one call at a time, then
 * gives its usual answer. It stops for the team when an app needs connecting,
 * and before anything that changes something (sending, posting, creating,
 * deleting…): reads run on their own, writes wait for an OK on the board.
 */

const MAX_CALLS = 24;
const RUN_MS = 4 * 60_000;

const SEARCH = "COMPOSIO_SEARCH_TOOLS";
const CONNECT = "COMPOSIO_MANAGE_CONNECTIONS";
const RUN = "COMPOSIO_MULTI_EXECUTE_TOOL";

/** Where a paused run picks up: the model's response, its tool call, and that call if it's waiting for an OK. */
export type ToolResume = { responseId: string; callId: string; sessionId: string; pending?: string };
export type App = { tool: string; name: string; url: string };

export type ToolRun<T> =
  | { kind: "done"; answer: T }
  | { kind: "connect"; text: string; apps: App[]; resume: ToolResume }
  | { kind: "ask"; text: string; resume: ToolResume };

type OutputItem = { type: string; call_id?: string; name?: string; arguments?: string; content?: { type: string; text?: string }[] };

async function respond(body: Record<string, unknown>) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as { id: string; output: OutputItem[] };
}

/** App actions that only look (read, list, search…): everything else changes something, and waits for an OK. */
const LOOKS = /^(GET|LIST|SEARCH|FIND|FETCH|READ|RETRIEVE|CHECK|QUERY|LOOKUP|DESCRIBE|COUNT|VIEW|SHOW|DOWNLOAD|EXPORT)(_|$)/;

type Planned = { tool_slug: string; arguments?: Record<string, unknown> };

const actionOf = (slug: string, apps: string[]) => {
  const app = apps.find((a) => slug.startsWith(`${a.toUpperCase()}_`));
  return { app, action: app ? slug.slice(app.length + 1) : slug };
};

/** The planned app actions that change something. */
function changes(args: Record<string, unknown>, apps: string[]): Planned[] {
  const tools = (Array.isArray(args.tools) ? args.tools : []) as Planned[];
  return tools.filter((t) => !LOOKS.test(actionOf(String(t.tool_slug), apps).action));
}

/** "GitHub: create an issue (“Fix login”)": an app action in plain words, for the OK on the board. */
function plain(t: Planned, apps: string[]): string {
  const { app, action } = actionOf(String(t.tool_slug), apps);
  const what = action.toLowerCase().replace(/_/g, " ");
  const a = t.arguments ?? {};
  const key = ["title", "subject", "text", "message", "name", "body", "content"].map((k) => a[k]).find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const to = ["to", "recipient_email", "channel", "repo", "repository"].map((k) => a[k]).find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const detail = [to ? `to ${to}` : "", key ? `“${key.trim().slice(0, 80)}${key.trim().length > 80 ? "…" : ""}”` : ""].filter(Boolean).join(", ");
  return `${app ? appName(app) : "An app"}: ${what}${detail ? ` (${detail})` : ""}`;
}

/** What an agent is doing with its apps, for its status on the board. */
function doing(name: string, args: Record<string, unknown>, apps: string[]): string {
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
const clip = (v: unknown) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 12_000 ? `${s.slice(0, 12_000)}… (cut)` : s;
};

export async function answerWithTools<T>(o: {
  model: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
  userId: string;
  toolkits: string[];
  resume?: ToolResume;
  approved?: boolean;
  onStep: (doing: string) => Promise<void>;
}): Promise<ToolRun<T>> {
  let session: Session | null;
  if (o.resume) {
    // Picking up: the session lives on at Composio; its tools are the same four.
    session = await openSession(o.userId, o.toolkits);
    if (session) session = { ...session, id: o.resume.sessionId };
  } else session = await openSession(o.userId, o.toolkits);
  if (!session) throw new Error("None of this agent's apps can be connected on this Pompi yet");
  const s = session;

  const instructions = [
    o.instructions,
    `You can use these apps through the tools here: ${s.apps.map(appName).join(", ")}.${s.missing.length ? ` ${s.missing.map(appName).join(" and ")} can't be connected on this Pompi yet: if the request needs ${s.missing.length > 1 ? "them" : "it"}, say so plainly.` : ""}`,
    s.guide,
    "Search for the app action first, then run it. If an app isn't connected, call COMPOSIO_MANAGE_CONNECTIONS for it and stop: the board shows the team a Connect button, so never write the link yourself.",
    "Reading and looking things up is fine. Anything that sends, posts, creates, edits or deletes is checked with the team before it runs, so just call it when the request asks for it, with exactly what you mean to do.",
    "When you're done, give your answer. Never say you did something an app didn't confirm.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const base = { model: o.model, instructions, tools: [...s.tools, { type: "web_search" }], parallel_tool_calls: false, reasoning: { effort: "low" }, text: { format: { type: "json_schema", name: "answer", schema: o.schema, strict: true } }, store: true };

  // What goes back for the call it paused on.
  let input: unknown;
  let previous: string | undefined;
  if (o.resume) {
    previous = o.resume.responseId;
    let output: string;
    if (o.resume.pending) {
      const args = JSON.parse(o.resume.pending) as Record<string, unknown>;
      output = o.approved ? clip(await execute(s.id, RUN, args).catch((e: unknown) => ({ error: (e as Error).message }))) : "The team said no to this. Don't do it; say so in your answer.";
    } else {
      output = o.approved ? "The team says they've connected it. Check with COMPOSIO_MANAGE_CONNECTIONS that it's active, then carry on." : "The team chose not to connect it now. Don't use that app; answer without it.";
    }
    input = [{ type: "function_call_output", call_id: o.resume.callId, output }];
  } else input = o.input;

  const t0 = Date.now();
  for (let calls = 0; calls < MAX_CALLS && Date.now() - t0 < RUN_MS; calls++) {
    const res = await respond({ ...base, input, ...(previous ? { previous_response_id: previous } : {}) });
    previous = res.id;
    const call = res.output.find((x) => x.type === "function_call");
    if (!call) {
      const text = res.output
        .filter((x) => x.type === "message")
        .flatMap((x) => x.content ?? [])
        .filter((c) => c.type === "output_text")
        .map((c) => c.text ?? "")
        .join("");
      return { kind: "done", answer: JSON.parse(text) as T };
    }

    const name = call.name ?? "";
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.arguments ?? "{}") as Record<string, unknown>;
    } catch {}
    await o.onStep(doing(name, args, s.apps));
    const resume = { responseId: res.id, callId: call.call_id ?? "", sessionId: s.id };

    // Something that changes things waits for the team.
    if (name === RUN) {
      const risky = changes(args, s.apps);
      if (risky.length) return { kind: "ask", text: `Before I go ahead: ${risky.map((t) => plain(t, s.apps)).join("; ")}. OK?`, resume: { ...resume, pending: JSON.stringify(args) } };
    }

    const result = await execute(s.id, name, args).catch((e: unknown) => ({ result_type: "failed" as const, error: (e as Error).message }));

    // An app to connect: the team gets a button for each, and the agent waits.
    if (name === CONNECT && result.result_type === "completed") {
      const results = ((result.data as { results?: Record<string, { status?: string; redirect_url?: string }> } | undefined)?.results ?? {}) as Record<string, { status?: string; redirect_url?: string }>;
      const apps = Object.entries(results)
        .filter(([, r]) => r.redirect_url && r.status !== "active")
        .map(([toolkit, r]) => ({ tool: toolOf(toolkit), name: appName(toolkit), url: r.redirect_url! }));
      if (apps.length) return { kind: "connect", text: `I need ${apps.map((a) => a.name).join(" and ")} connected to this board first. Connect ${apps.length > 1 ? "them" : "it"}, then tell me to carry on.`, apps, resume };
    }

    input = [{ type: "function_call_output", call_id: call.call_id, output: clip(result) }];
  }
  throw new Error("That took too many steps with the apps");
}
