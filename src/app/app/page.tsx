"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Bot, Zap, LayoutGrid, LayoutTemplate, LoaderCircle, LogOut, MoreHorizontal, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { LogoMark, GithubMark } from "@/components/brand/logo";
import { BoardThumb, type PreviewItem } from "@/components/board-thumb";
import { Dialog } from "@/components/ui/dialog";
import { ChoosePlanBanner, PlanBadge, PlanDialog } from "@/components/plan-dialog";
import { FullPageSpinner, useSignedIn } from "@/lib/use-signed-in";

type Template = "blank" | "brainstorm" | "launch" | "retro";
type Filter = "all" | "mine" | "shared";

const GITHUB = "https://github.com/NathanTDL/pompi_agents";

const TEMPLATES: { id: Template; name: string; blurb: string; preview: PreviewItem[] }[] = [
  { id: "blank", name: "Blank board", blurb: "Start from nothing", preview: [] },
  {
    id: "brainstorm",
    name: "Brainstorm",
    blurb: "Ideas, then favourites",
    preview: [
      { kind: "section", x: 0, y: 0, w: 740, h: 520, color: "yellow" },
      { kind: "sticky", x: 40, y: 60, w: 220, h: 220, color: "yellow" },
      { kind: "sticky", x: 280, y: 60, w: 220, h: 220, color: "orange" },
      { kind: "sticky", x: 160, y: 290, w: 220, h: 220, color: "yellow" },
      { kind: "section", x: 800, y: 0, w: 500, h: 520, color: "violet" },
      { kind: "sticky", x: 840, y: 60, w: 220, h: 220, color: "violet" },
    ],
  },
  {
    id: "launch",
    name: "Launch plan",
    blurb: "Goals, copy, site, inbox",
    preview: [
      { kind: "section", x: 0, y: 0, w: 520, h: 560, color: "green" },
      { kind: "sticky", x: 40, y: 60, w: 220, h: 220, color: "green" },
      { kind: "section", x: 580, y: 0, w: 520, h: 560, color: "pink" },
      { kind: "sticky", x: 620, y: 60, w: 220, h: 220, color: "pink" },
      { kind: "section", x: 1160, y: 0, w: 520, h: 560, color: "blue" },
      { kind: "sticky", x: 1200, y: 60, w: 220, h: 220, color: "blue" },
    ],
  },
  {
    id: "retro",
    name: "Team retro",
    blurb: "Went well, improve, actions",
    preview: [
      { kind: "section", x: 0, y: 0, w: 520, h: 620, color: "green" },
      { kind: "sticky", x: 40, y: 60, w: 220, h: 220, color: "green" },
      { kind: "section", x: 580, y: 0, w: 520, h: 620, color: "orange" },
      { kind: "sticky", x: 620, y: 60, w: 220, h: 220, color: "orange" },
      { kind: "section", x: 1160, y: 0, w: 520, h: 620, color: "violet" },
      { kind: "sticky", x: 1200, y: 60, w: 220, h: 220, color: "violet" },
    ],
  },
];

/** The workspace home: templates to start from, and every board I'm on. */
export default function BoardsPage() {
  const signedIn = useSignedIn();
  const router = useRouter();
  const me = useQuery(api.users.me, signedIn ? {} : "skip");
  const boards = useQuery(api.boards.mine, signedIn ? {} : "skip");
  const create = useMutation(api.boards.create);
  const [creating, setCreating] = React.useState<Template | null>(null);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [plans, setPlans] = React.useState(false);

  if (!signedIn) return <FullPageSpinner />;

  const newBoard = async (template: Template = "blank") => {
    setCreating(template);
    try {
      const id = await create({ template });
      router.push(`/b/${id}`);
    } catch {
      toast.error("Couldn't make a board. Please try again.");
      setCreating(null);
    }
  };

  const firstName = me?.name?.split(" ")[0] ?? "";
  const shown = (boards ?? [])
    .filter((b) => (filter === "mine" ? b.role === "owner" : filter === "shared" ? b.role !== "owner" : true))
    .filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="pompi-grain min-h-dvh bg-[#FAF9F6] text-ink">
      <Sidebar me={me} onNew={() => void newBoard()} creating={creating === "blank"} />

      <main className="min-w-0 lg:pl-[256px]">
        {/* Top bar */}
        <div className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-black/[0.06] bg-[#FAF9F6]/85 px-5 backdrop-blur-xl sm:px-10">
          <Link href="/app" className="lg:hidden">
            <LogoMark className="size-7" />
          </Link>
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search boards"
              className="h-10 w-full rounded-full border border-black/[0.08] bg-white pr-4 pl-10 text-[14px] outline-none transition-shadow placeholder:text-muted focus:border-black/20 focus:ring-4 focus:ring-black/[0.05]"
            />
          </div>
          <button type="button" onClick={() => setPlans(true)} className="ml-auto flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold text-ink-2 ring-1 ring-black/[0.08] transition-colors hover:bg-white lg:hidden">
            <Zap className="size-4" /> Plan
          </button>
          <button
            type="button"
            onClick={() => void newBoard()}
            disabled={!!creating}
            className="flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-60 lg:hidden"
          >
            {creating === "blank" ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
            <span className="hidden sm:inline">New board</span>
          </button>
        </div>

        <div className="mx-auto max-w-[1180px] px-5 pt-12 pb-20 sm:px-10">
          <Tag>{firstName ? `${firstName}'s workspace` : "Your workspace"}</Tag>
          <h1 className="mt-4 text-[clamp(2.1rem,4vw,3.1rem)] leading-[1] font-bold tracking-[-0.045em] text-balance">
            {greeting()}
            {firstName ? `, ${firstName}.` : "."}
            <br />
            <span className="text-black/35">What should your team work on?</span>
          </h1>
          <ChoosePlanBanner onOpen={() => setPlans(true)} />
          <PlanDialog open={plans} onClose={() => setPlans(false)} />

          {/* Templates */}
          <section id="templates" className="mt-12 scroll-mt-24">
            <div className="flex items-end justify-between gap-4">
              <h2 className="text-[18px] font-bold tracking-[-0.02em]">Start something new</h2>
              <p className="hidden text-[13px] text-muted sm:block">Every board can have its own AI teammates.</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void newBoard(t.id)}
                  disabled={!!creating}
                  className="group relative overflow-hidden rounded-[20px] bg-white p-1.5 text-left ring-1 ring-black/[0.07] transition-all hover:-translate-y-0.5 hover:shadow-[0_22px_40px_-24px_rgba(22,21,26,0.45)] hover:ring-black/15 disabled:opacity-60"
                >
                  {t.id === "blank" ? (
                    <div className="pompi-canvas flex h-28 items-center justify-center rounded-[15px]" style={{ backgroundSize: "12px 12px" }}>
                      <span className="flex size-11 items-center justify-center rounded-full bg-ink text-white shadow-[0_10px_20px_-10px_rgba(22,21,26,0.8)] transition-transform group-hover:scale-110">
                        {creating === "blank" ? <LoaderCircle className="size-5 animate-spin" /> : <Plus className="size-5" />}
                      </span>
                    </div>
                  ) : (
                    <BoardThumb items={t.preview} className="h-28 rounded-[15px]" />
                  )}
                  <div className="px-2.5 pt-3 pb-2">
                    <p className="flex items-center gap-1.5 text-[14.5px] font-semibold tracking-[-0.01em]">
                      {t.name}
                      {creating === t.id && t.id !== "blank" ? <LoaderCircle className="size-3.5 animate-spin text-muted" /> : null}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-muted">{t.blurb}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Boards */}
          <section className="mt-14">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-[18px] font-bold tracking-[-0.02em]">
                Your boards
                {boards?.length ? <span className="rounded-full bg-black/[0.06] px-2 py-0.5 font-mono text-[11.5px] font-semibold text-muted">{boards.length}</span> : null}
              </h2>
              <div className="flex rounded-full bg-black/[0.05] p-1 text-[13px] font-medium">
                {(["all", "mine", "shared"] as Filter[]).map((f) => (
                  <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3.5 py-1.5 transition-all ${filter === f ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-muted hover:text-ink"}`}>
                    {f === "all" ? "All" : f === "mine" ? "Owned by me" : "Shared with me"}
                  </button>
                ))}
              </div>
            </div>

            {boards === undefined ? (
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[252px] animate-pulse rounded-[22px] bg-black/[0.04]" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <div className="mt-5 flex flex-col items-center justify-center rounded-[28px] border border-dashed border-black/15 px-6 py-16 text-center">
                <div className="pompi-sticky rotate-[-3deg] rounded-[3px] bg-[#FFE48C] px-5 py-4 text-left text-[16px] leading-snug font-semibold">{boards.length ? "nothing here…" : "start your first board"}</div>
                <p className="mt-6 text-[17px] font-semibold tracking-[-0.01em]">{boards.length ? "No boards match" : "No boards yet"}</p>
                <p className="mt-1 max-w-sm text-[14px] text-muted">{boards.length ? "Try another search or filter." : "Pick a template above, or start with a blank board."}</p>
                {!boards.length ? (
                  <button type="button" onClick={() => void newBoard()} className="mt-6 flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-semibold text-white hover:bg-black">
                    <Plus className="size-4" /> New board
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((b) => (
                  <BoardCard key={b._id} board={b} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/** A section's label: mono caps, as on the landing page. */
function Tag({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[12px] font-semibold tracking-[0.14em] text-muted uppercase">{children}</p>;
}

type BoardRow = FunctionReturnType<typeof api.boards.mine>[number];

function BoardCard({ board }: { board: BoardRow }) {
  const rename = useMutation(api.boards.rename);
  const remove = useMutation(api.boards.remove);
  const [menu, setMenu] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [name, setName] = React.useState(board.name);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  return (
    <div className="group relative rounded-[22px] bg-white p-1.5 ring-1 ring-black/[0.07] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_44px_-26px_rgba(22,21,26,0.45)] hover:ring-black/15">
      <Link href={`/b/${board._id}`} className="block">
        <BoardThumb items={board.preview} className="h-44 overflow-hidden rounded-[17px]" />
        <div className="flex items-center gap-3 px-3 pt-3.5 pb-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{board.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
              Opened {timeAgo(board.lastOpenedAt)}
              {board.members > 1 ? (
                <>
                  <span className="text-black/20">·</span>
                  <Users className="size-3" /> {board.members}
                </>
              ) : null}
            </p>
          </div>
          {board.role !== "owner" ? <span className="rounded-full bg-[#A6D9FF]/60 px-2 py-0.5 text-[11px] font-semibold text-[#0B5E99]">Shared</span> : null}
        </div>
      </Link>

      <div ref={menuRef} className="absolute top-3.5 right-3.5">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          className={`flex size-8 items-center justify-center rounded-full bg-white/90 text-ink-2 shadow-sm ring-1 ring-black/5 backdrop-blur transition-opacity hover:bg-white ${menu ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
          aria-label="Board options"
        >
          <MoreHorizontal className="size-4" />
        </button>
        {menu ? (
          <div className="absolute right-0 z-30 mt-1.5 w-44 animate-pop rounded-xl bg-white p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.3)] ring-1 ring-black/5">
            <MenuItem
              icon={Pencil}
              onClick={() => {
                setMenu(false);
                setName(board.name);
                setRenaming(true);
              }}
            >
              Rename
            </MenuItem>
            {board.role === "owner" ? (
              <MenuItem
                icon={Trash2}
                danger
                onClick={() => {
                  setMenu(false);
                  setDeleting(true);
                }}
              >
                Delete
              </MenuItem>
            ) : null}
          </div>
        ) : null}
      </div>

      <Dialog open={renaming} onClose={() => setRenaming(false)} title="Rename board">
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            setRenaming(false);
            if (name.trim() && name.trim() !== board.name) void rename({ boardId: board._id as Id<"boards">, name }).catch(() => toast.error("Couldn't rename it"));
          }}
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-11 w-full rounded-xl border border-line px-3 text-[15px] outline-none focus:border-black/25 focus:ring-4 focus:ring-black/[0.05]" />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setRenaming(false)} className="h-10 rounded-full px-4 text-[14px] font-semibold text-ink-2 hover:bg-black/[0.04]">
              Cancel
            </button>
            <button type="submit" className="h-10 rounded-full bg-ink px-5 text-[14px] font-semibold text-white">
              Save
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={deleting} onClose={() => setDeleting(false)} title={`Delete “${board.name}”?`}>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">Everything on it is deleted for everyone on the board. This can&apos;t be undone.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => setDeleting(false)} className="h-10 rounded-full px-4 text-[14px] font-semibold text-ink-2 hover:bg-black/[0.04]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleting(false);
              void remove({ boardId: board._id as Id<"boards"> })
                .then(() => toast.success("Board deleted"))
                .catch(() => toast.error("Couldn't delete it"));
            }}
            className="h-10 rounded-full bg-[#E5484D] px-5 text-[14px] font-semibold text-white hover:bg-[#D93D42]"
          >
            Delete board
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function MenuItem({ icon: Icon, onClick, danger, children }: { icon: React.ElementType; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium ${danger ? "text-[#E5484D] hover:bg-[#FFF0F0]" : "text-ink-2 hover:bg-black/[0.04]"}`}>
      <Icon className="size-4" />
      {children}
    </button>
  );
}

function Sidebar({ me, onNew, creating }: { me: { name: string; email: string | null; image: string | null } | null | undefined; onNew: () => void; creating: boolean }) {
  const [planOpen, setPlanOpen] = React.useState(false);
  // Back from Polar's checkout: a thank-you (the plan badge shows the new plan as Polar confirms it).
  const refreshPlan = useAction(api.billing.refresh);
  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("upgraded")) return;
    url.searchParams.delete("upgraded");
    window.history.replaceState(null, "", url.toString());
    toast.success("You're upgraded. Thanks for supporting Pompi!");
    // Polar's webhook brings the plan too; this gets it here at once.
    void refreshPlan({}).catch(() => undefined);
  }, [refreshPlan]);
  const router = useRouter();
  return (
    // Fixed, so it stays put while the boards scroll.
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[256px] flex-col border-r border-black/[0.06] bg-[#F4F2EE] px-3.5 py-4 lg:flex">
      <Link href="/" className="flex items-center gap-2.5 px-2 py-1.5">
        <LogoMark className="size-7" />
        <span className="text-[16.5px] font-bold tracking-[-0.02em]">Pompi</span>
        <span className="ml-auto rounded-md border border-black/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] text-muted">BETA</span>
      </Link>

      <button
        type="button"
        onClick={onNew}
        disabled={creating}
        className="mt-6 flex h-11 items-center justify-center gap-2 rounded-full bg-ink text-[14px] font-semibold text-white shadow-[0_12px_24px_-14px_rgba(22,21,26,0.9)] transition-colors hover:bg-black disabled:opacity-60"
      >
        {creating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
        New board
      </button>

      <nav className="mt-6 space-y-0.5">
        <NavItem icon={LayoutGrid} href="/app" active>
          Boards
        </NavItem>
        <NavItem icon={LayoutTemplate} href="#templates">
          Templates
        </NavItem>
        <NavItem icon={GithubMark} href={GITHUB}>
          GitHub
        </NavItem>
      </nav>

      <div className="mt-auto space-y-3">
        <PlanBadge onOpen={() => setPlanOpen(true)} />
        <PlanDialog open={planOpen} onClose={() => setPlanOpen(false)} />
        <div className="pompi-sticky rotate-[-1.5deg] rounded-[3px] bg-[#FFE48C] p-4">
          <p className="flex items-center gap-1.5 text-[13.5px] font-semibold">
            <Bot className="size-4" /> Your AI team
          </p>
          <p className="mt-1.5 text-[12.5px] leading-snug text-ink/70">Open a board and add agents from the panel on its left. Then just write what you need.</p>
        </div>
        <div className="flex items-center gap-2.5 rounded-2xl bg-white/70 px-2.5 py-2 ring-1 ring-black/[0.05]">
          {me?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.image} alt="" className="size-8 rounded-full ring-1 ring-black/5" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-white">{(me?.name ?? "?").slice(0, 1).toUpperCase()}</span>
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold">{me?.name}</p>
            <p className="truncate text-[11.5px] text-muted">{me?.email}</p>
          </div>
          <button type="button" title="Sign out" onClick={() => void authClient.signOut().then(() => router.replace("/"))} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-black/[0.05] hover:text-ink">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ icon: Icon, href, active, children }: { icon: React.ElementType; href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors ${active ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.05]" : "text-ink-2 hover:bg-black/[0.04] hover:text-ink"}`}
    >
      <Icon className="size-4" />
      {children}
    </a>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function timeAgo(t: number) {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
