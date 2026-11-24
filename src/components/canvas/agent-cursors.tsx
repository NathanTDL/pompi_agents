"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { Square } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Item } from "@/lib/canvas/types";
import { CursorArrow } from "./cursors";
import { Pom } from "./pom";

type AgentLite = { _id: Id<"agents">; name: string; role: string; color: string; emoji: string };
type State = { agentId: Id<"agents">; x: number; y: number; status: "idle" | "walking" | "thinking" | "writing"; doing?: string; updatedAt: number };
type Going = { _id: Id<"requests">; itemId: string; status: "routing" | "working" | "done" | "ignored" | "failed" | "stopped"; agentId?: Id<"agents"> };

/** A cursor left idle this long is put away. */
const PARKED_MS = 15 * 60_000;

/**
 * The agents' cursors, drawn in world units inside the camera's layer: a walk
 * glides (a CSS transition on the position), while panning and zooming stay
 * instant. Under each request, a marker says who's on it.
 */
export function AgentCursors({ agents, states, going, byId, zoom }: { agents: AgentLite[]; states: State[]; going: Going[]; byId: Map<string, Item>; zoom: number }) {
  const k = 1 / zoom;
  const stopRequest = useMutation(api.brain.stop);
  const stop = (id: Id<"requests">, name?: string) =>
    stopRequest({ requestId: id }).then(
      () => toast(name ? `Stopped ${name}` : "Stopped"),
      () => toast.error("Couldn't stop it"),
    );
  // The clock, a few times a minute: enough to put away cursors that have been idle a while.
  const [now, setNow] = React.useState(0);
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 20_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  return (
    <>
      {going.map((g) => {
        const it = byId.get(g.itemId);
        if (!it) return null;
        const agent = g.agentId ? agents.find((a) => a._id === g.agentId) : undefined;
        return (
          <div key={g._id} className="pointer-events-none absolute top-0 left-0" style={{ transform: `translate(${it.x}px, ${it.y + it.h + 8}px)` }}>
            <div className="origin-top-left" style={{ transform: `scale(${k})` }}>
              {agent ? (
                <span className="flex animate-pop items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-[12px] font-semibold whitespace-nowrap text-white shadow-md" style={{ background: agent.color }}>
                  <span className="flex size-5 items-center justify-center rounded-full bg-white">
                    <Pom color={agent.color} size={18} head />
                  </span>
                  {agent.name} is on it
                  <StopButton onStop={() => stop(g._id, agent.name)} />
                </span>
              ) : (
                <span className="flex animate-pop items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap text-[#6F6C7A] shadow-md ring-1 ring-black/5">
                  <span className="size-1.5 animate-pulse rounded-full bg-[#7B4DFF]" />
                  Finding the right agent
                  <StopButton onStop={() => stop(g._id)} light />
                </span>
              )}
            </div>
          </div>
        );
      })}

      {states.map((s) => {
        const agent = agents.find((a) => a._id === s.agentId);
        if (!agent) return null;
        if (s.status === "idle" && now - s.updatedAt > PARKED_MS) return null;
        // What it's working on, so its cursor can be stopped too (it may be over at the computer).
        const job = s.status !== "idle" ? going.find((g) => g.agentId === s.agentId && g.status === "working") : undefined;
        return (
          <div
            key={s.agentId}
            className="pointer-events-none absolute top-0 left-0 z-20 transition-transform duration-[1100ms] ease-[cubic-bezier(0.45,0,0.2,1)]"
            style={{ transform: `translate(${s.x}px, ${s.y}px)` }}
          >
            <div className="origin-top-left" style={{ transform: `scale(${k})` }}>
              <CursorArrow color={agent.color} />
              <div className="absolute top-[18px] left-[14px] flex flex-col items-start gap-1.5">
                <span className="flex items-center gap-1 rounded-full px-2 py-[3px] text-[12px] font-semibold whitespace-nowrap text-white shadow-sm" style={{ background: agent.color }}>
                  <span className="text-[10px]">✦</span> {agent.name}
                  {job ? <StopButton onStop={() => stop(job._id, agent.name)} /> : null}
                </span>
                {s.status === "thinking" ? (
                  <span className="flex animate-pop items-center gap-1 rounded-full rounded-tl-[4px] bg-white px-3 py-2 shadow-md ring-1 ring-black/5">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="size-1.5 animate-bounce rounded-full" style={{ background: agent.color, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </span>
                ) : s.status === "writing" ? (
                  <span className="animate-pop rounded-full rounded-tl-[4px] bg-white px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap text-[#3D3B45] shadow-md ring-1 ring-black/5">{s.doing ?? "Writing"}…</span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Stops an agent's work: it finishes the step it's on, then stops. */
function StopButton({ onStop, light }: { onStop: () => void; light?: boolean }) {
  return (
    <button
      type="button"
      data-ui
      title="Stop"
      aria-label="Stop"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onStop();
      }}
      className={`pointer-events-auto ml-0.5 flex size-[18px] cursor-pointer items-center justify-center rounded-full transition-colors ${light ? "bg-black/[0.06] text-[#3D3B45] hover:bg-black/15" : "bg-white/25 text-white hover:bg-white/45"}`}
    >
      <Square className="size-2 fill-current" />
    </button>
  );
}
