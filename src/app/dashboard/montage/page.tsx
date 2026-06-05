"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, ClientMonth } from "@/lib/database";
import Avatar from "@/components/Avatar";
import KanbanBoard from "@/components/KanbanBoard";
import { MONTAGE_COLUMNS } from "@/components/kanbanConfigs";
import {
  CheckCircle2, Scissors, Eye, Clapperboard, Send, Package,
  Filter, Search, Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, X,
  type LucideIcon,
} from "lucide-react";

const RU_MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
function ymOfDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function ymShift(ym: string, delta: number) { const [y, m] = ym.split("-").map(Number); return ymOfDate(new Date(y, m - 1 + delta, 1)); }
function ymRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  return { start, end: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` };
}
function ymLabel(ym: string) { const [y, m] = ym.split("-").map(Number); return `${RU_MONTHS[m - 1]} ${y}`; }

export default function MontagePage() {
  const supabase = createClient();
  const today = new Date();
  const currentYM = ymOfDate(today);
  const [clients, setClients] = useState<Client[]>([]);
  const [allScripts, setAllScripts] = useState<Script[]>([]);
  const [clientMonths, setClientMonths] = useState<ClientMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | "all">(currentYM);
  const [clientFilter, setClientFilter] = useState<"all" | number>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const cls = await db.getClients(supabase);
    setClients(cls);
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

  // Какие (client_id, month_number) попадают в выбранный календарный период
  const activeMonthKeys = useMemo(() => {
    if (selectedMonth === "all") return null;
    const { start: ms, end: me } = ymRange(selectedMonth);
    const set = new Set<string>();
    for (const cm of clientMonths) {
      if (cm.start_date <= me && cm.end_date >= ms) set.add(`${cm.client_id}:${cm.month_number}`);
    }
    return set;
  }, [clientMonths, selectedMonth]);

  // В монтаж идут только утверждённые сценарии
  const filtered = useMemo(() => {
    return allScripts.filter(s => {
      if (s.script_status !== "approved") return false;
      const c = clients.find(x => x.id === s.client_id);
      if (!c) return false;
      if (activeMonthKeys && !activeMonthKeys.has(`${s.client_id}:${s.month_number}`)) return false;
      if (clientFilter !== "all" && s.client_id !== clientFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${c.name} ${c.surname || ""} ${s.hook_text || ""} ${s.hook || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allScripts, clients, clientFilter, searchQuery, activeMonthKeys]);

  const kpis = useMemo(() => {
    const v = (st: string) => filtered.filter(s => s.video_status === st).length;
    const queue = filtered.filter(s => s.video_status === "notStarted" || !s.video_status).length;
    return { queue, inMontage: v("inProgress"), review: v("review"), ready: v("ready"), published: v("published"), total: filtered.length };
  }, [filtered]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;

  const kpiCards: { Icon: LucideIcon; label: string; val: number; color: string }[] = [
    { Icon: CheckCircle2, label: "Согласовано · в очереди", val: kpis.queue, color: "#9d6bff" },
    { Icon: Scissors, label: "Взято в монтаж", val: kpis.inMontage, color: "#42d4f4" },
    { Icon: Eye, label: "Готово / на согласовании", val: kpis.review, color: "#ffae42" },
    { Icon: Clapperboard, label: "Готово к публикации", val: kpis.ready, color: "#34d399" },
    { Icon: Send, label: "Опубликовано", val: kpis.published, color: "#a8e063" },
    { Icon: Package, label: "Всего к монтажу", val: kpis.total, color: "#7b3fe4" },
  ];

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, color: "var(--t1)", letterSpacing: -0.5 }}>
            Монтаж
            <span style={{ marginLeft: 10, fontSize: 14, color: "var(--pu)", padding: "3px 10px", borderRadius: 8, background: "rgba(157,107,255,0.15)", fontFamily: "'Manrope', sans-serif" }}>{filtered.length}</span>
          </h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4, fontWeight: 500 }}>
            {selectedMonth === "all" ? "Утверждённые сценарии в монтаже — все месяцы" : `Монтаж за ${ymLabel(selectedMonth)}`}
            {clientFilter !== "all" && (() => { const c = clients.find(x => x.id === clientFilter); return c ? ` · ${c.name} ${c.surname || ""}` : ""; })()}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 12, background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)" }}>
            <button onClick={() => setSelectedMonth(s => s === "all" ? currentYM : ymShift(s, -1))}
              style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", padding: 4, display: "flex" }}><ChevronLeft size={14} /></button>
            <CalendarIcon size={13} style={{ color: "var(--t3)" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", minWidth: 90, textAlign: "center" }}>
              {selectedMonth === "all" ? "Всё время" : ymLabel(selectedMonth)}
            </span>
            {selectedMonth !== currentYM && selectedMonth !== "all" && (
              <button onClick={() => setSelectedMonth(currentYM)} title="Текущий месяц"
                style={{ background: "transparent", border: "none", color: "var(--cy)", cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "2px 6px" }}>сейчас</button>
            )}
            <button onClick={() => setSelectedMonth(s => s === "all" ? currentYM : ymShift(s, 1))}
              style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", padding: 4, display: "flex" }}><ChevronRight size={14} /></button>
          </div>
          <button onClick={() => setSelectedMonth(selectedMonth === "all" ? currentYM : "all")}
            style={{ padding: "8px 14px", borderRadius: 12, background: selectedMonth === "all" ? "linear-gradient(135deg, var(--pu), #7b3fe4)" : "transparent", color: selectedMonth === "all" ? "#fff" : "var(--t2)", border: selectedMonth === "all" ? "none" : "1px solid var(--brd)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {selectedMonth === "all" ? "✓ Всё время" : "Всё время"}
          </button>
        </div>
      </div>

      {/* KPI ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 18 }} className="montage-kpi">
        {kpiCards.map(it => {
          const I = it.Icon;
          return (
            <div key={it.label} style={{ background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 16, padding: 14, minHeight: 102, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: `${it.color}22`, color: it.color, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${it.color}44` }}>
                <I size={16} strokeWidth={1.8} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600, marginBottom: 3 }}>{it.label}</div>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 24, fontWeight: 800, color: "var(--t1)", lineHeight: 1 }}>{it.val}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
          <Search size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--t3)" }} />
          <input placeholder="Поиск..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", padding: "9px 12px 9px 32px", borderRadius: 10, background: "var(--inset)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, outline: "none" }} />
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setFilterMenuOpen(v => !v)}
            style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Filter size={11} strokeWidth={1.8} />
            <span style={{ color: "var(--t3)" }}>Клиент:</span>
            {clientFilter === "all" ? "Все" : (clients.find(c => c.id === clientFilter)?.name || "—")}
            <ChevronDown size={11} />
          </button>
          {filterMenuOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, minWidth: 200, background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 10, padding: 4, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", maxHeight: 320, overflowY: "auto" }}>
              <button onClick={() => { setClientFilter("all"); setFilterMenuOpen(false); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px" }}>Все клиенты</button>
              {clients.map(c => (
                <button key={c.id} onClick={() => { setClientFilter(c.id); setFilterMenuOpen(false); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px", gap: 8 }}>
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

      {/* KANBAN */}
      <KanbanBoard
        scripts={filtered}
        clients={clients}
        columns={MONTAGE_COLUMNS}
        onUpdate={updateScript}
        showClient
        emptyHint="Пусто"
      />

      <style jsx>{`
        @media (max-width: 1400px) { :global(.montage-kpi) { grid-template-columns: repeat(3, 1fr) !important; } }
        @media (max-width: 768px) { :global(.montage-kpi) { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>
    </div>
  );
}
