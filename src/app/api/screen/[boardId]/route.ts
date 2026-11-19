import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchAuthQuery } from "@/lib/auth-server";
import { nextFrame } from "@/lib/desktop";

/**
 * A board computer's screen, live, for the screen frame on the canvas: a stream
 * of JPEGs (MJPEG, which an <img> plays by itself) sent as the screen changes.
 * Only for the board's members, and only while its computer is on. Orgo's keys
 * stay on the server.
 */

const BOUNDARY = "pompiframe";
/** A stream ends after this long; the frame opens a new one (and so checks again that you're a member). */
const STREAM_MS = 10 * 60_000;

export async function GET(req: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  if (!process.env.ORGO_API_KEY) return new Response("No Orgo key", { status: 503 });
  let orgoId: string | null;
  try {
    orgoId = await fetchAuthQuery(api.computer.forScreen, { boardId: boardId as Id<"boards"> });
  } catch {
    return new Response("Not allowed", { status: 403 });
  }
  if (!orgoId) return new Response("The computer is off", { status: 409 });
  const id = orgoId;

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(out) {
      const t0 = Date.now();
      let last = "";
      let fails = 0;
      out.enqueue(enc.encode(`--${BOUNDARY}\r\n`));
      try {
        while (!req.signal.aborted && Date.now() - t0 < STREAM_MS) {
          const f = await nextFrame(id, last).catch(() => undefined);
          if (f === undefined) {
            // The computer went away (stopped, or restarting): give up after a few tries.
            if (++fails >= 5) break;
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          fails = 0;
          if (!f || req.signal.aborted) continue;
          last = f.sum;
          // The next boundary right after each picture, so the browser shows it at once.
          out.enqueue(enc.encode(`Content-Type: image/jpeg\r\nContent-Length: ${f.jpeg.length}\r\n\r\n`));
          out.enqueue(new Uint8Array(f.jpeg));
          out.enqueue(enc.encode(`\r\n--${BOUNDARY}\r\n`));
        }
      } catch {
        // The watcher left mid-picture.
      }
      try {
        out.close();
      } catch {}
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
      "Cache-Control": "no-store, private, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
