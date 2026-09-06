"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info, CheckCircle2, X } from "lucide-react";

/* Единое окно сообщений по центру экрана вместо системного alert().
   Перехватывает window.alert по всему приложению — старые вызовы ничего
   менять не нужно. Тип подбирается по тексту: ошибка / успех / инфо. */

type Notice = { id: number; text: string; kind: "error" | "ok" | "info" };
let seq = 1;
export function notify(text: string, kind?: Notice["kind"]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("crm:notice", { detail: { text, kind } }));
}
function guessKind(t: string): Notice["kind"] {
  const s = t.toLowerCase();
  if (/ошибк|error|не удалось|не сохран|не получил|не получ|fail|низк|too low|нет доступа|неверн|blocked|блокир|⚠|metricool:|ai:|r2:/.test(s)) return "error";
  if (/готово|сохран|отправлен|успеш|✓|опубликов|обновл/.test(s)) return "ok";
  return "info";
}
/** Человеческие переводы частых технических ошибок */
function humanize(t: string): { title: string; text: string } {
  if (/credit balance is too low/i.test(t)) return { title: "Закончились кредиты Anthropic", text: "Ключ API, которым CRM пишет тексты под соцсети, без баланса. Пополни на console.anthropic.com → Plans & Billing и повтори генерацию." };
  if (/rate limit|429/i.test(t)) return { title: "Слишком много запросов", text: "Сервис попросил подождать. Повтори через минуту." };
  const m = t.match(/^([^:]{2,24}):\s*([\s\S]+)$/);
  if (m) return { title: m[1].trim(), text: m[2].trim() };
  return { title: "", text: t };
}

export default function NoticeHost() {
  const [items, setItems] = useState<Notice[]>([]);
  useEffect(() => {
    const onNotice = (e: Event) => { const d = (e as CustomEvent).detail || {}; setItems(a => [...a, { id: seq++, text: String(d.text || ""), kind: d.kind || guessKind(String(d.text || "")) }]); };
    window.addEventListener("crm:notice", onNotice);
    const orig = window.alert;
    window.alert = (msg?: any) => notify(String(msg ?? ""));
    return () => { window.removeEventListener("crm:notice", onNotice); window.alert = orig; };
  }, []);
  useEffect(() => {
    if (!items.length) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") setItems(a => a.slice(1)); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [items.length]);
  const cur = items[0];
  if (!cur) return null;
  const { title, text } = humanize(cur.text);
  const color = cur.kind === "error" ? "var(--rd)" : cur.kind === "ok" ? "var(--gr)" : "var(--cy)";
  const Icon = cur.kind === "error" ? AlertTriangle : cur.kind === "ok" ? CheckCircle2 : Info;
  const close = () => setItems(a => a.slice(1));
  return createPortal(
    <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} role="alertdialog" style={{ width: "100%", maxWidth: 440, background: "var(--side)", border: `1px solid ${color}55`, borderRadius: 16, padding: "18px 18px 16px", boxShadow: "0 24px 70px rgba(0,0,0,.55)", fontFamily: "'Manrope', sans-serif" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: `${color}22`, color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={18} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            {title && <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 14, fontWeight: 700, color: "var(--t1)", marginBottom: 4, lineHeight: 1.3 }}>{title}</div>}
            <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</div>
          </div>
          <button onClick={close} aria-label="Закрыть" style={{ background: "none", border: 0, color: "var(--t3)", cursor: "pointer", padding: 2 }}><X size={16} /></button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          {items.length > 1 && <span style={{ fontSize: 11, color: "var(--t3)", alignSelf: "center" }}>ещё {items.length - 1}</span>}
          <button onClick={close} autoFocus style={{ padding: "9px 18px", borderRadius: 9, border: 0, background: cur.kind === "error" ? "var(--rd)" : "linear-gradient(135deg, var(--cy), var(--pu))", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Понятно</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
