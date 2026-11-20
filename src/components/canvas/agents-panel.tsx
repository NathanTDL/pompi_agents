"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Bot, ChevronsLeft, ChevronsRight, LoaderCircle, MonitorSmartphone, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Dialog } from "@/components/ui/dialog";
import { AgentDialog, PRESETS, TOOL_INFO, ToolLogo, type AgentDraft } from "./agent-dialog";
import { useBoardInfo } from "./board-context";
import { CursorArrow } from "./cursors";
import { Tip } from "./toolbar";

export type Agent = Pick<Doc<"agents">, "_id" | "name" | "role" | "color" | "emoji" | "instructions" | "tools" | "handle" | "email" | "emailError">;

const card = "pointer-events-auto rounded-2xl bg-white shadow-[0_0_0_1px_rgba(22,21,26,0.07),0_12px_32px_-14px_rgba(22,21,26,0.28)]";

/** The board's AI teammates, down the left of the canvas, as FigJam keeps its layers panel. */
export function AgentsPanel({ boardId }: { boardId: Id<"boards"> }) {
  const agents = useQuery(api.agents.list, { boardId });
  const activity = useQuery(api.brain.activity, { boardId });
  const statusOf = (id: Id<"agents">) => activity?.states.find((s) => s.agentId === id);
  const [open, setOpen] = React.useState(true);
  const [dialog, setDialog] = React.useState<{ agent?: Agent; draft?: Partial<AgentDraft> } | null>(null);

  const stop = { "data-ui": "", onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(), onWheel: (e: React.WheelEvent) => e.stopPropagation() };

  if (!open) {
    return (
      <div className="pointer-events-none absolute top-[76px] left-3 z-30" {...stop}>
        <div className={`${card} flex w-[52px] flex-col items-center gap-2 py-2.5`}>
          <Tip label="Show agents" side="bottom">
            <button type="button" onClick={() => setOpen(true)} className="flex size-9 items-center justify-center rounded-xl text-muted hover:bg-black/[0.05] hover:text-ink" aria-label="Show agents">
              <ChevronsRight className="size-4" />
            </button>
          </Tip>
          {(agents ?? []).slice(0, 6).map((a) => (
            <Tip key={a._id} label={`${a.name} · ${a.role}`} side="bottom">
              <button type="button" onClick={() => setDialog({ agent: a })}>
                <AgentAvatar agent={a} size={34} />
              </button>
            </Tip>
          ))}
          <Tip label="New agent" side="bottom">
            <button type="button" onClick={() => setDialog({})} className="flex size-[34px] items-center justify-center rounded-full border border-dashed border-black/20 text-muted hover:border-black/40 hover:text-ink" aria-label="New agent">
              <Plus className="size-4" />
            </button>
          </Tip>
        </div>
        <AgentDialog boardId={boardId} state={dialog} onClose={() => setDialog(null)} />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute top-[76px] bottom-24 left-3 z-30 flex w-[288px] flex-col" {...stop}>
      <div className={`${card} flex max-h-full flex-col overflow-hidden`}>
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
          <Bot className="size-[18px]" />
          <h2 className="text-[14.5px] font-bold tracking-[-0.015em]">Agents</h2>
          {agents?.length ? <span className="rounded-full bg-black/[0.06] px-1.5 py-px font-mono text-[11px] font-semibold text-muted">{agents.length}</span> : null}
          <div className="ml-auto flex items-center gap-0.5">
            {agents?.length ? (
              <Tip label="New agent" side="bottom">
                <button type="button" onClick={() => setDialog({})} className="flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-black/[0.05]" aria-label="New agent">
                  <Plus className="size-4" />
                </button>
              </Tip>
            ) : null}
            <Tip label="Hide" side="bottom">
              <button type="button" onClick={() => setOpen(false)} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-black/[0.05] hover:text-ink" aria-label="Hide agents">
                <ChevronsLeft className="size-4" />
              </button>
            </Tip>
          </div>
        </div>

        {agents === undefined ? (
          <div className="space-y-2 px-3 pb-4">
            {[0, 1].map((i) => (
              <div key={i} className="h-[58px] animate-pulse rounded-xl bg-black/[0.04]" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <EmptyAgents onCreate={(draft) => setDialog({ draft })} />
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
              {agents.map((a) => (
                <AgentRow key={a._id} agent={a} state={statusOf(a._id)} onEdit={() => setDialog({ agent: a })} />
              ))}
            </div>
            {activity && !activity.ai ? (
              <div className="mx-3 mb-3 rounded-xl bg-[#FFF8E6] px-3 py-2.5 text-[12px] leading-snug text-[#7A5200] ring-1 ring-[#F5D48A]">
                <p className="font-semibold">Your agents can&apos;t think yet</p>
                <p className="mt-0.5">Add an OpenAI key to this deployment: <code className="font-mono text-[11px]">npx convex env set OPENAI_API_KEY …</code></p>
              </div>
            ) : null}
            <div className="border-t border-line px-3 py-3">
              <button type="button" onClick={() => setDialog({})} className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ink text-[13px] font-semibold text-white transition-colors hover:bg-black">
                <Plus className="size-4" /> Create agent
              </button>
              <ComputerChip />
            </div>
          </>
        )}
      </div>
      <AgentDialog boardId={boardId} state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function EmptyAgents({ onCreate }: { onCreate: (draft?: Partial<AgentDraft>) => void }) {
  return (
    <div className="overflow-y-auto px-3 pb-3 [scrollbar-width:thin]">
      <div className="relative overflow-hidden rounded-[18px] bg-[#FAF9F6] px-4 pt-4 pb-4 ring-1 ring-black/[0.06]">
        <div className="pompi-canvas pointer-events-none absolute inset-0" style={{ backgroundSize: "14px 14px", backgroundColor: "transparent" }} />
        <div className="relative mx-auto h-[112px] w-[220px]">
          <div className="pompi-sticky absolute top-5 left-[66px] flex size-[78px] -rotate-3 items-start rounded-[3px] bg-[#FFE48C] p-2.5 text-left text-[11px] leading-tight font-semibold">craft the launch post</div>
          <FloatingCursor x={6} y={14} color="#14AE5C" name="Dev" delay="0s" />
          <FloatingCursor x={150} y={4} color="#FF24BD" name="Juno" delay="1.2s" />
          <FloatingCursor x={138} y={76} color="#FF8A00" name="Ivy" delay="2.1s" />
        </div>
        <p className="relative mt-2 text-[17px] leading-tight font-bold tracking-[-0.03em]">
          Bring your AI team.
          <br />
          <span className="text-black/35">They work right here.</span>
        </p>
        <p className="relative mt-2 text-[12.5px] leading-relaxed text-muted">Write what you need anywhere on the board, and the right agent walks over and does it.</p>
        <button
          type="button"
          onClick={() => onCreate()}
          className="relative mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ink text-[13.5px] font-semibold text-white shadow-[0_12px_24px_-14px_rgba(22,21,26,0.9)] transition-colors hover:bg-black"
        >
          <Plus className="size-4" /> Create an agent
        </button>
      </div>

      <p className="mt-5 px-1 font-mono text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Or start from a role</p>
      <div className="mt-2 space-y-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => onCreate(p)}
            className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-black/[0.035]"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[17px] ring-1 ring-black/[0.04]" style={{ background: `${p.color}24` }}>
              {p.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">{p.role}</span>
              <span className="block truncate text-[11.5px] text-muted">{p.blurb}</span>
            </span>
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ink opacity-0 shadow-sm ring-1 ring-black/[0.08] transition-opacity group-hover:opacity-100">Add</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FloatingCursor({ x, y, color, name, delay }: { x: number; y: number; color: string; name: string; delay: string }) {
  return (
    <div className="absolute animate-float" style={{ left: x, top: y, animationDelay: delay }}>
      <CursorArrow color={color} />
      <span className="absolute top-[16px] left-[12px] rounded-full px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-white" style={{ background: color }}>
        {name}
      </span>
    </div>
  );
}

type AgentState = { status: "idle" | "walking" | "thinking" | "writing"; doing?: string };

function AgentRow({ agent, state, onEdit }: { agent: Agent; state?: AgentState; onEdit: () => void }) {
  const busy = !!state && state.status !== "idle";
  const label = !state || state.status === "idle" ? "Idle" : state.status === "walking" ? "Coming over" : state.status === "thinking" ? "Thinking" : "Writing";
  const remove = useMutation(api.agents.remove);
  const [menu, setMenu] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [menu]);

  const tools = agent.tools.slice(0, 4);
  return (
    <div className="group relative">
      <button type="button" onClick={onEdit} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-black/[0.035]">
        <AgentAvatar agent={agent} size={38} status={busy ? "busy" : "idle"} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold">{agent.name}</span>
            <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${busy ? "bg-[#E3F8EA] text-[#0E8A47]" : "bg-black/[0.05] text-muted"}`}>{label}</span>
          </span>
          <span className="block truncate text-[12px] text-muted">{busy && state?.doing && state.status === "writing" ? state.doing : agent.role}</span>
          {tools.length ? (
            <span className="mt-1 flex items-center gap-1">
              {tools.map((t) => (
                <ToolDot key={t} tool={t} />
              ))}
              {agent.tools.length > 4 ? <span className="text-[10px] font-semibold text-muted">+{agent.tools.length - 4}</span> : null}
            </span>
          ) : null}
        </span>
      </button>
      <div ref={ref} className="absolute top-2 right-1.5">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          className={`flex size-7 items-center justify-center rounded-lg text-muted transition-opacity hover:bg-black/[0.06] hover:text-ink ${menu ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          aria-label={`${agent.name} options`}
        >
          <MoreHorizontal className="size-4" />
        </button>
        {menu ? (
          <div className="absolute right-0 z-40 mt-1 w-40 animate-pop rounded-xl bg-white p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.3)] ring-1 ring-black/5">
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                onEdit();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ink-2 hover:bg-black/[0.04]"
            >
              <Pencil className="size-4" /> Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                setConfirm(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-[#E5484D] hover:bg-[#FFF0F0]"
            >
              <Trash2 className="size-4" /> Remove
            </button>
          </div>
        ) : null}
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={`Remove ${agent.name}?`}>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{agent.name} leaves this board, and its email address stops working. What it made on the board stays.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirm(false)} className="h-10 rounded-xl px-4 text-[14px] font-semibold text-ink-2 hover:bg-black/[0.04]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirm(false);
              void remove({ agentId: agent._id }).catch(() => toast.error("Couldn't remove it"));
            }}
            className="h-10 rounded-xl bg-[#E5484D] px-4 text-[14px] font-semibold text-white hover:bg-[#D93D42]"
          >
            Remove agent
          </button>
        </div>
      </Dialog>
    </div>
  );
}

/** The board's shared computer: whether it's on, who's using it, and a switch. */
function ComputerChip() {
  const { computer, agents, startComputer, stopComputer } = useBoardInfo();
  const status = computer?.status ?? "off";
  const user = computer?.busy ? agents.find((a) => a._id === computer.busy!.agentId) : undefined;
  const on = status === "on";
  const label = status === "on" ? (user ? `${user.name} is using it` : "On · ready") : status === "starting" ? "Starting…" : status === "stopping" ? "Stopping…" : status === "error" ? "Couldn't start" : "Off · starts when needed";
  return (
    <div className="mt-2.5 flex items-center gap-2.5 rounded-2xl bg-[#FAF9F6] px-3 py-2.5 ring-1 ring-black/[0.06]">
      <span className={`relative flex size-8 items-center justify-center rounded-lg ring-1 ${on ? "bg-[#16151A] text-white ring-black" : "bg-white text-ink-2 ring-line"}`}>
        <MonitorSmartphone className="size-4" />
        <span className={`absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[#FAF9F6] ${on ? "bg-[#14AE5C]" : status === "starting" || status === "stopping" ? "animate-pulse bg-[#FFB020]" : status === "error" ? "bg-[#E5484D]" : "bg-[#C7C5CF]"}`} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[12.5px] font-semibold">Board computer</span>
        <span className="block truncate text-[11px] text-muted" title={status === "error" ? computer?.error : undefined}>{computer?.configured === false ? "Needs an Orgo key" : label}</span>
      </span>
      {computer?.configured === false ? null : status === "on" ? (
        <button type="button" onClick={stopComputer} disabled={!!user} className="h-7 rounded-full px-3 text-[11.5px] font-semibold text-ink-2 ring-1 ring-black/10 transition-colors hover:bg-white disabled:opacity-40">
          Stop
        </button>
      ) : status === "off" || status === "error" ? (
        <button type="button" onClick={startComputer} className="h-7 rounded-full bg-ink px-3 text-[11.5px] font-semibold text-white transition-colors hover:bg-black">
          Start
        </button>
      ) : (
        <LoaderCircle className="size-4 animate-spin text-muted" />
      )}
    </div>
  );
}

export function AgentAvatar({ agent, size = 36, status }: { agent: Pick<Agent, "color" | "emoji" | "name">; size?: number; status?: "idle" | "busy" }) {
  return (
    <span className="relative flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: `${agent.color}2e`, boxShadow: `inset 0 0 0 1.5px ${agent.color}55` }}>
      <span style={{ fontSize: size * 0.48 }} className="leading-none">
        {agent.emoji}
      </span>
      {status ? <span className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-white ${status === "busy" ? "animate-pulse bg-[#14AE5C]" : "bg-[#C7C5CF]"}`} /> : null}
    </span>
  );
}

function ToolDot({ tool }: { tool: string }) {
  return (
    <span title={TOOL_INFO[tool]?.name ?? tool} className="flex size-[18px] items-center justify-center rounded-[5px] bg-white ring-1 ring-black/[0.08]">
      <ToolLogo tool={tool} size={12} />
    </span>
  );
}
