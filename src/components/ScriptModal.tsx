"use client";
import { useEffect, useState } from "react";
import { Client, Script } from "@/lib/database";
import ConfirmDialog from "@/components/ConfirmDialog";
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
  /** false → даты и тексты только для чтения (роль монтажёра). Видео прикрепить можно. */
  canEdit?: boolean;
  /** Дату сдачи монтажа (ready_at) правит только владелец/админ. Остальные её видят, но не меняют. */
  canEditReadyAt?: boolean;
};

export default function ScriptModal({ script: s, client: c, onClose, onUpdate, onDelete, canEdit = true, canEditReadyAt = false }: Props) {
  const ro = !canEdit; // read-only для монтажёра
  const roReady = !canEditReadyAt; // дату сдачи меняет только владелец/админ
  const [hookText, setHookText] = useState(s.hook_text || "");
  const [refUrl, setRefUrl] = useState(s.ref_url || "");
  const [refText, setRefText] = useState(s.ref_text || "");
  const [hook, setHook] = useState(s.hook || "");
  const [bodyText, setBodyText] = useState(s.body_text || "");
  const [cta, setCta] = useState(s.cta || "");
  const [videoUrl, setVideoUrl] = useState(s.video_url || "");
  const [pubDate, setPubDate] = useState(s.pub_date || "");
  const [readyAt, setReadyAt] = useState(s.ready_at || "");
  const [adaptBusy, setAdaptBusy] = useState(false);
  const [refine, setRefine] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  async function adaptFromDonor(instruction?: string) {
    setAdaptBusy(true);
    try {
      const r = await fetch(`/api/scripts/${s.id}/adapt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instruction: instruction || "" }) });
      const j = await r.json();
      if (!r.ok) alert("AI: " + (j?.error || "ошибка"));
      else { setHook(j.hook || ""); setBodyText(j.body_text || ""); setCta(j.cta || ""); if (instruction) setRefine(""); }
    } catch (e: any) { alert(String(e)); }
    setAdaptBusy(false);
  }

  useEffect(() => {
    setHookText(s.hook_text || ""); setRefUrl(s.ref_url || ""); setRefText(s.ref_text || "");
    setHook(s.hook || ""); setBodyText(s.body_text || ""); setCta(s.cta || "");
    setVideoUrl(s.video_url || ""); setPubDate(s.pub_date || ""); setReadyAt(s.ready_at || "");
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
              value={hookText} onChange={(e) => setHookText(e.target.value)} readOnly={ro}
              onBlur={() => { if (!ro && hookText !== (s.hook_text || "")) onUpdate(s.id, { hook_text: hookText }); }}
              placeholder="Тема / хук сценария…"
              style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "var(--t1)", fontSize: 19, fontWeight: 800, fontFamily: "'Unbounded', sans-serif", letterSpacing: -0.3 }}
            />
          </div>
          <button onClick={onClose} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: "var(--track)", border: "1px solid var(--brd)", color: "var(--t2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>

        {/* Сроки */}
        <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr 1fr", gap: 12, alignItems: "end", padding: 14, borderRadius: 12, background: "var(--inset)", border: "1px solid var(--brd)" }}>
          <div>
            {label(ro ? "📅 Публикация (только чтение)" : "📅 Публикация")}
            <input type="date" value={pubDate} onChange={(e) => setPubDate(e.target.value)} readOnly={ro} disabled={ro}
              onBlur={() => { if (!ro && pubDate !== (s.pub_date || "")) onUpdate(s.id, { pub_date: pubDate || null }); }}
              style={{ ...ta, fontSize: 12, width: 150, opacity: ro ? 0.6 : 1 }} />
          </div>
          <div>
            {label(roReady ? "✂️ Смонтировано (фиксируется авто)" : "✂️ Смонтировано (дата сдачи)")}
            <input type="date" value={readyAt} onChange={(e) => setReadyAt(e.target.value)} readOnly={roReady} disabled={roReady}
              onBlur={() => { if (!roReady && readyAt !== (s.ready_at || "")) onUpdate(s.id, { ready_at: readyAt || null }); }}
              title={roReady
                ? "День сдачи монтажа. Проставляется автоматически при переносе ролика в «Готово к публикации» и не редактируется. Менять может только владелец."
                : "День сдачи монтажа — по нему начисляется ЗП монтажёру. Ставится авто при переносе в «Готово к публикации», при необходимости поправь вручную."}
              style={{ ...ta, fontSize: 12, width: 150, opacity: roReady ? 0.6 : 1, cursor: roReady ? "not-allowed" : "auto" }} />
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
            <input value={refUrl} onChange={(e) => setRefUrl(e.target.value)} readOnly={ro}
              onBlur={() => { if (!ro && refUrl !== (s.ref_url || "")) onUpdate(s.id, { ref_url: refUrl }); }}
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
          <textarea value={refText} onChange={(e) => setRefText(e.target.value)} readOnly={ro}
            onBlur={() => { if (!ro && refText !== (s.ref_text || "")) onUpdate(s.id, { ref_text: refText }); }}
            rows={5} placeholder="Расшифровка текста исходного видео…" style={ta} />
        </div>

        {/* Разбор донора — что именно тащило ролик (сохранить при адаптации) */}
        {s.description && (
          <div style={{ padding: 12, borderRadius: 11, background: "rgba(255,174,66,0.06)", border: "1px solid rgba(255,174,66,0.3)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--or)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>🔥 Разбор донора — рычаг, который надо сохранить</div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--t1)", whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto" }}>{s.description}</div>
          </div>
        )}

        {/* Наш сценарий — 3 части, каждую можно усиливать отдельно */}
        <div style={{ padding: 14, borderRadius: 12, background: "rgba(157,107,255,0.05)", border: "1px solid var(--brd)", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--pu)", textTransform: "uppercase", letterSpacing: 0.5 }}>✨ Наш сценарий</span>
            {!ro && (
            <button onClick={() => adaptFromDonor()} disabled={adaptBusy || !(s.transcription || s.ref_text)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 8, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 11, fontWeight: 800, cursor: adaptBusy ? "default" : "pointer", opacity: adaptBusy ? 0.7 : 1 }}>
              {adaptBusy ? "Адаптирую…" : "✨ Адаптировать под клиента"}
            </button>
            )}
          </div>
          <div>
            {label("1. Хук (первые секунды)", "var(--cy)")}
            <textarea value={hook} onChange={(e) => setHook(e.target.value)} readOnly={ro}
              onBlur={() => { if (!ro && hook !== (s.hook || "")) onUpdate(s.id, { hook }); }}
              rows={2} placeholder="Цепляющее начало — ради чего досмотрят…" style={{ ...ta, background: "var(--inset2)" }} />
          </div>
          <div>
            {label("2. Основной текст", "var(--pu)")}
            <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} readOnly={ro}
              onBlur={() => { if (!ro && bodyText !== (s.body_text || "")) onUpdate(s.id, { body_text: bodyText }); }}
              rows={7} placeholder="Тело сценария — мясо/смысл…" style={{ ...ta, background: "var(--inset2)" }} />
          </div>
          <div>
            {label("3. Призыв (CTA)", "var(--gr)")}
            <textarea value={cta} onChange={(e) => setCta(e.target.value)} readOnly={ro}
              onBlur={() => { if (!ro && cta !== (s.cta || "")) onUpdate(s.id, { cta }); }}
              rows={2} placeholder="Призыв к действию в конце…" style={{ ...ta, background: "var(--inset2)" }} />
          </div>
          {/* Доработка по правке — мини-чат с AI (только для тех, кто может редактировать) */}
          {!ro && (
          <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--brd)" }}>
            {label("↻ Что переделать? (правка для AI)", "var(--cy)")}
            <div style={{ display: "flex", gap: 6 }}>
              <textarea value={refine} onChange={(e) => setRefine(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && refine.trim()) adaptFromDonor(refine.trim()); }}
                rows={2} placeholder="Напр.: хук агрессивнее · убери про X · сократи тело · добавь конкретику…" style={{ ...ta, fontSize: 12 }} />
              <button onClick={() => refine.trim() && adaptFromDonor(refine.trim())} disabled={adaptBusy || !refine.trim()}
                style={{ flexShrink: 0, padding: "0 14px", borderRadius: 9, background: "rgba(66,212,244,0.14)", border: "1px solid var(--brd)", color: "var(--cy)", fontSize: 11, fontWeight: 800, cursor: adaptBusy || !refine.trim() ? "default" : "pointer", whiteSpace: "nowrap" }}>
                {adaptBusy ? "…" : "↻ Переделать"}
              </button>
            </div>
          </div>
          )}
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
          {onDelete && !ro ? (
            <button onClick={() => setConfirmDel(true)}
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

      <ConfirmDialog
        open={confirmDel}
        title="Удалить сценарий?"
        text={`«${hookText || `Сценарий #${s.order_num || "—"}`}» будет удалён безвозвратно.`}
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => { setConfirmDel(false); onDelete?.(s.id); }}
      />
    </div>
  );
}
