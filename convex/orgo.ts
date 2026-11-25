/**
 * A thin client for Orgo's REST API (https://docs.orgo.ai): the cloud computers
 * a board's agents share. Used from actions only (it reads ORGO_API_KEY).
 */

const BASE = "https://www.orgo.ai/api";
/** The Orgo workspace Pompi keeps its board computers in. */
const WORKSPACE_NAME = "Pompi";

export const hasOrgo = () => !!process.env.ORGO_API_KEY;

export class OrgoError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Orgo's cloud API. Reads (GET) that time out or hit a hiccup (429, 5xx) are
 * tried again; anything else isn't, since it may have happened already.
 */
async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
  const key = process.env.ORGO_API_KEY;
  if (!key) throw new OrgoError("No ORGO_API_KEY on this deployment", 0);
  const tries = method === "GET" ? 3 : 1;
  for (let i = 1; ; i++) {
    const signal = AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
      });
    } catch (e) {
      if (i < tries) continue;
      // Convex says only "The signal has been aborted" when a fetch times out: say what took too long.
      if (signal.aborted) throw new OrgoError(`Orgo took too long (${method} ${path.split("?")[0]})`, 0, "timeout");
      throw new OrgoError(`Couldn't reach Orgo (${method} ${path.split("?")[0]}): ${(e as Error).message}`, 0);
    }
    const json = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
    if (!res.ok && i < tries && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 800 * i));
      continue;
    }
    if (!res.ok) throw new OrgoError(`Orgo ${method} ${path.split("?")[0]}: ${res.status} ${json.error ?? ""}`.trim(), res.status, json.code);
    return json;
  }
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

/*
 * Straight to the computer. Each Orgo computer runs its own desktop API, which
 * answers about three times quicker than going through Orgo's cloud for every
 * screenshot, click and key. Its address and token come from Orgo (and change
 * when it restarts). If it can't be reached, the cloud API does the job instead.
 */

type Desk = { url: string; token: string; at: number };
const desks = new Map<string, Desk>();
const DESK_TTL = 10 * 60_000;

async function desk(id: string, fresh = false): Promise<Desk> {
  const known = desks.get(id);
  if (known && !fresh && Date.now() - known.at < DESK_TTL) return known;
  const c = await call<{ url?: string; vnc_password?: string; instance_details?: { webUrl?: string } }>("GET", `/computers/${id}`);
  const url = c.instance_details?.webUrl ?? c.url;
  if (!url || !c.vnc_password) throw new OrgoError("This computer has no desktop address yet", 0);
  const d = { url: url.replace(/\/$/, ""), token: c.vnc_password, at: Date.now() };
  desks.set(id, d);
  return d;
}

/** Couldn't reach the computer at all: nothing happened there, so the cloud may do it instead. */
class Unreachable extends Error {}

async function direct<T>(id: string, method: "GET" | "POST", path: string, body: unknown, timeoutMs: number): Promise<T> {
  let d: Desk;
  try {
    d = await desk(id);
  } catch (e) {
    throw new Unreachable((e as Error).message);
  }
  for (const fresh of [false, true]) {
    if (fresh) d = await desk(id, true).catch((e: unknown) => Promise.reject(new Unreachable((e as Error).message)));
    let res: Response;
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      res = await fetch(`${d.url}${path}`, {
        method,
        headers: { Authorization: `Bearer ${d.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
      });
    } catch (e) {
      // A timeout may have done it already (a click, some typing): don't do it twice. A look (GET) can go through the cloud instead.
      // (Convex's error is a bare "The signal has been aborted", so it's the signal that tells.)
      if (signal.aborted && method !== "GET") throw new OrgoError(`The computer took too long (${path})`, 0, "timeout");
      throw new Unreachable(signal.aborted ? `timed out (${path})` : (e as Error).message);
    }
    // A stale address or token: look it up again once.
    if ((res.status === 401 || res.status === 404) && !fresh) continue;
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new OrgoError(`Computer ${path}: ${res.status} ${json.error ?? ""}`.trim(), res.status);
    return json;
  }
  throw new Unreachable("The computer's address didn't work");
}

/** Straight to the computer, else (when it can't be reached) through Orgo's cloud. */
async function either<T>(id: string, method: "GET" | "POST", path: string, body: unknown, cloud: () => Promise<T>, timeoutMs = 30_000): Promise<T> {
  try {
    return await direct<T>(id, method, path, body, timeoutMs);
  } catch (e) {
    if (!(e instanceof Unreachable)) throw e;
    console.warn("[orgo] desktop API unreachable, using the cloud API:", e.message);
    return cloud();
  }
}

const xy = (x: number, y: number) => ({ x: Math.round(x), y: Math.round(y) });

export const orgo = {
  /** A new Linux computer: 8 GB and 2 vCPUs, enough for a browser, a shell and a dev server. */
  create: async (name: string) => call<Computer>("POST", "/computers", { workspace_id: await workspaceId(), name: name.slice(0, 80), os: "linux", ram: 8, cpu: 2, resolution: "1280x720x24" }, 120_000),
  get: (id: string) => call<Computer>("GET", `/computers/${id}`),
  start: (id: string) => call<{ success?: boolean }>("POST", `/computers/${id}/start`, {}, 90_000),
  stop: (id: string) => call<{ success?: boolean }>("POST", `/computers/${id}/stop`, {}, 120_000),
  remove: (id: string) => call("DELETE", `/computers/${id}`),
  /** The computer's password for its live desktop (VNC over a websocket). It changes when the computer restarts. */
  vncPassword: (id: string) => call<{ password?: string }>("GET", `/computers/${id}/vnc-password`),

  /** The screen as a PNG data URL, for the model. */
  screenshot: async (id: string) => {
    const r = await either<{ image: string }>(id, "GET", "/screenshot", undefined, () => call<{ image: string }>("GET", `/computers/${id}/screenshot?response_format=base64&image_encoding=data_url&format=png`, undefined, 30_000), 20_000);
    return r.image.startsWith("data:") ? r.image : `data:image/png;base64,${r.image}`;
  },
  click: (id: string, x: number, y: number, o: { button?: string; double?: boolean } = {}) => {
    const body = { ...xy(x, y), ...(o.button && o.button !== "left" ? { button: o.button } : {}), ...(o.double ? { double: true } : {}) };
    return either(id, "POST", "/click", body, () => call("POST", `/computers/${id}/click`, body));
  },
  move: (id: string, x: number, y: number) => either(id, "POST", "/mouse_move", xy(x, y), () => call("POST", `/computers/${id}/mouse-move`, xy(x, y))),
  drag: (id: string, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const body = { start_x: Math.round(a.x), start_y: Math.round(a.y), end_x: Math.round(b.x), end_y: Math.round(b.y) };
    return either(id, "POST", "/drag", body, () => call("POST", `/computers/${id}/drag`, body));
  },
  type: (id: string, text: string) => either(id, "POST", "/type", { text }, () => call("POST", `/computers/${id}/type`, { text }, 90_000), 90_000),
  key: (id: string, key: string) => either(id, "POST", "/key", { key }, () => call("POST", `/computers/${id}/key`, { key })),
  scroll: (id: string, x: number, y: number, direction: "up" | "down", amount: number) => {
    const body = { ...xy(x, y), direction, amount };
    return either(id, "POST", "/scroll", body, () => call("POST", `/computers/${id}/scroll`, body));
  },
  bash: (id: string, command: string, timeout = 120) =>
    either<{ output?: string; exit_code?: number }>(id, "POST", "/bash", { command, timeout }, () => call<{ output?: string; exit_code?: number }>("POST", `/computers/${id}/bash`, { command, timeout }, (timeout + 20) * 1000), (timeout + 20) * 1000),
};

/** Key names as the model says them, to the X11 names Orgo wants ("ctrl+shift+t", "Return"). */
const KEYS: Record<string, string> = {
  ctrl: "ctrl", control: "ctrl", alt: "alt", option: "alt", shift: "shift", cmd: "super", command: "super", meta: "super", super: "super", win: "super",
  enter: "Return", return: "Return", esc: "Escape", escape: "Escape", tab: "Tab", backspace: "BackSpace", delete: "Delete", del: "Delete", space: "space",
  up: "Up", down: "Down", left: "Left", right: "Right", arrowup: "Up", arrowdown: "Down", arrowleft: "Left", arrowright: "Right",
  home: "Home", end: "End", pageup: "Page_Up", pagedown: "Page_Down", insert: "Insert",
};
export const keyCombo = (keys: string[]) => keys.map((k) => KEYS[k.toLowerCase()] ?? (/^f\d{1,2}$/i.test(k) ? k.toUpperCase() : k.length === 1 ? k.toLowerCase() : k)).join("+");
