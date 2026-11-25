/**
 * Talking to a board computer straight at its own desktop API, not through
 * Orgo's cloud API: about three times quicker for each click and picture. Server
 * only: the computer's token never reaches the browser.
 */

const ORGO = "https://www.orgo.ai/api";

type Desk = { url: string; token: string; at: number; ok: boolean };
/** Each computer's address and token, looked up once in a while (they change when it restarts). */
const desks = new Map<string, Desk>();
const DESK_TTL = 10 * 60_000;

async function desk(orgoId: string, fresh = false): Promise<Desk> {
  const known = desks.get(orgoId);
  if (known && !fresh && Date.now() - known.at < DESK_TTL) return known;
  const res = await fetch(`${ORGO}/computers/${orgoId}`, {
    headers: { Authorization: `Bearer ${process.env.ORGO_API_KEY}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Orgo said ${res.status}`);
  const c = (await res.json()) as { url?: string; vnc_password?: string; instance_details?: { webUrl?: string } };
  const url = c.instance_details?.webUrl ?? c.url;
  if (!url || !c.vnc_password) throw new Error("This computer has no desktop address yet");
  const base = url.replace(/\/$/, "");
  const d = { url: base, token: c.vnc_password, at: Date.now(), ok: await reachable(base) };
  desks.set(orgoId, d);
  return d;
}

/** Whether the desktop API answers at all (any reply will do). Some computers' addresses can't be reached: then Orgo's cloud API does it. */
async function reachable(url: string) {
  try {
    await fetch(`${url}/`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    return true;
  } catch {
    return false;
  }
}

/** The same through Orgo's cloud API: slower, but always there. */
async function cloudCall<T>(orgoId: string, path: string, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const res = await fetch(`${ORGO}/computers/${orgoId}/${path.replace(/_/g, "-")}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.ORGO_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs + 10_000),
  });
  if (!res.ok) throw new Error(`The computer said ${res.status}`);
  return (await res.json()) as T;
}

/** POSTs `body` to the computer's desktop API at `path` (click, drag, scroll, type, key, bash). */
export async function deskCall<T = unknown>(orgoId: string, path: string, body: Record<string, unknown>, timeoutMs = 20_000): Promise<T> {
  for (const fresh of [false, true]) {
    const d = await desk(orgoId, fresh);
    if (!d.ok) return cloudCall<T>(orgoId, path, body, timeoutMs);
    const res = await fetch(`${d.url}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${d.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    }).catch(() => null);
    if (res?.ok) return (await res.json()) as T;
    // A stale address or token: look it up again and try once more.
    if (res && res.status !== 401 && res.status !== 404) throw new Error(`The computer said ${res.status}`);
  }
  throw new Error("The computer didn't answer");
}

/**
 * Keeps ffmpeg saving the screen as a JPEG a few times a second, for as long as
 * someone's watching (it stops itself 20 s after the last look), then waits, up to
 * 2 s, for that picture to differ from the one the watcher has (`last`, its cksum)
 * and prints the new one's cksum and the picture in base64.
 */
const FRAME_SH = (last: string) => `
D=/tmp/pompi; mkdir -p $D; touch $D/alive
( flock -n 9 || exit 0
  if ! grep -qs ffmpeg "/proc/$(cat $D/pid 2>/dev/null)/cmdline"; then
    setsid nohup sh -c 'ffmpeg -y -nostdin -loglevel error -f x11grab -framerate 10 -i "\${DISPLAY:-:99}" -vf scale=1024:-2 -q:v 7 -f image2 -update 1 -atomic_writing 1 /tmp/pompi/frame.jpg & F=$!; echo $F > /tmp/pompi/pid; while kill -0 $F 2>/dev/null && [ $(( $(date +%s) - $(stat -c %Y /tmp/pompi/alive) )) -lt 20 ]; do sleep 2; done; kill $F 2>/dev/null' >/dev/null 2>&1 </dev/null 9>&- &
    for i in $(seq 15); do [ -s $D/frame.jpg ] && break; sleep 0.2; done
  fi
) 9>$D/start.lock
T=$(mktemp); trap 'rm -f $T' EXIT
for i in $(seq 40); do cp $D/frame.jpg $T 2>/dev/null; S=$(cksum < $T | cut -d' ' -f1); [ "$S" != "${last}" ] && break; sleep 0.05; done
echo "$S"; [ "$S" != "${last}" ] && base64 -w0 $T
`;

/** The computer's screen once it differs from `last` (or after 2 s, `null` when it hasn't changed). */
export async function nextFrame(orgoId: string, last: string): Promise<{ sum: string; jpeg: Buffer } | null> {
  const safe = /^\d{0,12}$/.test(last) ? last : "";
  const out = await deskCall<{ output?: string; exit_code?: number }>(orgoId, "bash", { command: FRAME_SH(safe), timeout: 10 }, 15_000);
  const [sum, b64] = (out.output ?? "").trim().split("\n");
  if (!sum || !b64) return null;
  return { sum, jpeg: Buffer.from(b64, "base64") };
}
