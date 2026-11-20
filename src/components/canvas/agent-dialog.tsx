"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { Check, Globe, LoaderCircle, Mail, MonitorSmartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dialog } from "@/components/ui/dialog";
import { CursorArrow } from "./cursors";
import type { Agent } from "./agents-panel";

export type AgentDraft = { name: string; role: string; color: string; emoji: string; instructions: string; tools: string[] };

export const AGENT_COLORS = ["#7B4DFF", "#14AE5C", "#FF24BD", "#FF8A00", "#0D99FF", "#F24822", "#0FA394", "#E0A100"];
const EMOJIS = ["⚡", "✍️", "🎨", "🔎", "🧠", "📈", "🛠️", "🚀", "📣", "🧾", "🤝", "🦊", "🐙", "🌱", "🎯", "💬"];

/** Apps an agent can be given (Composio toolkits), with a colour for their badge. */
export const TOOL_INFO: Record<string, { name: string; color: string; blurb: string }> = {
  github: { name: "GitHub", color: "#24292F", blurb: "Code and issues" },
  vercel: { name: "Vercel", color: "#000000", blurb: "Deploy sites" },
  notion: { name: "Notion", color: "#37352F", blurb: "Docs and wikis" },
  slack: { name: "Slack", color: "#611F69", blurb: "Messages" },
  gmail: { name: "Gmail", color: "#EA4335", blurb: "Email" },
  x: { name: "X", color: "#0F1419", blurb: "Post and read" },
  linear: { name: "Linear", color: "#5E6AD2", blurb: "Issues" },
  figma: { name: "Figma", color: "#F24E1E", blurb: "Designs" },
  googledrive: { name: "Google Drive", color: "#1FA463", blurb: "Files" },
  googlecalendar: { name: "Google Calendar", color: "#4285F4", blurb: "Events" },
  hubspot: { name: "HubSpot", color: "#FF7A59", blurb: "CRM" },
  stripe: { name: "Stripe", color: "#635BFF", blurb: "Payments" },
};

/** A tool's own logo (public/tools/<id>.svg). */
export function ToolLogo({ tool, size = 20, className = "" }: { tool: string; size?: number; className?: string }) {
  return TOOL_INFO[tool] ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/tools/${tool}.svg`} alt="" width={size} height={size} draggable={false} className={`object-contain ${className}`} style={{ width: size, height: size }} />
  ) : (
    <span className="flex items-center justify-center rounded-[4px] bg-[#6F6C7A] text-[9px] font-bold text-white" style={{ width: size, height: size }}>
      {tool[0]?.toUpperCase()}
    </span>
  );
}

export const PRESETS: (AgentDraft & { blurb: string })[] = [
  {
    name: "Dev",
    role: "Engineer",
    color: "#14AE5C",
    emoji: "⚡",
    blurb: "Builds and deploys websites",
    instructions: "You're the team's engineer. Build what's asked on the board's computer, keep tests passing, and ask before deploying anything public.",
    tools: ["github", "vercel"],
  },
  {
    name: "Juno",
    role: "Copywriter",
    color: "#FF24BD",
    emoji: "✍️",
    blurb: "Writes posts, pages and emails",
    instructions: "You're the team's copywriter. Write clear, warm, punchy copy in the brand's voice. Put drafts on the canvas as cards, and never post without an OK.",
    tools: ["x", "notion"],
  },
  {
    name: "Ivy",
    role: "Designer",
    color: "#FF8A00",
    emoji: "🎨",
    blurb: "Makes images and layouts",
    instructions: "You're the team's designer. Make images and layouts that fit the brand, and explain your choices in a sentence.",
    tools: ["figma"],
  },
  {
    name: "Rae",
    role: "Researcher",
    color: "#0D99FF",
    emoji: "🔎",
    blurb: "Digs up facts, with sources",
    instructions: "You're the team's researcher. Look things up on the web, compare sources, and put findings on the canvas as short notes with links.",
    tools: ["notion", "googledrive"],
  },
];

const BLANK: AgentDraft = { name: "", role: "", color: AGENT_COLORS[0], emoji: "🧠", instructions: "", tools: [] };

/** Create an agent (from scratch or a preset), or edit one. */
export function AgentDialog({ boardId, state, onClose }: { boardId: Id<"boards">; state: { agent?: Agent; draft?: Partial<AgentDraft> } | null; onClose: () => void }) {
  return (
    <Dialog open={!!state} onClose={onClose} title={state?.agent ? `Edit ${state.agent.name}` : "Create an agent"} width={760}>
      {state ? <AgentForm key={state.agent?._id ?? JSON.stringify(state.draft ?? {})} boardId={boardId} agent={state.agent} draft={state.draft} onClose={onClose} /> : null}
    </Dialog>
  );
}

function AgentForm({ boardId, agent, draft, onClose }: { boardId: Id<"boards">; agent?: Agent; draft?: Partial<AgentDraft>; onClose: () => void }) {
  const create = useMutation(api.agents.create);
  const update = useMutation(api.agents.update);
  const [f, setF] = React.useState<AgentDraft>(() => (agent ? { name: agent.name, role: agent.role, color: agent.color, emoji: agent.emoji, instructions: agent.instructions, tools: agent.tools } : { ...BLANK, ...draft }));
  const [saving, setSaving] = React.useState(false);
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const set = (patch: Partial<AgentDraft>) => setF((prev) => ({ ...prev, ...patch }));
  const handle = (f.name.trim() || "agent").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "agent";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) {
      toast.error("Give your agent a name");
      return;
    }
    setSaving(true);
    // Only the agent's own fields: a preset also carries its blurb for the list.
    const fields = { name: f.name, role: f.role, color: f.color, emoji: f.emoji, instructions: f.instructions, tools: f.tools };
    try {
      if (agent) await update({ agentId: agent._id, ...fields });
      else await create({ boardId, ...fields });
      toast.success(agent ? `${f.name} updated` : `${f.name} joined the board`, { description: agent ? undefined : `${f.role || "Teammate"} · ${handle}@board.pompi.email` });
      onClose();
    } catch (err) {
      toast.error(err instanceof ConvexError ? String(err.data) : "Couldn't save the agent");
      setSaving(false);
    }
  };

  const input = "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[14.5px] outline-none transition-all placeholder:text-black/30 focus:border-black/25 focus:ring-4 focus:ring-black/[0.05]";

  return (
    <form onSubmit={(e) => void save(e)} className="mt-5 grid gap-6 md:grid-cols-[230px_minmax(0,1fr)]">
      {/* Preview */}
      <div className="flex flex-col gap-3">
        <div className="pompi-canvas relative flex h-[210px] flex-col items-center justify-center overflow-hidden rounded-2xl ring-1 ring-line" style={{ backgroundSize: "14px 14px" }}>
          <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(60% 60% at 50% 40%, ${f.color}24, transparent 70%)` }} />
          <div className="relative">
            <button
              type="button"
              onClick={() => setEmojiOpen((o) => !o)}
              className="relative flex size-[84px] items-center justify-center rounded-full text-[40px] transition-transform hover:scale-105"
              style={{ background: `color-mix(in srgb, ${f.color} 18%, white)`, boxShadow: `inset 0 0 0 2px ${f.color}66, 0 14px 30px -16px ${f.color}` }}
              aria-label="Change avatar"
            >
              {f.emoji}
              <span className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full bg-white text-[12px] shadow-md ring-1 ring-black/5">✎</span>
            </button>
            {emojiOpen ? (
              <div className="absolute top-full left-1/2 z-10 mt-2 grid w-[208px] -translate-x-1/2 animate-pop grid-cols-8 gap-0.5 rounded-xl bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
                {EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      set({ emoji: em });
                      setEmojiOpen(false);
                    }}
                    className={`flex size-6 items-center justify-center rounded-md text-[15px] hover:bg-black/[0.06] ${f.emoji === em ? "bg-black/[0.07]" : ""}`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="relative mt-5 flex items-start">
            <CursorArrow color={f.color} />
            <span className="mt-3 -ml-1 rounded-full px-2 py-[3px] text-[12px] font-semibold whitespace-nowrap text-white shadow-sm" style={{ background: f.color }}>
              ✦ {f.name.trim() || "Agent"}
              {f.role.trim() ? ` · ${f.role.trim()}` : ""}
            </span>
          </div>
        </div>

        <div>
          <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Colour</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {AGENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set({ color: c })}
                className="flex size-7 items-center justify-center rounded-full transition-transform hover:scale-110"
                style={{ background: c }}
                aria-label={`Colour ${c}`}
              >
                {f.color === c ? <Check className="size-3.5 text-white" strokeWidth={3} /> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 rounded-2xl bg-[#FAF9F6] p-3.5 ring-1 ring-black/[0.06]">
          <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Always included</p>
          <Included icon={MonitorSmartphone} label="The board's computer" />
          <Included icon={Globe} label="Web browsing" />
          <Included icon={Mail} label={<span className="truncate font-mono text-[11px]">{handle}@board.pompi.email</span>} />
        </div>
      </div>

      {/* Fields */}
      <div className="flex min-w-0 flex-col">
        {!agent ? (
          <div className="mb-5">
            <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Start from a role</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const on = f.role === p.role && f.name === p.name;
                return (
                  <button
                    key={p.role}
                    type="button"
                    onClick={() => setF({ name: p.name, role: p.role, color: p.color, emoji: p.emoji, instructions: p.instructions, tools: p.tools })}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-all ${on ? "border-transparent text-white" : "border-line text-ink-2 hover:border-black/20"}`}
                    style={on ? { background: p.color } : undefined}
                  >
                    <span>{p.emoji}</span> {p.role}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[12.5px] font-semibold text-ink-2">Name</span>
            <input autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Juno" maxLength={32} className={`${input} mt-1.5`} />
          </label>
          <label className="block">
            <span className="text-[12.5px] font-semibold text-ink-2">Role</span>
            <input value={f.role} onChange={(e) => set({ role: e.target.value })} placeholder="Copywriter" maxLength={48} className={`${input} mt-1.5`} />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="flex items-center justify-between text-[12.5px] font-semibold text-ink-2">
            Instructions
            <span className="font-normal text-muted">How it should work, in plain words</span>
          </span>
          <textarea
            value={f.instructions}
            onChange={(e) => set({ instructions: e.target.value })}
            rows={4}
            maxLength={4000}
            placeholder="You're our copywriter. Keep it short and warm. Always ask before posting."
            className="mt-1.5 w-full resize-none rounded-xl border border-line bg-white px-3.5 py-3 text-[14px] leading-relaxed outline-none transition-all placeholder:text-black/30 focus:border-black/25 focus:ring-4 focus:ring-black/[0.05]"
          />
        </label>

        <div className="mt-4">
          <p className="flex items-center justify-between text-[12.5px] font-semibold text-ink-2">
            Tools
            {f.tools.length ? (
              <button type="button" onClick={() => set({ tools: [] })} className="font-normal text-muted hover:text-ink">
                {f.tools.length} selected · Clear
              </button>
            ) : (
              <span className="font-normal text-muted">Apps this agent may use</span>
            )}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(TOOL_INFO).map(([id, t]) => {
              const on = f.tools.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ tools: on ? f.tools.filter((x) => x !== id) : [...f.tools, id] })}
                  className={`flex items-center gap-2.5 rounded-xl bg-white px-2.5 py-2 text-left transition-all ${on ? "shadow-[0_0_0_1.5px_#16151A,0_8px_18px_-12px_rgba(22,21,26,0.6)]" : "ring-1 ring-black/[0.08] hover:ring-black/20"}`}
                >
                  <span className="relative flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white ring-1 ring-black/[0.07]">
                    <ToolLogo tool={id} size={20} />
                    {on ? (
                      <span className="absolute -top-1.5 -right-1.5 flex size-4 animate-pop items-center justify-center rounded-full bg-ink text-white ring-2 ring-white">
                        <Check className="size-2.5" strokeWidth={3.5} />
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[12.5px] font-semibold">{t.name}</span>
                    <span className="block truncate text-[11px] text-muted">{t.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px] text-muted">You&apos;ll connect each app once, the first time an agent needs it.</p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className="h-10 rounded-full px-4 text-[14px] font-semibold text-ink-2 hover:bg-black/[0.04]">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-60">
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {agent ? "Save changes" : "Create agent"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Included({ icon: Icon, label }: { icon: React.ElementType; label: React.ReactNode }) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-[12px] text-ink-2">
      <Icon className="size-3.5 shrink-0 text-muted" />
      {label}
    </p>
  );
}
