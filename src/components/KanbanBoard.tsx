"use client";
import { useEffect, useMemo, useState } from "react";
import { Client, Script } from "@/lib/database";
import Avatar from "@/components/Avatar";
import ScriptModal, { fmtDateShort } from "@/components/ScriptModal";
import { ExternalLink, Calendar as CalendarIcon, Plus, type LucideIcon } from "lucide-react";

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
