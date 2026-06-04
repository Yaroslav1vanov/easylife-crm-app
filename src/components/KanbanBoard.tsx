"use client";
import { useEffect, useMemo, useState } from "react";
import { Client, Script } from "@/lib/database";
import Avatar from "@/components/Avatar";
import { ExternalLink, Calendar as CalendarIcon, type LucideIcon } from "lucide-react";

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
};

export default function KanbanBoard({ scripts, clients, columns, onUpdate, showClient = false, minColWidth = 220, emptyHint = "Пусто" }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [movingScript, setMovingScript] = useState<number | null>(null);

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

  async function handleDrop(colId: string, scriptId: number) {
    const col = columns.find(c => c.id === colId);
    if (!col) return;
    setMovingScript(scriptId);
    await onUpdate(scriptId, col.patch);
    setMovingScript(null);
    setDraggedId(null);
    setDragOverCol(null);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns.length}, minmax(${minColWidth}px, 1fr))`, gap: 10, overflowX: "auto", paddingBottom: 8 }}>
      {columns.map(col => {
        const Icon = col.Icon;
        const items = byColumn[col.id] || [];
        const isOver = dragOverCol === col.id;
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
              {items.length === 0 && (
                <div style={{ padding: "30px 8px", textAlign: "center", color: "var(--t3)", fontSize: 10, fontStyle: "italic" }}>
                  {isOver ? "Отпусти здесь" : emptyHint}
                </div>
              )}
              {items.map(s => {
                const c = clients.find(x => x.id === s.client_id);
                return (
                  <KanbanCard
                    key={s.id}
                    script={s}
                    client={c}
                    color={col.color}
                    expanded={expanded === s.id}
                    dragging={draggedId === s.id}
                    moving={movingScript === s.id}
                    showClient={showClient}
                    onDragStart={(e) => { setDraggedId(s.id); e.dataTransfer.setData("text/plain", String(s.id)); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                    onToggle={() => setExpanded(expanded === s.id ? null : s.id)}
                    onUpdate={onUpdate}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===== Card ===== */
type CardProps = {
  script: Script;
  client?: Client;
  color: string;
  expanded: boolean;
  dragging: boolean;
  moving: boolean;
  showClient: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onToggle: () => void;
  onUpdate: (id: number, patch: Partial<Script>) => Promise<void> | void;
};

function KanbanCard({ script: s, client: c, color, expanded, dragging, moving, showClient, onDragStart, onDragEnd, onToggle, onUpdate }: CardProps) {
  const [refUrl, setRefUrl] = useState(s.ref_url || "");
  const [refText, setRefText] = useState(s.ref_text || "");
  const [hookText, setHookText] = useState(s.hook_text || "");
  const [bodyText, setBodyText] = useState(s.body_text || "");
  const [pubDate, setPubDate] = useState(s.pub_date || "");

  useEffect(() => {
    setRefUrl(s.ref_url || "");
    setRefText(s.ref_text || "");
    setHookText(s.hook_text || "");
    setBodyText(s.body_text || "");
    setPubDate(s.pub_date || "");
  }, [s.id, s.ref_url, s.ref_text, s.hook_text, s.body_text, s.pub_date]);

  const title = s.hook_text || s.hook || `Сценарий #${s.order_num}`;
  const titleShort = title.length > 60 ? title.slice(0, 57) + "..." : title;

  return (
    <div
      draggable={!expanded}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: "rgba(0,0,0,0.32)",
        border: `1px solid ${expanded ? color : "rgba(255,255,255,0.05)"}`,
        borderRadius: 11,
        padding: 10,
        cursor: expanded ? "default" : "grab",
        opacity: dragging || moving ? 0.4 : 1,
        transition: "border .15s, opacity .15s",
      }}>
      <div onClick={onToggle} style={{ display: "flex", flexDirection: "column", gap: 7, cursor: "pointer" }}>
        {showClient && c && (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={24} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name} {c.surname || ""}</div>
              <div style={{ fontSize: 8, color: "var(--t3)", fontFamily: "monospace" }}>M{s.month_number} · #{s.order_num}</div>
            </div>
          </div>
        )}
        {!showClient && (
          <div style={{ fontSize: 9, color: "var(--t3)", fontFamily: "monospace" }}>#{s.order_num} · M{s.month_number}</div>
        )}
        <div style={{ fontSize: 11, color: "var(--t1)", lineHeight: 1.35, fontWeight: 500 }}>{titleShort}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "var(--t3)", flexWrap: "wrap" }}>
          {s.pub_date && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><CalendarIcon size={9} /> {fmtDateShort(s.pub_date)}</span>}
          {s.ref_url && <span><ExternalLink size={9} style={{ display: "inline" }} /> реф</span>}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--brd)", display: "flex", flexDirection: "column", gap: 9 }}>
          <div>
            <label style={{ fontSize: 8, fontWeight: 700, color: "var(--t3)", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 3 }}>🎣 Хук</label>
            <textarea value={hookText} onChange={(e) => setHookText(e.target.value)}
              onBlur={() => { if (hookText !== (s.hook_text || "")) onUpdate(s.id, { hook_text: hookText }); }}
              rows={2}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, background: "rgba(0,0,0,0.35)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
          </div>
          <div>
            <label style={{ fontSize: 8, fontWeight: 700, color: "var(--t3)", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 3 }}>🎬 Ссылка на референс / готовый ролик</label>
            <div style={{ display: "flex", gap: 4 }}>
              <input value={refUrl} onChange={(e) => setRefUrl(e.target.value)}
                onBlur={() => { if (refUrl !== (s.ref_url || "")) onUpdate(s.id, { ref_url: refUrl }); }}
                placeholder="https://..."
                style={{ flex: 1, padding: "6px 8px", borderRadius: 6, background: "rgba(0,0,0,0.35)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 10, outline: "none" }} />
              {s.ref_url && (
                <a href={s.ref_url.startsWith("http") ? s.ref_url : `https://${s.ref_url}`} target="_blank" rel="noopener noreferrer"
                  style={{ padding: "6px 8px", borderRadius: 6, background: "rgba(157,107,255,0.1)", border: "1px solid var(--brd)", color: "var(--pu)", fontSize: 10, display: "inline-flex", alignItems: "center" }}>
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 8, fontWeight: 700, color: "var(--t3)", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 3 }}>📝 Текст референса (оригинал)</label>
            <textarea value={refText} onChange={(e) => setRefText(e.target.value)}
              onBlur={() => { if (refText !== (s.ref_text || "")) onUpdate(s.id, { ref_text: refText }); }}
              rows={3}
              placeholder="Расшифровка / текст исходного видео..."
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, background: "rgba(0,0,0,0.35)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
          </div>
          <div>
            <label style={{ fontSize: 8, fontWeight: 700, color: "var(--pu)", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 3 }}>✨ Наш сценарий</label>
            <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)}
              onBlur={() => { if (bodyText !== (s.body_text || "")) onUpdate(s.id, { body_text: bodyText }); }}
              rows={5}
              placeholder="Текст сценария, переписанный под клиента..."
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, background: "rgba(157,107,255,0.06)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }} />
          </div>
          {/* Дата публикации — для опубликованных видео */}
          {s.video_status === "published" && (
            <div>
              <label style={{ fontSize: 8, fontWeight: 700, color: "var(--gr)", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 3 }}>📅 Дата публикации</label>
              <input type="date" value={pubDate} onChange={(e) => setPubDate(e.target.value)}
                onBlur={() => { if (pubDate !== (s.pub_date || "")) onUpdate(s.id, { pub_date: pubDate }); }}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, background: "rgba(0,0,0,0.35)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, outline: "none" }} />
            </div>
          )}
          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
            <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
              style={{ padding: "5px 9px", borderRadius: 6, background: "transparent", border: "1px solid var(--brd)", color: "var(--t3)", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
              Свернуть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
