"use client";

import * as React from "react";

const WORDS = ["Miro", "Excalidraw", "FigJam"];
const LAST = WORDS.length - 1;
const ease = "cubic-bezier(0.2, 0.7, 0.2, 1)";

/** "FigJam", then Miro and Excalidraw roll past and it lands back on FigJam, which holds longest. */
export function RotatingWord() {
  const [at, setAt] = React.useState({ i: LAST, prev: -1, w: null as number | null });
  const sizers = React.useRef<(HTMLSpanElement | null)[]>([]);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = LAST;
    let timer: number;
    const next = () => {
      const prev = i;
      i = (i + 1) % WORDS.length;
      setAt({ i, prev, w: sizers.current[i]?.getBoundingClientRect().width ?? null });
      timer = window.setTimeout(next, i === LAST ? 3400 : 1400);
    };
    timer = window.setTimeout(next, 2600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <span className="relative inline-flex overflow-hidden align-bottom" style={{ width: at.w ?? undefined, transition: `width 500ms ${ease}` }}>
      <span className="sr-only">FigJam</span>
      {WORDS.map((word, n) => (
        <span key={word} ref={(el) => void (sizers.current[n] = el)} aria-hidden className="invisible absolute top-0 left-0 whitespace-nowrap">
          {word}
        </span>
      ))}
      {WORDS.map((word, n) => {
        const on = n === at.i;
        const gone = n === at.prev;
        return (
          <span
            key={word}
            aria-hidden
            className={`whitespace-nowrap ${on ? "relative" : "absolute top-0 left-0"}`}
            style={{
              transform: on ? "translateY(0)" : gone ? "translateY(-105%)" : "translateY(105%)",
              opacity: on ? 1 : 0,
              filter: on ? "blur(0)" : "blur(3px)",
              transition: on || gone ? `transform 500ms ${ease}, opacity 400ms ${ease}, filter 400ms ${ease}` : "none",
            }}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
}
