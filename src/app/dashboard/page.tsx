"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, ClientMonth, TeamMember, Profile, OnboardingProgress } from "@/lib/database";
import Avatar from "@/components/Avatar";
import {
  Users, Film, AlertCircle, CalendarCheck, Rocket,
  Plus, Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown,
  FileCheck2, Scissors, Send, ArrowRight, Filter,
  TrendingUp, TrendingDown, Minus,
  type LucideIcon,
} from "lucide-react";

/* ----- helpers ----- */
const RU_MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const RU_WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

function ymOfDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
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
function ymLabel(ym: string) { const [y, m] = ym.split("-").map(Number); return `${RU_MONTHS[m - 1]} ${y}`; }
function shortYm(ym: string) { const [y, m] = ym.split("-").map(Number); return `${RU_MONTHS[m - 1].slice(0, 3)} ${y}`; }
function fmtDateShort(s: string | null | undefined) {
  if (!s) return "—";
  const [, mm, dd] = String(s).slice(0, 10).split("-");
  const m = parseInt(mm, 10), d = parseInt(dd, 10);
  if (!m || !d) return String(s);
  return `${d} ${RU_MONTHS_GEN[m - 1]}`;
}
function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}
function todayFullRu(d: Date) {
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}, ${RU_WEEKDAYS[d.getDay()]}`;
}

/* темп: где должны быть vs где есть (в % или в роликах) */
function paceOf(start: string, end: string, today: string, doneCount: number, planCount: number) {
  if (planCount <= 0) return { delta: 0, expected: 0, actualPct: 0, expectedPct: 0, label: "—", color: "var(--t3)", icon: "neutral" as const };
  const totalDays = Math.max(1, daysBetween(start, end) + 1);
  const elapsed = Math.max(0, Math.min(totalDays, daysBetween(start, today) + 1));
  const expectedPct = (elapsed / totalDays) * 100;
  const actualPct = (doneCount / planCount) * 100;
  const expected = Math.round((elapsed / totalDays) * planCount);
  const delta = doneCount - expected; // > 0 опережаем, < 0 отстаём
  let label = "по плану";
  let color = "var(--gr)";
  let icon: "up" | "down" | "neutral" = "neutral";
  if (delta >= 2) { label = `опережаем +${delta}`; color = "var(--gr)"; icon = "up"; }
  else if (delta >= -1) { label = "по плану"; color = "var(--cy)"; icon = "neutral"; }
  else if (delta >= -3) { label = `отстаём ${delta}`; color = "var(--or)"; icon = "down"; }
  else { label = `отстаём ${delta}`; color = "var(--rd)"; icon = "down"; }
  return { delta, expected, actualPct, expectedPct, label, color, icon };
}

/* ----- KPI карточка ----- */
type KPIProps = {
  title: string;
  value: string;
  caption: string;
  Icon: LucideIcon;
  color: string;
  progress?: number;
  attention?: boolean;
  onClick?: () => void;
};

function KPICard({ title, value, caption, Icon, color, progress, attention, onClick }: KPIProps) {
  return (
    <div onClick={onClick} style={{
      background: "var(--card)",
      backdropFilter: "blur(8px)",
      border: `1px solid ${attention ? "rgba(255,92,122,0.35)" : "var(--brd)"}`,
      borderRadius: 18,
      padding: 17,
      minHeight: 122,
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      transition: "all .2s",
      cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11,
          background: `${color}22`, color,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `1px solid ${color}44`,
        }}>
          <Icon size={18} strokeWidth={1.8} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600, marginBottom: 4, lineHeight: 1.2 }}>{title}</div>
        <div style={{
          fontFamily: "'Unbounded', sans-serif", fontSize: 26, fontWeight: 800,
          color: attention ? "var(--rd)" : "var(--t1)", letterSpacing: -0.5, lineHeight: 1, marginBottom: 4,
        }}>{value}</div>
        <div style={{ fontSize: 10, color: attention ? "var(--rd)" : "var(--t2)", fontWeight: 600 }}>{caption}</div>
      </div>
      {typeof progress === "number" && (
        <div style={{ height: 4, borderRadius: 2, background: "var(--track)", overflow: "hidden", marginTop: 8 }}>
          <div style={{ width: `${Math.max(0, Math.min(100, progress))}%`, height: "100%", background: color, borderRadius: 2, transition: "width .3s" }} />
        </div>
      )}
    </div>
  );
}

/* ===== Таблица клиентов ===== */
type ClientsBlockProps = {
  clients: Client[];
  clientMonths: ClientMonth[];
  scripts: Script[];
  team: TeamMember[];
  todayIso: string;
  overdueClientIds: Set<number>;
  view: "table" | "cards";
  setView: (v: "table" | "cards") => void;
  searchQuery: string; setSearchQuery: (v: string) => void;
  filterStatus: "all" | "working" | "overdue" | "paused"; setFilterStatus: (v: any) => void;
  filterPkg: "all" | number; setFilterPkg: (v: any) => void;
  filterMontager: "all" | number; setFilterMontager: (v: any) => void;
  filterTeamlead: "all" | number; setFilterTeamlead: (v: any) => void;
  sortBy: "progress" | "deadline" | "name" | "plan" | "month"; setSortBy: (v: any) => void;
  filterMenuOpen: null | "status" | "pkg" | "montager" | "teamlead" | "sort"; setFilterMenuOpen: (v: any) => void;
  collapsedTotals: boolean; setCollapsedTotals: (v: boolean) => void;
  selectedMonth: string;
  setSelectedMonth: (v: string) => void;
  currentYM: string;
  onOpen: (clientId: number) => void;
};

type ClientRow = {
  c: Client; cm: ClientMonth;
  plan: number; scrApproved: number; scrInProgress: number; montage: number; montageInProgress: number; ready: number; published: number;
  remaining: number; progressPct: number; daysToEnd: number; daysTotal: number;
  isOverdue: boolean; isPaused: boolean;
  status: "overdue" | "working" | "paused" | "done";
  pace: ReturnType<typeof paceOf>;
};

function ClientsBlock(p: ClientsBlockProps) {
  const rows = useMemo<ClientRow[]>(() => {
    const out: ClientRow[] = [];
    // Один ряд = один клиент-месяц (если у клиента 2 пересекающихся месяца — 2 ряда)
    for (const cm of p.clientMonths) {
      const c = p.clients.find(x => x.id === cm.client_id);
      if (!c) continue;
      const list = p.scripts.filter(s => s.client_id === c.id && s.month_number === cm.month_number);
      const plan = cm.package || list.length || 1;
      const scrApproved = list.filter(s => s.script_status === "approved").length;
      const scrInProgress = list.filter(s => s.script_status === "inProgress").length;
      const montage = list.filter(s => s.script_status === "approved" && (s.video_status === "inProgress" || s.video_status === "ready" || s.video_status === "published")).length;
      const montageInProgress = list.filter(s => s.script_status === "approved" && s.video_status === "inProgress").length;
      const ready = list.filter(s => s.video_status === "ready" || s.video_status === "published").length;
      const published = list.filter(s => s.video_status === "published").length;
      const remaining = Math.max(0, plan - published);
      const progressPct = Math.round((published / plan) * 100);
      const daysToEnd = daysBetween(p.todayIso, cm.end_date);
      const daysTotal = Math.max(1, daysBetween(cm.start_date, cm.end_date) + 1);
      const isOverdue = daysToEnd < 0 || p.overdueClientIds.has(c.id);
      const isPaused = cm.status === "planned" || cm.status === "cancelled";
      const status: ClientRow["status"] = isOverdue ? "overdue" : isPaused ? "paused" : published >= plan ? "done" : "working";
      const pace = paceOf(cm.start_date, cm.end_date, p.todayIso, published, plan);
      out.push({ c, cm, plan, scrApproved, scrInProgress, montage, montageInProgress, ready, published, remaining, progressPct, daysToEnd, daysTotal, isOverdue, isPaused, status, pace });
    }
    // Сортируем: клиент.id, потом по month_number — соседние месяцы одного клиента рядом
    out.sort((a, b) => a.c.id - b.c.id || a.cm.month_number - b.cm.month_number);
    return out;
  }, [p.clients, p.clientMonths, p.scripts, p.todayIso, p.overdueClientIds]);

  // фильтры
  const filtered = useMemo(() => {
    const q = p.searchQuery.trim().toLowerCase();
    return rows.filter(r => {
      if (q) {
        const hay = `${r.c.name} ${r.c.surname || ""} ${r.c.niche || ""} ${r.c.product || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (p.filterStatus !== "all" && r.status !== p.filterStatus) return false;
      if (p.filterPkg !== "all" && r.cm.package !== p.filterPkg) return false;
      if (p.filterMontager !== "all" && r.c.montager_id !== p.filterMontager) return false;
      if (p.filterTeamlead !== "all" && r.c.teamlead_id !== p.filterTeamlead) return false;
      return true;
    });
  }, [rows, p.searchQuery, p.filterStatus, p.filterPkg, p.filterMontager, p.filterTeamlead]);

  // сортировка
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (p.sortBy === "progress") arr.sort((a, b) => a.progressPct - b.progressPct);
    else if (p.sortBy === "deadline") arr.sort((a, b) => a.cm.end_date.localeCompare(b.cm.end_date));
    else if (p.sortBy === "name") arr.sort((a, b) => `${a.c.name} ${a.c.surname || ""}`.localeCompare(`${b.c.name} ${b.c.surname || ""}`));
    else if (p.sortBy === "plan") arr.sort((a, b) => b.plan - a.plan);
    else if (p.sortBy === "month") arr.sort((a, b) => a.cm.month_number - b.cm.month_number || `${a.c.name}`.localeCompare(`${b.c.name}`));
    return arr;
  }, [filtered, p.sortBy]);

  // итоги
  const totals = useMemo(() => {
    const t = { plan: 0, scrInProgress: 0, montageInProgress: 0, published: 0, expected: 0, remaining: 0 };
    for (const r of sorted) {
      t.plan += r.plan; t.scrInProgress += r.scrInProgress; t.montageInProgress += r.montageInProgress;
      t.published += r.published; t.expected += r.pace.expected; t.remaining += r.remaining;
    }
    return t;
  }, [sorted]);

  // список пакетов из реальных данных
  const pkgOptions = useMemo(() => {
    const set = new Set<number>(rows.map(r => r.cm.package).filter(Boolean));
    return Array.from(set).sort((a, b) => a - b);
  }, [rows]);

  // монтажёры и тимлиды
  const montagers = useMemo(() => {
    const ids = new Set(p.clients.map(c => c.montager_id).filter(Boolean) as number[]);
    return p.team.filter(t => ids.has(t.id));
  }, [p.clients, p.team]);
  const teamleads = useMemo(() => {
    const ids = new Set(p.clients.map(c => c.teamlead_id).filter(Boolean) as number[]);
    return p.team.filter(t => ids.has(t.id));
  }, [p.clients, p.team]);

  const filtersActive = p.filterStatus !== "all" || p.filterPkg !== "all" || p.filterMontager !== "all" || p.filterTeamlead !== "all" || p.searchQuery.trim().length > 0;

  // helper для dropdown
  const Dropdown = ({ kind, label, current, options, onSelect }: {
    kind: NonNullable<ClientsBlockProps["filterMenuOpen"]>;
    label: string;
    current: string;
    options: { v: any; l: string }[];
    onSelect: (v: any) => void;
  }) => (
    <div style={{ position: "relative" }}>
      <button onClick={() => p.setFilterMenuOpen(p.filterMenuOpen === kind ? null : kind)}
        style={{
          padding: "8px 12px", borderRadius: 10,
          background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)",
          color: "var(--t1)", fontSize: 11, fontWeight: 600,
          cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        }}>
        <span style={{ color: "var(--t3)" }}>{label}:</span> {current}
        <ChevronDown size={11} strokeWidth={2} />
      </button>
      {p.filterMenuOpen === kind && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30,
          minWidth: 180, background: "var(--side)", border: "1px solid var(--brd)",
          borderRadius: 10, padding: 4, boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          maxHeight: 280, overflowY: "auto",
        }}>
          {options.map(opt => (
            <button key={String(opt.v)} onClick={() => { onSelect(opt.v); p.setFilterMenuOpen(null); }}
              className="nav-item" style={{ fontSize: 11, padding: "7px 10px" }}>
              {opt.l}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const statusBadge = (s: ClientRow["status"]) => {
    const map = {
      overdue:  { bg: "rgba(255,92,122,0.15)", fg: "var(--rd)", l: "🔴 Просрочка" },
      working:  { bg: "rgba(66,212,244,0.12)", fg: "var(--cy)", l: "🟦 В работе" },
      paused:   { bg: "rgba(245,196,81,0.12)", fg: "var(--yl)", l: "⏸ На паузе" },
      done:     { bg: "rgba(168,224,99,0.12)", fg: "var(--gr)", l: "✓ Готово" },
    } as const;
    const m = map[s];
    return (
      <span style={{ padding: "4px 8px", borderRadius: 7, background: m.bg, color: m.fg, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{m.l}</span>
    );
  };

  const StageCell = ({ done, plan, color }: { done: number; plan: number; color: string }) => {
    const pct = plan > 0 ? Math.round((done / plan) * 100) : 0;
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)" }}>{done}/{plan}</span>
          <span style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600 }}>{pct}%</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: "var(--track)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
        </div>
      </div>
    );
  };

  const WipCell = ({ n, color, caption }: { n: number; color: string; caption?: string }) => (
    <div>
      <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: n > 0 ? color : "var(--t3)", lineHeight: 1 }}>{n}</div>
      {caption && <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600, marginTop: 2 }}>{caption}</div>}
    </div>
  );

  // Факт vs план «на сегодня»: published против ожидаемого, с дельтой
  const PaceVsCell = ({ published, expected, pace }: { published: number; expected: number; pace: ClientRow["pace"] }) => {
    const PI = pace.icon === "up" ? TrendingUp : pace.icon === "down" ? TrendingDown : Minus;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: pace.color, lineHeight: 1 }}>{published}</span>
          <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600 }}>/ {expected}</span>
        </div>
        <div style={{ fontSize: 9, color: pace.color, fontWeight: 700, marginTop: 3, display: "inline-flex", alignItems: "center", gap: 3 }}>
          <PI size={9} strokeWidth={2.2} /> {pace.label}
        </div>
      </div>
    );
  };

  const RingProgress = ({ pct, color }: { pct: number; color: string }) => {
    const r = 16; const circ = 2 * Math.PI * r;
    return (
      <div style={{ position: "relative", width: 38, height: 38 }}>
        <svg width="38" height="38" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="19" cy="19" r={r} fill="none" stroke="var(--track)" strokeWidth="3" />
          <circle cx="19" cy="19" r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ} strokeLinecap="round" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, fontFamily: "monospace", color: "var(--t1)" }}>{pct}%</div>
      </div>
    );
  };

  return (
    <div className="card" style={{ padding: 18, borderRadius: 18 }}>
      {/* Header + Toolbar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            Клиенты в работе
            <span style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(157,107,255,0.15)", color: "var(--pu)", fontSize: 10, fontWeight: 700 }}>{new Set(filtered.map(r => r.c.id)).size} клиентов</span>
            {/* Локальный period picker — синхронизован с глобальным */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 9, background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)", marginLeft: 4 }}>
              <button onClick={() => p.setSelectedMonth(ymShift(p.selectedMonth, -1))}
                style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
                <ChevronLeft size={12} />
              </button>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)", minWidth: 76, textAlign: "center", letterSpacing: 0.2 }}>{ymLabel(p.selectedMonth)}</span>
              {p.selectedMonth !== p.currentYM && (
                <button onClick={() => p.setSelectedMonth(p.currentYM)} title="Текущий месяц"
                  style={{ background: "transparent", border: "none", color: "var(--cy)", cursor: "pointer", fontSize: 9, fontWeight: 700, padding: "1px 4px" }}>сейчас</button>
              )}
              <button onClick={() => p.setSelectedMonth(ymShift(p.selectedMonth, 1))}
                style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
                <ChevronRight size={12} />
              </button>
            </span>
          </h3>
          {/* View toggle */}
          <div style={{ display: "flex", background: "rgba(123,63,228,0.06)", border: "1px solid var(--brd)", borderRadius: 10, padding: 3 }}>
            <button onClick={() => p.setView("table")}
              style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: p.view === "table" ? "var(--pu)" : "transparent", color: p.view === "table" ? "#fff" : "var(--t2)" }}>
              ☰ Таблица
            </button>
            <button onClick={() => p.setView("cards")}
              style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: p.view === "cards" ? "var(--pu)" : "transparent", color: p.view === "cards" ? "#fff" : "var(--t2)" }}>
              ▦ Карточки
            </button>
          </div>
        </div>
        {/* Toolbar row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
            <input
              placeholder="🔍  Поиск клиента..."
              value={p.searchQuery}
              onChange={(e) => p.setSearchQuery(e.target.value)}
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 10,
                background: "var(--inset)", border: "1px solid var(--brd)",
                color: "var(--t1)", fontSize: 12, outline: "none",
              }}
            />
          </div>
          <Dropdown kind="status" label="Статус"
            current={p.filterStatus === "all" ? "Все" : p.filterStatus === "working" ? "В работе" : p.filterStatus === "overdue" ? "Просрочка" : "На паузе"}
            options={[
              { v: "all", l: "Все" }, { v: "working", l: "В работе" },
              { v: "overdue", l: "Просрочка" }, { v: "paused", l: "На паузе" },
            ]}
            onSelect={p.setFilterStatus}
          />
          <Dropdown kind="pkg" label="Пакет"
            current={p.filterPkg === "all" ? "Все" : `${p.filterPkg} роликов`}
            options={[{ v: "all", l: "Все пакеты" }, ...pkgOptions.map(pk => ({ v: pk, l: `${pk} роликов` }))]}
            onSelect={p.setFilterPkg}
          />
          <Dropdown kind="montager" label="Монтажёр"
            current={p.filterMontager === "all" ? "Все" : (p.team.find(t => t.id === p.filterMontager)?.name || "—")}
            options={[{ v: "all", l: "Все" }, ...montagers.map(t => ({ v: t.id, l: t.name }))]}
            onSelect={p.setFilterMontager}
          />
          <Dropdown kind="teamlead" label="Тимлид"
            current={p.filterTeamlead === "all" ? "Все" : (p.team.find(t => t.id === p.filterTeamlead)?.name || "—")}
            options={[{ v: "all", l: "Все" }, ...teamleads.map(t => ({ v: t.id, l: t.name }))]}
            onSelect={p.setFilterTeamlead}
          />
          <div style={{ flex: 1 }} />
          <Dropdown kind="sort" label="Сорт."
            current={p.sortBy === "progress" ? "По прогрессу" : p.sortBy === "deadline" ? "По дедлайну" : p.sortBy === "name" ? "По имени" : p.sortBy === "month" ? "По M" : "По плану"}
            options={[
              { v: "progress", l: "По прогрессу" },
              { v: "deadline", l: "По дедлайну" },
              { v: "name", l: "По имени" },
              { v: "plan", l: "По плану (больше)" },
              { v: "month", l: "📅 По M (группировка)" },
            ]}
            onSelect={p.setSortBy}
          />
          {filtersActive && (
            <button onClick={() => {
              p.setSearchQuery(""); p.setFilterStatus("all"); p.setFilterPkg("all"); p.setFilterMontager("all"); p.setFilterTeamlead("all");
            }} style={{ padding: "8px 10px", borderRadius: 10, background: "transparent", border: "1px solid var(--brd)", color: "var(--rd)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              ✕ Сбросить
            </button>
          )}
        </div>
      </div>

      {/* TABLE VIEW */}
      {p.view === "table" && (
        <div style={{ overflowX: "auto", marginLeft: -8, marginRight: -8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
            <thead>
              <tr style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {["Клиент", "Пакет", "Сцен. в работе", "В монтаже", "Опубликовано", "План сегодня", "Факт / план", "Дедлайн"].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid var(--brd)", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const out: React.ReactNode[] = [];
                let lastGroup: number | null = null;
                for (const r of sorted) {
                  // Group header — только в режиме сортировки "По M"
                  if (p.sortBy === "month" && lastGroup !== r.cm.month_number) {
                    lastGroup = r.cm.month_number;
                    const inGroup = sorted.filter(x => x.cm.month_number === r.cm.month_number);
                    const groupPkg = inGroup.reduce((s, x) => s + (x.cm.package || 0), 0);
                    const groupRemaining = inGroup.reduce((s, x) => s + x.remaining, 0);
                    out.push(
                      <tr key={`grp-${r.cm.month_number}`} style={{ background: "rgba(157,107,255,0.10)" }}>
                        <td colSpan={8} style={{ padding: "10px 8px", fontSize: 11, fontWeight: 800, color: "var(--pu)", letterSpacing: 0.3, borderBottom: "1px solid rgba(157,107,255,0.2)" }}>
                          📅 M{r.cm.month_number} — {inGroup.length} {inGroup.length === 1 ? "клиент" : inGroup.length < 5 ? "клиента" : "клиентов"}
                          <span style={{ marginLeft: 12, color: "var(--t3)", fontWeight: 600 }}>пакет {groupPkg} · осталось {groupRemaining}</span>
                        </td>
                      </tr>
                    );
                  }
                  out.push(
                    <tr key={`row-${r.cm.id}`}
                    onClick={() => p.onOpen(r.c.id)}
                    style={{ borderBottom: "1px solid rgba(157,107,255,0.08)", cursor: "pointer", transition: "background .12s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(157,107,255,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    {/* Клиент */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={`${r.c.name} ${r.c.surname || ""}`} src={r.c.avatar_url} size={36} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
                              {r.c.name} {r.c.surname || ""}
                            </div>
                            <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 5, background: "rgba(157,107,255,0.18)", color: "var(--pu)", letterSpacing: 0.3 }}>M{r.cm.month_number}</span>
                          </div>
                          <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 170 }}>
                            {r.c.niche || r.c.product || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Пакет */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", fontSize: 11, color: "var(--t2)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {r.cm.package} роликов/мес
                    </td>
                    {/* Сцен. в работе */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 90 }}><WipCell n={r.scrInProgress} color="#42d4f4" caption="пишутся" /></td>
                    {/* В монтаже */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 90 }}><WipCell n={r.montageInProgress} color="#ffae42" caption="монтируются" /></td>
                    {/* Опубликовано */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 110 }}><StageCell done={r.published} plan={r.plan} color="#34a853" /></td>
                    {/* План сегодня */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 90 }}><WipCell n={r.pace.expected} color="#9d6bff" caption="ждём к сегодня" /></td>
                    {/* Факт / план */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 110 }}><PaceVsCell published={r.published} expected={r.pace.expected} pace={r.pace} /></td>
                    {/* Дедлайн */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)" }}>{fmtDateShort(r.cm.end_date)}</div>
                      <div style={{ fontSize: 9, color: r.daysToEnd < 0 ? "var(--rd)" : "var(--t3)", fontWeight: 600 }}>
                        {r.daysToEnd < 0 ? `${-r.daysToEnd} дн. просрочки` : `${r.daysToEnd} дней`}
                      </div>
                    </td>
                  </tr>
                  );
                }
                return out;
              })()}
              {sorted.length === 0 && (
                <tr><td colSpan={8} style={{ padding: "40px 8px", textAlign: "center", color: "var(--t3)", fontSize: 12 }}>
                  Никого не найдено по фильтрам
                </td></tr>
              )}
            </tbody>
            {/* TOTALS */}
            {sorted.length > 0 && !p.collapsedTotals && (() => {
              const tDelta = totals.published - totals.expected;
              const tColor = tDelta >= 0 ? "var(--gr)" : tDelta >= -5 ? "var(--or)" : "var(--rd)";
              const TI = tDelta > 0 ? TrendingUp : tDelta < 0 ? TrendingDown : Minus;
              const tLabel = tDelta === 0 ? "по плану" : tDelta > 0 ? `опережаем +${tDelta}` : `отстаём ${tDelta}`;
              return (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--brd)", background: "rgba(123,63,228,0.06)" }}>
                  <td style={{ padding: "14px 8px", fontSize: 11, fontWeight: 800, color: "var(--t1)" }}>
                    Итого на {ymLabel(p.selectedMonth)}
                  </td>
                  <td style={{ padding: "14px 8px", fontSize: 10, color: "var(--t2)", fontWeight: 600 }}>{new Set(sorted.map(r => r.c.id)).size} клиентов · план {totals.plan}</td>
                  <td style={{ padding: "14px 8px" }}><WipCell n={totals.scrInProgress} color="#42d4f4" /></td>
                  <td style={{ padding: "14px 8px" }}><WipCell n={totals.montageInProgress} color="#ffae42" /></td>
                  <td style={{ padding: "14px 8px" }}><StageCell done={totals.published} plan={totals.plan} color="#34a853" /></td>
                  <td style={{ padding: "14px 8px" }}><WipCell n={totals.expected} color="#9d6bff" /></td>
                  <td style={{ padding: "14px 8px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: tColor, lineHeight: 1 }}>{totals.published}</span>
                      <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600 }}>/ {totals.expected}</span>
                    </div>
                    <div style={{ fontSize: 9, color: tColor, fontWeight: 700, marginTop: 3, display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <TI size={9} strokeWidth={2.2} /> {tLabel}
                    </div>
                  </td>
                  <td />
                </tr>
              </tfoot>
              );
            })()}
          </table>
          <div style={{ textAlign: "right", paddingTop: 8 }}>
            <button onClick={() => p.setCollapsedTotals(!p.collapsedTotals)}
              style={{ background: "transparent", border: "none", color: "var(--t3)", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
              {p.collapsedTotals ? "Показать итоги ↓" : "Свернуть итоги ↑"}
            </button>
          </div>
        </div>
      )}

      {/* CARDS VIEW */}
      {p.view === "cards" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {sorted.map(r => {
            const PIcon = r.pace.icon === "up" ? TrendingUp : r.pace.icon === "down" ? TrendingDown : Minus;
            return (
              <button key={r.cm.id} onClick={() => p.onOpen(r.c.id)}
                style={{ textAlign: "left", padding: 12, borderRadius: 14, background: "var(--inset)", border: "1px solid var(--brd)", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <Avatar name={`${r.c.name} ${r.c.surname || ""}`} src={r.c.avatar_url} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.c.name} {r.c.surname || ""}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: r.pace.color, textTransform: "uppercase", marginTop: 2, letterSpacing: 0.4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <PIcon size={9} strokeWidth={2.2} /> {r.pace.label}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600 }}>
                  M{r.cm.month_number} · {fmtDateShort(r.cm.start_date)} — {fmtDateShort(r.cm.end_date)} · {r.daysToEnd < 0 ? "просрочен" : `${r.daysToEnd} дн.`}
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: "var(--t2)", fontWeight: 600 }}>{r.published}/{r.plan}</span>
                    <span style={{ fontSize: 10, color: r.progressPct >= 70 ? "var(--gr)" : r.progressPct >= 40 ? "var(--cy)" : "var(--or)", fontWeight: 700 }}>{r.progressPct}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "var(--track)", overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", left: `${r.pace.expectedPct}%`, top: -2, bottom: -2, width: 2, background: "var(--marker)", zIndex: 2 }} />
                    <div style={{ width: `${r.progressPct}%`, height: "100%", background: r.progressPct >= 70 ? "linear-gradient(90deg, var(--gr), var(--cy))" : r.progressPct >= 40 ? "var(--cy)" : "var(--or)", borderRadius: 3, transition: "width .3s" }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ===== ErrorBoundary ===== */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(p: any) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  render() {
    if (this.state.error) {
      return <div style={{ padding: 24, color: "#f87171", fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Dashboard error</div>
        <div>{String(this.state.error.message || this.state.error)}</div>
        <div style={{ opacity: 0.6, marginTop: 12 }}>{this.state.error.stack}</div>
      </div>;
    }
    return this.props.children;
  }
}

/* ===== Main ===== */
function DashboardInner() {
  const router = useRouter();
  const supabase = createClient();
  const today = new Date();
  const currentYM = ymOfDate(today);
  const todayIso = today.toISOString().slice(0, 10);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [clientMonths, setClientMonths] = useState<ClientMonth[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<any[]>([]);
  const [onbProgresses, setOnbProgresses] = useState<OnboardingProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentYM);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [taskFilter, setTaskFilter] = useState<"all" | number>("all"); // team_member id or "all"
  const [taskFilterOpen, setTaskFilterOpen] = useState(false);
  const [expandedTask, setExpandedTask] = useState<"onboarding" | "scripts" | "montage" | "publish" | null>(null);
  // Clients table
  const [clientsView, setClientsView] = useState<"table" | "cards">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "working" | "overdue" | "paused">("all");
  const [filterPkg, setFilterPkg] = useState<"all" | number>("all");
  const [filterMontager, setFilterMontager] = useState<"all" | number>("all");
  const [filterTeamlead, setFilterTeamlead] = useState<"all" | number>("all");
  const [sortBy, setSortBy] = useState<"progress" | "deadline" | "name" | "plan">("progress");
  const [filterMenuOpen, setFilterMenuOpen] = useState<null | "status" | "pkg" | "montager" | "teamlead" | "sort">(null);
  const [collapsedTotals, setCollapsedTotals] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, cls, t, tasks, cmRes, onb] = await Promise.all([
          db.getProfile(supabase),
          db.getClients(supabase),
          db.getTeam(supabase),
          db.getAllOverdueTasks(supabase),
          db.getClientMonths(supabase),
          db.getAllOnboardingProgress(supabase),
        ]);
        setProfile(p);
        setClients(cls || []);
        setTeam(t || []);
        setOverdueTasks(tasks || []);
        setClientMonths(cmRes?.data || []);
        setOnbProgresses(onb || []);
        const scr = await db.getScriptsForClients(supabase, (cls || []).map(c => c.id));
        setScripts(scr);
      } catch (e: any) {
        setLoadError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ===== Я как member команды (для автофильтра) ===== */
  const myTeamMember = useMemo(() => {
    if (!profile) return null;
    return team.find(t => t.profile_id === profile.id) || null;
  }, [team, profile]);

  // Если я teamlead/montager/scriptwriter — авто-фильтр на меня при первом рендере
  useEffect(() => {
    if (!profile || !myTeamMember) return;
    if (profile.role === "owner" || profile.role === "admin") return;
    setTaskFilter(myTeamMember.id);
  }, [profile, myTeamMember]);

  /* ===== Period ===== */
  const periodRange = ymRange(selectedMonth);

  /* ===== Derived ===== */
  const data = useMemo(() => {
    const { start: ms, end: me } = periodRange;
    // Активные = active + closed + onboarding в выбранном периоде.
    // planned НЕ включаем — это будущий контракт, пока активный M не закрыт он не должен
    // считаться в плане/pipeline. Появится когда закроется предыдущий M.
    const activeMonths = clientMonths.filter(cm =>
      (cm.status === "active" || cm.status === "closed" || cm.status === "onboarding") &&
      cm.start_date <= me && cm.end_date >= ms
    );
    const activeClientIds = new Set(activeMonths.map(m => m.client_id));
    const activeClients = clients.filter(c => activeClientIds.has(c.id));

    // onboarding в фазе (pending > 0)
    const onboardingActive = onbProgresses.filter(o => o.pending_tasks > 0);
    const onboardingClients = onboardingActive
      .map(o => ({ progress: o, client: clients.find(c => c.id === o.client_id) }))
      .filter(x => !!x.client) as { progress: OnboardingProgress; client: Client }[];

    const scriptsByClientMonth = (cm: ClientMonth) =>
      scripts.filter(s => s.client_id === cm.client_id && s.month_number === cm.month_number);

    // Полный пакет всех активных M (для контекста)
    const totalPackage = activeMonths.reduce((s, m) => s + (m.package || 0), 0);
    // ОСТАЛОСЬ сделать до конца M = sum(max(0, pkg - published)) по активным
    const planRolls = activeMonths.reduce((s, m) => {
      const pub = scriptsByClientMonth(m).filter(x => x.video_status === "published").length;
      return s + Math.max(0, (m.package || 0) - pub);
    }, 0);

    let scriptsApproved = 0, scriptsReview = 0, scriptsInProg = 0, videosMontage = 0, videosReady = 0, videosPublished = 0;
    for (const cm of activeMonths) {
      const list = scriptsByClientMonth(cm);
      for (const s of list) {
        if (s.script_status === "approved") scriptsApproved++;
        else if (s.script_status === "review") scriptsReview++;
        else if (s.script_status === "inProgress") scriptsInProg++;
        if (s.video_status === "published") videosPublished++;
        else if (s.video_status === "ready") videosReady++;
        else if (s.video_status === "inProgress" && s.script_status === "approved") videosMontage++;
      }
    }
    // суммарный pending по онбордингу
    const onboardingPendingTotal = onbProgresses.reduce((s, o) => s + (o.pending_tasks || 0), 0);

    // contracts ending
    const contractsEnding = clientMonths
      .filter(cm => (cm.status === "active" || cm.status === "onboarding") && cm.end_date >= todayIso)
      .sort((a, b) => a.end_date.localeCompare(b.end_date))
      .slice(0, 6);
    const endingThisPeriod = clientMonths.filter(cm =>
      cm.status === "active" && cm.end_date >= ms && cm.end_date <= me
    );
    const renewedCount = endingThisPeriod.filter(cm =>
      clientMonths.some(x => x.client_id === cm.client_id && x.month_number > cm.month_number)
    ).length;

    // attention
    const overdueClientIds = new Set(overdueTasks.map((t: any) => t.client_id));
    const attentionClients: Array<{ client: Client; reason: string; severity: "red" | "yellow" }> = [];
    for (const c of activeClients) {
      const cm = activeMonths.find(m => m.client_id === c.id);
      if (!cm) continue;
      const list = scriptsByClientMonth(cm);
      const pub = list.filter(s => s.video_status === "published");
      const lastPub = pub.map(s => s.pub_date as string | null).filter(Boolean).sort().pop() as string | undefined;
      const daysFromPub = lastPub ? daysBetween(lastPub, todayIso) : 999;
      const daysToEnd = daysBetween(todayIso, cm.end_date);
      const rollsLeft = (cm.package || 0) - pub.length;
      if (overdueClientIds.has(c.id)) attentionClients.push({ client: c, reason: `Просрочка задач`, severity: "red" });
      else if (daysFromPub > 7 && pub.length > 0) attentionClients.push({ client: c, reason: `Нет публикаций ${daysFromPub} дн.`, severity: "red" });
      else if (pub.length === 0 && daysBetween(cm.start_date, todayIso) > 7) attentionClients.push({ client: c, reason: `Ни одной публикации с начала месяца`, severity: "red" });
      else if (rollsLeft > 0 && daysToEnd <= 7 && daysToEnd >= 0 && rollsLeft > daysToEnd) attentionClients.push({ client: c, reason: `Осталось ${rollsLeft} видео / ${daysToEnd} дн.`, severity: "yellow" });
    }
    attentionClients.sort((a, b) => (a.severity === "red" ? -1 : 1) - (b.severity === "red" ? -1 : 1));

    // pace по pipeline целиком: среднее ожидание = средняя доля прошедшего времени по активным CM
    let totalExpectedVideos = 0;
    for (const cm of activeMonths) {
      const totalDays = Math.max(1, daysBetween(cm.start_date, cm.end_date) + 1);
      const elapsed = Math.max(0, Math.min(totalDays, daysBetween(cm.start_date, todayIso) + 1));
      totalExpectedVideos += (cm.package || 0) * (elapsed / totalDays);
    }
    const expectedNow = Math.round(totalExpectedVideos);
    const pipelinePace = paceOf(ms, me, todayIso, videosPublished, expectedNow); // упрощённо
    // более точно — считаем delta по pkg
    const pipelineDelta = videosPublished - expectedNow;

    // загрузка по команде — конкретные задачи (не %)
    type TeamLoad = {
      tm: TeamMember;
      role: "scriptwriter" | "teamlead" | "montager" | "other";
      clientsCount: number;
      scriptsInProg: number;
      scriptsReview: number;
      shotsNeeded: number;
      videosMontage: number;
      videosReady: number;
      onboardingPending: number;
      clientIds: number[];
      done: number;
      totalPlan: number;
      loadPct: number;
    };
    const teamLoad: TeamLoad[] = team.map(tm => {
      const myClientsAsMontager = activeClients.filter(c => c.montager_id === tm.id);
      const myClientsAsTL = activeClients.filter(c => c.teamlead_id === tm.id);
      const isMont = myClientsAsMontager.length > 0;
      const isTL = myClientsAsTL.length > 0;
      const isScript = /сценар|script/i.test(tm.role_title || "") || tm.member_type === "scriptwriter";
      const role: TeamLoad["role"] = isScript ? "scriptwriter" : (isMont && !isTL) ? "montager" : isTL ? "teamlead" : "other";
      const myClientIds = Array.from(new Set([...myClientsAsMontager, ...myClientsAsTL].map(c => c.id)));
      const myMonths = activeMonths.filter(cm => myClientIds.includes(cm.client_id));
      let scrInProg = 0, scrRev = 0, sh = 0, vm = 0, vr = 0;
      let totalPlan = 0, done = 0;
      for (const cm of myMonths) {
        const list = scriptsByClientMonth(cm);
        totalPlan += cm.package || 0;
        for (const s of list) {
          if (s.script_status === "inProgress") scrInProg++;
          if (s.script_status === "review") scrRev++;
          if (s.script_status === "approved" && s.video_status === "notStarted") sh++;
          if (s.script_status === "approved" && s.video_status === "inProgress") vm++;
          if (s.video_status === "ready") vr++;
          // done: для монтажёра — published+ready; для остальных — approved сценариев
          if (role === "montager") {
            if (s.video_status === "published" || s.video_status === "ready") done++;
          } else {
            if (s.script_status === "approved") done++;
          }
        }
      }
      const loadPct = totalPlan > 0 ? Math.round((done / totalPlan) * 100) : 0;
      // онбординг pending по клиентам этого сотрудника
      const onboardingPending = onbProgresses
        .filter(o => myClientIds.includes(o.client_id))
        .reduce((s, o) => s + (o.pending_tasks || 0), 0);
      return { tm, role, clientsCount: myClientIds.length, scriptsInProg: scrInProg, scriptsReview: scrRev, shotsNeeded: sh, videosMontage: vm, videosReady: vr, onboardingPending, clientIds: myClientIds, done, totalPlan, loadPct };
    }).filter(x => x.clientsCount > 0)
      .sort((a, b) => b.totalPlan - a.totalPlan);

    return {
      activeClients, activeMonths, planRolls, totalPackage,
      scriptsApproved, scriptsReview, scriptsInProg,
      videosMontage, videosReady, videosPublished,
      contractsEnding, endingThisPeriod, renewedCount,
      attentionClients, teamLoad,
      onboardingClients, onboardingPendingTotal,
      expectedNow, pipelineDelta, pipelinePace,
    };
  }, [clients, clientMonths, scripts, team, overdueTasks, onbProgresses, selectedMonth]);

  /* ===== Задачи отфильтрованные по сотруднику с разбивкой по клиентам ===== */
  type TaskClientItem = { client: Client; count: number };
  const tasksByClient = useMemo(() => {
    // Фильтр клиентов: если выбран сотрудник — только его клиенты
    const tm = taskFilter === "all" ? null : team.find(t => t.id === taskFilter) || null;
    const isMyClient = (c: Client) => !tm || c.montager_id === tm.id || c.teamlead_id === tm.id;
    const isMyClientById = (cid: number) => {
      const c = clients.find(x => x.id === cid);
      return c ? isMyClient(c) : false;
    };

    // Онбординг — берём только тех у кого pending > 0 + фильтр
    const onboarding: TaskClientItem[] = onbProgresses
      .filter(o => o.pending_tasks > 0 && isMyClientById(o.client_id))
      .map(o => ({ client: clients.find(c => c.id === o.client_id)!, count: o.pending_tasks }))
      .filter(x => !!x.client)
      .sort((a, b) => b.count - a.count);

    // Активные клиент-месяцы (чтобы считать только сценарии текущего активного месяца)
    const activeMonthByClient = new Map<number, ClientMonth>();
    for (const cm of data.activeMonths) {
      activeMonthByClient.set(cm.client_id, cm);
    }
    const isInActiveMonth = (s: Script) => {
      const cm = activeMonthByClient.get(s.client_id);
      return cm && s.month_number === cm.month_number;
    };

    // Сценарии в работе (inProgress + review) — по клиентам
    const scriptsMap = new Map<number, number>();
    for (const s of scripts) {
      if (!isInActiveMonth(s)) continue;
      if (!isMyClientById(s.client_id)) continue;
      if (s.script_status === "inProgress" || s.script_status === "review") {
        scriptsMap.set(s.client_id, (scriptsMap.get(s.client_id) || 0) + 1);
      }
    }
    const scriptsWork: TaskClientItem[] = Array.from(scriptsMap.entries())
      .map(([cid, count]) => ({ client: clients.find(c => c.id === cid)!, count }))
      .filter(x => !!x.client)
      .sort((a, b) => b.count - a.count);

    // Монтаж
    const montageMap = new Map<number, number>();
    for (const s of scripts) {
      if (!isInActiveMonth(s)) continue;
      if (!isMyClientById(s.client_id)) continue;
      if (s.script_status === "approved" && s.video_status === "inProgress") {
        montageMap.set(s.client_id, (montageMap.get(s.client_id) || 0) + 1);
      }
    }
    const montage: TaskClientItem[] = Array.from(montageMap.entries())
      .map(([cid, count]) => ({ client: clients.find(c => c.id === cid)!, count }))
      .filter(x => !!x.client)
      .sort((a, b) => b.count - a.count);

    // Опубликовать (video_status=ready)
    const publishMap = new Map<number, number>();
    for (const s of scripts) {
      if (!isInActiveMonth(s)) continue;
      if (!isMyClientById(s.client_id)) continue;
      if (s.video_status === "ready") {
        publishMap.set(s.client_id, (publishMap.get(s.client_id) || 0) + 1);
      }
    }
    const publish: TaskClientItem[] = Array.from(publishMap.entries())
      .map(([cid, count]) => ({ client: clients.find(c => c.id === cid)!, count }))
      .filter(x => !!x.client)
      .sort((a, b) => b.count - a.count);

    const sum = (arr: TaskClientItem[]) => arr.reduce((s, x) => s + x.count, 0);
    return {
      onboarding, scriptsWork, montage, publish,
      onboardingClients: onboarding.length, scriptsClients: scriptsWork.length, montageClients: montage.length, publishClients: publish.length,
      onboardingTotal: sum(onboarding), scriptsTotal: sum(scriptsWork), montageTotal: sum(montage), publishTotal: sum(publish),
    };
  }, [taskFilter, team, clients, onbProgresses, scripts, data.activeMonths]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;
  if (loadError) return <div style={{ padding: 24, color: "#f87171", fontFamily: "monospace", fontSize: 12 }}>Load error: {loadError}</div>;

  const me = profile?.name || (profile?.email?.split("@")[0]) || "друг";
  const overdueCount = data.attentionClients.filter(a => a.severity === "red").length;
  const PaceIcon = data.pipelinePace.icon === "up" ? TrendingUp : data.pipelinePace.icon === "down" ? TrendingDown : Minus;

  return (
    <div className="dashboard-v3" style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* ===== HEADER ===== */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 24, fontWeight: 800, color: "var(--t1)", letterSpacing: -0.6, lineHeight: 1.15 }}>
            {greeting(today)}, {me.split(" ")[0]}! <span style={{ display: "inline-block" }}>👋</span>
          </h1>
          <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 4, fontWeight: 500 }}>{todayFullRu(today)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 12, background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)" }}>
            <button onClick={() => setSelectedMonth(s => ymShift(s, -1))} style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}><ChevronLeft size={14} /></button>
            <CalendarIcon size={14} style={{ color: "var(--t3)" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", minWidth: 90, textAlign: "center" }}>{ymLabel(selectedMonth)}</span>
            {selectedMonth !== currentYM && <button onClick={() => setSelectedMonth(currentYM)} title="Текущий месяц" style={{ background: "transparent", border: "none", color: "var(--cy)", cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "2px 6px" }}>сейчас</button>}
            <button onClick={() => setSelectedMonth(s => ymShift(s, 1))} style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}><ChevronRight size={14} /></button>
          </div>
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowAddMenu(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 12, background: "linear-gradient(135deg, var(--pu), #7b3fe4)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 800, letterSpacing: 0.3, boxShadow: "0 8px 24px rgba(123,63,228,0.35)" }}>
              <Plus size={15} strokeWidth={2.5} /> Добавить
            </button>
            {showAddMenu && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, minWidth: 200, background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 12, padding: 6, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
                {[
                  { label: "Клиента", icon: Users, path: "/dashboard/clients" },
                  { label: "Сценарий", icon: FileCheck2, path: "/dashboard/scripts" },
                ].map(it => {
                  const I = it.icon;
                  return (
                    <button key={it.label} onClick={() => { setShowAddMenu(false); router.push(it.path); }} className="nav-item" style={{ fontSize: 12, padding: "9px 10px", gap: 9 }}>
                      <I size={14} strokeWidth={1.8} /> {it.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== KPI ROW (без MRR) ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }} className="dashboard-v3-kpi">
        <KPICard title="Всего клиентов" value={String(data.activeClients.length)} caption={`активных + ${data.onboardingClients.length} на онбординге`} Icon={Users} color="#42d4f4" />
        <KPICard title="На онбординге" value={String(data.onboardingClients.length)} caption={data.onboardingClients.length === 0 ? "никто не онбордится" : `в фазе вхождения`} Icon={Rocket} color="#ffae42" onClick={data.onboardingClients.length ? () => { const el = document.getElementById("onboarding-section"); el?.scrollIntoView({ behavior: "smooth" }); } : undefined} />
        <KPICard title="Осталось сделать" value={String(data.planRolls)} caption={`из ${data.totalPackage} в пакетах`} Icon={Film} color="#9d6bff" />
        <KPICard title="Просрочено" value={String(overdueCount)} caption={overdueCount === 0 ? "всё под контролем" : "клиентов требуют внимания"} Icon={AlertCircle} color="#ff5c7a" attention={overdueCount > 0} />
      </div>

      {/* ===== ONBOARDING SECTION ===== */}
      {data.onboardingClients.length > 0 && (
        <div id="onboarding-section" className="card" style={{ padding: 18, borderRadius: 18, marginBottom: 18, borderColor: "rgba(255,174,66,0.3)", background: "linear-gradient(135deg, rgba(255,174,66,0.06), rgba(123,63,228,0.04))" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Rocket size={18} style={{ color: "#ffae42" }} strokeWidth={1.8} />
              <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)" }}>
                На онбординге
                <span style={{ marginLeft: 8, padding: "2px 7px", borderRadius: 6, background: "rgba(255,174,66,0.18)", color: "#ffae42", fontSize: 10, fontWeight: 700 }}>{data.onboardingClients.length}</span>
              </h3>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {data.onboardingClients.map(({ client: c, progress: p }) => {
              const startedDays = Math.max(0, daysBetween(((c as any).created_at as string) || todayIso, todayIso));
              const daysTotal = 10;
              const daysLeft = Math.max(0, daysTotal - startedDays);
              const dayProgressPct = Math.min(100, Math.round((startedDays / daysTotal) * 100));
              const taskProgress = p.progress_pct || 0;
              // pace по онбордингу
              const expectedDone = Math.round((startedDays / daysTotal) * (p.total_tasks - p.skipped_tasks));
              const realDone = p.done_tasks;
              const delta = realDone - expectedDone;
              const paceLabel = delta >= 0 ? `опережает +${delta}` : `отстаёт ${delta}`;
              const paceColor = delta >= 0 ? "var(--gr)" : delta >= -2 ? "var(--or)" : "var(--rd)";
              return (
                <button key={c.id} onClick={() => router.push(`/dashboard/clients/${c.id}/onboarding`)} style={{ textAlign: "left", padding: 12, borderRadius: 12, background: "var(--inset)", border: "1px solid var(--brd)", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name} {c.surname || ""}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: paceColor, textTransform: "uppercase", marginTop: 2, letterSpacing: 0.4 }}>{paceLabel}</div>
                    </div>
                    <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: "#ffae42" }}>{taskProgress}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600, marginBottom: 4 }}>
                      Задачи: {p.done_tasks}/{p.total_tasks - p.skipped_tasks} · День {startedDays}/{daysTotal}
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: "var(--track)", overflow: "hidden" }}>
                      <div style={{ width: `${taskProgress}%`, height: "100%", background: "linear-gradient(90deg, #ffae42, #ff5c7a)", borderRadius: 3, transition: "width .3s" }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== ROW 2: Attention + Pipeline ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 1fr) 2fr", gap: 12, marginBottom: 18 }} className="dashboard-v3-row2">
        <div className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)" }}>
              Требуют внимания
              {data.attentionClients.length > 0 && <span style={{ marginLeft: 8, padding: "2px 7px", borderRadius: 6, background: "rgba(255,92,122,0.15)", color: "var(--rd)", fontSize: 10, fontWeight: 700 }}>{data.attentionClients.length}</span>}
            </h3>
          </div>
          {data.attentionClients.length === 0 ? (
            <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--t3)", fontSize: 12 }}>🎉 Всё под контролем</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.attentionClients.slice(0, 4).map(({ client, reason, severity }) => (
                <div key={client.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, background: "var(--inset)", borderLeft: `3px solid ${severity === "red" ? "var(--rd)" : "var(--yl)"}` }}>
                  <Avatar name={`${client.name} ${client.surname || ""}`} src={client.avatar_url} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.name} {client.surname || ""}</div>
                    <div style={{ fontSize: 10, color: severity === "red" ? "var(--rd)" : "var(--yl)", fontWeight: 600, marginTop: 2 }}>{reason}</div>
                  </div>
                  <button onClick={() => router.push(`/dashboard/clients/${client.id}`)} style={{ padding: "6px 11px", borderRadius: 8, background: "transparent", color: severity === "red" ? "var(--rd)" : "var(--yl)", border: `1px solid ${severity === "red" ? "var(--rd)" : "var(--yl)"}`, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Перейти</button>
                </div>
              ))}
              {data.attentionClients.length > 4 && <button onClick={() => router.push("/dashboard/clients")} style={{ padding: "8px", borderRadius: 8, background: "transparent", border: "none", color: "var(--t3)", fontSize: 11, cursor: "pointer", marginTop: 4 }}>Смотреть всех ({data.attentionClients.length}) →</button>}
            </div>
          )}
        </div>

        {/* Производство контента с pace */}
        <div className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)" }}>Производство контента</h3>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 10px", borderRadius: 8,
              background: `${data.pipelinePace.color}22`,
              border: `1px solid ${data.pipelinePace.color}44`,
              color: data.pipelinePace.color,
              fontSize: 11, fontWeight: 700,
            }}>
              <PaceIcon size={12} strokeWidth={2.2} />
              {data.pipelineDelta === 0
                ? "Идём по плану"
                : data.pipelineDelta > 0
                ? `Опережаем на ${data.pipelineDelta} ${data.pipelineDelta === 1 ? "ролик" : data.pipelineDelta < 5 ? "ролика" : "роликов"}`
                : `Отстаём на ${Math.abs(data.pipelineDelta)} ${Math.abs(data.pipelineDelta) === 1 ? "ролик" : Math.abs(data.pipelineDelta) < 5 ? "ролика" : "роликов"}`}
              <span style={{ color: "var(--t3)", fontWeight: 600 }}>· сегодня ждём {data.expectedNow}</span>
            </div>
          </div>
          {(() => {
            const stages = [
              { label: "Пакет", val: data.totalPackage, color: "#9d6bff", denom: data.totalPackage },
              { label: "Сценарии", val: data.scriptsApproved, color: "#42d4f4", denom: data.totalPackage },
              { label: "Монтаж", val: data.videosMontage, color: "#ffae42", denom: data.totalPackage },
              { label: "Готово", val: data.videosReady, color: "#a8e063", denom: data.totalPackage },
              { label: "Опубликовано", val: data.videosPublished, color: "#34a853", denom: data.totalPackage },
            ];
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0, alignItems: "stretch" }}>
                {stages.map((st, i) => (
                  <div key={st.label} style={{ display: "flex", flexDirection: "column", padding: "0 8px", position: "relative" }}>
                    <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, marginBottom: 6, letterSpacing: 0.3 }}>{st.label}</div>
                    <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 28, fontWeight: 800, color: st.color, lineHeight: 1, marginBottom: 8 }}>{st.val}</div>
                    <div style={{ height: 4, borderRadius: 2, background: "var(--track)", overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ width: `${st.denom > 0 ? Math.round((st.val / st.denom) * 100) : 0}%`, height: "100%", background: st.color, borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600 }}>{st.denom > 0 ? Math.round((st.val / st.denom) * 100) : 0}%</div>
                    {i < stages.length - 1 && <ArrowRight size={14} style={{ position: "absolute", right: -7, top: 18, color: "var(--t3)", background: "var(--card)", borderRadius: "50%" }} />}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ===== ROW 3: Команда + Контракты + Сегодня ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }} className="dashboard-v3-row3">
        {/* Загрузка команды — теперь конкретные задачи */}
        <div className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)" }}>Загрузка по сотрудникам</h3>
            <span style={{ fontSize: 10, color: "var(--t3)" }}>{shortYm(selectedMonth)}</span>
          </div>
          {data.teamLoad.length === 0 ? (
            <div style={{ padding: 20, color: "var(--t3)", textAlign: "center", fontSize: 12 }}>Нет загрузки</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {data.teamLoad.slice(0, 5).map((load) => {
                const tags: { l: string; v: number; c: string }[] = [];
                if (load.role === "scriptwriter" || load.role === "teamlead") {
                  if (load.scriptsReview > 0) tags.push({ l: "на утв.", v: load.scriptsReview, c: "#42d4f4" });
                  if (load.scriptsInProg > 0) tags.push({ l: "в работе", v: load.scriptsInProg, c: "#ffae42" });
                }
                if (load.role === "montager") {
                  if (load.videosMontage > 0) tags.push({ l: "монтаж", v: load.videosMontage, c: "#9d6bff" });
                  if (load.videosReady > 0) tags.push({ l: "готово", v: load.videosReady, c: "#a8e063" });
                }
                if (load.shotsNeeded > 0 && (load.role === "teamlead" || load.role === "scriptwriter")) {
                  tags.push({ l: "снять", v: load.shotsNeeded, c: "#ff5c7a" });
                }
                const roleLabel = load.role === "scriptwriter" ? "Сценарист" : load.role === "montager" ? "Монтажёр" : load.role === "teamlead" ? "Тимлид" : load.tm.role_title || "Команда";
                const pctColor = load.loadPct >= 80 ? "var(--gr)" : load.loadPct >= 50 ? "var(--cy)" : "var(--or)";
                return (
                  <button key={load.tm.id}
                    onClick={() => { setTaskFilter(load.tm.id); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 10, background: "transparent", border: "1px solid transparent", cursor: "pointer", textAlign: "left", transition: "background .15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(157,107,255,0.05)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    title="Кликни — отфильтровать «Что нужно сделать»"
                  >
                    <Avatar name={load.tm.name} src={load.tm.avatar_url} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>{load.tm.name}</div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: pctColor }}>
                          <span style={{ color: "var(--t3)", fontWeight: 600 }}>{load.done}/{load.totalPlan}</span> · {load.loadPct}%
                        </div>
                      </div>
                      <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>{roleLabel} · {load.clientsCount} {load.clientsCount === 1 ? "клиент" : load.clientsCount < 5 ? "клиента" : "клиентов"}</div>
                      <div style={{ height: 5, borderRadius: 3, background: "var(--track)", overflow: "hidden", marginBottom: 6 }}>
                        <div style={{ width: `${load.loadPct}%`, height: "100%", background: load.loadPct >= 80 ? "linear-gradient(90deg, var(--gr), var(--cy))" : load.loadPct >= 50 ? "var(--cy)" : "var(--or)", borderRadius: 3, transition: "width .3s" }} />
                      </div>
                      {tags.length === 0 ? (
                        <div style={{ fontSize: 10, color: "var(--gr)", fontWeight: 600 }}>✓ всё закрыто</div>
                      ) : (
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {tags.map((t, i) => (
                            <span key={i} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: `${t.c}22`, color: t.c, fontWeight: 700 }}>
                              {t.v} {t.l}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <button onClick={() => router.push("/dashboard/team")} style={{ marginTop: 14, width: "100%", padding: "8px", borderRadius: 8, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Вся команда →</button>
        </div>

        {/* Что нужно сделать — с фильтром по сотруднику */}
        <div className="card" style={{ padding: 18, borderRadius: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)" }}>
              Что нужно сделать
              {(() => {
                const total = tasksByClient.onboardingTotal + tasksByClient.scriptsTotal + tasksByClient.montageTotal + tasksByClient.publishTotal;
                return total > 0 && <span style={{ marginLeft: 8, padding: "2px 7px", borderRadius: 6, background: "rgba(157,107,255,0.15)", color: "var(--pu)", fontSize: 10, fontWeight: 700 }}>{total}</span>;
              })()}
            </h3>
            {/* Фильтр сотрудника */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setTaskFilterOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 8, background: "rgba(157,107,255,0.08)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                <Filter size={11} strokeWidth={1.8} />
                {taskFilter === "all" ? "Все" : (team.find(t => t.id === taskFilter)?.name || "Сотрудник")}
                <ChevronDown size={11} />
              </button>
              {taskFilterOpen && (
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 20, minWidth: 180, background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 10, padding: 4, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", maxHeight: 280, overflowY: "auto" }}>
                  <button onClick={() => { setTaskFilter("all"); setTaskFilterOpen(false); }} className="nav-item" style={{ fontSize: 11, padding: "7px 9px", gap: 8 }}>
                    <Users size={12} strokeWidth={1.8} /> Все
                  </button>
                  {team.map(tm => (
                    <button key={tm.id} onClick={() => { setTaskFilter(tm.id); setTaskFilterOpen(false); }} className="nav-item" style={{ fontSize: 11, padding: "7px 9px", gap: 8 }}>
                      <Avatar name={tm.name} src={tm.avatar_url} size={20} /> {tm.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {([
              { id: "onboarding", Icon: Rocket, label: "Онбординг доделать", color: "#ffae42",
                items: tasksByClient.onboarding, total: tasksByClient.onboardingTotal, clientsCount: tasksByClient.onboardingClients,
                clientPath: (id: number) => `/dashboard/clients/${id}/onboarding` },
              { id: "scripts", Icon: FileCheck2, label: "Написать/утвердить сценарии", color: "#42d4f4",
                items: tasksByClient.scriptsWork, total: tasksByClient.scriptsTotal, clientsCount: tasksByClient.scriptsClients,
                clientPath: (id: number) => `/dashboard/clients/${id}` },
              { id: "montage", Icon: Scissors, label: "Смонтировать", color: "#9d6bff",
                items: tasksByClient.montage, total: tasksByClient.montageTotal, clientsCount: tasksByClient.montageClients,
                clientPath: (id: number) => `/dashboard/clients/${id}` },
              { id: "publish", Icon: Send, label: "Опубликовать", color: "#a8e063",
                items: tasksByClient.publish, total: tasksByClient.publishTotal, clientsCount: tasksByClient.publishClients,
                clientPath: (id: number) => `/dashboard/clients/${id}` },
            ] as const).map(it => {
              const I = it.Icon;
              const isExpanded = expandedTask === it.id;
              const hasItems = it.items.length > 0;
              return (
                <div key={it.id} style={{ background: "var(--inset)", borderRadius: 10, border: `1px solid ${isExpanded ? it.color + "55" : "transparent"}`, transition: "all .15s" }}>
                  <button onClick={() => setExpandedTask(isExpanded ? null : (hasItems ? it.id as any : null))}
                    disabled={!hasItems}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", border: "none", background: "transparent", cursor: hasItems ? "pointer" : "default", textAlign: "left" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: `${it.color}22`, color: it.color, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${it.color}33`, flexShrink: 0 }}>
                      <I size={15} strokeWidth={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>{it.label}</div>
                      {hasItems && <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1 }}>{it.clientsCount} {it.clientsCount === 1 ? "клиент" : it.clientsCount < 5 ? "клиента" : "клиентов"}</div>}
                    </div>
                    <div style={{ minWidth: 26, height: 22, padding: "0 7px", background: it.total > 0 ? it.color : "var(--track)", color: it.total > 0 ? "#0a0118" : "var(--t3)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{it.total}</div>
                    {hasItems && <ChevronDown size={13} style={{ color: "var(--t3)", transform: isExpanded ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s", flexShrink: 0 }} />}
                  </button>
                  {/* Раскрытый список клиентов */}
                  {isExpanded && hasItems && (
                    <div style={{ padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 4, borderTop: `1px solid ${it.color}22`, marginTop: 4, paddingTop: 8 }}>
                      {it.items.map(({ client, count }) => (
                        <button key={client.id}
                          onClick={() => router.push(it.clientPath(client.id))}
                          style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", transition: "background .12s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = `${it.color}14`)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <Avatar name={`${client.name} ${client.surname || ""}`} src={client.avatar_url} size={26} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.name} {client.surname || ""}</div>
                            {client.niche && <div style={{ fontSize: 8, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.niche}</div>}
                          </div>
                          <div style={{ minWidth: 22, height: 18, padding: "0 6px", background: it.color + "22", color: it.color, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>{count}</div>
                          <ArrowRight size={11} style={{ color: it.color, opacity: 0.6 }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {taskFilter !== "all" && (
            <div style={{ marginTop: 12, fontSize: 10, color: "var(--t3)", textAlign: "center" }}>
              Показаны задачи: <b style={{ color: "var(--pu)" }}>{team.find(t => t.id === taskFilter)?.name}</b>
              <button onClick={() => setTaskFilter("all")} style={{ marginLeft: 6, background: "transparent", border: "none", color: "var(--cy)", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>сбросить</button>
            </div>
          )}
        </div>
      </div>

      {/* ===== ПРОДЛЕНИЯ (компактный алерт вместо большой таблицы) ===== */}
      {(() => {
        const cands = clientMonths
          .filter(cm => (cm.status === "active" || cm.status === "onboarding")
            && daysBetween(todayIso, cm.end_date) <= 7
            && !clientMonths.some(x => x.client_id === cm.client_id && x.month_number === cm.month_number + 1))
          .sort((a, b) => daysBetween(todayIso, a.end_date) - daysBetween(todayIso, b.end_date));
        if (cands.length === 0) return null;
        return (
          <div className="card" style={{ padding: 16, borderRadius: 18, marginBottom: 18, borderColor: "rgba(245,196,81,0.32)", background: "linear-gradient(135deg, rgba(245,196,81,0.07), rgba(123,63,228,0.03))" }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <CalendarCheck size={16} style={{ color: "var(--yl)" }} strokeWidth={1.8} />
              Контракты на продление
              <span style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(245,196,81,0.18)", color: "var(--yl)", fontSize: 10, fontWeight: 700 }}>{cands.length}</span>
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
              {cands.map(cm => {
                const c = clients.find(x => x.id === cm.client_id);
                if (!c) return null;
                const dte = daysBetween(todayIso, cm.end_date);
                return (
                  <button key={cm.id} onClick={() => router.push(`/dashboard/clients/${cm.client_id}`)}
                    style={{ textAlign: "left", padding: 12, borderRadius: 12, background: "var(--inset)", border: "1px solid var(--brd)", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name} {c.surname || ""}</div>
                      <div style={{ fontSize: 10, color: dte < 0 ? "var(--rd)" : "var(--yl)", fontWeight: 600, marginTop: 2 }}>
                        M{cm.month_number} {dte < 0 ? `просрочен ${-dte} дн.` : `заканчивается через ${dte} дн.`}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--pu)", fontWeight: 700, whiteSpace: "nowrap" }}>Продлить →</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ===== КЛИЕНТЫ В РАБОТЕ (таблица) ===== */}
      <ClientsBlock
        clients={data.activeClients}
        clientMonths={data.activeMonths}
        scripts={scripts}
        team={team}
        todayIso={todayIso}
        overdueClientIds={new Set(overdueTasks.map((t: any) => t.client_id))}
        view={clientsView} setView={setClientsView}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        filterStatus={filterStatus} setFilterStatus={setFilterStatus}
        filterPkg={filterPkg} setFilterPkg={setFilterPkg}
        filterMontager={filterMontager} setFilterMontager={setFilterMontager}
        filterTeamlead={filterTeamlead} setFilterTeamlead={setFilterTeamlead}
        sortBy={sortBy} setSortBy={setSortBy}
        filterMenuOpen={filterMenuOpen} setFilterMenuOpen={setFilterMenuOpen}
        collapsedTotals={collapsedTotals} setCollapsedTotals={setCollapsedTotals}
        selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
        currentYM={currentYM}
        onOpen={(id) => router.push(`/dashboard/clients/${id}`)}
      />

      <style jsx>{`
        @media (max-width: 1280px) {
          :global(.dashboard-v3-kpi) { grid-template-columns: repeat(4, 1fr) !important; }
        }
        @media (max-width: 1024px) {
          :global(.dashboard-v3-kpi) { grid-template-columns: repeat(2, 1fr) !important; }
          :global(.dashboard-v3-row2) { grid-template-columns: 1fr !important; }
          :global(.dashboard-v3-row3) { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

export default function DashboardPage() {
  return <ErrorBoundary><DashboardInner /></ErrorBoundary>;
}
