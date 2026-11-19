import { color } from "@/lib/canvas/types";

export type PreviewItem = { kind: string; x: number; y: number; w: number; h: number; color?: string; shape?: unknown };

/** A board in miniature: its sections, stickies, shapes and text, fitted into the card. */
export function BoardThumb({ items, className = "" }: { items: PreviewItem[]; className?: string }) {
  const drawn = items.filter((it) => it.kind !== "connector" && it.w > 0 && it.h > 0);
  if (!drawn.length) {
    return (
      <div className={`pompi-canvas flex items-center justify-center ${className}`} style={{ backgroundSize: "14px 14px" }}>
        <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-muted shadow-sm">Empty board</span>
      </div>
    );
  }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const it of drawn) {
    x1 = Math.min(x1, it.x);
    y1 = Math.min(y1, it.kind === "section" ? it.y - 40 : it.y);
    x2 = Math.max(x2, it.x + it.w);
    y2 = Math.max(y2, it.y + it.h);
  }
  const pad = Math.max(x2 - x1, y2 - y1) * 0.08 + 40;
  const vb = `${x1 - pad} ${y1 - pad} ${x2 - x1 + pad * 2} ${y2 - y1 + pad * 2}`;
  const order = [...drawn].sort((a, b) => (a.kind === "section" ? -1 : 0) - (b.kind === "section" ? -1 : 0));
  return (
    <div className={`pompi-canvas ${className}`} style={{ backgroundSize: "14px 14px" }}>
      <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" className="size-full">
        {order.map((it, i) => {
          const c = color(it.color, it.kind === "section" ? "gray" : it.kind === "shape" ? "blue" : "yellow");
          if (it.kind === "section")
            return (
              <g key={i}>
                <rect x={it.x} y={it.y} width={it.w} height={it.h} rx={16} fill={c.section} stroke={`${c.ink}33`} strokeWidth={3} />
                <rect x={it.x} y={it.y - 40} width={Math.min(it.w, 180)} height={30} rx={8} fill={it.color === "gray" || !it.color ? "#E6E6E6" : c.fill} />
              </g>
            );
          if (it.kind === "sticky") return <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} rx={4} fill={c.fill} />;
          if (it.kind === "shape")
            return it.shape === "ellipse" ? (
              <ellipse key={i} cx={it.x + it.w / 2} cy={it.y + it.h / 2} rx={it.w / 2} ry={it.h / 2} fill={c.fill} stroke={c.ink} strokeWidth={3} />
            ) : (
              <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} rx={10} fill={c.fill} stroke={c.ink} strokeWidth={3} />
            );
          if (it.kind === "text") return <rect key={i} x={it.x} y={it.y + it.h * 0.25} width={it.w} height={Math.max(8, it.h * 0.5)} rx={it.h * 0.25} fill="#16151a" opacity={0.75} />;
          if (it.kind === "stamp") return <circle key={i} cx={it.x + it.w / 2} cy={it.y + it.h / 2} r={it.w / 2} fill="#fff" />;
          return null;
        })}
      </svg>
    </div>
  );
}
