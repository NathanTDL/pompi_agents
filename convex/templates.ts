/** Starting boards: what a new board from each template has on it. Positions are in world units. */

type Seed = { kind: "sticky" | "text" | "shape" | "section" | "connector"; x: number; y: number; w: number; h: number; props: Record<string, unknown> };

export const TEMPLATES = ["blank", "brainstorm", "launch", "retro"] as const;
export type Template = (typeof TEMPLATES)[number];

export const TEMPLATE_NAMES: Record<Template, string> = {
  blank: "Untitled board",
  brainstorm: "Brainstorm",
  launch: "Launch plan",
  retro: "Team retro",
};

const sticky = (x: number, y: number, text: string, color: string, author: string): Seed => ({ kind: "sticky", x, y, w: 220, h: 220, props: { text, color, author } });
const section = (x: number, y: number, w: number, h: number, title: string, color: string): Seed => ({ kind: "section", x, y, w, h, props: { title, color } });
const text = (x: number, y: number, t: string, size: "s" | "m" | "l" | "xl" = "m", bold = false): Seed => ({ kind: "text", x, y, w: Math.max(40, t.length * (size === "xl" ? 34 : size === "l" ? 22 : 13)), h: size === "xl" ? 84 : size === "l" ? 52 : 32, props: { text: t, size, bold } });

export function templateItems(template: Template, author: string): Seed[] {
  switch (template) {
    case "brainstorm":
      return [
        text(0, -140, "What should we build next?", "xl", true),
        text(0, -54, "Write ideas on stickies (S), then group them into sections (Shift+S).", "s"),
        section(0, 0, 740, 520, "Ideas", "yellow"),
        sticky(40, 60, "", "yellow", author),
        sticky(280, 60, "", "yellow", author),
        sticky(520, 60, "", "yellow", author),
        section(800, 0, 500, 520, "Favourites", "violet"),
        sticky(840, 60, "", "violet", author),
      ];
    case "launch":
      return [
        text(0, -140, "Launch plan", "xl", true),
        text(0, -54, "Who, what and when for launch day.", "s"),
        section(0, 0, 520, 560, "Goals", "green"),
        sticky(40, 60, "What does a great launch look like?", "green", author),
        sticky(40, 300, "Who is it for?", "teal", author),
        section(580, 0, 520, 560, "Launch copy", "pink"),
        sticky(620, 60, "The one-line pitch", "pink", author),
        section(1160, 0, 520, 560, "Website", "blue"),
        sticky(1200, 60, "What the landing page must say", "blue", author),
        section(1740, 0, 420, 560, "Inbox", "gray"),
        text(1780, 70, "Emails to your agents land here.", "s"),
      ];
    case "retro":
      return [
        text(0, -140, "Team retro", "xl", true),
        section(0, 0, 520, 620, "Went well", "green"),
        section(580, 0, 520, 620, "To improve", "orange"),
        section(1160, 0, 520, 620, "Action items", "violet"),
        sticky(40, 60, "", "green", author),
        sticky(620, 60, "", "orange", author),
        sticky(1200, 60, "", "violet", author),
      ];
    default:
      return [];
  }
}
