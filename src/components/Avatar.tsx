"use client";
import { useState } from "react";

const PALETTE = [
  ["#7b3fe4", "#9d6bff"], // purple
  ["#42d4f4", "#0891b2"], // cyan
  ["#ffae42", "#ea580c"], // orange
  ["#a8e063", "#059669"], // green
  ["#ec4899", "#db2777"], // pink
  ["#f5c451", "#ca8a04"], // yellow
  ["#ff5c7a", "#dc2626"], // red
  ["#a890d0", "#6366f1"], // indigo
];

function hashIndex(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % PALETTE.length;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Props = {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  ring?: boolean;
  statusColor?: string; // for the status dot
};

export default function Avatar({ name, src, size = 40, className = "", style, ring, statusColor }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  const [c1, c2] = PALETTE[hashIndex(name || "?")];
  const ini = initials(name);
  const fontSize = Math.max(10, Math.floor(size * 0.36));

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: showImage ? "#222" : `linear-gradient(135deg, ${c1}, ${c2})`,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize,
        fontFamily: "'Unbounded', sans-serif",
        letterSpacing: -0.4,
        flexShrink: 0,
        position: "relative",
        boxShadow: ring ? "0 0 0 2px rgba(157,107,255,0.4)" : undefined,
        overflow: "hidden",
        ...style,
      }}
      title={name}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt={name}
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        ini
      )}
      {statusColor && (
        <span
          style={{
            position: "absolute",
            right: -1,
            bottom: -1,
            width: Math.max(8, size * 0.25),
            height: Math.max(8, size * 0.25),
            borderRadius: "50%",
            background: statusColor,
            border: "2px solid var(--side, #0d0220)",
          }}
        />
      )}
    </div>
  );
}
