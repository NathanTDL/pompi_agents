import { ImageResponse } from "next/og";

/** Pompi's mark for home screens (iOS wants a PNG): the same as icon.svg, on its purple. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#7B4DFF" }}>
        <svg viewBox="2 2 28 28" width="180" height="180">
          <rect x="8" y="8" width="13" height="13" rx="2" fill="#FFE48C" transform="rotate(-6 14.5 14.5)" />
          <path d="M17.5 15.5v10.2c0 .4.5.6.7.3l2.6-2.7c.1-.1.3-.2.5-.2h3.9c.4 0 .6-.5.3-.8l-7.3-7.2c-.3-.2-.7 0-.7.4Z" fill="#fff" stroke="#1E1E1E" strokeWidth="1.2" />
        </svg>
      </div>
    ),
    size,
  );
}
