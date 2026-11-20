/** What's on a canvas, as the client works with it. Geometry is in world units. */

export type Kind = "sticky" | "text" | "shape" | "section" | "connector" | "stamp" | "reply" | "card" | "screen";

export type Item = {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  updatedBy?: string;
  updatedAt?: number;
};

export type StickyProps = { text: string; color: ColorName; author?: string };
export type TextSize = "s" | "m" | "l" | "xl";
export type TextProps = { text: string; size: TextSize; color?: ColorName; bold?: boolean };
export type ShapeKind = "rect" | "ellipse" | "diamond" | "triangle";
export type ShapeProps = { shape: ShapeKind; color: ColorName; text: string };
export type SectionProps = { title: string; color: ColorName };
export type StampProps = { emoji: string };
/** One end of a connector: stuck to an item (it follows it), else a free point. */
export type End = { id?: string; x: number; y: number };
/** Who made an agent's reply or card. `at`: when (it types itself out if that was just now). */
export type AgentMark = { agentId: string; agentName: string; role: string; color: string; emoji: string; requestId: string; at: number };
export type ReplyProps = AgentMark & { text: string; failed?: boolean; /** Teammates it handed part of the work to. */ handoffs?: { agentId: string; name: string; color: string; emoji: string }[] };
export type CardProps = AgentMark & {
  type: "post" | "note" | "email";
  title: string;
  body: string;
  /** Emails: who it's from (one that came in) or to (an agent's draft), and whether a draft went out. */
  from?: string;
  to?: string;
  draft?: boolean;
  sent?: boolean;
};
export type ConnectorProps = { from: End; to: End; color: ColorName; arrowStart?: boolean; arrowEnd?: boolean; curved?: boolean };

export type Tool = "select" | "hand" | "sticky" | "text" | "shape" | "connector" | "section" | "stamp";

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
/** Screen = world × z + (x, y). */
export type Camera = { x: number; y: number; z: number };

/**
 * The palette, after FigJam's: soft stickies, a clear stroke for lines and
 * text. `fill` is a sticky or shape; `section` a section's tint; `ink` text
 * and lines.
 */
export const COLORS = {
  gray: { fill: "#E6E6E6", section: "#F5F5F5", ink: "#757575" },
  yellow: { fill: "#FFE48C", section: "#FFF8DC", ink: "#B88A00" },
  orange: { fill: "#FFC98F", section: "#FFF0E0", ink: "#E06C00" },
  red: { fill: "#FFAFA3", section: "#FFE9E6", ink: "#E03E2D" },
  pink: { fill: "#FFBDF2", section: "#FFEDFB", ink: "#D2369F" },
  violet: { fill: "#D3BDFF", section: "#F1EBFF", ink: "#7B4DFF" },
  blue: { fill: "#A6D9FF", section: "#E8F5FF", ink: "#0D8BE0" },
  teal: { fill: "#A0EDE5", section: "#E5FAF7", ink: "#0FA394" },
  green: { fill: "#B3EFBD", section: "#E8FAEB", ink: "#14AE5C" },
  black: { fill: "#2C2C2C", section: "#EDEDED", ink: "#1E1E1E" },
  white: { fill: "#FFFFFF", section: "#FFFFFF", ink: "#B3B3B3" },
} as const;
export type ColorName = keyof typeof COLORS;
export const COLOR_NAMES = Object.keys(COLORS) as ColorName[];
/** Colours offered for each kind, in the order the colour picker shows them. */
export const STICKY_COLORS: ColorName[] = ["yellow", "orange", "red", "pink", "violet", "blue", "teal", "green", "gray", "white"];
export const INK_COLORS: ColorName[] = ["black", "gray", "red", "orange", "yellow", "green", "teal", "blue", "violet", "pink"];

export const color = (name: unknown, fallback: ColorName = "yellow") => COLORS[(typeof name === "string" && name in COLORS ? name : fallback) as ColorName];

export const TEXT_SIZES: Record<TextSize, number> = { s: 16, m: 24, l: 40, xl: 64 };

export const STAMPS = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "✅", "❓", "⭐", "💡"];

export const STICKY_SIZE = 220;
