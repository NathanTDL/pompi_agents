import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchAuthMutation } from "@/lib/auth-server";
import { deskCall } from "@/lib/desktop";

/**
 * Someone driving the board's computer from its screen frame: a click, a drag,
 * a scroll, typing or a key, passed on to Orgo; or opening a browser or terminal. Only for the board's members,
 * only while the computer is on (an agent may be working on it too: they share it).
 */

type Input =
  | { type: "click"; x: number; y: number; button?: "left" | "right"; double?: boolean }
  | { type: "drag"; x: number; y: number; toX: number; toY: number }
  | { type: "scroll"; x: number; y: number; direction: "up" | "down"; amount: number }
  | { type: "type"; text: string }
  | { type: "key"; key: string }
  | { type: "open"; app: "browser" | "terminal" };

/** The first of these the computer has (a program, then how to start it), started on its screen. */
const APPS: Record<"browser" | "terminal", [string, string][]> = {
  // Orgo's computers run as root, where Chrome only starts without its sandbox.
  browser: [["google-chrome", "--no-sandbox --no-first-run --no-default-browser-check --start-maximized"], ["firefox", ""], ["chromium", "--no-sandbox"]],
  terminal: [["xfce4-terminal", ""], ["x-terminal-emulator", ""], ["xterm", ""]],
};
const launch = (apps: [string, string][]) =>
  `export DISPLAY=\${DISPLAY:-:99}; ${apps.map(([bin, args]) => `if command -v ${bin} >/dev/null 2>&1; then setsid nohup ${bin} ${args} >/dev/null 2>&1 </dev/null & exit 0; fi`).join("; ")}; exit 1`;

const W = 1280;
const H = 720;
const px = (v: unknown, max: number) => Math.min(max - 1, Math.max(0, Math.round(Number(v) || 0)));

function orgoCall(input: Input): { path: string; body: Record<string, unknown> } | null {
  switch (input.type) {
    case "click":
      return { path: "click", body: { x: px(input.x, W), y: px(input.y, H), ...(input.button === "right" ? { button: "right" } : {}), ...(input.double ? { double: true } : {}) } };
    case "drag":
      return { path: "drag", body: { start_x: px(input.x, W), start_y: px(input.y, H), end_x: px(input.toX, W), end_y: px(input.toY, H) } };
    case "scroll":
      return { path: "scroll", body: { x: px(input.x, W), y: px(input.y, H), direction: input.direction === "up" ? "up" : "down", amount: Math.min(10, Math.max(1, Math.round(input.amount) || 1)) } };
    case "type":
      return typeof input.text === "string" && input.text.length > 0 && input.text.length <= 4000 ? { path: "type", body: { text: input.text } } : null;
    case "key":
      return typeof input.key === "string" && /^[\w+]{1,40}$/.test(input.key) ? { path: "key", body: { key: input.key } } : null;
    case "open":
      return input.app === "browser" || input.app === "terminal" ? { path: "bash", body: { command: launch(APPS[input.app]), timeout: 15 } } : null;
    default:
      return null;
  }
}

/**
 * Who may drive which computer, remembered for a few seconds per sign-in and board:
 * asking Convex for every key and click would add its own delay to each.
 */
const allowed = new Map<string, { at: number; target: { orgoId: string | null; agent: string | null } }>();
const ALLOWED_MS = 4000;

export async function POST(req: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  if (!process.env.ORGO_API_KEY) return Response.json({ error: "No Orgo key" }, { status: 503 });
  const call = orgoCall((await req.json().catch(() => ({}))) as Input);
  if (!call) return Response.json({ error: "That isn't something the computer can do" }, { status: 400 });
  const who = `${boardId} ${req.headers.get("cookie") ?? ""}`;
  const known = allowed.get(who);
  let target = known && Date.now() - known.at < ALLOWED_MS ? known.target : null;
  if (!target) {
    try {
      target = await fetchAuthMutation(api.computer.forInput, { boardId: boardId as Id<"boards"> });
    } catch {
      return Response.json({ error: "Not allowed" }, { status: 403 });
    }
    for (const [k, v] of allowed) if (Date.now() - v.at > ALLOWED_MS) allowed.delete(k);
    allowed.set(who, { at: Date.now(), target });
  }
  if (!target.orgoId) return Response.json({ error: "The computer is off" }, { status: 409 });
  let out: { exit_code?: number } | null;
  try {
    out = await deskCall<{ exit_code?: number }>(target.orgoId, call.path, call.body);
  } catch {
    allowed.delete(who);
    return Response.json({ error: "The computer didn't take that" }, { status: 502 });
  }
  if (call.path === "bash" && out?.exit_code) return Response.json({ error: "The computer doesn't have that app" }, { status: 502 });
  return Response.json({ ok: true });
}
