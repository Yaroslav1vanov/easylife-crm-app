"use client";
import { useEffect, useLayoutEffect, useState } from "react";

// Интерактивный тур по разделу: подсветка реального элемента + подсказка «нажми сюда».
// Шаг привязывается к элементу по data-tour="<id>" (или по любому CSS-селектору).
export type TourStep = {
  target?: string;           // data-tour id или CSS-селектор; пусто → подсказка по центру
  title: string;
  text: string;
  placement?: "top" | "bottom" | "left" | "right";
  action?: () => void;       // выполняется при входе на шаг (напр. открыть карточку сценария)
};

const PAD = 8; // отступ подсветки вокруг элемента

export default function Tour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];

  useEffect(() => { if (open) setI(0); }, [open]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    setRect(null);
    step.action?.(); // напр. открыть/закрыть карточку сценария
    const find = () => step.target ? (document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement) || (document.querySelector(step.target) as HTMLElement) : null;
    const apply = (el: HTMLElement | null) => { if (el) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }); setRect(el ? el.getBoundingClientRect() : null); };
    // ждём появления элемента (модалка может открыться не сразу)
    let tries = 0, poll = 0;
    const seek = () => {
      const el = find();
      if (el || !step.target || tries > 16) { apply(el); if (el) { poll = window.setTimeout(() => apply(find()), 280); } return; }
      tries++; poll = window.setTimeout(seek, 120);
    };
    seek();
    const onMove = () => { const el = find(); if (el) setRect(el.getBoundingClientRect()); };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => { clearTimeout(poll); window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove, true); };
  }, [open, i, step]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight" || e.key === "Enter") next(); if (e.key === "ArrowLeft") setI(v => Math.max(0, v - 1)); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (!open || !step) return null;
  const last = i === steps.length - 1;
  const next = () => { if (last) onClose(); else setI(v => v + 1); };

  // позиция карточки-подсказки
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const CARD_W = Math.min(340, vw - 32);
  let cardStyle: React.CSSProperties;
  if (rect) {
    const below = rect.bottom + 14 + 180 < vh;
    const top = below ? rect.bottom + 14 : Math.max(14, rect.top - 14 - 180);
    let left = rect.left + rect.width / 2 - CARD_W / 2;
    left = Math.max(14, Math.min(left, vw - CARD_W - 14));
    cardStyle = { position: "fixed", top, left, width: CARD_W };
  } else {
    cardStyle = { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: CARD_W };
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, fontFamily: "'Manrope', sans-serif" }}>
      {/* ловим клики, чтобы не задеть приложение */}
      <div onClick={() => {}} style={{ position: "absolute", inset: 0 }} />
      {/* подсветка-дырка вокруг элемента (тень заливает всё, кроме окна) */}
      {rect ? (
        <div style={{
          position: "fixed",
          top: rect.top - PAD, left: rect.left - PAD,
          width: rect.width + PAD * 2, height: rect.height + PAD * 2,
          borderRadius: 12, boxShadow: "0 0 0 9999px rgba(6,3,20,.74), 0 0 0 2px var(--cy)",
          pointerEvents: "none", transition: "all .2s ease",
        }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "rgba(6,3,20,.74)" }} />
      )}

      {/* карточка-подсказка */}
      <div style={{ ...cardStyle, background: "var(--side, #160c38)", border: "1px solid var(--brd)", borderRadius: 16, padding: 18, boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--cy)", letterSpacing: 0.5 }}>ШАГ {i + 1} / {steps.length}</span>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Пропустить ✕</button>
        </div>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 15, fontWeight: 800, color: "var(--t1)", marginBottom: 6, lineHeight: 1.3 }}>{step.title}</div>
        <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.55, marginBottom: 14 }}>{step.text}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 5 }}>
            {steps.map((_, k) => <span key={k} style={{ width: 6, height: 6, borderRadius: "50%", background: k === i ? "var(--cy)" : "var(--track)" }} />)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {i > 0 && <button onClick={() => setI(v => v - 1)} style={{ padding: "8px 14px", borderRadius: 9, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Назад</button>}
            <button onClick={next} style={{ padding: "8px 16px", borderRadius: 9, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{last ? "Готово ✓" : "Далее →"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Кнопка запуска тура — ставится в шапку раздела.
export function TourButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Показать, как тут работать"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 10, background: "rgba(66,212,244,0.12)", border: "1px solid var(--brd)", color: "var(--cy)", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
      ❓ Как тут работать?
    </button>
  );
}
