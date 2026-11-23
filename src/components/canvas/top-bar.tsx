"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronLeft, Copy, Keyboard, Link as LinkIcon, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { track } from "@/lib/analytics";
import type { Id } from "@/convex/_generated/dataModel";
import { LogoMark } from "@/components/brand/logo";
import { Dialog } from "@/components/ui/dialog";
import { PlanStatus } from "@/components/plan-dialog";
import type { Others } from "@/lib/canvas/use-presence";
import { Tip } from "./toolbar";

const panel = "pointer-events-auto flex items-center rounded-2xl bg-white shadow-[0_0_0_1px_rgba(22,21,26,0.07),0_8px_24px_-10px_rgba(22,21,26,0.22)]";

/** Floating panels over the canvas, as on FigJam: the board on the left; who's here and Share on the right. */
export function TopBar({ boardId, others, me, onFollow, onHelp }: { boardId: Id<"boards">; others: Others; me: { name: string; color: string; image?: string | null }; onFollow: (sessionId: string) => void; onHelp: () => void }) {
  const board = useQuery(api.boards.get, { boardId });
  const rename = useMutation(api.boards.rename);
  const [name, setName] = React.useState<string | null>(null);
  const [sharing, setSharing] = React.useState(false);

  // One avatar per person, however many tabs they have open.
  const people = [...new Map(others.map((o) => [o.userId, o])).values()];

  const saveName = () => {
    const next = name?.trim();
    setName(null);
    if (next && board && next !== board.name) void rename({ boardId, name: next }).catch(() => toast.error("Couldn't rename the board"));
  };

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-3" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className={`${panel} gap-0.5 p-1`}>
        <Tip label="All boards" side="bottom">
          <Link href="/app" className="flex h-10 items-center gap-1 rounded-xl pr-1.5 pl-1 text-muted transition-colors hover:bg-black/[0.04] hover:text-ink">
            <ChevronLeft className="size-4" />
            <LogoMark className="size-7" />
          </Link>
        </Tip>
        <div className="mx-1 h-6 w-px bg-black/[0.08]" />
        <input
          value={name ?? board?.name ?? ""}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => {
            setName(board?.name ?? "");
            e.currentTarget.select();
          }}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setName(null);
              e.currentTarget.blur();
            }
          }}
          aria-label="Board name"
          size={Math.max(8, Math.min(32, (name ?? board?.name ?? "").length + 1))}
          className="h-10 rounded-xl bg-transparent px-2.5 text-[14.5px] font-semibold tracking-[-0.01em] outline-none transition-colors hover:bg-black/[0.04] focus:bg-black/[0.04]"
        />
      </div>

      <div className={`${panel} gap-2 py-1 pr-1 pl-1`}>
        <PlanStatus boardId={boardId} />
        <div className="h-6 w-px bg-black/[0.08]" />
        <div className="flex items-center -space-x-1.5 pr-0.5">
          {people.slice(0, 4).map((p) => (
            <Tip key={p.userId} label={`${p.name} · click to follow`} side="bottom">
              <button type="button" onClick={() => onFollow(p.sessionId)} className="rounded-full transition-transform hover:z-10 hover:-translate-y-0.5">
                <Avatar name={p.name} color={p.color} image={p.image} />
              </button>
            </Tip>
          ))}
          {people.length > 4 ? <span className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-[#EEEDF2] text-[11px] font-bold">+{people.length - 4}</span> : null}
          <Tip label={`${me.name} (you)`} side="bottom">
            <Avatar name={me.name} color={me.color} image={me.image ?? undefined} ring />
          </Tip>
        </div>
        <Tip label="Keyboard shortcuts" keys="?" side="bottom">
          <button type="button" onClick={onHelp} className="flex size-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-black/[0.05] hover:text-ink" aria-label="Keyboard shortcuts">
            <Keyboard className="size-[18px]" />
          </button>
        </Tip>
        <button type="button" onClick={() => setSharing(true)} className="flex h-9 items-center gap-1.5 rounded-xl bg-[#0D99FF] px-4 text-[13.5px] font-semibold text-white shadow-[0_6px_14px_-6px_rgba(13,153,255,0.9)] transition-colors hover:bg-[#0A8AE8]">
          Share
        </button>
      </div>

      <ShareDialog open={sharing} onClose={() => setSharing(false)} code={board?.inviteCode} people={people.length + 1} />
    </div>
  );
}

function ShareDialog({ open, onClose, code, people }: { open: boolean; onClose: () => void; code?: string; people: number }) {
  const [copied, setCopied] = React.useState(false);
  const url = typeof window !== "undefined" && code ? `${window.location.origin}/join/${code}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      track("share_link_copied");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.message("Copy this link", { description: url });
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Share this board" width={460}>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">Anyone with the link can join after signing in, and edit with you in real time.</p>
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-line bg-[#FAFAFC] p-1.5 pl-3">
        <LinkIcon className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-2">{url || "…"}</span>
        <button type="button" onClick={() => void copy()} disabled={!url} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-50">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[13px] text-muted">
        <Users className="size-3.5" /> {people === 1 ? "Only you are here right now" : `${people} people here right now`}
      </p>
    </Dialog>
  );
}

function Avatar({ name, color, image, ring }: { name: string; color: string; image?: string; ring?: boolean }) {
  return (
    <span className={`relative flex size-8 items-center justify-center overflow-hidden rounded-full border-2 border-white text-[12px] font-bold text-white ${ring ? "outline-2 outline-offset-[-1px]" : ""}`} style={{ background: color, outlineColor: color }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
