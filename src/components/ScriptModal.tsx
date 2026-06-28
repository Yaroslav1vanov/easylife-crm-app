"use client";
import { useEffect, useState } from "react";
import { Client, Script } from "@/lib/database";
import { ExternalLink, X, Trash2 } from "lucide-react";

export const SCRIPT_LEAD = 5, VIDEO_LEAD = 2; // дней до публикации

const RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export function fmtDateShort(s: string | null | undefined) {
  if (!s) return "—";
  const [, mm, dd] = String(s).slice(0, 10).split("-");
  const m = parseInt(mm, 10), d = parseInt(dd, 10);
  if (!m || !d) return String(s);
  return `${d} ${RU_MONTHS_GEN[m - 1]}`;
}
export function addDaysIso(iso: string, n: number) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
/** Дата, к которой нужен сценарий (= публикация − SCRIPT_LEAD) */
export function scriptDueDate(s: Script) { return s.pub_date ? addDaysIso(s.pub_date, -SCRIPT_LEAD) : null; }
/** Дата, к которой нужно видео/монтаж (= публикация − VIDEO_LEAD) */
export function videoDueDate(s: Script) { return s.pub_date ? addDaysIso(s.pub_date, -VIDEO_LEAD) : null; }

type Props = {
  script: Script;
  client?: Client;
  onClose: () => void;
  onUpdate: (id: number, patch: Partial<Script>) => Promise<void> | void;
  onDelete?: (id: number) => Promise<void> | void;
};

export default function ScriptModal({ script: s, client: c, onClose, onUpdate, onDelete }: Props) {
  const [hookText, setHookText] = useState(s.hook_text || "");
  const [refUrl, setRefUrl] = useState(s.ref_url || "");
  const [refText, setRefText] = useState(s.ref_text || "");
  const [hook, setHook] = useState(s.hook || "");
  const [bodyText, setBodyText] = useState(s.body_text || "");
  const [cta, setCta] = useState(s.cta || "");
  const [videoUrl, setVideoUrl] = useState(s.video_url || "");
  const [pubDate, setPubDate] = useState(s.pub_date || "");

  useEffect(() => {
    setHookText(s.hook_text || ""); setRefUrl(s.ref_url || ""); setRefText(s.ref_text || "");
    setHook(s.hook || ""); setBodyText(s.body_text || ""); setCta(s.cta || "");
    setVideoUrl(s.video_url || ""); setPubDate(s.pub_date || "");
  }, [s.id]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const isPublished = s.video_status === "published";
  const scrDue = pubDate ? addDaysIso(pubDate, -SCRIPT_LEAD) : null;
  const vidDue = pubDate ? addDaysIso(pubDate, -VIDEO_LEAD) : null;

  const label = (txt: string, color = "var(--t3)") => (
    <label style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 5 }}>{txt}</label>
  );
  const ta: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 9,
    background: "var(--inset2)", border: "1px solid var(--brd)", color: "var(--t1)",
    fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5,
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 18,
        width: "100%", maxWidth: 680, padding: 24, display: "flex", flexDirection: "column", gap: 16,
        boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: "var(--t3)", fontFamily: "monospace", marginBottom: 4 }}>
              {c ? `${c.name} ${c.surname || ""} · ` : ""}M{s.month_number} · сценарий #{s.order_num}
            </div>
            <input
              value={hookText} onChange={(e) => setHookText(e.target.value)}
              onBlur={() => { if (hookText !== (s.hook_text || "")) onUpdate(s.id, { hook_text: hookText }); }}
              placeholder="Тема / хук сценария…"
              style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "var(--t1)", fontSize: 19, fontWeight: 800, fontFamily: "'Unbounded', sans-serif", letterSpacing: -0.3 }}
            />
          </div>
          <button onClick={onClose} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: "var(--track)", border: "1px solid var(--brd)", color: "var(--t2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>

        {/* Сроки */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 12, alignItems: "end", padding: 14, borderRadius: 12, background: "var(--inset)", border: "1px solid var(--brd)" }}>
          <div>
            {label("📅 Публикация")}
            <input type="date" value={pubDate} onChange={(e) => setPubDate(e.target.value)}
              onBlur={() => { if (pubDate !== (s.pub_date || "")) onUpdate(s.id, { pub_date: pubDate || null }); }}
              style={{ ...ta, fontSize: 12, width: 160 }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Сценарий к</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: scrDue ? "var(--cy)" : "var(--t3)", marginTop: 3 }}>{scrDue ? fmtDateShort(scrDue) : "—"}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Видео к</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: vidDue ? "var(--or)" : "var(--t3)", marginTop: 3 }}>{vidDue ? fmtDateShort(vidDue) : "—"}</div>
          </div>
        </div>

        {/* Референс — ссылка */}
        <div>
          {label("🎬 Референс — ссылка на исходник")}
          <div style={{ display: "flex", gap: 6 }}>
            <input value={refUrl} onChange={(e) => setRefUrl(e.target.value)}
              onBlur={() => { if (refUrl !== (s.ref_url || "")) onUpdate(s.id, { ref_url: refUrl }); }}
              placeholder="https://…" style={{ ...ta, fontSize: 12 }} />
            {s.ref_url && (
              <a href={s.ref_url.startsWith("http") ? s.ref_url : `https://${s.ref_url}`} target="_blank" rel="noopener noreferrer"
                style={{ flexShrink: 0, padding: "0 14px", borderRadius: 9, background: "rgba(157,107,255,0.12)", border: "1px solid var(--brd)", color: "var(--pu)", display: "inline-flex", alignItems: "center" }}>
                <ExternalLink size={15} />
              </a>
            )}
          </div>
        </div>

        {/* Транскрибация */}
        <div>
          {label("📝 Транскрибация референса")}
          <textarea value={refText} onChange={(e) => setRefText(e.target.value)}
            onBlur={() => { if (refText !== (s.ref_text || "")) onUpdate(s.id, { ref_text: refText }); }}
            rows={5} placeholder="Расшифровка текста исходного видео…" style={ta} />
        </div>

        {/* Наш сценарий — 3 части, каждую можно усиливать отдельно */}
        <div style={{ padding: 14, borderRadius: 12, background: "rgba(157,107,255,0.05)", border: "1px solid var(--brd)", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--pu)", textTransform: "uppercase", letterSpacing: 0.5 }}>✨ Наш сценарий</div>
          <div>
            {label("1. Хук (первые секунды)", "var(--cy)")}
            <textarea value={hook} onChange={(e) => setHook(e.target.value)}
              onBlur={() => { if (hook !== (s.hook || "")) onUpdate(s.id, { hook }); }}
              rows={2} placeholder="Цепляющее начало — ради чего досмотрят…" style={{ ...ta, background: "var(--inset2)" }} />
          </div>
          <div>
            {label("2. Основной текст", "var(--pu)")}
            <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)}
              onBlur={() => { if (bodyText !== (s.body_text || "")) onUpdate(s.id, { body_text: bodyText }); }}
              rows={7} placeholder="Тело сценария — мясо/смысл…" style={{ ...ta, background: "var(--inset2)" }} />
          </div>
          <div>
            {label("3. Призыв (CTA)", "var(--gr)")}
            <textarea value={cta} onChange={(e) => setCta(e.target.value)}
              onBlur={() => { if (cta !== (s.cta || "")) onUpdate(s.id, { cta }); }}
              rows={2} placeholder="Призыв к действию в конце…" style={{ ...ta, background: "var(--inset2)" }} />
          </div>
        </div>

        {/* Опубликованное видео */}
        {isPublished && (
          <div>
            {label("▶ Ссылка на опубликованное видео", "var(--gr)")}
            <div style={{ display: "flex", gap: 6 }}>
              <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
                onBlur={() => { if (videoUrl !== (s.video_url || "")) onUpdate(s.id, { video_url: videoUrl }); }}
                placeholder="https://instagram.com/reel/…" style={{ ...ta, fontSize: 12 }} />
              {s.video_url && (
                <a href={s.video_url.startsWith("http") ? s.video_url : `https://${s.video_url}`} target="_blank" rel="noopener noreferrer"
                  style={{ flexShrink: 0, padding: "0 14px", borderRadius: 9, background: "rgba(168,224,99,0.14)", border: "1px solid rgba(168,224,99,0.3)", color: "var(--gr)", display: "inline-flex", alignItems: "center" }}>
                  <ExternalLink size={15} />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 4 }}>
          {onDelete ? (
            <button onClick={() => { if (confirm("Удалить этот сценарий?")) onDelete(s.id); }}
              style={{ padding: "8px 12px", borderRadius: 9, background: "transparent", border: "1px solid rgba(255,92,122,0.4)", color: "var(--rd)", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Trash2 size={13} /> Удалить
            </button>
          ) : <span />}
          <button onClick={onClose}
            style={{ padding: "8px 18px", borderRadius: 9, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
