/**
 * A thin client for Orgo's REST API (https://docs.orgo.ai): the cloud computers
 * a board's agents share. Used from actions only (it reads ORGO_API_KEY).
 */

const BASE = "https://www.orgo.ai/api";
/** The Orgo workspace Pompi keeps its board computers in. */
const WORKSPACE_NAME = "Pompi";

export const hasOrgo = () => !!process.env.ORGO_API_KEY;

export class OrgoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
  const key = process.env.ORGO_API_KEY;
  if (!key) throw new OrgoError("No ORGO_API_KEY on this deployment", 0);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw new OrgoError(`Orgo ${method} ${path.split("?")[0]}: ${res.status} ${json.error ?? ""}`.trim(), res.status, json.code);
  return json;
}

/** Pompi's Orgo workspace: ORGO_WORKSPACE_ID if set, else the one named "Pompi", made the first time. */
export async function workspaceId(): Promise<string> {
  if (process.env.ORGO_WORKSPACE_ID) return process.env.ORGO_WORKSPACE_ID;
  const { workspaces = [] } = await call<{ workspaces?: { id: string; name: string }[] }>("GET", "/workspaces");
  const found = workspaces.find((w) => w.name.toLowerCase() === WORKSPACE_NAME.toLowerCase());
  if (found) return found.id;
  return (await call<{ id: string }>("POST", "/workspaces", { name: WORKSPACE_NAME })).id;
}

export type Computer = { id: string; status: string };

export const orgo = {
  /** A new Linux computer: 8 GB and 2 vCPUs, enough for a browser, a shell and a dev server. */
  create: async (name: string) => call<Computer>("POST", "/computers", { workspace_id: await workspaceId(), name: name.slice(0, 80), os: "linux", ram: 8, cpu: 2, resolution: "1280x720x24" }, 120_000),
  get: (id: string) => call<Computer>("GET", `/computers/${id}`),
  start: (id: string) => call<{ success?: boolean }>("POST", `/computers/${id}/start`, {}, 320_000),
  stop: (id: string) => call<{ success?: boolean }>("POST", `/computers/${id}/stop`, {}, 120_000),
  remove: (id: string) => call("DELETE", `/computers/${id}`),

  /** The screen as a data URL (PNG for the model; JPEG is smaller for people). */
  screenshot: async (id: string, format: "png" | "jpeg" = "png", scale = 1) => {
    const r = await call<{ image: string; width?: number; height?: number }>("GET", `/computers/${id}/screenshot?response_format=base64&image_encoding=data_url&format=${format}&scale=${scale}${format === "jpeg" ? "&quality=72" : ""}`, undefined, 45_000);
    return r.image.startsWith("data:") ? r.image : `data:image/${format};base64,${r.image}`;
  },
  click: (id: string, x: number, y: number, o: { button?: string; double?: boolean } = {}) => call("POST", `/computers/${id}/click`, { x: Math.round(x), y: Math.round(y), ...(o.button && o.button !== "left" ? { button: o.button } : {}), ...(o.double ? { double: true } : {}) }),
  move: (id: string, x: number, y: number) => call("POST", `/computers/${id}/mouse-move`, { x: Math.round(x), y: Math.round(y) }),
  drag: (id: string, a: { x: number; y: number }, b: { x: number; y: number }) => call("POST", `/computers/${id}/drag`, { start_x: Math.round(a.x), start_y: Math.round(a.y), end_x: Math.round(b.x), end_y: Math.round(b.y) }),
  type: (id: string, text: string) => call("POST", `/computers/${id}/type`, { text }, 90_000),
  key: (id: string, key: string) => call("POST", `/computers/${id}/key`, { key }),
  scroll: (id: string, x: number, y: number, direction: "up" | "down", amount: number) => call("POST", `/computers/${id}/scroll`, { x: Math.round(x), y: Math.round(y), direction, amount }),
  bash: (id: string, command: string, timeout = 120) => call<{ output?: string; exit_code?: number }>("POST", `/computers/${id}/bash`, { command, timeout }, (timeout + 20) * 1000),
};

/** Key names as the model says them, to the X11 names Orgo wants ("ctrl+shift+t", "Return"). */
const KEYS: Record<string, string> = {
  ctrl: "ctrl", control: "ctrl", alt: "alt", option: "alt", shift: "shift", cmd: "super", command: "super", meta: "super", super: "super", win: "super",
  enter: "Return", return: "Return", esc: "Escape", escape: "Escape", tab: "Tab", backspace: "BackSpace", delete: "Delete", del: "Delete", space: "space",
  up: "Up", down: "Down", left: "Left", right: "Right", arrowup: "Up", arrowdown: "Down", arrowleft: "Left", arrowright: "Right",
  home: "Home", end: "End", pageup: "Page_Up", pagedown: "Page_Down", insert: "Insert",
};
export const keyCombo = (keys: string[]) => keys.map((k) => KEYS[k.toLowerCase()] ?? (/^f\d{1,2}$/i.test(k) ? k.toUpperCase() : k.length === 1 ? k.toLowerCase() : k)).join("+");
