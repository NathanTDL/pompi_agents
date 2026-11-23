"use client";

import * as React from "react";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowRight, Check, CreditCard, LoaderCircle, Mail, MessageSquareText, MonitorSmartphone, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { track } from "@/lib/analytics";
import type { Id } from "@/convex/_generated/dataModel";
import { features, PLANS, type PaidPlan } from "@/convex/plans";
import { Dialog } from "@/components/ui/dialog";

const fail = (e: unknown, fallback: string) => toast.error(e instanceof ConvexError ? String(e.data) : fallback);
const day = (at: number) => new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/* ---------------- the dialog ---------------- */

/** Choosing a plan (through Polar's checkout), or yours and what you've used this month. */
export function PlanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useQuery(api.billing.mine, open ? {} : "skip");
  const checkout = useAction(api.billing.checkout);
  const portal = useAction(api.billing.portal);
  const change = useAction(api.billing.changePlan);
  const cancelPlan = useAction(api.billing.cancel);
  const [cancelling, setCancelling] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<PaidPlan | null>(null);
  const none = me?.plan === "none";

  const choose = async (key: PaidPlan) => {
    if (!me) return;
    if (!none) {
      setConfirm(key);
      return;
    }
    setBusy(key);
    try {
      track("checkout_started", { plan: key });
      const { url } = await checkout({ plan: key, origin: window.location.origin });
      window.location.assign(url);
    } catch (e) {
      fail(e, "Couldn't open checkout");
      setBusy(null);
    }
  };

  const switchTo = async (key: PaidPlan) => {
    setBusy(key);
    try {
      await change({ plan: key });
      toast.success(`You're on ${PLANS[key].name} now`);
      setConfirm(null);
    } catch (e) {
      fail(e, "Couldn't change your plan");
    } finally {
      setBusy(null);
    }
  };

  /** Cancel at the period's end, or keep it going after all. */
  const setEnding = async (end: boolean) => {
    setBusy(end ? "cancel" : "resume");
    try {
      await cancelPlan({ resume: !end });
      toast.success(end ? "Your plan is cancelled. You keep it until the end of this period." : "Your plan keeps going.");
      setCancelling(false);
    } catch (e) {
      fail(e, end ? "Couldn't cancel your plan" : "Couldn't keep your plan");
    } finally {
      setBusy(null);
    }
  };

  const manage = async () => {
    setBusy("portal");
    try {
      const { url } = await portal({ returnUrl: window.location.href });
      window.location.assign(url);
    } catch (e) {
      fail(e, "Couldn't open billing");
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={none ? "Choose your plan" : "Plan & usage"} width={820}>
      {!me ? (
        <div className="flex h-72 items-center justify-center">
          <LoaderCircle className="size-6 animate-spin text-muted" />
        </div>
      ) : (
        <div className="mt-2 space-y-6">
          {none ? (
            <p className="max-w-xl text-[14px] leading-relaxed text-muted">Your agents answer, use their apps and work on your own cloud computer on your plan. Change or cancel any time.</p>
          ) : (
            <div className="rounded-2xl bg-[#FAF9F6] p-5 ring-1 ring-black/[0.06]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-2 text-[15px] font-bold">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-[#16151A] text-white">
                    <Zap className="size-3.5" />
                  </span>
                  {me.limits.name}
                </span>
                <span className="text-[12.5px] text-muted">
                  {me.granted ? "On the house" : `$${me.limits.price}/month`}
                  {me.renews?.at ? ` · ${me.renews.cancelling ? "ends" : "renews"} ${day(me.renews.at)}` : ""}
                </span>
                {me.granted ? (
                  <span className="ml-auto rounded-full bg-[#E3F8EA] px-2.5 py-1 text-[11.5px] font-semibold text-[#0E8A47]">Complimentary</span>
                ) : (
                  <button type="button" onClick={() => void manage()} disabled={!!busy} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[12.5px] font-semibold ring-1 ring-black/10 transition-colors hover:bg-black/[0.03] disabled:opacity-60">
                    {busy === "portal" ? <LoaderCircle className="size-3.5 animate-spin" /> : <CreditCard className="size-3.5" />} Billing & invoices
                  </button>
                )}
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                <Meter icon={MessageSquareText} label="Agent answers" used={me.used.answers} limit={me.limits.answers} />
                <Meter icon={MonitorSmartphone} label="Computer tasks" used={me.used.computerTasks} limit={me.limits.computerTasks} />
                <Meter icon={Mail} label="Agents with email" used={me.used.emailAgents} limit={me.limits.emailAgents} />
              </div>
              <p className="mt-4 text-[12px] text-muted">Answers and computer tasks start over on {day(me.resetsAt)}. Agents on your boards use your plan, whoever asks them.</p>
              {me.granted ? null : me.renews?.cancelling ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#FFF4DB] px-3.5 py-2.5">
                  <p className="min-w-0 flex-1 text-[12.5px] text-[#7A5200]">
                    Your plan is cancelled. You keep {me.limits.name} until {me.renews.at ? day(me.renews.at) : "the end of this period"}, then your agents stop working.
                  </p>
                  <button type="button" onClick={() => void setEnding(false)} disabled={!!busy} className="flex h-8 items-center gap-1.5 rounded-lg bg-[#16151A] px-3 text-[12.5px] font-semibold text-white hover:bg-black disabled:opacity-60">
                    {busy === "resume" ? <LoaderCircle className="size-3.5 animate-spin" /> : null} Keep my plan
                  </button>
                </div>
              ) : cancelling ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-black/[0.08]">
                  <p className="min-w-0 flex-1 text-[12.5px] text-ink-2">
                    Cancel {me.limits.name}? You keep it until {me.renews?.at ? day(me.renews.at) : "the end of this period"} and won&apos;t be charged again.
                  </p>
                  <button type="button" onClick={() => void setEnding(true)} disabled={!!busy} className="flex h-8 items-center gap-1.5 rounded-lg bg-[#E5484D] px-3 text-[12.5px] font-semibold text-white hover:bg-[#D13C41] disabled:opacity-60">
                    {busy === "cancel" ? <LoaderCircle className="size-3.5 animate-spin" /> : null} Yes, cancel
                  </button>
                  <button type="button" onClick={() => setCancelling(false)} className="h-8 rounded-lg px-3 text-[12.5px] font-semibold ring-1 ring-black/10 hover:bg-black/[0.03]">
                    Keep it
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setCancelling(true)} className="mt-3 text-[12px] font-medium text-muted underline-offset-2 hover:text-[#B4261E] hover:underline">
                  Cancel plan
                </button>
              )}
            </div>
          )}

          {!me.configured ? (
            <p className="rounded-xl bg-[#FFF4DB] px-3.5 py-2.5 text-[12.5px] text-[#7A5200]">Plans aren&apos;t set up on this deployment yet (Polar keys and products are missing).</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {me.plans.map((p) => {
                const current = me.plan === p.key;
                const popular = p.key === "pro";
                return (
                  <div key={p.key} className={`relative flex flex-col rounded-2xl p-5 ring-1 transition-shadow ${popular ? "bg-[#16151A] text-white shadow-[0_24px_50px_-24px_rgba(22,21,26,0.8)] ring-black" : "bg-white ring-black/[0.08] hover:shadow-[0_18px_40px_-26px_rgba(22,21,26,0.5)]"}`}>
                    {popular ? (
                      <span className="absolute -top-2.5 left-5 flex items-center gap-1 rounded-full bg-[#FFE48C] px-2 py-0.5 text-[10.5px] font-bold text-[#16151A]">
                        <Sparkles className="size-3" /> Most popular
                      </span>
                    ) : null}
                    <p className="text-[15px] font-bold">{p.name}</p>
                    <p className="mt-1.5 flex items-baseline gap-1">
                      <span className="text-[32px] leading-none font-bold tracking-[-0.04em]">${p.price}</span>
                      <span className={`text-[12.5px] ${popular ? "text-white/55" : "text-muted"}`}>/ month</span>
                    </p>
                    <p className={`mt-2 text-[12.5px] leading-snug ${popular ? "text-white/65" : "text-muted"}`}>{p.blurb}</p>
                    <ul className="mt-4 space-y-2 text-[13px]">
                      {features(p).map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className={`mt-0.5 size-3.5 shrink-0 ${popular ? "text-[#5BE39A]" : "text-[#0E8A47]"}`} strokeWidth={2.5} />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-5">
                      {me.granted && !current ? (
                        <span className={`flex h-10 items-center justify-center rounded-xl text-[12.5px] ${popular ? "text-white/50" : "text-muted"}`}>Not needed</span>
                      ) : current ? (
                        <span className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold ${popular ? "bg-white/10" : "bg-black/[0.04]"}`}>
                          <Check className="size-4" /> Your plan
                        </span>
                      ) : confirm === p.key ? (
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => void switchTo(p.key)} disabled={!!busy} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0D99FF] text-[13px] font-semibold text-white hover:bg-[#0A8AE8] disabled:opacity-60">
                            {busy === p.key ? <LoaderCircle className="size-3.5 animate-spin" /> : null} Switch now
                          </button>
                          <button type="button" onClick={() => setConfirm(null)} className={`h-10 rounded-xl px-3 text-[13px] font-semibold ${popular ? "bg-white/10" : "bg-black/[0.05]"}`}>
                            Keep
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void choose(p.key)}
                          className={`group flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-60 ${popular ? "bg-white text-[#16151A] hover:bg-white/90" : "bg-[#16151A] text-white hover:bg-black"}`}
                        >
                          {busy === p.key ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                          {none ? `Get ${p.name}` : p.price > me.limits.price ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                          {busy === p.key ? null : <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-center text-[12px] text-muted">
            {confirm ? "Switching changes your plan right away; Polar settles the difference on your next bill." : "Payments by Polar. Cancel any time from Billing & invoices."}
          </p>
        </div>
      )}
    </Dialog>
  );
}

function Meter({ icon: Icon, label, used, limit }: { icon: React.ElementType; label: string; used: number; limit: number }) {
  const share = limit ? Math.min(1, used / limit) : 1;
  const full = used >= limit;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
        <Icon className="size-3.5 text-muted" />
        {label}
      </div>
      <p className="mt-1 text-[20px] leading-none font-bold tracking-[-0.03em] tabular-nums">
        {Math.max(0, limit - used).toLocaleString()}
        <span className="ml-1 text-[12px] font-medium tracking-normal text-muted">of {limit.toLocaleString()} left</span>
      </p>
      <Bar share={share} full={full} className="mt-2.5" />
    </div>
  );
}

function Bar({ share, full, className = "" }: { share: number; full: boolean; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-black/[0.07] ${className}`}>
      <div className={`h-full rounded-full transition-[width] ${full ? "bg-[#E5484D]" : share > 0.8 ? "bg-[#FFB020]" : "bg-[#16151A]"}`} style={{ width: `${share > 0 ? Math.max(Math.min(1, share) * 100, 4) : 0}%` }} />
    </div>
  );
}

/* ---------------- on the boards page ---------------- */

/** Your plan, small, in the sidebar: it opens Plan & usage. Without one, it asks you to choose. */
export function PlanBadge({ onOpen }: { onOpen: () => void }) {
  const me = useQuery(api.billing.mine, {});
  if (!me) return null;
  if (me.plan === "none") {
    return (
      <button type="button" onClick={onOpen} className="group w-full rounded-2xl bg-[#16151A] p-3.5 text-left text-white shadow-[0_14px_30px_-16px_rgba(22,21,26,0.9)] transition-transform hover:-translate-y-0.5">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Zap className="size-3.5 text-[#FFE48C]" /> Choose a plan
        </span>
        <span className="mt-1 block text-[12px] leading-snug text-white/60">Your agents start working as soon as you pick one.</span>
        <span className="mt-2.5 flex items-center gap-1 text-[12px] font-semibold text-[#FFE48C]">
          See plans <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>
    );
  }
  const left = me.limits.answers - me.used.answers;
  return (
    <div className="overflow-hidden rounded-2xl bg-white/70 ring-1 ring-black/[0.05]">
      <button type="button" onClick={onOpen} className="w-full px-3.5 py-3 text-left transition-colors hover:bg-white">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Zap className="size-3.5" /> {me.limits.name}
          </span>
          <span className="text-[11.5px] font-semibold text-[#0D7FD9]">Plan & usage</span>
        </div>
        <Bar share={me.used.answers / Math.max(1, me.limits.answers)} full={left <= 0} className="mt-2" />
        <p className="mt-1.5 text-[11.5px] text-muted">
          {Math.max(0, left)} answers · {Math.max(0, me.limits.computerTasks - me.used.computerTasks)} computer tasks left
        </p>
      </button>
      {me.granted ? null : <ManageBilling />}
    </div>
  );
}

/** Polar's billing portal: card, invoices, cancelling. */
function ManageBilling() {
  const portal = useAction(api.billing.portal);
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        portal({ returnUrl: window.location.href })
          .then(({ url }) => window.location.assign(url))
          .catch((e: unknown) => {
            fail(e, "Couldn't open billing");
            setBusy(false);
          });
      }}
      className="flex w-full items-center gap-1.5 border-t border-black/[0.05] px-3.5 py-2.5 text-left text-[12px] font-semibold text-ink-2 transition-colors hover:bg-white hover:text-ink disabled:opacity-60"
    >
      {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <CreditCard className="size-3.5" />}
      Manage billing
      <ArrowRight className="ml-auto size-3.5 text-muted" />
    </button>
  );
}

/** Across the top of the boards page while you have no plan: what to do first. */
export function ChoosePlanBanner({ onOpen }: { onOpen: () => void }) {
  const me = useQuery(api.billing.mine, {});
  if (me?.plan !== "none") return null;
  return (
    <div className="mt-8 flex flex-col gap-4 rounded-[22px] bg-[#16151A] p-5 text-white sm:flex-row sm:items-center sm:p-6">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFE48C] text-[#16151A]">
        <Zap className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-bold tracking-[-0.01em]">Choose a plan to put your AI team to work</p>
        <p className="mt-1 text-[13.5px] text-white/60">Your boards are ready. Agents answer, use apps and work on your own computer once you pick a plan, from $19 a month.</p>
      </div>
      <button type="button" onClick={onOpen} className="group flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white px-5 text-[14px] font-semibold text-[#16151A] transition-colors hover:bg-white/90">
        See plans <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}

/* ---------------- on the canvas ---------------- */

/**
 * The board's plan (its owner's) and what's left this month, at the top right
 * of the canvas. Click for the details; the owner can open Plan & usage.
 */
export function PlanStatus({ boardId }: { boardId: Id<"boards"> }) {
  const s = useQuery(api.billing.forBoard, { boardId });
  const [open, setOpen] = React.useState(false);
  const [dialog, setDialog] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!s) return null;
  const none = s.plan === "none";
  const answersLeft = Math.max(0, s.limits.answers - s.used.answers);
  const tasksLeft = Math.max(0, s.limits.computerTasks - s.used.computerTasks);
  const low = !none && (answersLeft <= s.limits.answers * 0.1 || tasksLeft === 0);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => (none && s.mine ? setDialog(true) : setOpen((o) => !o))}
        aria-expanded={open}
        aria-label={none ? undefined : `${s.limits.name} plan${low ? ", running low" : ""}`}
        className={`group flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[12.5px] font-semibold transition-colors ${
          none ? "bg-[#FFF4DB] text-[#7A5200] hover:bg-[#FFEBC2]" : open ? "bg-black/[0.06] text-ink" : "text-ink-2 hover:bg-black/[0.05]"
        }`}
      >
        {none ? (
          <>
            <Zap className="size-3.5" /> {s.mine ? "Choose a plan" : "No plan"}
          </>
        ) : (
          <>
            <span className="relative flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-[#FFE48C] to-[#FFC94D] text-[#5C3D00] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
              <Sparkles className="size-3" />
              {low ? <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-[#E5484D] ring-2 ring-white" /> : null}
            </span>
            <span className="hidden sm:inline">{s.limits.name}</span>
          </>
        )}
      </button>

      {open ? (
        <div className="absolute top-11 right-0 z-40 w-[296px] animate-pop overflow-hidden rounded-2xl bg-white text-left shadow-[0_0_0_1px_rgba(22,21,26,0.07),0_18px_40px_-14px_rgba(22,21,26,0.35)]">
          <div className="bg-gradient-to-b from-[#FFF8E1] to-white px-4 pt-4 pb-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{s.mine ? "Your plan" : "The owner's plan"}</p>
              {!none ? <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-muted shadow-[0_0_0_1px_rgba(22,21,26,0.06)]">Resets {day(s.resetsAt)}</span> : null}
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-[18px] font-bold tracking-[-0.02em]">
              <Sparkles className="size-4 text-[#C98A00]" /> {none ? "No plan yet" : s.limits.name}
            </p>
          </div>
          <div className="px-4 pb-4">
            {none ? (
              <p className="text-[12.5px] leading-snug text-muted">The agents on this board start working once the board&apos;s owner chooses a plan.</p>
            ) : (
              <>
                <div className="space-y-2">
                  <MiniMeter icon={<MessageSquareText className="size-3.5" />} label="Agent answers" used={s.used.answers} limit={s.limits.answers} />
                  <MiniMeter icon={<MonitorSmartphone className="size-3.5" />} label="Computer tasks" used={s.used.computerTasks} limit={s.limits.computerTasks} />
                </div>
                <p className="mt-3 text-[11.5px] leading-snug text-muted">{s.mine ? "Agents on all your boards share this plan." : "Agents here use the board owner's plan."}</p>
              </>
            )}
            {s.mine ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setDialog(true);
                }}
                className="mt-3.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#16151A] text-[12.5px] font-semibold text-white transition-colors hover:bg-black"
              >
                {low ? "Upgrade" : "Plan & usage"} <ArrowRight className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {s.mine ? <PlanDialog open={dialog} onClose={() => setDialog(false)} /> : null}
    </div>
  );
}

function MiniMeter({ icon, label, used, limit }: { icon: React.ReactNode; label: string; used: number; limit: number }) {
  const left = Math.max(0, limit - used);
  return (
    <div className="rounded-xl bg-[#F7F7F9] px-3 py-2.5">
      <div className="flex items-center justify-between text-[12px]">
        <span className="flex items-center gap-1.5 font-medium text-ink-2">
          <span className="text-muted">{icon}</span>
          {label}
        </span>
        <span className={`font-semibold tabular-nums ${used >= limit ? "text-[#B4261E]" : ""}`}>
          {left.toLocaleString()} <span className="font-medium text-muted">left</span>
        </span>
      </div>
      <Bar share={used / Math.max(1, limit)} full={used >= limit} className="mt-2" />
      <p className="mt-1.5 text-[11px] text-muted tabular-nums">
        {used.toLocaleString()} of {limit.toLocaleString()} used
      </p>
    </div>
  );
}
