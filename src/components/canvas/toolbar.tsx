"use client";

import * as React from "react";
import { Circle, Diamond, Hand, LoaderCircle, Mic, MousePointer2, MoveUpRight, Smile, Square, SquareDashed, Triangle, Type } from "lucide-react";
import { color, STAMPS, STICKY_COLORS, type ColorName, type ShapeKind, type Tool } from "@/lib/canvas/types";

export type ToolOptions = { stickyColor: ColorName; shape: ShapeKind; stamp: string };

const SHAPES: { shape: ShapeKind; icon: React.ElementType; label: string; keys?: string }[] = [
  { shape: "rect", icon: Square, label: "Rectangle", keys: "R" },
  { shape: "ellipse", icon: Circle, label: "Ellipse", keys: "O" },
  { shape: "diamond", icon: Diamond, label: "Diamond" },
  { shape: "triangle", icon: Triangle, label: "Triangle" },
];

/** FigJam's bottom toolbar: the tools, with a tray above for the active tool's options. */
export function Toolbar({
  tool,
  setTool,
  options,
  setOptions,
  voice,
  onVoice,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  options: ToolOptions;
  setOptions: (o: Partial<ToolOptions>) => void;
  /** Talking to the board: what the mic is doing, and its button. */
  voice: "idle" | "listening" | "thinking";
  onVoice: () => void;
}) {
  const ShapeIcon = SHAPES.find((s) => s.shape === options.shape)?.icon ?? Square;
  const others = STICKY_COLORS.filter((c) => c !== options.stickyColor);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex flex-col items-center gap-2.5" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      {tool === "sticky" ? (
        <Tray>
          {STICKY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c[0].toUpperCase() + c.slice(1)}
              onClick={() => setOptions({ stickyColor: c })}
              className={`size-7 rounded-[6px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] transition-transform hover:scale-110 ${options.stickyColor === c ? "ring-2 ring-[#0D99FF] ring-offset-2" : ""}`}
              style={{ background: color(c).fill }}
            />
          ))}
        </Tray>
      ) : tool === "shape" ? (
        <Tray>
          {SHAPES.map(({ shape, icon: Icon, label }) => (
            <TrayButton key={shape} active={options.shape === shape} onClick={() => setOptions({ shape })} label={label}>
              <Icon className="size-[18px]" />
            </TrayButton>
          ))}
        </Tray>
      ) : tool === "stamp" ? (
        <Tray>
          {STAMPS.map((emoji) => (
            <TrayButton key={emoji} active={options.stamp === emoji} onClick={() => setOptions({ stamp: emoji })} label={emoji}>
              <span className="text-[20px] leading-none">{emoji}</span>
            </TrayButton>
          ))}
        </Tray>
      ) : null}

      <div className="pointer-events-auto flex items-center gap-0.5 rounded-[18px] bg-white px-1.5 py-1.5 shadow-[0_0_0_1px_rgba(22,21,26,0.07),0_2px_4px_rgba(22,21,26,0.04),0_16px_40px_-12px_rgba(22,21,26,0.3)]">
        <ToolButton tool="select" current={tool} setTool={setTool} label="Select" keys="V">
          <MousePointer2 className="size-[19px]" />
        </ToolButton>
        <ToolButton tool="hand" current={tool} setTool={setTool} label="Hand" keys="H">
          <Hand className="size-[19px]" />
        </ToolButton>
        <Divider />

        {/* The sticky pad: the colour in use on top, the next two peeking out behind it. */}
        <Tip label="Sticky note" keys="S">
          <button
            type="button"
            aria-label="Sticky note"
            aria-pressed={tool === "sticky"}
            onClick={() => setTool("sticky")}
            className={`group relative mx-0.5 flex h-[52px] w-[58px] items-end justify-center overflow-hidden rounded-xl transition-colors ${tool === "sticky" ? "bg-[#EAF5FF]" : "hover:bg-black/[0.04]"}`}
          >
            {[others[1], others[0], options.stickyColor].map((c, i) => (
              <span
                key={`${c}-${i}`}
                className="absolute bottom-0 block h-10 w-9 rounded-[4px] shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-200 ease-out"
                style={{
                  background: color(c).fill,
                  transform:
                    i === 2
                      ? tool === "sticky"
                        ? "translateY(-2px) rotate(-3deg)"
                        : "translateY(14px) rotate(-3deg)"
                      : `translate(${i === 0 ? 9 : -9}px, ${tool === "sticky" ? 4 : 18}px) rotate(${i === 0 ? 8 : -10}deg)`,
                }}
              />
            ))}
            <span className="pointer-events-none absolute inset-0 rounded-xl transition-transform group-hover:-translate-y-0.5" />
          </button>
        </Tip>

        <ToolButton tool="text" current={tool} setTool={setTool} label="Text" keys="T">
          <Type className="size-[19px]" />
        </ToolButton>
        <ToolButton tool="shape" current={tool} setTool={setTool} label="Shapes" keys="R">
          <ShapeIcon className="size-[19px]" />
        </ToolButton>
        <ToolButton tool="connector" current={tool} setTool={setTool} label="Connector" keys="X">
          <MoveUpRight className="size-[19px]" />
        </ToolButton>
        <ToolButton tool="section" current={tool} setTool={setTool} label="Section" keys="⇧S">
          <SquareDashed className="size-[19px]" />
        </ToolButton>
        <Divider />
        <ToolButton tool="stamp" current={tool} setTool={setTool} label="Stamps" keys="E">
          <Smile className="size-[19px]" />
        </ToolButton>
        <Tip label={voice === "listening" ? "Done talking" : "Talk to your agents"} keys="Hold M">
          <button
            type="button"
            aria-label="Talk to your agents"
            aria-pressed={voice === "listening"}
            onClick={onVoice}
            disabled={voice === "thinking"}
            className={`flex size-11 items-center justify-center rounded-xl transition-all duration-150 ${voice === "listening" ? "bg-[#F24822] text-white shadow-[0_4px_12px_-4px_rgba(242,72,34,0.8)]" : "text-[#2C2B33] hover:bg-black/[0.05]"}`}
          >
            {voice === "thinking" ? <LoaderCircle className="size-[19px] animate-spin" /> : <Mic className="size-[19px]" />}
          </button>
        </Tip>
      </div>
    </div>
  );
}

function ToolButton({ tool, current, setTool, label, keys, children }: { tool: Tool; current: Tool; setTool: (t: Tool) => void; label: string; keys: string; children: React.ReactNode }) {
  const active = tool === current;
  return (
    <Tip label={label} keys={keys}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={() => setTool(tool)}
        className={`flex size-11 items-center justify-center rounded-xl transition-all duration-150 ${active ? "bg-[#0D99FF] text-white shadow-[0_4px_12px_-4px_rgba(13,153,255,0.8)]" : "text-[#2C2B33] hover:bg-black/[0.05]"}`}
      >
        {children}
      </button>
    </Tip>
  );
}

/** A dark tooltip with the shortcut, above the button. */
export function Tip({ label, keys, children, side = "top" }: { label: string; keys?: string; children: React.ReactNode; side?: "top" | "bottom" }) {
  return (
    <div className="group/tip relative flex">
      {children}
      <div
        className={`pointer-events-none absolute left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-[#1E1D24] px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition-all duration-150 group-hover/tip:opacity-100 group-hover/tip:delay-300 ${side === "top" ? "bottom-full mb-2.5 translate-y-1 group-hover/tip:translate-y-0" : "top-full mt-2.5 -translate-y-1 group-hover/tip:translate-y-0"}`}
      >
        {label}
        {keys ? <kbd className="rounded bg-white/15 px-1.5 py-px font-sans text-[11px] text-white/80">{keys}</kbd> : null}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="mx-1 h-7 w-px self-center bg-black/[0.08]" />;
}

function Tray({ children }: { children: React.ReactNode }) {
  return <div className="pointer-events-auto flex animate-pop items-center gap-1.5 rounded-2xl bg-white px-2.5 py-2 shadow-[0_0_0_1px_rgba(22,21,26,0.07),0_12px_32px_-10px_rgba(22,21,26,0.3)]">{children}</div>;
}

function TrayButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" title={label} onClick={onClick} className={`flex size-9 items-center justify-center rounded-xl transition-colors ${active ? "bg-[#EAF5FF] text-[#0D99FF]" : "text-[#2C2B33] hover:bg-black/[0.05]"}`}>
      {children}
    </button>
  );
}
