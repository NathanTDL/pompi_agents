import { keyCombo, orgo, OrgoError } from "./orgo";

/**
 * An agent working on the board's computer, on the Responses API's own
 * `computer` tool (as Bops does): the model sees the screen and asks for
 * clicks and keys, they're done on the Orgo computer, and the screen goes
 * back. Next to it, a shell. One run lasts at most RUN_MS (a Convex action has
 * ten minutes); it ends with the agent's answer, with it asking first, or, for
 * long work, with where it got to, for the next run to carry on from.
 */

/** The computer's screen, as orgo.ts makes it. */
export const SCREEN = { w: 1280, h: 720 };
const MAX_CALLS = 60;
/** Leaves room in the action's ten minutes for a last model call and command. */
const RUN_MS = 5 * 60_000;
/** When the action's model calls must be done by, retries included (Convex stops an action at ten minutes). */
const LAST_CALL_MS = 8.5 * 60_000;
/** After acting, how long the screen settles before it's captured. */
const SETTLE_MS = 350;

type Action = { type: string; x?: number; y?: number; button?: string; keys?: string[] | null; path?: { x: number; y: number }[]; text?: string; scroll_x?: number; scroll_y?: number };
type OutputItem = {
  type: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  action?: Action;
  actions?: Action[];
  pending_safety_checks?: { id: string; code?: string | null; message?: string | null }[];
  content?: { type: string; text?: string }[];
};

/** Where a run left off, to carry it on after the user's OK. */
export type Resume = {
  responseId: string;
  callId?: string;
  checks?: { id: string; code?: string | null; message?: string | null }[];
  /** Carrying long work on: the steps it took last, waiting for their results (a fresh screenshot, a command's output). */
  pending?: Pending[];
};
type Pending = { callId: string; kind: "computer" | "shell"; output?: string };

export type RunResult =
  | { kind: "done"; text: string; responseId: string }
  | { kind: "ask"; text: string; resume: Resume }
  | { kind: "more"; resume: Resume }
  | { kind: "failed"; text: string };

/** One thing the agent does: in words, and what and where on the screen (for the board to show). */
export type Step = { doing: string; kind: string; at?: { x: number; y: number }; dir?: "up" | "down" };

const SHELL_TOOL = {
  type: "function",
  name: "run_shell",
  description:
    "Run a bash command on the computer (Ubuntu) and get its output, for up to 2 minutes. For terminal work: files, git, npm, building and running code, CLIs. Long-running servers: start them in the background with their output in a log (nohup npm run dev > /tmp/dev.log 2>&1 &), or the command never returns. Use the screen for browsing and desktop apps.",
  strict: true,
  parameters: { type: "object", additionalProperties: false, required: ["command"], properties: { command: { type: "string" } } },
};

/**
 * One turn of the model. A turn that hangs, or hits a hiccup (429, 5xx), is
 * asked again: it only decides the next step, so asking twice does no harm.
 */
/**
 * `command`, run so everyone watching the screen sees it: it and its output go
 * to a log that a terminal window on the desktop follows (opened the first time,
 * and again if it's closed). The output comes back as usual too. It writes to a
 * file, not a pipe, so a server started in the background can't hold it open.
 */
export function onScreen(command: string) {
  const b64 = Buffer.from(command, "utf8").toString("base64");
  const shown = command.split("\n").slice(0, 3).join("\n").slice(0, 300).replace(/'/g, String.raw`'\''`);
  return [
    "P=/tmp/pompi; L=$P/shell.log; mkdir -p $P; touch $L; M=pompi-shell-",
    // The window: a terminal following the log. (The marker is put together so this script's own text doesn't match it.)
    'if ! pgrep -f "${M}view" >/dev/null 2>&1; then export DISPLAY=${DISPLAY:-:99}; V="tail -n 300 -F $L # ${M}view";',
    '  if command -v xfce4-terminal >/dev/null 2>&1; then setsid nohup xfce4-terminal --title="Agent terminal" --geometry=110x30 -x bash -c "$V" >/dev/null 2>&1 </dev/null &',
    '  elif command -v xterm >/dev/null 2>&1; then setsid nohup xterm -T "Agent terminal" -geometry 110x30 -e bash -c "$V" >/dev/null 2>&1 </dev/null &',
    '  elif command -v x-terminal-emulator >/dev/null 2>&1; then setsid nohup x-terminal-emulator -e bash -c "$V" >/dev/null 2>&1 </dev/null & fi; fi',
    String.raw`printf '\n\033[1;32m$\033[0m %s\n' '${shown}' >> $L`,
    // Its own file: bash reads a script as it goes, and one still running mustn't see the next.
    `C=$(mktemp $P/cmd.XXXXXX); echo ${b64} | base64 -d > $C`,
    "S=$(stat -c %s $L)",
    "bash $C >> $L 2>&1 </dev/null; E=$?; rm -f $C",
    "tail -c +$((S + 1)) $L",
    "exit $E",
  ].join("\n");
}

async function respond(body: Record<string, unknown>, deadline: number) {
  for (let i = 1; ; i++) {
    const signal = AbortSignal.timeout(Math.max(30_000, Math.min(150_000, deadline - Date.now())));
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (i < 3 && deadline - Date.now() > 45_000) continue;
      // Convex says only "The signal has been aborted" when a fetch times out.
      throw new Error(signal.aborted ? "the model took too long to answer" : `couldn't reach OpenAI: ${(e as Error).message}`);
    }
    if (!res.ok && i < 3 && deadline - Date.now() > 45_000 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 1500 * i));
      continue;
    }
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as { id: string; output: OutputItem[] };
  }
}

const screen = async (id: string) => ({ type: "computer_screenshot", image_url: await orgo.screenshot(id), detail: "original" });

/** Plain words for an action, for the agent's status on the board. */
function describe(a: Action): string {
  switch (a.type) {
    case "click":
    case "double_click":
      return "Clicking";
    case "type":
      return `Typing “${(a.text ?? "").slice(0, 28)}${(a.text ?? "").length > 28 ? "…" : ""}”`;
    case "keypress":
      return `Pressing ${keyCombo(a.keys ?? [])}`;
    case "scroll":
      return "Scrolling";
    case "drag":
      return "Dragging";
    case "wait":
      return "Waiting for the page";
    default:
      return "Looking at the screen";
  }
}

async function act(id: string, a: Action) {
  switch (a.type) {
    case "click":
      return orgo.click(id, a.x ?? 0, a.y ?? 0, { button: a.button });
    case "double_click":
      return orgo.click(id, a.x ?? 0, a.y ?? 0, { double: true });
    case "move":
      return orgo.move(id, a.x ?? 0, a.y ?? 0);
    case "drag": {
      const p = a.path ?? [];
      if (p.length >= 2) return orgo.drag(id, p[0], p[p.length - 1]);
      return;
    }
    case "type":
      return orgo.type(id, a.text ?? "");
    case "keypress":
      return orgo.key(id, keyCombo(a.keys ?? []));
    case "scroll": {
      const dy = a.scroll_y ?? 0;
      if (!dy) return;
      return orgo.scroll(id, a.x ?? SCREEN.w / 2, a.y ?? SCREEN.h / 2, dy < 0 ? "up" : "down", Math.min(15, Math.max(1, Math.round(Math.abs(dy) / 100))));
    }
    case "wait":
      return new Promise((r) => setTimeout(r, 2000));
    default:
      return;
  }
}

/**
 * Runs `goal` on the computer `orgoId` (or carries on from `resume` after the
 * user's OK), calling `onStep` as it goes so the board can show what it's doing.
 */
export async function runOnComputer(o: { orgoId: string; model: string; instructions: string; goal: string; resume?: Resume; approved?: boolean; startedAt?: number; wake?: () => Promise<void>; onStep: (s: Step) => Promise<void> }): Promise<RunResult> {
  // From when the action began (thinking, or waiting for the computer, may have used some of it).
  const started = o.startedAt ?? Date.now();
  // The computer went to sleep or stopped under it (Orgo's idle timer, its credit): wake it and carry on, twice a run at most.
  let wakes = 0;
  const woke = async () => {
    if (!o.wake || wakes >= 2) return false;
    const now = await orgo.get(o.orgoId).catch(() => null);
    if (now?.status === "running") return false;
    wakes++;
    await o.wake();
    return true;
  };
  const look = async () => {
    try {
      return await screen(o.orgoId);
    } catch (e) {
      if (await woke()) return screen(o.orgoId);
      throw e;
    }
  };
  let prev: string | undefined = o.resume?.responseId;
  let input: unknown[];
  if (o.resume?.pending) {
    input = [];
    for (const p of o.resume.pending) {
      input.push(p.kind === "computer" ? { type: "computer_call_output", call_id: p.callId, output: await look() } : { type: "function_call_output", call_id: p.callId, output: p.output ?? "" });
    }
    input.push({ role: "user", content: [{ type: "input_text", text: "(From Pompi: keep going with the same task, from where you are.)" }] });
  } else if (o.resume) {
    // Carrying on after their answer: the flagged step, if it was one, gets the screen as it is now with its checks acknowledged.
    input = [
      ...(o.resume.callId ? [{ type: "computer_call_output", call_id: o.resume.callId, acknowledged_safety_checks: o.approved ? (o.resume.checks ?? []) : [], output: await look() }] : []),
      { role: "user", content: [{ type: "input_text", text: o.approved ? "They said yes: go ahead and do it now." : "They said no: don't do it. Stop and say in a sentence what you'll leave as it is." }] },
    ];
  } else {
    input = [{ role: "user", content: [{ type: "input_text", text: o.goal }] }];
  }

  let pending: Pending[] = [];
  for (let calls = 0; ; calls++) {
    // Out of time for this run: the next one takes over from here.
    if (prev && pending.length && (calls >= MAX_CALLS || Date.now() - started > RUN_MS)) return { kind: "more", resume: { responseId: prev, pending } };
    const r = await respond({ model: o.model, instructions: o.instructions, tools: [{ type: "computer" }, SHELL_TOOL], reasoning: { effort: "low" }, input, ...(prev ? { previous_response_id: prev } : {}), truncation: "auto", store: true }, started + LAST_CALL_MS);
    prev = r.id;
    const asks = r.output.filter((x) => x.type === "computer_call" || x.type === "function_call");
    if (!asks.length) {
      const text = r.output
        .filter((x) => x.type === "message")
        .flatMap((x) => x.content ?? [])
        .filter((c) => c.type === "output_text")
        .map((c) => c.text ?? "")
        .join("")
        .trim();
      const ask = text.match(/^NEED_OK:\s*([\s\S]+)/i);
      if (ask) return { kind: "ask", text: ask[1].trim(), resume: { responseId: r.id } };
      return { kind: "done", text: text || "Done.", responseId: r.id };
    }
    // OpenAI flagged the next step (a sensitive site, instructions on a page): the user decides.
    const flagged = asks.find((x) => x.pending_safety_checks?.length);
    if (flagged) {
      const why = flagged.pending_safety_checks!.map((c) => c.message ?? c.code ?? "a safety check").join("; ");
      return { kind: "ask", text: `Before my next step I need your OK: ${why}`, resume: { responseId: r.id, callId: flagged.call_id, checks: flagged.pending_safety_checks } };
    }
    input = [];
    pending = [];
    for (const call of asks) {
      if (call.type === "computer_call") {
        const actions = call.actions ?? (call.action ? [call.action] : []);
        let note = "";
        let acted = false;
        for (const a of actions) {
          if (a.type === "screenshot") continue;
          acted = true;
          await o.onStep({ doing: describe(a), kind: a.type, at: a.x !== undefined && a.y !== undefined ? { x: a.x, y: a.y } : a.path?.[0], ...(a.type === "scroll" ? { dir: (a.scroll_y ?? 0) < 0 ? ("up" as const) : ("down" as const) } : {}) });
          try {
            await act(o.orgoId, a);
          } catch (e) {
            note = `The ${a.type} failed: ${(e as Error).message}. The screenshot shows the screen now.`;
            break;
          }
        }
        if (acted) await new Promise((res) => setTimeout(res, SETTLE_MS));
        input.push({ type: "computer_call_output", call_id: call.call_id, output: await look() });
        pending.push({ callId: call.call_id ?? "", kind: "computer" });
        if (note) input.push({ role: "user", content: [{ type: "input_text", text: `(From Pompi: ${note})` }] });
      } else {
        let command = "";
        try {
          command = String((JSON.parse(call.arguments ?? "{}") as { command?: string }).command ?? "");
        } catch {
          // Unreadable arguments: an empty command, which says so below.
        }
        await o.onStep({ doing: `Running ${command.split("\n")[0].slice(0, 36)}`, kind: "shell" });
        const run = async () => {
          // Up to 2 minutes, less near the end of the action's ten.
          const secs = Math.max(15, Math.min(120, Math.floor((started + 9 * 60_000 - Date.now()) / 1000) - 45));
          const res = await orgo.bash(o.orgoId, onScreen(command), secs);
          return `exit ${res.exit_code ?? "?"}\n${(res.output ?? "").slice(-12_000)}`;
        };
        let output: string;
        try {
          if (!command.trim()) throw new Error("the command was empty");
          output = await run().catch(async (e: unknown) => {
            if (await woke()) return run();
            // Up but its desktop not answering yet (just started, a hiccup): nothing ran, so wait a little and try again.
            if (/not available|502|503/i.test((e as Error).message)) {
              orgo.forget(o.orgoId);
              await new Promise((r) => setTimeout(r, 6000));
              return run();
            }
            throw e;
          });
        } catch (e) {
          output =
            e instanceof OrgoError && e.code === "timeout"
              ? "Couldn't run it: it ran past its time limit and was stopped. Servers and long jobs go in the background with their output in a log (nohup … > /tmp/job.log 2>&1 &); then check the log with tail."
              : `Couldn't run it: ${(e as Error).message}`;
        }
        input.push({ type: "function_call_output", call_id: call.call_id, output });
        pending.push({ callId: call.call_id ?? "", kind: "shell", output: output.slice(-6000) });
      }
    }
  }
}
