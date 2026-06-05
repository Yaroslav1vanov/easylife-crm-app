"use client";
import { useEffect, useMemo, useState } from "react";
import { Client, Script } from "@/lib/database";
import Avatar from "@/components/Avatar";
import { ExternalLink, Calendar as CalendarIcon, Plus, X, Trash2, type LucideIcon } from "lucide-react";

const RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function fmtDateShort(s: string | null | undefined) {
  if (!s) return "—";
  const [, mm, dd] = String(s).slice(0, 10).split("-");
  const m = parseInt(mm, 10), d = parseInt(dd, 10);
  if (!m || !d) return String(s);
  return `${d} ${RU_MONTHS_GEN[m - 1]}`;
}

export type KanbanColumn = {
  id: string;
  label: string;
  color: string;
  Icon: LucideIcon;
  /** Подходит ли скрипт для этой колонки */
  matches: (s: Script) => boolean;
  /** Что записать при drop */
  patch: Partial<Script>;
};

type Props = {
  scripts: Script[];
  clients: Client[]; // для аватарок
  columns: KanbanColumn[];
  onUpdate: (id: number, patch: Partial<Script>) => Promise<void> | void;
  showClient?: boolean; // показывать ли имя клиента в карточке
  minColWidth?: number;
  emptyHint?: string;
  /** Если задано — в первой колонке появится кнопка «+ Добавить». */
  onAddCard?: () => Promise<void> | void;
  /** В какой колонке показывать кнопку добавления (по умолчанию — первая). */
  addColumnId?: string;
  onDelete?: (id: number) => Promise<void> | void;
};

export default function KanbanBoard({ scripts, clients, columns, onUpdate, showClient = false, minColWidth = 220, emptyHint = "Пусто", onAddCard, addColumnId, onDelete }: Props) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [movingScript, setMovingScript] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const addColId = addColumnId || columns[0]?.id;

  // Распределение по колонкам
  const byColumn = useMemo(() => {
    const out: Record<string, Script[]> = {};
    for (const col of columns) out[col.id] = [];
    for (const s of scripts) {
      const col = columns.find(c => c.matches(s));
      if (col) out[col.id].push(s);
    }
    return out;
  }, [scripts, columns]);

  const openScript = openId != null ? scripts.find(s => s.id === openId) || null : null;

  async function handleDrop(colId: string, scriptId: number) {
    const col = columns.find(c => c.id === colId);
    if (!col) return;
    setMovingScript(scriptId);
    await onUpdate(scriptId, col.patch);
    setMovingScript(null);
    setDraggedId(null);
    setDragOverCol(null);
  }

  async function handleAdd() {
    if (!onAddCard) return;
    setAdding(true);
    await onAddCard();
    setAdding(false);
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns.length}, minmax(${minColWidth}px, 1fr))`, gap: 10, overflowX: "auto", paddingBottom: 8 }}>
        {columns.map(col => {
          const Icon = col.Icon;
          const items = byColumn[col.id] || [];
          const isOver = dragOverCol === col.id;
          const showAdd = !!onAddCard && col.id === addColId;
          return (
            <div key={col.id}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
              onDragLeave={() => { if (dragOverCol === col.id) setDragOverCol(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const id = parseInt(e.dataTransfer.getData("text/plain"), 10);
                if (id && !isNaN(id)) handleDrop(col.id, id);
              }}
              style={{
                background: "rgba(123,63,228,0.04)",
                border: `1px solid ${isOver ? col.color : "var(--brd)"}`,
                borderRadius: 14,
                padding: 12,
                display: "flex", flexDirection: "column",
                minHeight: 320,
                transition: "border-color .15s, background .15s",
              }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 10, borderBottom: `2px solid ${col.color}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Icon size={13} style={{ color: col.color }} strokeWidth={1.8} />
                  <h3 style={{ fontSize: 11, fontWeight: 800, color: "var(--t1)", textTransform: "uppercase", letterSpacing: 0.5 }}>{col.label}</h3>
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: `${col.color}22`, color: col.color }}>{items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
                {showAdd && (
                  <button onClick={handleAdd} disabled={adding}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "9px", borderRadius: 9,
                      background: "rgba(157,107,255,0.08)", border: `1px dashed ${col.color}`,
                      color: col.color, fontSize: 11, fontWeight: 700, cursor: "pointer",
                    }}>
                    <Plus size={13} strokeWidth={2.4} /> {adding ? "Создаю..." : "Добавить сценарий"}
                  </button>
                )}
                {items.length === 0 && !showAdd && (
                  <div style={{ padding: "30px 8px", textAlign: "center", color: "var(--t3)", fontSize: 10, fontStyle: "italic" }}>
                    {isOver ? "Отпусти здесь" : emptyHint}
                  </div>
                )}
                {items.map(s => {
                  const c = clients.find(x => x.id === s.client_id);
                  return (
                    <KanbanCardPreview
                      key={s.id}
                      script={s}
                      client={c}
                      color={col.color}
                      dragging={draggedId === s.id}
                      moving={movingScript === s.id}
                      showClient={showClient}
                      onDragStart={(e) => { setDraggedId(s.id); e.dataTransfer.setData("text/plain", String(s.id)); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                      onClick={() => setOpenId(s.id)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {openScript && (
        <ScriptModal
          script={openScript}
          client={clients.find(x => x.id === openScript.client_id)}
          onClose={() => setOpenId(null)}
          onUpdate={onUpdate}
          onDelete={onDelete ? async (id) => { await onDelete(id); setOpenId(null); } : undefined}
        />
      )}
    </>
  );
}

/* ===== Card preview (in column) ===== */
type PreviewProps = {
  script: Script;
  client?: Client;
  color: string;
  dragging: boolean;
  moving: boolean;
  showClient: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
};

function KanbanCardPreview({ script: s, client: c, color, dragging, moving, showClient, onDragStart, onDragEnd, onClick }: PreviewProps) {
  const title = s.hook_text || s.hook || `Сценарий #${s.order_num}`;
  const titleShort = title.length > 70 ? title.slice(0, 67) + "..." : title;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        background: "var(--inset2)",
        border: "1px solid var(--track)",
        borderRadius: 11,
        padding: 10,
        cursor: "grab",
        opacity: dragging || moving ? 0.4 : 1,
        transition: "border .15s, opacity .15s",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
      {showClient && c ? (
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={22} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name} {c.surname || ""}</div>
            <div style={{ fontSize: 8, color: "var(--t3)", fontFamily: "monospace" }}>M{s.month_number} · #{s.order_num}</div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 9, color: "var(--t3)", fontFamily: "monospace" }}>#{s.order_num} · M{s.month_number}</div>
      )}
      <div style={{ fontSize: 11, color: "var(--t1)", lineHeight: 1.35, fontWeight: 500 }}>{titleShort}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 9, color: "var(--t3)", flexWrap: "wrap" }}>
        {s.ref_url && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><ExternalLink size={9} /> реф</span>}
        {s.ref_text && <span>📝 транскр.</span>}
        {s.body_text && <span style={{ color: color }}>✨ сценарий</span>}
        {s.video_url && <span style={{ color: "var(--gr)" }}>▶ видео</span>}
        {s.pub_date && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><CalendarIcon size={9} /> {fmtDateShort(s.pub_date)}</span>}
      </div>
    </div>
  );
}

/* ===== Edit modal ===== */
type ModalProps = {
  script: Script;
  client?: Client;
  onClose: () => void;
  onUpdate: (id: number, patch: Partial<Script>) => Promise<void> | void;
  onDelete?: (id: number) => Promise<void> | void;
};

function ScriptModal({ script: s, client: c, onClose, onUpdate, onDelete }: ModalProps) {
  const [hookText, setHookText] = useState(s.hook_text || "");
  const [refUrl, setRefUrl] = useState(s.ref_url || "");
  const [refText, setRefText] = useState(s.ref_text || "");
  const [bodyText, setBodyText] = useState(s.body_text || "");
  const [videoUrl, setVideoUrl] = useState(s.video_url || "");
  const [pubDate, setPubDate] = useState(s.pub_date || "");

  useEffect(() => {
    setHookText(s.hook_text || ""); setRefUrl(s.ref_url || ""); setRefText(s.ref_text || "");
    setBodyText(s.body_text || ""); setVideoUrl(s.video_url || ""); setPubDate(s.pub_date || "");
  }, [s.id]);

  // Esc закрывает
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const isPublished = s.video_status === "published";

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

        {/* Референс — ссылка */}
        <div>
          {label("🎬 Референс — ссылка на исходник")}
          <div style={{ display: "flex", gap: 6 }}>
            <input value={refUrl} onChange={(e) => setRefUrl(e.target.value)}
              onBlur={() => { if (refUrl !== (s.ref_url || "")) onUpdate(s.id, { ref_url: refUrl }); }}
              placeholder="https://…"
              style={{ ...ta, fontSize: 12 }} />
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
            rows={5} placeholder="Расшифровка текста исходного видео…"
            style={ta} />
        </div>

        {/* Наш сценарий */}
        <div>
          {label("✨ Наш сценарий (переписанный под клиента)", "var(--pu)")}
          <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)}
            onBlur={() => { if (bodyText !== (s.body_text || "")) onUpdate(s.id, { body_text: bodyText }); }}
            rows={9} placeholder="Финальный текст сценария…"
            style={{ ...ta, background: "rgba(157,107,255,0.07)" }} />
        </div>

        {/* Опубликованное видео — только для published */}
        {isPublished && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: 14, borderRadius: 12, background: "rgba(168,224,99,0.06)", border: "1px solid rgba(168,224,99,0.25)" }}>
            <div>
              {label("▶ Ссылка на опубликованное видео", "var(--gr)")}
              <div style={{ display: "flex", gap: 6 }}>
                <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
                  onBlur={() => { if (videoUrl !== (s.video_url || "")) onUpdate(s.id, { video_url: videoUrl }); }}
                  placeholder="https://instagram.com/reel/…"
                  style={{ ...ta, fontSize: 12 }} />
                {s.video_url && (
                  <a href={s.video_url.startsWith("http") ? s.video_url : `https://${s.video_url}`} target="_blank" rel="noopener noreferrer"
                    style={{ flexShrink: 0, padding: "0 14px", borderRadius: 9, background: "rgba(168,224,99,0.14)", border: "1px solid rgba(168,224,99,0.3)", color: "var(--gr)", display: "inline-flex", alignItems: "center" }}>
                    <ExternalLink size={15} />
                  </a>
                )}
              </div>
            </div>
            <div>
              {label("📅 Дата", "var(--gr)")}
              <input type="date" value={pubDate} onChange={(e) => setPubDate(e.target.value)}
                onBlur={() => { if (pubDate !== (s.pub_date || "")) onUpdate(s.id, { pub_date: pubDate }); }}
                style={{ ...ta, fontSize: 12, width: 150 }} />
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
