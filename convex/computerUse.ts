import { keyCombo, orgo } from "./orgo";

/**
 * What an agent does on the board's computer, whatever model it thinks with
 * (agent.ts gives these to it as tools): look at the screen, act on it in
 * batches, and run commands, shown in a terminal on the screen as they go.
 */

/** The computer's screen, as orgo.ts makes it. */
export const SCREEN = { w: 1280, h: 720 };
/** After acting, how long the screen settles before it's captured. */
const SETTLE_MS = 350;
/** The most actions one batch may carry. */
export const MAX_ACTIONS = 20;

/** One thing to do on the screen, as the computer_act tool takes it. */
export type Action = {
  type: "click" | "double_click" | "right_click" | "move" | "drag" | "type" | "key" | "scroll" | "wait";
  x?: number;
  y?: number;
  /** Where a drag ends. */
  to_x?: number;
  to_y?: number;
  text?: string;
  /** "ctrl+l", "Return", "alt+tab" (key). */
  keys?: string;
  direction?: "up" | "down";
  /** Scroll notches, 1–15 (default 3). */
  amount?: number;
  /** For wait: up to 5 s (default 1.5 s). */
  ms?: number;
};

/** One thing the agent does: in words, and what and where on the screen (for the board to show). */
export type Step = { doing: string; kind: string; at?: { x: number; y: number }; dir?: "up" | "down" };

/** Plain words for an action, for the agent's status on the board. */
export function describe(a: Action): string {
  switch (a.type) {
    case "click":
    case "double_click":
    case "right_click":
      return "Clicking";
    case "type":
      return `Typing “${(a.text ?? "").slice(0, 28)}${(a.text ?? "").length > 28 ? "…" : ""}”`;
    case "key":
      return `Pressing ${keyCombo((a.keys ?? "").split("+"))}`;
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

export const stepOf = (a: Action): Step => ({
  doing: describe(a),
  kind: a.type === "key" ? "keypress" : a.type,
  ...(a.x !== undefined && a.y !== undefined ? { at: { x: a.x, y: a.y } } : {}),
  ...(a.type === "scroll" ? { dir: a.direction === "up" ? ("up" as const) : ("down" as const) } : {}),
});

export async function act(id: string, a: Action) {
  const x = a.x ?? SCREEN.w / 2;
  const y = a.y ?? SCREEN.h / 2;
  switch (a.type) {
    case "click":
      return orgo.click(id, x, y);
    case "double_click":
      return orgo.click(id, x, y, { double: true });
    case "right_click":
      return orgo.click(id, x, y, { button: "right" });
    case "move":
      return orgo.move(id, x, y);
    case "drag":
      return orgo.drag(id, { x, y }, { x: a.to_x ?? x, y: a.to_y ?? y });
    case "type":
      return orgo.type(id, a.text ?? "");
    case "key":
      return orgo.key(id, keyCombo((a.keys ?? "").split("+").filter(Boolean)));
    case "scroll":
      return orgo.scroll(id, x, y, a.direction === "up" ? "up" : "down", Math.min(15, Math.max(1, Math.round(a.amount ?? 3))));
    case "wait":
      return new Promise((r) => setTimeout(r, Math.min(5000, Math.max(200, a.ms ?? 1500))));
    default:
      return;
  }
}

/**
 * Does `actions` in order, calling `onStep` before each. Stops at the first
 * that fails, and says which (the rest weren't done).
 */
export async function actAll(id: string, actions: Action[], onStep: (s: Step) => Promise<void>): Promise<{ done: number; error?: string }> {
  let done = 0;
  for (const a of actions.slice(0, MAX_ACTIONS)) {
    await onStep(stepOf(a));
    try {
      await act(id, a);
    } catch (e) {
      return { done, error: `Action ${done + 1} (${a.type}) failed: ${(e as Error).message}. The ones after it weren't done.` };
    }
    done++;
  }
  if (done && actions.some((a) => a.type !== "wait")) await new Promise((r) => setTimeout(r, SETTLE_MS));
  return { done };
}

/** The screen, as base64 PNG (for a model) and the data URL Orgo gave. */
export async function screenshot(id: string): Promise<{ data: string; mimeType: string }> {
  const url = await orgo.screenshot(id);
  const m = /^data:([^;]+);base64,(.*)$/s.exec(url);
  return m ? { mimeType: m[1], data: m[2] } : { mimeType: "image/png", data: url };
}

/**
 * `command`, run so everyone watching the screen sees it: it and its output go
 * to a log that a terminal window on the desktop follows (opened the first time,
 * and again if it's closed). The output comes back as usual too. It writes to a
 * file, not a pipe, so a server started in the background can't hold it open.
 */
export function onScreen(command: string) {
  // (Convex's runtime has no Buffer: UTF-8 bytes, then btoa.)
  const bytes = new TextEncoder().encode(command);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
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

/** Long output, for the model: the start and the end, which is where what matters usually is. */
export function clip(s: string, max = 6000) {
  return s.length <= max ? s : `${s.slice(0, 1500)}\n…(${s.length - max} characters cut)…\n${s.slice(-(max - 1500))}`;
}
