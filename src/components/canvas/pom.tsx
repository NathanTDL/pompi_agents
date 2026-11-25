import * as React from "react";

/** Lightens (k > 0) or darkens (k < 0) a #rrggbb colour. */
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  if (Number.isNaN(n)) return hex;
  const f = (c: number) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("");
}

/**
 * Pom, Pompi's mascot: a soft marshmallow in headphones, with a sticky note on its head and a cursor on one ear.
 * Every agent is a Pom in its own colour. `head` crops to the head, for avatars and small badges.
 */
export function Pom({ color, size = 40, head = false, mood = "happy", className }: { color: string; size?: number; head?: boolean; mood?: "happy" | "sad"; className?: string }) {
  const id = "pom" + React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const dark = shade(color, -0.3);
  const light = shade(color, 0.3);
  // Texture and shadows only where they can be seen; small badges stay cheap.
  const rich = size >= 44;
  const velvet = rich ? `url(#${id}v)` : undefined;
  const lift = rich ? `url(#${id}d)` : undefined;
  return (
    <svg width={size} height={head ? size : size * 1.18} viewBox={head ? "22 2 156 156" : "0 0 200 236"} className={className} aria-hidden>
      <defs>
        <radialGradient id={`${id}w`} cx="34%" cy="24%" r="90%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".5" stopColor="#F4F5F9" />
          <stop offset=".85" stopColor="#D9DDE7" />
          <stop offset="1" stopColor="#C3C9D6" />
        </radialGradient>
        <radialGradient id={`${id}c`} cx="34%" cy="26%" r="85%">
          <stop offset="0" stopColor={light} />
          <stop offset=".55" stopColor={color} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".7" stopColor="#E9ECF2" />
          <stop offset="1" stopColor="#C9CFDB" />
        </linearGradient>
        {rich ? (
          <>
            <filter id={`${id}v`} x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7" result="n" />
              <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.47  0 0 0 0 0.55  0 0 0 0.16 0" result="n2" />
              <feComposite in="n2" in2="SourceGraphic" operator="in" result="n3" />
              <feMerge>
                <feMergeNode in="SourceGraphic" />
                <feMergeNode in="n3" />
              </feMerge>
            </filter>
            <filter id={`${id}d`} x="-20%" y="-20%" width="140%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#1B2340" floodOpacity=".22" />
            </filter>
          </>
        ) : null}
      </defs>

      {head ? null : (
        <>
          <ellipse cx="100" cy="226" rx="52" ry="6" fill="#000" opacity=".16" />
          <g filter={velvet}>
            <rect x="70" y="176" width="28" height="34" rx="13" fill={`url(#${id}c)`} transform="rotate(9 84 186)" />
            <rect x="102" y="176" width="28" height="34" rx="13" fill={`url(#${id}c)`} transform="rotate(-9 116 186)" />
            <rect x="62" y="160" width="76" height="34" rx="16" fill={`url(#${id}c)`} />
          </g>
          {[78, 122].map((x, i) => (
            <g key={x} transform={`translate(${x} 214)${i ? " scale(-1 1)" : ""}`} filter={lift}>
              <path d="M-19 6 C-20 -6 -10 -12 0 -12 C12 -12 20 -6 20 6 Q20 9 17 9 L-16 9 Q-19 9 -19 6 Z" fill={`url(#${id}s)`} />
              <rect x="-19" y="4" width="39" height="5" rx="2.5" fill="#D3D8E2" />
              <ellipse cx="-14" cy="0" rx="3" ry="4.2" fill={color} />
            </g>
          ))}
          <rect x="58" y="112" width="84" height="66" rx="30" fill={`url(#${id}w)`} filter={velvet} />
        </>
      )}

      <rect x="40" y="26" width="120" height="100" rx="44" fill={`url(#${id}w)`} filter={velvet} />

      {head ? null : (
        <>
          <g filter={lift}>
            <rect x="44" y="124" width="76" height="36" rx="18" fill={`url(#${id}w)`} filter={velvet} transform="rotate(12 82 142)" />
          </g>
          <g filter={lift}>
            <rect x="80" y="126" width="76" height="36" rx="18" fill={`url(#${id}w)`} filter={velvet} transform="rotate(-12 118 144)" />
          </g>
        </>
      )}

      {/* Headphones */}
      <path d="M44 84 C42 2 158 2 156 84" fill="none" stroke={dark} strokeWidth="11" strokeLinecap="round" />
      <path d="M44 84 C42 2 158 2 156 84" fill="none" stroke={color} strokeWidth="7.5" strokeLinecap="round" />
      <path d="M60 34 C80 12 120 12 140 34" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".35" />
      <g filter={lift}>
        <ellipse cx="42" cy="86" rx="17" ry="24" fill={`url(#${id}c)`} />
        <ellipse cx="158" cy="86" rx="17" ry="24" fill={`url(#${id}c)`} />
      </g>
      <rect x="34" y="78" width="6" height="15" rx="3" fill="#fff" opacity=".85" />
      <path d="M155 76 L155 94 L159.8 89.6 L166.5 89.6 Z" fill="#fff" stroke={dark} strokeWidth="1.4" strokeLinejoin="round" />

      {/* The sticky note */}
      <g transform="rotate(10 130 50)" filter={lift}>
        <rect x="118" y="38" width="24" height="24" rx="3" fill="#FFE48C" />
        <path d="M135 62 L142 55 L142 59 Q142 62 139 62 Z" fill="#E8C55E" />
        <rect x="122" y="44" width="12" height="2.3" rx="1.15" fill="#C9A43E" opacity=".7" />
        <rect x="122" y="50" width="8" height="2.3" rx="1.15" fill="#C9A43E" opacity=".7" />
      </g>

      {/* Face */}
      <ellipse cx="85" cy="84" rx="3.4" ry="4.6" fill="#1A1A1A" />
      <ellipse cx="115" cy="84" rx="3.4" ry="4.6" fill="#1A1A1A" />
      {mood === "sad" ? (
        <>
          <path d="M78 75 L89 71 M122 75 L111 71" fill="none" stroke="#1A1A1A" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M95 99 Q100 95 105 99" fill="none" stroke="#1A1A1A" strokeWidth="2.3" strokeLinecap="round" />
          <path d="M119 90 Q122 95.5 119 97 Q116 95.5 119 90 Z" fill="#8FD0FF" />
        </>
      ) : (
        <path d="M95.5 96 Q100 99 104.5 96" fill="none" stroke="#1A1A1A" strokeWidth="2.3" strokeLinecap="round" />
      )}
    </svg>
  );
}
