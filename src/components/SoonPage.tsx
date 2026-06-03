"use client";
import { type LucideIcon } from "lucide-react";

type Props = {
  title: string;
  description: string;
  Icon: LucideIcon;
  accent?: string;
};

export default function SoonPage({ title, description, Icon, accent = "var(--pu)" }: Props) {
  return (
    <div style={{ padding: "60px 20px", maxWidth: 720, margin: "40px auto", textAlign: "center" }}>
      <div style={{
        width: 88, height: 88, margin: "0 auto 24px",
        borderRadius: 24,
        background: `linear-gradient(135deg, ${accent}, transparent)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: "1px solid var(--brd)",
        boxShadow: `0 12px 40px ${accent}33`,
      }}>
        <Icon size={40} strokeWidth={1.6} style={{ color: "#fff" }} />
      </div>
      <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 28, color: "var(--t1)", marginBottom: 12, letterSpacing: -0.6 }}>
        {title}
      </h1>
      <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, color: "var(--t2)", marginBottom: 24, lineHeight: 1.55 }}>
        {description}
      </p>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "10px 18px", borderRadius: 999,
        background: "rgba(157,107,255,0.1)", border: "1px solid var(--brd)",
        fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 0.6, textTransform: "uppercase",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent, boxShadow: `0 0 0 4px ${accent}22` }} />
        Скоро
      </div>
    </div>
  );
}
