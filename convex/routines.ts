import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { blocking, CARD_W, nearestFree } from "./brain";
import { requireMember } from "./lib";

/**
 * Routines: an agent doing a task on a schedule ("every weekday at 9, check
 * Hacker News and post the top stories"). An agent sets one up when asked
 * (agent.ts: schedule_task); it shows as a card on the board, where each run's
 * work lands beside it, and where the team can pause it, run it now or delete
 * it. A cron (crons.ts) starts the ones that are due, in their own time zone.
 */

/** Routines a board can have on at once. */
const MAX_ON = 10;
/** In a row, failed runs pause a routine. */
const MAX_FAILS = 3;

export const scheduleV = v.object({
  /** "hour": every `hours` hours; "day", "weekday", "week" (on `days`), "month" (on `dayOfMonth`): at `at`; "once": on `date` at `at`. */
  every: v.union(v.literal("hour"), v.literal("day"), v.literal("weekday"), v.literal("week"), v.literal("month"), v.literal("once")),
  /** "09:00", in the routine's time zone. */
  at: v.optional(v.string()),
  /** 0 = Sunday … 6 = Saturday. */
  days: v.optional(v.array(v.number())),
  dayOfMonth: v.optional(v.number()),
  hours: v.optional(v.number()),
  /** "2026-12-01". */
  date: v.optional(v.string()),
  /** IANA, like "Africa/Addis_Ababa". */
  tz: v.string(),
});
export type Schedule = Infer<typeof scheduleV>;

/* ---------------- time, in a time zone ---------------- */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The wall clock in `tz` at instant `ms`. */
function wall(ms: number, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return { y: +parts.year, m: +parts.month, d: +parts.day, h: +parts.hour % 24, min: +parts.minute, s: +parts.second, dow: DOW.indexOf(parts.weekday) };
}

/** The instant when the wall clock in `tz` reads that date and time. */
function instant(y: number, m: number, d: number, h: number, min: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const off = (ms: number) => {
    const w = wall(ms, tz);
    return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - ms;
  };
  const first = guess - off(guess);
  const second = guess - off(first);
  return second;
}

export function validZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const hm = (at?: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(at ?? "");
  return m ? { h: Math.min(23, +m[1]), min: Math.min(59, +m[2]) } : { h: 9, min: 0 };
};

/** The schedule's next time after `after`, or null when there's none (a one-off that's past). */
export function nextRun(s: Schedule, after: number): number | null {
  const { h, min } = hm(s.at);
  if (s.every === "hour") {
    const n = Math.max(1, Math.min(24, Math.round(s.hours ?? 1))) * 3600_000;
    // On the hour (or at the minute in `at`), then every n hours.
    const w = wall(after, s.tz);
    let t = instant(w.y, w.m, w.d, w.h, s.at ? min : 0, s.tz);
    while (t <= after) t += n;
    return t;
  }
  if (s.every === "once") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.date ?? "");
    if (!m) return null;
    const t = instant(+m[1], +m[2], +m[3], h, min, s.tz);
    return t > after ? t : null;
  }
  const today = wall(after, s.tz);
  for (let i = 0; i < 400; i++) {
    // Noon that day, so the date is right whatever the clocks did overnight.
    const day = wall(instant(today.y, today.m, today.d, 12, 0, s.tz) + i * 86400_000, s.tz);
    const fits =
      s.every === "day" ||
      (s.every === "weekday" && day.dow >= 1 && day.dow <= 5) ||
      (s.every === "week" && (s.days?.length ? s.days : [1]).includes(day.dow)) ||
      (s.every === "month" && day.d === Math.min(s.dayOfMonth ?? 1, new Date(Date.UTC(day.y, day.m, 0)).getUTCDate()));
    if (!fits) continue;
    const t = instant(day.y, day.m, day.d, h, min, s.tz);
    if (t > after) return t;
  }
  return null;
}

const NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const nth = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const list = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** "Every weekday at 09:00", in words. */
export function describe(s: Schedule): string {
  const at = s.at ? ` at ${s.at}` : "";
  switch (s.every) {
    case "hour":
      return (s.hours ?? 1) <= 1 ? "Every hour" : `Every ${Math.round(s.hours ?? 1)} hours`;
    case "day":
      return `Every day${at}`;
    case "weekday":
      return `Every weekday${at}`;
    case "week":
      return `Every ${list((s.days?.length ? s.days : [1]).map((d) => NAMES[d]))}${at}`;
    case "month":
      return `On the ${nth(s.dayOfMonth ?? 1)} of each month${at}`;
    case "once":
      return `Once, on ${s.date}${at}`;
  }
}

/** "Tue 27 Nov, 09:00", in the routine's time zone. */
export function when(ms: number, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
}

/* ---------------- making, running ---------------- */

/** What the routine's card shows (kept on it, so the board draws it without asking). */
const cardProps = (r: Pick<Doc<"routines">, "schedule" | "task" | "enabled" | "nextAt" | "lastAt" | "note">) => ({
  title: describe(r.schedule),
  body: r.task,
  enabled: r.enabled,
  nextAt: r.nextAt ?? null,
  next: r.nextAt ? when(r.nextAt, r.schedule.tz) : null,
  lastAt: r.lastAt ?? null,
  tz: r.schedule.tz,
  note: r.note ?? null,
});

async function patchCard(ctx: MutationCtx, r: Doc<"routines">) {
  const card = await ctx.db
    .query("items")
    .withIndex("by_board_cid", (q) => q.eq("boardId", r.boardId).eq("cid", r.cardCid))
    .unique();
  if (card) await ctx.db.patch(card._id, { props: { ...card.props, ...cardProps(r) }, updatedAt: Date.now() });
}

/** An agent sets up a routine (agent.ts): its card goes on the board beside `near`. */
export const create = internalMutation({
  args: { agentId: v.id("agents"), requestId: v.id("requests"), near: v.string(), task: v.string(), schedule: scheduleV },
  handler: async (ctx, { agentId, requestId, near, task, schedule }): Promise<{ ok: boolean; message: string; routineId?: Id<"routines"> }> => {
    const agent = await ctx.db.get(agentId);
    const request = await ctx.db.get(requestId);
    if (!agent || !request) return { ok: false, message: "This agent is gone." };
    if (!validZone(schedule.tz)) return { ok: false, message: `"${schedule.tz}" isn't a time zone. Use an IANA name, like Europe/London.` };
    const on = (
      await ctx.db
        .query("routines")
        .withIndex("by_board", (q) => q.eq("boardId", agent.boardId))
        .collect()
    ).filter((r) => r.enabled);
    if (on.length >= MAX_ON) return { ok: false, message: `This board already has ${MAX_ON} routines on. Pause or delete one first (list_routines).` };
    const nextAt = nextRun(schedule, Date.now());
    if (nextAt === null) return { ok: false, message: "That schedule never comes round: a one-off date in the past?" };

    // Its card, beside what asked for it.
    const all = await ctx.db
      .query("items")
      .withIndex("by_board", (q) => q.eq("boardId", agent.boardId))
      .collect();
    const base = all.find((it) => it.cid === near) ?? all.find((it) => it.cid === request.itemId);
    const size = { w: CARD_W, h: 230 + Math.ceil(task.length / 48) * 22 };
    const at = nearestFree(blocking(all), { x: (base ? base.x + base.w : 0) + 48, y: base?.y ?? 0, ...size });
    const cardCid = crypto.randomUUID();
    const routine = { boardId: agent.boardId, agentId, task: task.trim().slice(0, 2000), schedule, enabled: true, nextAt, cardCid, createdBy: request.by.startsWith("agent:") || request.by === "email" ? ((await ctx.db.get(agent.boardId))?.ownerId ?? request.by) : request.by, fails: 0, runs: 0, updatedAt: Date.now() };
    const routineId = await ctx.db.insert("routines", routine);
    await ctx.db.insert("items", {
      boardId: agent.boardId,
      cid: cardCid,
      kind: "card",
      ...at,
      ...size,
      z: Math.max(0, ...all.map((it) => it.z)) + 1,
      props: { agentId, agentName: agent.name, role: agent.role, color: agent.color, emoji: agent.emoji, requestId, at: Date.now(), type: "routine", routineId, ...cardProps({ ...routine, lastAt: undefined, note: undefined }) },
      createdBy: `agent:${agentId}`,
      updatedBy: `agent:${agentId}`,
      updatedAt: Date.now(),
    });
    return { ok: true, routineId, message: `Set up: ${describe(schedule)} (${schedule.tz}). The first run is ${when(nextAt, schedule.tz)}. Its card is on the board, where the team can pause it, run it now or delete it.` };
  },
});

/** A board's routines, for an agent (list_routines). */
export const ofBoard = internalQuery({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const rows = await ctx.db
      .query("routines")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    const agents = new Map((await ctx.db.query("agents").withIndex("by_board", (q) => q.eq("boardId", boardId)).collect()).map((a) => [a._id, a.name]));
    return rows.map((r) => ({ id: r._id, agent: agents.get(r.agentId) ?? "(gone)", task: r.task, schedule: `${describe(r.schedule)} (${r.schedule.tz})`, on: r.enabled, next: r.nextAt ? when(r.nextAt, r.schedule.tz) : null, note: r.note ?? null }));
  },
});

/** Starts what's due (crons.ts, every minute): each run a request to its agent, its work beside the card. */
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("routines")
      .withIndex("by_next", (q) => q.eq("enabled", true).lte("nextAt", now))
      .take(25);
    for (const r of due) {
      // Its card was deleted from the board: so is the routine.
      const card = await ctx.db
        .query("items")
        .withIndex("by_board_cid", (q) => q.eq("boardId", r.boardId).eq("cid", r.cardCid))
        .unique();
      if (!card) {
        await ctx.db.delete(r._id);
        continue;
      }
      const agent = await ctx.db.get(r.agentId);
      if (!agent) {
        await stop(ctx, r, "Paused: its agent was deleted.");
        continue;
      }
      const last = r.lastRequestId ? await ctx.db.get(r.lastRequestId) : null;
      // Runs that keep failing (no plan left, a broken site): it pauses, and says why on its card.
      const fails = last?.status === "failed" ? r.fails + 1 : 0;
      if (fails >= MAX_FAILS) {
        await stop(ctx, { ...r, fails }, `Paused after ${MAX_FAILS} failed runs in a row. Resume it once what's wrong is fixed.`);
        continue;
      }
      const nextAt = nextRun(r.schedule, now) ?? undefined;
      // Still on the last run (long work): this one's skipped.
      if (last && (last.status === "routing" || last.status === "working") && now - last.updatedAt < 60 * 60_000) {
        await ctx.db.patch(r._id, { nextAt, enabled: nextAt !== undefined, updatedAt: now });
        await patchCard(ctx, { ...r, nextAt, enabled: nextAt !== undefined });
        continue;
      }
      const requestId = await start(ctx, r, agent);
      const next = { ...r, nextAt, enabled: nextAt !== undefined, lastAt: now, lastRequestId: requestId, runs: r.runs + 1, fails, note: nextAt === undefined ? "Done: that was its only run." : undefined, updatedAt: now };
      await ctx.db.replace(r._id, next);
      await patchCard(ctx, { ...r, ...next });
    }
  },
});

/** A run: a request to the routine's agent, written on its card. */
async function start(ctx: MutationCtx, r: Doc<"routines">, agent: Doc<"agents">) {
  const requestId = await ctx.db.insert("requests", {
    boardId: r.boardId,
    itemId: r.cardCid,
    text: r.task,
    by: r.createdBy,
    byName: "Routine",
    status: "working",
    agentId: agent._id,
    note: "Routine",
    routineId: r._id,
    tz: r.schedule.tz,
    updatedAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.agent.run, { requestId });
  return requestId;
}

async function stop(ctx: MutationCtx, r: Doc<"routines">, note: string) {
  const next = { ...r, enabled: false, note, updatedAt: Date.now() };
  await ctx.db.replace(r._id, next);
  await patchCard(ctx, next);
}

/* ---------------- for people, on its card ---------------- */

async function mine(ctx: MutationCtx, boardId: Id<"boards">, routineId: Id<"routines">) {
  await requireMember(ctx, boardId);
  const r = await ctx.db.get(routineId);
  if (!r || r.boardId !== boardId) throw new ConvexError("That routine is gone");
  return r;
}

export const setEnabled = mutation({
  args: { boardId: v.id("boards"), routineId: v.id("routines"), enabled: v.boolean() },
  handler: async (ctx, { boardId, routineId, enabled }) => {
    const r = await mine(ctx, boardId, routineId);
    if (enabled && !r.enabled) {
      const on = (await ctx.db.query("routines").withIndex("by_board", (q) => q.eq("boardId", boardId)).collect()).filter((x) => x.enabled);
      if (on.length >= MAX_ON) throw new ConvexError(`A board can have ${MAX_ON} routines on at once`);
    }
    const nextAt = enabled ? (nextRun(r.schedule, Date.now()) ?? undefined) : r.nextAt;
    if (enabled && nextAt === undefined) throw new ConvexError("That one-off date has passed");
    const next = { ...r, enabled, nextAt, fails: 0, note: undefined, updatedAt: Date.now() };
    await ctx.db.replace(r._id, next);
    await patchCard(ctx, next);
  },
});

export const runNow = mutation({
  args: { boardId: v.id("boards"), routineId: v.id("routines") },
  handler: async (ctx, { boardId, routineId }) => {
    const r = await mine(ctx, boardId, routineId);
    const agent = await ctx.db.get(r.agentId);
    if (!agent) throw new ConvexError("Its agent was deleted");
    const last = r.lastRequestId ? await ctx.db.get(r.lastRequestId) : null;
    if (last && (last.status === "routing" || last.status === "working")) throw new ConvexError(`${agent.name} is still on the last run`);
    const requestId = await start(ctx, r, agent);
    const next = { ...r, lastAt: Date.now(), lastRequestId: requestId, runs: r.runs + 1, updatedAt: Date.now() };
    await ctx.db.replace(r._id, next);
    await patchCard(ctx, next);
  },
});

/** Deletes a routine, and its card. */
export const remove = mutation({
  args: { boardId: v.id("boards"), routineId: v.id("routines") },
  handler: async (ctx, { boardId, routineId }) => {
    const r = await mine(ctx, boardId, routineId);
    const card = await ctx.db
      .query("items")
      .withIndex("by_board_cid", (q) => q.eq("boardId", boardId).eq("cid", r.cardCid))
      .unique();
    if (card) await ctx.db.delete(card._id);
    await ctx.db.delete(r._id);
  },
});

/** An agent cancels a routine (cancel_routine): it's paused, its card stays for the team to delete. */
export const cancel = internalMutation({
  args: { boardId: v.id("boards"), routineId: v.string() },
  handler: async (ctx, { boardId, routineId }): Promise<string> => {
    const id = ctx.db.normalizeId("routines", routineId);
    const r = id ? await ctx.db.get(id) : null;
    if (!r || r.boardId !== boardId) return "There's no routine with that id on this board (list_routines).";
    await stop(ctx, r, "Paused by its agent.");
    return `Paused: ${describe(r.schedule)}, "${r.task.slice(0, 80)}". Its card stays on the board for the team to resume or delete.`;
  },
});

/** One routine, for its run (agent.ts). */
export const get = internalQuery({
  args: { routineId: v.id("routines") },
  handler: async (ctx, { routineId }) => {
    const r = await ctx.db.get(routineId);
    return r ? { schedule: describe(r.schedule), tz: r.schedule.tz, runs: r.runs } : null;
  },
});
