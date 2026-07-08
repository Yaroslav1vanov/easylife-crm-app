"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Стилизованное подтверждение вместо браузерного confirm(): по центру, в стиле сайта.
export default function ConfirmDialog({ open, title, text, confirmLabel = "Удалить", onConfirm, onCancel }: {
  open: boolean;
  title: string;
  text?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); if (e.key === "Enter") onConfirm(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 16, padding: 22, maxWidth: 400, width: "100%", boxShadow: "0 24px 70px rgba(0,0,0,0.6)", fontFamily: "'Manrope', sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: text ? 10 : 18 }}>
          <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: "rgba(255,92,122,0.12)", border: "1px solid rgba(255,92,122,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle size={17} style={{ color: "#ff5c7a" }} />
          </span>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 15, fontWeight: 800, color: "var(--t1)", lineHeight: 1.3 }}>{title}</div>
        </div>
        {text && <div style={{ fontSize: 12.5, color: "var(--t2)", lineHeight: 1.55, marginBottom: 18 }}>{text}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "9px 16px", borderRadius: 9, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Отмена</button>
          <button onClick={onConfirm} style={{ padding: "9px 18px", borderRadius: 9, background: "linear-gradient(135deg, #ff5c7a, #e03560)", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
