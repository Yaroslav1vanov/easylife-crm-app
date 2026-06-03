"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, TeamMember, ClientMonth } from "@/lib/database";
import Avatar from "@/components/Avatar";
import {
  FileText, Pen, UserCheck, CheckCircle2, RotateCcw, Archive, AlertCircle,
  Filter, Search, Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, X, ExternalLink,
  type LucideIcon,
} from "lucide-react";

const RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const RU_MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

function ymOfDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}
function targetForCalendarMonth(cm: { start_date: string; end_date: string; package: number; calendar_split?: Record<string, number> | null }, ym: string): number {
  if (cm.calendar_split && cm.calendar_split[ym] !== undefined && cm.calendar_split[ym] !== null) {
    return cm.calendar_split[ym];
  }
  const { start: ms, end: me } = ymRange(ym);
  const overlapStart = cm.start_date > ms ? cm.start_date : ms;
  const overlapEnd = cm.end_date < me ? cm.end_date : me;
  const overlapDays = Math.max(0, daysBetween(overlapStart, overlapEnd) + 1);
  const totalDays = Math.max(1, daysBetween(cm.start_date, cm.end_date) + 1);
  return Math.round(((cm.package || 0) * overlapDays) / totalDays);
}
function ymShift(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  return ymOfDate(new Date(y, m - 1 + delta, 1));
}
function ymRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
function ymLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${RU_MONTHS[m - 1]} ${y}`;
}
function fmtDateShort(s: string | null | undefined) {
  if (!s) return "—";
  const [, mm, dd] = String(s).slice(0, 10).split("-");
  const m = parseInt(mm, 10), d = parseInt(dd, 10);
  if (!m || !d) return String(s);
  return `${d} ${RU_MONTHS_GEN[m - 1]}`;
}

/* ===== Kanban columns ===== */
type ColumnId = "idea" | "writing" | "review" | "ready_for_montage" | "rework" | "done_or_archive";
type Column = { id: ColumnId; label: string; color: string; Icon: LucideIcon; matches: (s: Script) => boolean };

// "Возврат на доработку" реализуем как inProgress с маркером в hook (костыль) или просто оставим пустой пока.
// Сейчас: pure 5 колонок без rework, миграция позже.
const COLUMNS: Column[] = [
  { id: "idea", label: "Идея", color: "#9d6bff", Icon: FileText,
    matches: (s) => s.script_status === "notStarted" && !s.hook_text && !s.body_text },
  { id: "writing", label: "Написание", color: "#42d4f4", Icon: Pen,
    matches: (s) => s.script_status === "inProgress" || (s.script_status === "notStarted" && (!!s.hook_text || !!s.body_text)) },
  { id: "review", label: "На согласовании", color: "#ffae42", Icon: UserCheck,
    matches: (s) => s.script_status === "review" },
  { id: "ready_for_montage", label: "Готовы к монтажу", color: "#a8e063", Icon: CheckCircle2,
    matches: (s) => s.script_status === "approved" && (s.video_status === "notStarted" || !s.video_status) },
  { id: "done_or_archive", label: "В монтаже / опубликовано", color: "#34a853", Icon: Archive,
    matches: (s) => s.script_status === "approved" && (s.video_status === "inProgress" || s.video_status === "ready" || s.video_status === "published") },
];

// Куда переводить script_status при дропе в колонку
function targetStatus(colId: ColumnId): Partial<Script> {
  switch (colId) {
    case "idea": return { script_status: "notStarted" };
    case "writing": return { script_status: "inProgress" };
    case "review": return { script_status: "review" };
    case "ready_for_montage": return { script_status: "approved", video_status: "notStarted" };
    case "done_or_archive": return { script_status: "approved" }; // не трогаем video, пусть остаётся
    case "rework": return { script_status: "inProgress" };
  }
}

export default function ScriptsPage() {
  const router = useRouter();
  const supabase = createClient();
  const today = new Date();
  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [allScripts, setAllScripts] = useState<Script[]>([]);
  const [clientMonths, setClientMonths] = useState<ClientMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const currentYM = ymOfDate(today);
  const [selectedMonth, setSelectedMonth] = useState<string | "all">(currentYM);
  const [clientFilter, setClientFilter] = useState<"all" | number>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ColumnId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColumnId | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState<null | "client" | "status">(null);
  const [movingScript, setMovingScript] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const cls = await db.getClients(supabase);
    const tm = await db.getTeam(supabase);
    setClients(cls);
    setTeam(tm);
    const all = await db.getScriptsForClients(supabase, cls.map(c => c.id));
    setAllScripts(all);
    const cmRes = await db.getClientMonths(supabase);
    setClientMonths(cmRes?.data || []);
    setLoading(false);
  }

  async function updateScript(id: number, patch: Partial<Script>) {
    await db.updateScript(supabase, id, patch);
    setAllScripts(arr => arr.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  async function handleDrop(colId: ColumnId, scriptId: number) {
    setMovingScript(scriptId);
    const patch = targetStatus(colId);
    await updateScript(scriptId, patch);
    setMovingScript(null);
    setDraggedId(null);
    setDragOverCol(null);
  }

  /* Считаем какие (client_id, month_number) активны в выбранном периоде */
  const activeMonthKeys = useMemo(() => {
    if (selectedMonth === "all") return null; // null = не фильтруем
    const { start: ms, end: me } = ymRange(selectedMonth);
    const set = new Set<string>();
    for (const cm of clientMonths) {
      if (cm.start_date <= me && cm.end_date >= ms) {
        set.add(`${cm.client_id}:${cm.month_number}`);
      }
    }
    return set;
  }, [clientMonths, selectedMonth]);

  /* Filter scripts by period + client + search */
  const filteredScripts = useMemo(() => {
    return allScripts.filter(s => {
      const c = clients.find(x => x.id === s.client_id);
      if (!c) return false;
      // фильтр по периоду — только сценарии активного M-месяца этого клиента в этом периоде
      if (activeMonthKeys && !activeMonthKeys.has(`${s.client_id}:${s.month_number}`)) return false;
      // фильтр по клиенту
      if (clientFilter !== "all" && s.client_id !== clientFilter) return false;
      // фильтр по поиску
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${c.name} ${c.surname || ""} ${s.hook_text || ""} ${s.hook || ""} ${s.body_text || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allScripts, clients, clientFilter, searchQuery, activeMonthKeys]);

  /* Group by column */
  const byColumn = useMemo(() => {
    const out: Record<ColumnId, Script[]> = {
      idea: [], writing: [], review: [], ready_for_montage: [], rework: [], done_or_archive: [],
    };
    for (const s of filteredScripts) {
      const col = COLUMNS.find(c => c.matches(s));
      if (col) out[col.id].push(s);
    }
    return out;
  }, [filteredScripts]);

  /* KPI cards — план = пропорция package на выбранный календарный месяц
     (planned контракты не считаем — клиент с planned M ещё не "в работе") */
  const kpis = useMemo(() => {
    // Полный пакет всех применимых CM
    let totalPkg = 0;
    // Опубликованных сценариев в этих же CM
    let publishedCount = 0;
    const include = (cm: ClientMonth) => {
      if (cm.status === "planned" || cm.status === "cancelled") return false;
      if (clientFilter !== "all" && cm.client_id !== clientFilter) return false;
      if (selectedMonth !== "all") {
        const { start: ms, end: me } = ymRange(selectedMonth);
        if (cm.start_date > me || cm.end_date < ms) return false;
      }
      return true;
    };
    for (const cm of clientMonths) {
      if (!include(cm)) continue;
      totalPkg += cm.package || 0;
      publishedCount += allScripts.filter((s: Script) =>
        s.client_id === cm.client_id &&
        s.month_number === cm.month_number &&
        s.video_status === "published"
      ).length;
    }
    const remaining = Math.max(0, totalPkg - publishedCount);
    return {
      remaining, // Осталось до конца M
      plan: totalPkg, // Полный пакет
      total: filteredScripts.length, // фактически создано записей в БД
      writing: byColumn.writing.length,
      review: byColumn.review.length,
      ready: byColumn.ready_for_montage.length,
      rework: byColumn.rework.length,
      overdue: 0,
    };
  }, [filteredScripts, byColumn, clientMonths, selectedMonth, clientFilter, allScripts]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, color: "var(--t1)", letterSpacing: -0.5 }}>
            Сценарии
            <span style={{ marginLeft: 10, fontSize: 14, color: "var(--pu)", padding: "3px 10px", borderRadius: 8, background: "rgba(157,107,255,0.15)", fontFamily: "'Manrope', sans-serif" }}>{filteredScripts.length}</span>
          </h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4, fontWeight: 500 }}>
            {selectedMonth === "all" ? "Все сценарии по всем месяцам" : `Сценарии за ${ymLabel(selectedMonth)}`}
            {clientFilter !== "all" && (() => { const c = clients.find(x => x.id === clientFilter); return c ? ` · ${c.name} ${c.surname || ""}` : ""; })()}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Period picker */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 12, background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)" }}>
            <button onClick={() => setSelectedMonth(s => s === "all" ? currentYM : ymShift(s, -1))}
              style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
              <ChevronLeft size={14} />
            </button>
            <CalendarIcon size={13} style={{ color: "var(--t3)" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", minWidth: 90, textAlign: "center" }}>
              {selectedMonth === "all" ? "Всё время" : ymLabel(selectedMonth)}
            </span>
            {selectedMonth !== currentYM && selectedMonth !== "all" && (
              <button onClick={() => setSelectedMonth(currentYM)} title="Текущий месяц"
                style={{ background: "transparent", border: "none", color: "var(--cy)", cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "2px 6px" }}>сейчас</button>
            )}
            <button onClick={() => setSelectedMonth(s => s === "all" ? currentYM : ymShift(s, 1))}
              style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
              <ChevronRight size={14} />
            </button>
          </div>
          <button onClick={() => setSelectedMonth(selectedMonth === "all" ? currentYM : "all")}
            style={{
              padding: "8px 14px", borderRadius: 12,
              background: selectedMonth === "all" ? "linear-gradient(135deg, var(--pu), #7b3fe4)" : "transparent",
              color: selectedMonth === "all" ? "#fff" : "var(--t2)",
              border: selectedMonth === "all" ? "none" : "1px solid var(--brd)",
              fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>
            {selectedMonth === "all" ? "✓ Всё время" : "Всё время"}
          </button>
        </div>
      </div>

      {/* KPI ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 18 }} className="scripts-kpi">
        {([
          { Icon: FileText, label: "Осталось сделать", val: String(kpis.remaining), color: "#9d6bff", caption: `из ${kpis.plan} в пакетах` },
          { Icon: Pen, label: "На написании", val: String(kpis.writing), color: "#42d4f4", caption: kpis.plan ? `${Math.round((kpis.writing / kpis.plan) * 100)}% плана` : "—" },
          { Icon: UserCheck, label: "На согласовании", val: String(kpis.review), color: "#ffae42", caption: kpis.plan ? `${Math.round((kpis.review / kpis.plan) * 100)}% плана` : "—" },
          { Icon: CheckCircle2, label: "Готовы к монтажу", val: String(kpis.ready), color: "#a8e063", caption: kpis.plan ? `${Math.round((kpis.ready / kpis.plan) * 100)}% плана` : "—" },
          { Icon: RotateCcw, label: "Возврат на доработку", val: String(kpis.rework), color: "#ec4899", caption: kpis.plan ? `${Math.round((kpis.rework / kpis.plan) * 100)}% плана` : "—" },
          { Icon: AlertCircle, label: "Просроченные", val: String(kpis.overdue), color: "#ff5c7a", caption: kpis.overdue > 0 ? "требуют внимания" : "—" },
        ] as const).map(it => {
          const I = it.Icon;
          return (
            <div key={it.label} style={{ background: "rgba(123,63,228,0.075)", border: "1px solid var(--brd)", borderRadius: 16, padding: 14, minHeight: 102, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: `${it.color}22`, color: it.color, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${it.color}44` }}>
                <I size={16} strokeWidth={1.8} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600, marginBottom: 3 }}>{it.label}</div>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 24, fontWeight: 800, color: "var(--t1)", lineHeight: 1 }}>{it.val}</div>
                <div style={{ fontSize: 10, color: it.color, fontWeight: 600, marginTop: 3 }}>{it.caption}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
          <Search size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--t3)" }} />
          <input
            placeholder="Поиск сценария..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", padding: "9px 12px 9px 32px", borderRadius: 10, background: "rgba(0,0,0,0.25)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, outline: "none" }}
          />
        </div>
        {/* Client filter */}
        <div style={{ position: "relative" }}>
          <button onClick={() => setFilterMenuOpen(filterMenuOpen === "client" ? null : "client")}
            style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Filter size={11} strokeWidth={1.8} />
            <span style={{ color: "var(--t3)" }}>Клиент:</span>
            {clientFilter === "all" ? "Все" : (clients.find(c => c.id === clientFilter)?.name || "—")}
            <ChevronDown size={11} />
          </button>
          {filterMenuOpen === "client" && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, minWidth: 200, background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 10, padding: 4, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", maxHeight: 320, overflowY: "auto" }}>
              <button onClick={() => { setClientFilter("all"); setFilterMenuOpen(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px" }}>Все клиенты</button>
              {clients.map(c => (
                <button key={c.id} onClick={() => { setClientFilter(c.id); setFilterMenuOpen(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px", gap: 8 }}>
                  <Avatar name={c.name} src={c.avatar_url} size={20} /> {c.name} {c.surname || ""}
                </button>
              ))}
            </div>
          )}
        </div>
        {(clientFilter !== "all" || searchQuery.trim()) && (
          <button onClick={() => { setClientFilter("all"); setSearchQuery(""); }}
            style={{ padding: "8px 10px", borderRadius: 10, background: "transparent", border: "1px solid var(--brd)", color: "var(--rd)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            <X size={11} style={{ display: "inline", verticalAlign: "middle" }} /> Сбросить
          </button>
        )}
      </div>

      {/* KANBAN BOARD */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(220px, 1fr))`, gap: 10, overflowX: "auto", paddingBottom: 8 }} className="scripts-kanban">
        {COLUMNS.map(col => {
          const Icon = col.Icon;
          const items = byColumn[col.id];
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
                minHeight: 400,
                transition: "border-color .15s, background .15s",
                position: "relative",
              }}>
              {/* Column header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 10, borderBottom: `2px solid ${col.color}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Icon size={13} style={{ color: col.color }} strokeWidth={1.8} />
                  <h3 style={{ fontSize: 11, fontWeight: 800, color: "var(--t1)", textTransform: "uppercase", letterSpacing: 0.5 }}>{col.label}</h3>
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: `${col.color}22`, color: col.color }}>{items.length}</span>
              </div>
              {/* Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
                {items.length === 0 && (
                  <div style={{ padding: "30px 8px", textAlign: "center", color: "var(--t3)", fontSize: 10, fontStyle: "italic" }}>
                    {isOver ? "Отпусти здесь" : "Пусто"}
                  </div>
                )}
                {items.map(s => {
                  const c = clients.find(x => x.id === s.client_id);
                  if (!c) return null;
                  const isExpanded = expanded === s.id;
                  const isDragging = draggedId === s.id;
                  const isMoving = movingScript === s.id;
                  return (
                    <ScriptCard
                      key={s.id}
                      script={s}
                      client={c}
                      color={col.color}
                      expanded={isExpanded}
                      dragging={isDragging}
                      moving={isMoving}
                      onDragStart={(e) => { setDraggedId(s.id); e.dataTransfer.setData("text/plain", String(s.id)); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                      onToggle={() => setExpanded(isExpanded ? null : s.id)}
                      onUpdate={updateScript}
                      onOpenClient={() => router.push(`/dashboard/clients/${c.id}`)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        @media (max-width: 1400px) {
          :global(.scripts-kpi) { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 768px) {
          :global(.scripts-kpi) { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

/* ===== Single card ===== */
type ScriptCardProps = {
  script: Script;
  client: Client;
  color: string;
  expanded: boolean;
  dragging: boolean;
  moving: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onToggle: () => void;
  onUpdate: (id: number, patch: Partial<Script>) => Promise<void>;
  onOpenClient: () => void;
};

function ScriptCard({ script: s, client: c, color, expanded, dragging, moving, onDragStart, onDragEnd, onToggle, onUpdate, onOpenClient }: ScriptCardProps) {
  const [refUrl, setRefUrl] = useState(s.ref_url || "");
  const [refText, setRefText] = useState(s.ref_text || "");
  const [hookText, setHookText] = useState(s.hook_text || "");
  const [bodyText, setBodyText] = useState(s.body_text || "");
  useEffect(() => { setRefUrl(s.ref_url || ""); setRefText(s.ref_text || ""); setHookText(s.hook_text || ""); setBodyText(s.body_text || ""); }, [s.id, s.ref_url, s.ref_text, s.hook_text, s.body_text]);
  const title = s.hook_text || s.hook || `Сценарий #${s.order_num}`;
  const titleShort = title.length > 70 ? title.slice(0, 67) + "..." : title;

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
      }}
    >
      <div onClick={onToggle} style={{ display: "flex", flexDirection: "column", gap: 7, cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={26} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.name} {c.surname || ""}
            </div>
            <div style={{ fontSize: 8, color: "var(--t3)", fontFamily: "monospace" }}>M{s.month_number} · #{s.order_num}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--t1)", lineHeight: 1.35, fontWeight: 500 }}>{titleShort}</div>
        {/* meta */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "var(--t3)" }}>
          {s.pub_date && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <CalendarIcon size={9} /> {fmtDateShort(s.pub_date)}
            </span>
          )}
          {s.ref_url && <span><ExternalLink size={9} style={{ display: "inline" }} /> реф</span>}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--brd)", display: "flex", flexDirection: "column", gap: 9 }}>
          {/* Hook */}
          <div>
            <label style={{ fontSize: 8, fontWeight: 700, color: "var(--t3)", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 3 }}>🎣 Хук</label>
            <textarea
              value={hookText}
              onChange={(e) => setHookText(e.target.value)}
              onBlur={() => { if (hookText !== (s.hook_text || "")) onUpdate(s.id, { hook_text: hookText }); }}
              rows={2}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, background: "rgba(0,0,0,0.35)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, outline: "none", resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
          {/* Ref URL */}
          <div>
            <label style={{ fontSize: 8, fontWeight: 700, color: "var(--t3)", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 3 }}>🎬 Ссылка на референс</label>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                value={refUrl}
                onChange={(e) => setRefUrl(e.target.value)}
                onBlur={() => { if (refUrl !== (s.ref_url || "")) onUpdate(s.id, { ref_url: refUrl }); }}
                placeholder="https://..."
                style={{ flex: 1, padding: "6px 8px", borderRadius: 6, background: "rgba(0,0,0,0.35)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 10, outline: "none" }}
              />
              {s.ref_url && (
                <a href={s.ref_url} target="_blank" rel="noopener noreferrer" style={{ padding: "6px 8px", borderRadius: 6, background: "rgba(157,107,255,0.1)", border: "1px solid var(--brd)", color: "var(--pu)", fontSize: 10, display: "inline-flex", alignItems: "center" }}>
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>
          {/* Ref text */}
          <div>
            <label style={{ fontSize: 8, fontWeight: 700, color: "var(--t3)", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 3 }}>📝 Текст референса (оригинал)</label>
            <textarea
              value={refText}
              onChange={(e) => setRefText(e.target.value)}
              onBlur={() => { if (refText !== (s.ref_text || "")) onUpdate(s.id, { ref_text: refText }); }}
              rows={3}
              placeholder="Расшифровка / текст исходного видео..."
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, background: "rgba(0,0,0,0.35)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, outline: "none", resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
          {/* Body — наш переделанный */}
          <div>
            <label style={{ fontSize: 8, fontWeight: 700, color: "var(--pu)", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 3 }}>✨ Наш сценарий</label>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              onBlur={() => { if (bodyText !== (s.body_text || "")) onUpdate(s.id, { body_text: bodyText }); }}
              rows={5}
              placeholder="Текст сценария, переписанный под клиента..."
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, background: "rgba(157,107,255,0.06)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
            />
          </div>
          {/* Actions */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <button onClick={(e) => { e.stopPropagation(); onOpenClient(); }}
              style={{ padding: "5px 9px", borderRadius: 6, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
              К карточке клиента →
            </button>
            <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
              style={{ padding: "5px 9px", borderRadius: 6, background: "transparent", border: "1px solid var(--brd)", color: "var(--t3)", fontSize: 10, fontWeight: 600, cursor: "pointer", marginLeft: "auto" }}>
              Свернуть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
