import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { nearestFree } from "./brain";

/**
 * Agents keeping the board in order (agent.ts: look_at_board, tidy_board,
 * move_items, delete_items). An agent sees the board as threads: what someone
 * wrote, the replies to it and the work that came of it, which move as one.
 * It decides what goes together; the geometry is done here, so it's neat.
 */

type Box = { x: number; y: number; w: number; h: number };
type It = Doc<"items">;

/** What an agent calls an item: the start of its id. */
const short = (cid: string) => cid.slice(0, 8);
const GAP = 48;
const GROUP_GAP = 160;
/** A section's padding round what's in it. */
const PAD = 48;
/** How wide a row of threads in a group, or of groups, gets before wrapping. */
const ROW_W = 2400;
const GROUPS_W = 7000;
/** Kinds that are part of the board's content (not lines, frames or the computer). */
const movable = (it: It) => it.kind !== "connector" && it.kind !== "section" && it.kind !== "screen";

async function board(ctx: QueryCtx, boardId: Id<"boards">) {
  const all = await ctx.db
    .query("items")
    .withIndex("by_board", (q) => q.eq("boardId", boardId))
    .collect();
  const requests = await ctx.db
    .query("requests")
    .withIndex("by_board", (q) => q.eq("boardId", boardId))
    .collect();
  return { all, threads: threads(all, requests) };
}

/**
 * The board's items in threads: each request's message with its replies and
 * cards (and a hand-off's, under the reply it came from), stamps with what
 * they're on, and everything else on its own. Threads come in board order.
 */
export function threads(all: It[], requests: Doc<"requests">[]): It[][] {
  const items = all.filter(movable);
  const byCid = new Map(items.map((it) => [it.cid, it]));
  const parent = new Map<string, string>();
  const find = (c: string): string => {
    let p = parent.get(c) ?? c;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(c, p);
    return p;
  };
  const join = (a: string, b: string) => {
    if (byCid.has(a) && byCid.has(b)) parent.set(find(a), find(b));
  };
  const source = new Map(requests.map((r) => [r._id as string, r.itemId]));
  for (const it of items) {
    const rid = (it.props as { requestId?: string } | undefined)?.requestId;
    const src = rid ? source.get(rid) : undefined;
    if (src) join(it.cid, src);
  }
  for (const st of items.filter((it) => it.kind === "stamp")) {
    const c = { x: st.x + st.w / 2, y: st.y + st.h / 2 };
    const on = items.find((it) => it.kind !== "stamp" && c.x >= it.x && c.x <= it.x + it.w && c.y >= it.y && c.y <= it.y + it.h);
    if (on) join(st.cid, on.cid);
  }
  const groups = new Map<string, It[]>();
  for (const it of [...items].sort((a, b) => a._creationTime - b._creationTime)) {
    const k = find(it.cid);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  return [...groups.values()];
}

const textOf = (it: It) => {
  const p = (it.props ?? {}) as { text?: string; title?: string; body?: string; emoji?: string };
  return String(p.title ? `${p.title}: ${p.body ?? ""}` : p.text ?? p.emoji ?? "").replace(/\s+/g, " ").trim();
};
const whoOf = (it: It) => {
  const p = (it.props ?? {}) as { agentName?: string; author?: string };
  return p.agentName ?? p.author;
};
const label = (it: It) => {
  const p = (it.props ?? {}) as { type?: string };
  const kind = it.kind === "card" ? `${p.type ?? "note"} card` : it.kind;
  const who = whoOf(it);
  const t = textOf(it);
  return `[${short(it.cid)}] ${kind}${who ? ` by ${who}` : ""}${t ? `: "${t.slice(0, 110)}${t.length > 110 ? "…" : ""}"` : ""}`;
};
const inside = (b: Box, it: { x: number; y: number; w: number; h: number }) => {
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
};

/** The board as an agent reads it: sections, then threads, with ids to name them by. */
export const snapshot = internalQuery({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const { all, threads: ts } = await board(ctx, boardId);
    const sections = all.filter((it) => it.kind === "section");
    const where = (it: It) => sections.find((s) => inside(s, it));
    const lines: string[] = [];
    if (sections.length) lines.push(`Sections: ${sections.map((s) => `[${short(s.cid)}] "${(s.props as { title?: string }).title ?? "Section"}"`).join(", ")}`);
    const screen = all.find((it) => it.kind === "screen");
    if (screen) lines.push(`The computer's screen is at (${Math.round(screen.x)}, ${Math.round(screen.y)}), ${screen.w}×${screen.h}: tidying leaves it where it is.`);
    lines.push(`${ts.length} threads (a message, then the replies and work it got; they move together):`);
    for (const t of ts) {
      const [head, ...rest] = t;
      const s = where(head);
      lines.push(`- ${label(head)} at (${Math.round(head.x)}, ${Math.round(head.y)})${s ? ` in "${(s.props as { title?: string }).title ?? "Section"}"` : ""}`);
      for (const it of rest.slice(0, 8)) lines.push(`    ${label(it)}`);
      if (rest.length > 8) lines.push(`    and ${rest.length - 8} more`);
    }
    const text = lines.join("\n");
    return text.length > 16000 ? `${text.slice(0, 16000)}\n(and more: the board is big)` : text;
  },
});

/** A thread packed neatly: messages and replies down the left, in order; its cards in columns to the right. */
function pack(t: It[]): { w: number; h: number; at: Map<string, { x: number; y: number }> } {
  const at = new Map<string, { x: number; y: number }>();
  if (t.length === 1) {
    at.set(t[0].cid, { x: 0, y: 0 });
    return { w: t[0].w, h: t[0].h, at };
  }
  const stamps = t.filter((it) => it.kind === "stamp");
  const cards = t.filter((it) => it.kind === "card");
  const talk = t.filter((it) => it.kind !== "stamp" && it.kind !== "card");
  let y = 0;
  let leftW = 0;
  for (const it of talk) {
    at.set(it.cid, { x: 0, y });
    y += it.h + 18;
    leftW = Math.max(leftW, it.w);
  }
  const leftH = Math.max(0, y - 18);
  const colH = Math.max(leftH, 1300);
  let x = talk.length ? leftW + GAP : 0;
  let cy = 0;
  let colW = 0;
  let w = leftW;
  let h = leftH;
  for (const c of cards) {
    if (cy > 0 && cy + c.h > colH) {
      x += colW + 24;
      cy = 0;
      colW = 0;
    }
    at.set(c.cid, { x, y: cy });
    cy += c.h + 24;
    colW = Math.max(colW, c.w);
    w = Math.max(w, x + c.w);
    h = Math.max(h, cy - 24);
  }
  // Stamps stay where they were on what they're stuck to.
  for (const st of stamps) {
    const on = t.find((it) => it.kind !== "stamp" && inside(it, st));
    const base = on ? at.get(on.cid) : undefined;
    if (on && base) at.set(st.cid, { x: base.x + (st.x - on.x), y: base.y + (st.y - on.y) });
    else {
      at.set(st.cid, { x: w + 12, y: 0 });
      w += st.w + 12;
    }
  }
  return { w, h, at };
}

/** Boxes laid out in rows, left to right, wrapping at `maxW`. */
function flow(sizes: { w: number; h: number }[], maxW: number, gap: number) {
  const at: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let w = 0;
  for (const s of sizes) {
    if (x > 0 && x + s.w > maxW) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    at.push({ x, y });
    x += s.w + gap;
    rowH = Math.max(rowH, s.h);
    w = Math.max(w, x - gap);
  }
  return { at, w, h: y + rowH };
}

const groupV = v.object({ title: v.string(), ids: v.array(v.string()) });

/**
 * Lays the board out again: each group in its own section (titled), threads
 * packed and in rows, groups side by side; what's in no group after them
 * (or left where it is, with `keepRest`). Sections it empties go.
 */
export const tidy = internalMutation({
  args: { boardId: v.id("boards"), groups: v.array(groupV), keepRest: v.optional(v.boolean()) },
  handler: async (ctx, { boardId, groups, keepRest }) => {
    const { all, threads: ts } = await board(ctx, boardId);
    const threadOf = new Map<string, number>();
    ts.forEach((t, i) => t.forEach((it) => threadOf.set(it.cid, i)));
    const resolve = (id: string) => {
      const k = id.trim().replace(/^\[|\]$/g, "").toLowerCase();
      if (k.length < 4) return undefined;
      return all.find((it) => it.cid.toLowerCase().startsWith(k));
    };

    // Which threads go in which group (a thread goes where it's first named).
    const taken = new Set<number>();
    const unknown: string[] = [];
    const plan: { title: string; threads: number[] }[] = [];
    for (const g of groups.slice(0, 24)) {
      const mine: number[] = [];
      for (const id of g.ids) {
        const it = resolve(id);
        const i = it ? threadOf.get(it.cid) : undefined;
        if (i === undefined) {
          if (!it) unknown.push(id);
          continue;
        }
        if (taken.has(i)) continue;
        taken.add(i);
        mine.push(i);
      }
      if (mine.length) plan.push({ title: g.title.trim().slice(0, 80), threads: mine.sort((a, b) => a - b) });
    }
    const rest = ts.map((_, i) => i).filter((i) => !taken.has(i));
    if (!keepRest && rest.length) plan.push({ title: "", threads: rest });
    if (!plan.length) return { moved: 0, sections: 0, unknown, at: null };

    // Each group: its threads packed, in rows; a section round it when it has a title.
    const packed = ts.map(pack);
    const blocks = plan.map((g) => {
      const sizes = g.threads.map((i) => packed[i]);
      const area = sizes.reduce((a, s) => a + (s.w + GAP) * (s.h + GAP), 0);
      const rowW = Math.min(ROW_W, Math.max(900, Math.sqrt(area) * 1.5));
      const f = flow(sizes, rowW, GAP);
      const pad = g.title ? PAD : 0;
      return { ...g, f, pad, w: f.w + pad * 2, h: f.h + pad * 2 };
    });
    // Groups side by side; a section's title sits above it, so leave room for that.
    const groupsFlow = flow(
      blocks.map((b) => ({ w: b.w, h: b.h + (b.title ? 44 : 0) })),
      GROUPS_W,
      GROUP_GAP,
    );

    // Where it all goes: where the board's content starts, clear of whatever stays put.
    const moving = new Set(plan.flatMap((g) => g.threads.flatMap((i) => ts[i].map((it) => it.cid))));
    const content = all.filter((it) => moving.has(it.cid));
    const minX = Math.min(...content.map((it) => it.x));
    const minY = Math.min(...content.map((it) => it.y));
    const reused = new Set<string>();
    const oldSections = all.filter((it) => it.kind === "section");
    const staying = all.filter((it) => it.kind !== "connector" && it.kind !== "section" && !moving.has(it.cid));
    const origin = nearestFree(
      staying.map((it) => ({ x: it.x, y: it.y, w: it.w, h: it.h })),
      { x: minX, y: minY + 44, w: groupsFlow.w, h: groupsFlow.h },
    );

    const now = Date.now();
    let sectionsMade = 0;
    const finalBoxes: Box[] = [];
    for (const [gi, b] of blocks.entries()) {
      const gx = origin.x + groupsFlow.at[gi].x;
      const gy = origin.y + groupsFlow.at[gi].y + (b.title ? 44 : 0);
      for (const [ti, i] of b.threads.entries()) {
        const tx = gx + b.pad + b.f.at[ti].x;
        const ty = gy + b.pad + b.f.at[ti].y;
        for (const it of ts[i]) {
          const p = packed[i].at.get(it.cid) ?? { x: 0, y: 0 };
          const x = Math.round(tx + p.x);
          const y = Math.round(ty + p.y);
          if (x !== it.x || y !== it.y) await ctx.db.patch(it._id, { x, y, updatedBy: "pompi", updatedAt: now });
          finalBoxes.push({ x, y, w: it.w, h: it.h });
        }
      }
      if (!b.title) continue;
      const box = { x: gx, y: gy, w: Math.round(b.w), h: Math.round(b.h) };
      const same = oldSections.find((s) => !reused.has(s.cid) && String((s.props as { title?: string }).title ?? "").trim().toLowerCase() === b.title.toLowerCase());
      if (same) {
        reused.add(same.cid);
        await ctx.db.patch(same._id, { ...box, updatedBy: "pompi", updatedAt: now });
      } else {
        const colors = ["blue", "violet", "green", "orange", "pink", "teal", "yellow", "gray"];
        await ctx.db.insert("items", { boardId, cid: crypto.randomUUID(), kind: "section", ...box, z: 0, props: { title: b.title, color: colors[sectionsMade % colors.length] }, createdBy: "pompi", updatedBy: "pompi", updatedAt: now });
      }
      sectionsMade++;
    }
    // Sections that held some of what moved, and now hold nothing, go.
    for (const s of oldSections) {
      if (reused.has(s.cid)) continue;
      const had = content.some((it) => inside(s, it));
      const has = finalBoxes.some((b) => inside(s, b)) || staying.some((it) => inside(s, it));
      if (had && !has) await ctx.db.delete(s._id);
    }
    await ctx.db.patch(boardId, { updatedAt: now });
    const at = { x: origin.x, y: origin.y };
    return { moved: content.length, sections: sectionsMade, unknown, at };
  },
});

/** Moves items (with their threads, keeping their shape) so each named one's top-left lands where it's asked. */
export const move = internalMutation({
  args: { boardId: v.id("boards"), moves: v.array(v.object({ id: v.string(), x: v.number(), y: v.number() })) },
  handler: async (ctx, { boardId, moves }) => {
    const { all, threads: ts } = await board(ctx, boardId);
    const now = Date.now();
    const done = new Set<string>();
    const unknown: string[] = [];
    for (const m of moves.slice(0, 200)) {
      const k = m.id.trim().replace(/^\[|\]$/g, "").toLowerCase();
      const it = k.length >= 4 ? all.find((x) => x.cid.toLowerCase().startsWith(k)) : undefined;
      if (!it) {
        unknown.push(m.id);
        continue;
      }
      const dx = Math.round(m.x - it.x);
      const dy = Math.round(m.y - it.y);
      // A section takes what's in it along; anything else takes its thread.
      const along = it.kind === "section" ? all.filter((x) => x.kind !== "connector" && x.cid !== it.cid && inside(it, x)) : (ts.find((t) => t.some((x) => x.cid === it.cid)) ?? []).filter((x) => x.cid !== it.cid);
      for (const x of [it, ...along]) {
        if (done.has(x.cid)) continue;
        done.add(x.cid);
        await ctx.db.patch(x._id, { x: x.x + dx, y: x.y + dy, updatedBy: "pompi", updatedAt: now });
      }
    }
    await ctx.db.patch(boardId, { updatedAt: now });
    return { moved: done.size, unknown };
  },
});

/** What deleting these would take away (for the team's OK), by id. */
export const describe = internalQuery({
  args: { boardId: v.id("boards"), ids: v.array(v.string()) },
  handler: async (ctx, { boardId, ids }) => {
    const all = await ctx.db
      .query("items")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    const found = ids.map((id) => all.find((it) => id.trim().length >= 4 && it.cid.toLowerCase().startsWith(id.trim().replace(/^\[|\]$/g, "").toLowerCase()))).filter((it): it is It => !!it && it.kind !== "screen");
    return found.map((it) => ({ cid: it.cid, label: label(it).replace(/^\[[^\]]+\] /, "") }));
  },
});

export const remove = internalMutation({
  args: { boardId: v.id("boards"), cids: v.array(v.string()) },
  handler: async (ctx, { boardId, cids }) => {
    let n = 0;
    for (const cid of cids.slice(0, 200)) {
      const it = await ctx.db
        .query("items")
        .withIndex("by_board_cid", (q) => q.eq("boardId", boardId).eq("cid", cid))
        .unique();
      if (!it || it.kind === "screen") continue;
      await ctx.db.delete(it._id);
      n++;
    }
    await ctx.db.patch(boardId, { updatedAt: Date.now() });
    return n;
  },
});
