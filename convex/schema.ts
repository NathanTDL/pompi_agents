import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Pompi's data. Users and sessions live in the Better Auth component
 * (convex/betterAuth); `userId` everywhere here is the auth user's id
 * (the JWT subject).
 */

/** What kinds of things can sit on a canvas. */
export const itemKind = v.union(
  v.literal("sticky"),
  v.literal("text"),
  v.literal("shape"),
  v.literal("section"),
  v.literal("connector"),
  v.literal("stamp"),
  /** An agent's answer, beside what it answers. */
  v.literal("reply"),
  /** Work an agent made: a post, a note. */
  v.literal("card"),
  /** The board computer's screen, live. */
  v.literal("screen"),
);

export default defineSchema({
  boards: defineTable({
    name: v.string(),
    ownerId: v.string(),
    /** Anyone signed in with this code can join the board (the share link). */
    inviteCode: v.string(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_invite", ["inviteCode"]),

  boardMembers: defineTable({
    boardId: v.id("boards"),
    userId: v.string(),
    role: v.union(v.literal("owner"), v.literal("editor")),
    /** When this person last opened the board: the board list is sorted by it. */
    lastOpenedAt: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_user", ["userId", "lastOpenedAt"])
    .index("by_board_user", ["boardId", "userId"]),

  /**
   * Everything on a canvas. Geometry is in world units (the canvas at zoom 1).
   * `z` orders items front to back; `props` holds what each kind needs
   * (its text, colour, shape, the ends of a connector), typed in src/lib/canvas/types.ts.
   */
  items: defineTable({
    boardId: v.id("boards"),
    /** The id the client gave it: it can draw, edit and undo an item before the server has seen it. */
    cid: v.string(),
    kind: itemKind,
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    z: v.number(),
    props: v.any(),
    createdBy: v.string(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_board_cid", ["boardId", "cid"]),

  /**
   * An AI teammate on a board. `tools` are the apps (Composio toolkits) it may
   * use; `handle` is the local part of its email address.
   */
  agents: defineTable({
    boardId: v.id("boards"),
    name: v.string(),
    role: v.string(),
    color: v.string(),
    emoji: v.string(),
    instructions: v.string(),
    tools: v.array(v.string()),
    handle: v.string(),
    /** Its own email address (an AgentMail inbox; the address is the inbox's id). */
    email: v.optional(v.string()),
    /** Why it has no address, when making one failed (e.g. the plan's inbox limit). */
    emailError: v.optional(v.string()),
    /** Its inbox is being made (it counts toward the plan's agents with email meanwhile). */
    emailPending: v.optional(v.boolean()),
    createdBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_email", ["email"]),

  /**
   * The board's computer (one Orgo computer, shared by all its agents). `busy`:
   * the request using it now; one at a time, the rest wait their turn.
   */
  /** What each person's agents used in a month (billing.ts): it starts over each month. */
  usage: defineTable({
    userId: v.string(),
    /** "2026-11" (UTC). */
    month: v.string(),
    answers: v.number(),
    computerTasks: v.number(),
  }).index("by_user_month", ["userId", "month"]),

  /** People's Polar subscriptions (billing.ts), as its webhook reports them. */
  subscriptions: defineTable({
    userId: v.string(),
    polarId: v.string(),
    customerId: v.string(),
    productId: v.string(),
    /** Polar's: "active", "trialing", "past_due", "canceled", "unpaid"… */
    status: v.string(),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_polar", ["polarId"]),

  computers: defineTable({
    /** Whose computer it is (a board's agents use its owner's). */
    userId: v.optional(v.string()),
    /** Before computers were people's: the board it was for (computer.adoptBoardComputers moves these over). */
    boardId: v.optional(v.id("boards")),
    orgoId: v.optional(v.string()),
    status: v.union(v.literal("off"), v.literal("starting"), v.literal("on"), v.literal("stopping"), v.literal("error")),
    error: v.optional(v.string()),
    busy: v.optional(
      v.object({
        requestId: v.id("requests"),
        agentId: v.id("agents"),
        /** The board that agent is on. */
        boardId: v.optional(v.id("boards")),
        doing: v.string(),
        since: v.number(),
        /** The agent's latest action on the screen (a click, a scroll, typing…), drawn over it so everyone sees it happen. */
        step: v.optional(v.object({ kind: v.string(), x: v.optional(v.number()), y: v.optional(v.number()), dir: v.optional(v.string()), at: v.number() })),
      }),
    ),
    lastUsedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_last_used", ["lastUsedAt"])
    .index("by_board", ["boardId"])
    .index("by_status", ["status", "lastUsedAt"]),

  /** Where each agent's cursor is on its board, and what it's doing (the canvas draws it walking over). */
  agentStates: defineTable({
    boardId: v.id("boards"),
    agentId: v.id("agents"),
    x: v.number(),
    y: v.number(),
    status: v.union(v.literal("idle"), v.literal("walking"), v.literal("thinking"), v.literal("writing")),
    /** What it's on, in a few words ("Writing the launch post"). */
    doing: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_agent", ["agentId"]),

  /**
   * Something someone wrote on the board, and what came of it: which agent it
   * was for (the judge's pick), and how the agent's answer went.
   */
  requests: defineTable({
    boardId: v.id("boards"),
    itemId: v.string(),
    text: v.string(),
    by: v.string(),
    byName: v.string(),
    status: v.union(v.literal("routing"), v.literal("working"), v.literal("done"), v.literal("ignored"), v.literal("failed"), v.literal("stopped")),
    agentId: v.optional(v.id("agents")),
    /** Why the judge picked it, or why it failed. */
    note: v.optional(v.string()),
    /** When a teammate handed it over: who, and how many hand-offs deep (a chain stops at MAX_DEPTH, brain.ts). */
    from: v.optional(v.object({ agentId: v.id("agents"), depth: v.number() })),
    /** When it came in as an email to one of the board's agents. */
    email: v.optional(v.object({ inbox: v.string(), messageId: v.string(), from: v.string(), subject: v.string() })),
    updatedAt: v.number(),
  })
    .index("by_board", ["boardId", "updatedAt"])
    .index("by_item", ["boardId", "itemId"])
    .index("by_email", ["email.messageId"]),

  /** Who's on a board right now, and where their cursor is. One row per open tab. */
  presence: defineTable({
    boardId: v.id("boards"),
    sessionId: v.string(),
    userId: v.string(),
    name: v.string(),
    image: v.optional(v.string()),
    color: v.string(),
    cursor: v.optional(v.object({ x: v.number(), y: v.number() })),
    selection: v.array(v.string()),
    lastSeen: v.number(),
  })
    .index("by_board_session", ["boardId", "sessionId"])
    .index("by_board_seen", ["boardId", "lastSeen"]),
});
