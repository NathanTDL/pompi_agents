"use client";

import * as React from "react";
import type { Id } from "@/convex/_generated/dataModel";

export type ComputerState = { status: "off" | "starting" | "on" | "stopping" | "error"; error?: string; busy: { agentId: Id<"agents">; doing: string; step?: ComputerStep } | null;
  /** An agent from another of the owner's boards has it. */
  elsewhere: boolean;
  /** It's yours (the board's owner): you can use it, not only watch. */
  mine: boolean;
  configured: boolean;
};
/** An agent's latest action on the computer's screen (convex/computer.ts step), in screen pixels. */
export type ComputerStep = { kind: string; x?: number; y?: number; dir?: string; at: number };
export type AgentLite = { _id: Id<"agents">; name: string; role: string; color: string; emoji: string };

/** What items on the canvas need from the board beyond their own data: the computer, the agents, and the actions they offer. */
export type BoardInfo = {
  boardId: Id<"boards">;
  computer: ComputerState | undefined;
  agents: AgentLite[];
  startComputer: () => void;
  stopComputer: () => void;
  answerAsk: (itemId: string, approve: boolean) => void;
};

const Ctx = React.createContext<BoardInfo | null>(null);

export const BoardInfoProvider = Ctx.Provider;

export function useBoardInfo() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useBoardInfo outside a board");
  return v;
}
