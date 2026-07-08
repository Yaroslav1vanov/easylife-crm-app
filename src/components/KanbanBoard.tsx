"use client";
import { useEffect, useMemo, useState } from "react";
import { Client, Script } from "@/lib/database";
import Avatar from "@/components/Avatar";
import ScriptModal, { fmtDateShort, addDaysIso } from "@/components/ScriptModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ExternalLink, Calendar as CalendarIcon, Plus, CheckSquare, Trash2, Undo2, X, type LucideIcon } from "lucide-react";

const pad2 = (n: number) => String(n).padStart(2, "0");
function todayIsoLocal() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function daysBetweenIso(aIso: string, bIso: string) {
  return Math.round((new Date(`${aIso}T00:00:00`).getTime() - new Date(`${bIso}T00:00:00`).getTime()) / 86400000);
}
// Считает дедлайн готовности (= дата публикации − lead дней) и его срочность.
function deadlineInfo(s: Script, lead: number, done: boolean, todayIso: string) {
  if (!s.pub_date) return null;
  const due = addDaysIso(s.pub_date, -lead);
  const diff = daysBetweenIso(due, todayIso); // <0 просрочено, 0 сегодня, 1 завтра
  let tone: "done" | "overdue" | "soon" | "future" = "future";
  if (done) tone = "done";
  else if (diff < 0) tone = "overdue";
  else if (diff <= 1) tone = "soon";
  const color = tone === "done" ? "#8a8f98" : tone === "overdue" ? "#ff5c7a" : tone === "soon" ? "#ffae42" : "#9d6bff";
  const text = done ? "готово"
    : diff < 0 ? `просрочено ${-diff} дн`
    : diff === 0 ? "сегодня"
    : diff === 1 ? "завтра"
    : `через ${diff} дн`;
  return { due, diff, tone, color, text };
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
  /** Если задано — на карточках показывается дедлайн готовности (= pub_date − N дней), цвет по срочности, сортировка по сроку. */
  deadlineLeadDays?: number;
  /** Когда вернёт true — карточка считается «сдана» (дедлайн неактуален). */
  deadlineDone?: (s: Script) => boolean;
  /** Если задан и вернёт false — бейдж дедлайна не показывается (напр. «идея» ещё не в работе). */
  deadlineShow?: (s: Script) => boolean;
  /** false → в модалке даты/тексты только для чтения (роль монтажёра). Перетаскивание карточек остаётся. */
  canEditScript?: boolean;
  /** true → в модалке дату сдачи монтажа можно править (только владелец/админ). */
  canEditReadyAt?: boolean;
  /** Быстрое действие на карточке (напр. «✓ Сдать» в монтаже) — кнопка без открытия модалки. */
  cardAction?: {
    show: (s: Script) => boolean;
    label: string;
    color?: string;
    run: (s: Script) => Promise<void> | void;
  };
};

export default function KanbanBoard({ scripts, clients, columns, onUpdate, showClient = false, minColWidth = 220, emptyHint = "Пусто", onAddCard, addColumnId, onDelete, deadlineLeadDays, deadlineDone, deadlineShow, canEditScript = true, canEditReadyAt = false, cardAction }: Props) {
  const todayIso = todayIsoLocal();
  const hasDeadline = deadlineLeadDays != null;
  const [openId, setOpenId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [movingScript, setMovingScript] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  // Массовый выбор (галочками): удалить пачкой / вернуть в идею
  const selectable = !!onDelete && canEditScript;
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const addColId = addColumnId || columns[0]?.id;

  const toggleSelect = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  async function bulkDelete() {
    if (!onDelete) return;
    setBulkBusy(true);
    for (const id of Array.from(selected)) await onDelete(id);
    setBulkBusy(false); setBulkConfirm(false); exitSelect();
  }
  async function bulkToIdea() {
    setBulkBusy(true);
    for (const id of Array.from(selected)) await onUpdate(id, { script_status: "notStarted", pub_date: null } as Partial<Script>);
    setBulkBusy(false); exitSelect();
  }

  // Распределение по колонкам
  const byColumn = useMemo(() => {
    const out: Record<string, Script[]> = {};
    for (const col of columns) out[col.id] = [];
    for (const s of scripts) {
      const col = columns.find(c => c.matches(s));
      if (col) out[col.id].push(s);
    }
    // дедлайн-режим: самые горящие — наверх (по due = pub_date − lead), без даты — в конец
    if (hasDeadline) {
      const dueOf = (s: Script) => (s.pub_date ? addDaysIso(s.pub_date, -deadlineLeadDays!) : "9999-99-99");
      for (const col of columns) out[col.id].sort((a, b) => dueOf(a).localeCompare(dueOf(b)));
    }
    return out;
  }, [scripts, columns, hasDeadline, deadlineLeadDays]);

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
      {selectable && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button onClick={() => selectMode ? exitSelect() : setSelectMode(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, border: `1px solid ${selectMode ? "var(--cy)" : "var(--brd)"}`, background: selectMode ? "rgba(66,212,244,0.12)" : "transparent", color: selectMode ? "var(--cy)" : "var(--t2)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            <CheckSquare size={13} /> {selectMode ? "Отменить выбор" : "Выбрать несколько"}
          </button>
        </div>
      )}
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
                      deadline={hasDeadline && (deadlineShow ? deadlineShow(s) : true) ? deadlineInfo(s, deadlineLeadDays!, deadlineDone?.(s) ?? false, todayIso) : null}
                      selectMode={selectMode}
                      selected={selected.has(s.id)}
                      action={cardAction && !selectMode && cardAction.show(s) ? { label: cardAction.label, color: cardAction.color || col.color, onClick: () => cardAction.run(s) } : null}
                      onDragStart={(e) => { if (selectMode) { e.preventDefault(); return; } setDraggedId(s.id); e.dataTransfer.setData("text/plain", String(s.id)); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                      onClick={() => selectMode ? toggleSelect(s.id) : setOpenId(s.id)}
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
          canEdit={canEditScript}
          canEditReadyAt={canEditReadyAt}
        />
      )}

      {/* Плавающая панель массовых действий */}
      {selectMode && (
        <div style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 300, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 14, background: "var(--side)", border: "1px solid var(--brd)", boxShadow: "0 16px 50px rgba(0,0,0,0.6)", flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)", whiteSpace: "nowrap" }}>
            Выбрано: <span style={{ color: "var(--cy)" }}>{selected.size}</span>
          </span>
          <button onClick={bulkToIdea} disabled={bulkBusy || selected.size === 0}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, background: "rgba(157,107,255,0.12)", border: "1px solid var(--brd)", color: "var(--pu)", fontSize: 11, fontWeight: 700, cursor: bulkBusy || selected.size === 0 ? "default" : "pointer", opacity: selected.size === 0 ? 0.5 : 1 }}>
            <Undo2 size={13} /> {bulkBusy ? "…" : "В идею"}
          </button>
          <button onClick={() => setBulkConfirm(true)} disabled={bulkBusy || selected.size === 0}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, background: "rgba(255,92,122,0.12)", border: "1px solid rgba(255,92,122,0.4)", color: "#ff5c7a", fontSize: 11, fontWeight: 700, cursor: bulkBusy || selected.size === 0 ? "default" : "pointer", opacity: selected.size === 0 ? 0.5 : 1 }}>
            <Trash2 size={13} /> {bulkBusy ? "…" : "Удалить"}
          </button>
          <button onClick={exitSelect} title="Выйти из режима выбора"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, background: "transparent", border: "1px solid var(--brd)", color: "var(--t3)", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={bulkConfirm}
        title={`Удалить ${selected.size} ${selected.size === 1 ? "сценарий" : selected.size < 5 ? "сценария" : "сценариев"}?`}
        text="Выбранные карточки будут удалены безвозвратно."
        onCancel={() => setBulkConfirm(false)}
        onConfirm={bulkDelete}
      />
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
  deadline?: ReturnType<typeof deadlineInfo>;
  selectMode?: boolean;
  selected?: boolean;
  action?: { label: string; color: string; onClick: () => Promise<void> | void } | null;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
};

function KanbanCardPreview({ script: s, client: c, color, dragging, moving, showClient, deadline, selectMode = false, selected = false, action, onDragStart, onDragEnd, onClick }: PreviewProps) {
  const numLabel = s.order_num && s.order_num > 0 ? `#${s.order_num}` : "идея";
  const title = s.hook_text || s.hook || (s.order_num && s.order_num > 0 ? `Сценарий #${s.order_num}` : "Идея из референса");
  const titleShort = title.length > 70 ? title.slice(0, 67) + "..." : title;
  return (
    <div
      draggable={!selectMode}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        position: "relative",
        background: selected ? "rgba(66,212,244,0.08)" : deadline?.tone === "overdue" ? "rgba(255,92,122,0.07)" : "var(--inset2)",
        border: selected ? "1px solid var(--cy)" : deadline && deadline.tone !== "done" && deadline.tone !== "future" ? `1px solid ${deadline.color}` : "1px solid var(--track)",
        borderRadius: 11,
        padding: 10,
        cursor: selectMode ? "pointer" : "grab",
        opacity: dragging || moving ? 0.4 : 1,
        transition: "border .15s, opacity .15s, background .15s",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
      {selectMode && (
        <span style={{ position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: 6, border: `1.5px solid ${selected ? "var(--cy)" : "var(--brd)"}`, background: selected ? "var(--cy)" : "var(--inset)", color: "#0a0118", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, lineHeight: 1 }}>
          {selected ? "✓" : ""}
        </span>
      )}
      {showClient && c ? (
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={22} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name} {c.surname || ""}</div>
            <div style={{ fontSize: 8, color: "var(--t3)", fontFamily: "monospace" }}>M{s.month_number} · {numLabel}</div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 9, color: "var(--t3)", fontFamily: "monospace" }}>{numLabel} · M{s.month_number}</div>
      )}
      <div style={{ fontSize: 11, color: "var(--t1)", lineHeight: 1.35, fontWeight: 500 }}>{titleShort}</div>
      {deadline && (
        <div style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 7, fontSize: 10, fontWeight: 800, background: `${deadline.color}1f`, color: deadline.color }}>
          🎬 сдать {fmtDateShort(deadline.due)} · {deadline.text}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 9, color: "var(--t3)", flexWrap: "wrap" }}>
        {s.ref_url && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><ExternalLink size={9} /> реф</span>}
        {s.ref_text && <span>📝 транскр.</span>}
        {s.body_text && <span style={{ color: color }}>✨ сценарий</span>}
        {s.video_url && <span style={{ color: "var(--gr)" }}>▶ видео</span>}
        {s.pub_date && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><CalendarIcon size={9} /> {deadline ? "публ. " : ""}{fmtDateShort(s.pub_date)}</span>}
      </div>
      {action && (
        <button
          onClick={(e) => { e.stopPropagation(); action.onClick(); }}
          style={{ marginTop: 2, padding: "6px 10px", borderRadius: 8, background: `${action.color}1c`, border: `1px solid ${action.color}55`, color: action.color, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>
          {action.label}
        </button>
      )}
    </div>
  );
}
