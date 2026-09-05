"use client";
import React, { useMemo, useState } from "react";
import { Client, Script, ClientMonth, TeamMember } from "@/lib/database";
import Avatar from "@/components/Avatar";
import { VIDEO_LEAD, SCRIPT_LEAD } from "@/components/ScriptModal";
import {
  Users, Film, AlertCircle, CalendarCheck, Rocket,
  Plus, Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown,
  FileCheck2, Scissors, Send, ArrowRight, Filter,
  TrendingUp, TrendingDown, Minus,
  type LucideIcon,
} from "lucide-react";

/* Таблица «Клиенты в работе» — перенесена без изменений из старого дашборда (v1). */
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
  calTargets: Record<string, number>;                    // ключ '<clientId>:<ym>'
  onSetTarget: (clientId: number, ym: string, n: number) => void;
  canEditPlan: boolean;
  onOpen: (clientId: number) => void;
};

type ClientRow = {
  c: Client; cm: ClientMonth;
  plan: number; scrApproved: number; scrInProgress: number; montage: number; montageInProgress: number; ready: number; published: number;
  remaining: number; progressPct: number; daysToEnd: number; daysTotal: number;
  isOverdue: boolean; isPaused: boolean;
  status: "overdue" | "working" | "paused" | "done";
  pace: ReturnType<typeof paceOf>;
  // календарно-месячная статистика (по плановым датам публикаций)
  publishedInMonth: number; plannedInMonth: number; dueByToday: number; factByToday: number;
};

function ClientsBlock(p: ClientsBlockProps) {
  const [editPlan, setEditPlan] = useState<{ clientId: number; val: string } | null>(null);
  const rows = useMemo<ClientRow[]>(() => {
    const out: ClientRow[] = [];
    // Границы выбранного месяца — по ним отсекаем старые закрытые контракты
    const [selY, selM] = p.selectedMonth.split("-").map(Number);
    const periodStart = `${p.selectedMonth}-01`;
    const periodEnd = `${p.selectedMonth}-${String(new Date(selY, selM, 0).getDate()).padStart(2, "0")}`;
    // Один ряд = один клиент-месяц (если у клиента 2 пересекающихся месяца — 2 ряда)
    for (const cm of p.clientMonths) {
      const c = p.clients.find(x => x.id === cm.client_id);
      if (!c) continue;
      // Закрытые/отменённые месяцы показываем только если они попадают в выбранный
      // период. Иначе в августе висят закрытые M1–M3 с марта — лишний шум.
      if ((cm.status === "closed" || cm.status === "cancelled")
        && !(cm.start_date <= periodEnd && cm.end_date >= periodStart)) continue;
      const list = p.scripts.filter(s => s.client_id === c.id && s.month_number === cm.month_number);
      const plan = cm.package || list.length || 1;
      const scrApproved = list.filter(s => s.script_status === "approved").length;
      const scrInProgress = list.filter(s => s.script_status === "inProgress").length;
      const montage = list.filter(s => s.script_status === "approved" && (s.video_status === "inProgress" || s.video_status === "ready" || s.video_status === "published")).length;
      const montageInProgress = list.filter(s => s.script_status === "approved" && s.video_status === "inProgress").length;
      const ready = list.filter(s => s.video_status === "ready" || s.video_status === "published").length;
      const published = list.filter(s => s.video_status === "published").length;
      // календарно-месячные числа: по pub_date в выбранном месяце; «к сегодня» = строго ДО сегодня (вечерний ролik не штрафует)
      const inMonth = (s: Script) => !!s.pub_date && s.pub_date.slice(0, 7) === p.selectedMonth;
      const publishedInMonth = list.filter(s => s.video_status === "published" && inMonth(s)).length;
      // План на календарный месяц: цифра тимлида (проставлена при открытии месяца) важнее
      // автосчёта по датам карточек — карточки часто ещё без pub_date.
      const target = p.calTargets[`${c.id}:${p.selectedMonth}`];
      const byDates = list.filter(inMonth).length;
      const plannedInMonth = target != null ? target : byDates;
      const dueByDates = list.filter(s => inMonth(s) && (s.pub_date as string) < p.todayIso).length;
      // Если план задан цифрой, а даты не расставлены — «должно быть к сегодня» считаем
      // ровным темпом: сколько дней месяца прошло, столько и роликов должно выйти.
      const daysInMonth = new Date(selY, selM, 0).getDate();
      const dayNow = p.selectedMonth === p.currentYM ? Math.max(0, Number(p.todayIso.slice(8, 10)) - 1) : (p.selectedMonth < p.currentYM ? daysInMonth : 0);
      const dueByToday = target != null && byDates === 0
        ? Math.round((target * dayNow) / daysInMonth)
        : dueByDates;
      const factByToday = list.filter(s => s.video_status === "published" && inMonth(s) && (s.pub_date as string) < p.todayIso).length;
      const remaining = Math.max(0, plan - published);
      const progressPct = Math.round((published / plan) * 100);
      const daysToEnd = daysBetween(p.todayIso, cm.end_date);
      const daysTotal = Math.max(1, daysBetween(cm.start_date, cm.end_date) + 1);
      const paused = c.stage === "paused";
      const isOverdue = !paused && ((daysToEnd < 0 && published < plan) || p.overdueClientIds.has(c.id));
      const isPaused = paused || cm.status === "planned" || cm.status === "cancelled";
      const status: ClientRow["status"] = isPaused ? "paused" : isOverdue ? "overdue" : published >= plan ? "done" : "working";
      const pace = paceOf(cm.start_date, cm.end_date, p.todayIso, published, plan);
      out.push({ c, cm, plan, scrApproved, scrInProgress, montage, montageInProgress, ready, published, remaining, progressPct, daysToEnd, daysTotal, isOverdue, isPaused, status, pace, publishedInMonth, plannedInMonth, dueByToday, factByToday });
    }
    // Сортируем: клиент.id, потом по month_number — соседние месяцы одного клиента рядом
    out.sort((a, b) => a.c.id - b.c.id || a.cm.month_number - b.cm.month_number);
    return out;
  }, [p.clients, p.clientMonths, p.scripts, p.todayIso, p.overdueClientIds, p.selectedMonth, p.calTargets, p.currentYM]);

  // Сколько клиентов в этом месяце остались без проставленного плана — чтобы не терялось
  const noPlanCount = useMemo(
    () => new Set(rows.filter(r => !r.isPaused && !r.plannedInMonth).map(r => r.c.id)).size,
    [rows]
  );

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
    // Вниз: сначала активные, потом на паузе, потом закрытые (поверх выбранной сортировки)
    const rank = (r: ClientRow) => r.cm.status === "closed" ? 2 : r.status === "paused" ? 1 : 0;
    arr.sort((a, b) => rank(a) - rank(b));
    return arr;
  }, [filtered, p.sortBy]);

  // итоги
  const totals = useMemo(() => {
    const t = { plan: 0, scrInProgress: 0, montageInProgress: 0, published: 0, remaining: 0, publishedInMonth: 0, plannedInMonth: 0, dueByToday: 0, factByToday: 0 };
    for (const r of sorted) {
      t.plan += r.plan; t.scrInProgress += r.scrInProgress; t.montageInProgress += r.montageInProgress;
      t.published += r.published; t.remaining += r.remaining;
      t.publishedInMonth += r.publishedInMonth; t.plannedInMonth += r.plannedInMonth;
      t.dueByToday += r.dueByToday; t.factByToday += r.factByToday;
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

  // Опубликовано в этом месяце: факт за месяц / план на месяц (план правится по клику)
  const MonthCell = ({ pubInMonth, planned, clientId }: { pubInMonth: number; planned: number; clientId: number }) => {
    const pct = planned > 0 ? Math.round((pubInMonth / planned) * 100) : 0;
    const canEdit = p.canEditPlan && clientId > 0;
    const editing = editPlan?.clientId === clientId && clientId > 0;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 3 }}>
          <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: pubInMonth > 0 ? "#34a853" : "var(--t3)", lineHeight: 1 }}>{pubInMonth}</span>
          {editing ? (
            <input autoFocus type="number" min={0} max={999} value={editPlan!.val}
              onClick={e => e.stopPropagation()}
              onChange={e => setEditPlan({ clientId, val: e.target.value })}
              onBlur={() => { const n = parseInt(editPlan!.val, 10); if (!isNaN(n) && n >= 0) p.onSetTarget(clientId, p.selectedMonth, n); setEditPlan(null); }}
              onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditPlan(null); }}
              style={{ width: 46, padding: "2px 5px", borderRadius: 6, background: "var(--inp)", border: "1px solid var(--cy)", color: "var(--t1)", fontSize: 12, fontWeight: 700, textAlign: "center" }} />
          ) : (
            <span onClick={canEdit ? (e) => { e.stopPropagation(); setEditPlan({ clientId, val: String(planned || "") }); } : undefined}
              title={canEdit ? "Нажми, чтобы поставить план на месяц" : undefined}
              style={{ fontSize: 11, color: planned ? "var(--t3)" : "var(--or)", fontWeight: planned ? 600 : 800, cursor: canEdit ? "pointer" : "default", borderBottom: canEdit ? "1px dashed var(--brd)" : "none" }}>
              / {planned || (canEdit ? "поставить план" : "—")}
            </span>
          )}
        </div>
        {planned > 0 && (
          <div style={{ height: 4, borderRadius: 2, background: "var(--track)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "#34a853", borderRadius: 2 }} />
          </div>
        )}
      </div>
    );
  };

  // Темп к сегодня: факт vs «должно быть к сегодня» (строго до сегодня), по плановым датам
  const DueCell = ({ fact, due }: { fact: number; due: number }) => {
    const delta = fact - due;
    const color = delta >= 0 ? "var(--gr)" : delta >= -2 ? "var(--or)" : "var(--rd)";
    const PI = delta < 0 ? TrendingDown : Minus;
    const label = due === 0 ? "нет плана" : delta >= 0 ? "по плану" : `отстаём ${delta}`;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: due === 0 ? "var(--t3)" : color, lineHeight: 1 }}>{fact}</span>
          <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600 }}>/ {due}</span>
        </div>
        <div style={{ fontSize: 9, color: due === 0 ? "var(--t3)" : color, fontWeight: 700, marginTop: 3, display: "inline-flex", alignItems: "center", gap: 3 }}>
          <PI size={9} strokeWidth={2.2} /> {label}
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
            {noPlanCount > 0 && (
              <span title="Тимлид не проставил, сколько роликов должно выйти в этом месяце"
                style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(255,174,66,0.14)", color: "var(--or)", fontSize: 10, fontWeight: 800 }}>
                ⚠ без плана на месяц: {noPlanCount}
              </span>
            )}
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
                {["Клиент", "Пакет", "Сцен. в работе", "В монтаже", `Опубл. в ${RU_MONTHS[parseInt(p.selectedMonth.split("-")[1], 10) - 1]}`, "Сделано / пакет (M)", "Темп к сегодня", "Дедлайн"].map((h, i) => (
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
                  const isClosed = r.cm.status === "closed";
                  const isPausedRow = r.status === "paused";
                  const dim = isClosed || isPausedRow;
                  out.push(
                    <tr key={`row-${r.cm.id}`}
                    onClick={() => p.onOpen(r.c.id)}
                    style={{ borderBottom: "1px solid rgba(157,107,255,0.08)", cursor: "pointer", transition: "background .12s", opacity: dim ? 0.6 : 1, background: dim ? "var(--inset)" : "transparent" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(157,107,255,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = dim ? "var(--inset)" : "transparent")}>
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
                            {isClosed && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 5, background: "rgba(168,224,99,0.15)", color: "var(--gr)", letterSpacing: 0.3 }}>🔒 закрыт</span>}
                            {isPausedRow && !isClosed && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 5, background: "rgba(245,196,81,0.18)", color: "var(--yl)", letterSpacing: 0.3 }}>⏸ на паузе</span>}
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
                    {/* Опубл. в этом месяце */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 110 }}><MonthCell pubInMonth={r.publishedInMonth} planned={r.plannedInMonth} clientId={r.c.id} /></td>
                    {/* Сделано за этот месяц (текущий M-период): опубликовано / пакет */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 110 }}><StageCell done={r.published} plan={r.plan} color="#9d6bff" /></td>
                    {/* Темп к сегодня */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 110 }}><DueCell fact={r.factByToday} due={r.dueByToday} /></td>
                    {/* Дедлайн */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)" }}>{fmtDateShort(r.cm.end_date)}</div>
                      <div style={{ fontSize: 9, color: r.published >= r.plan ? "var(--gr)" : r.daysToEnd < 0 ? "var(--rd)" : "var(--t3)", fontWeight: 600 }}>
                        {r.published >= r.plan ? "✓ выполнен" : r.daysToEnd < 0 ? `${-r.daysToEnd} дн. просрочки` : `${r.daysToEnd} дней`}
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
              const tDelta = totals.factByToday - totals.dueByToday;
              const tColor = tDelta >= 0 ? "var(--gr)" : tDelta >= -5 ? "var(--or)" : "var(--rd)";
              const TI = tDelta < 0 ? TrendingDown : Minus;
              const tLabel = totals.dueByToday === 0 ? "нет плана" : tDelta >= 0 ? "по плану" : `отстаём ${tDelta}`;
              return (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--brd)", background: "rgba(123,63,228,0.06)" }}>
                  <td style={{ padding: "14px 8px", fontSize: 11, fontWeight: 800, color: "var(--t1)" }}>
                    Итого на {ymLabel(p.selectedMonth)}
                  </td>
                  <td style={{ padding: "14px 8px", fontSize: 10, color: "var(--t2)", fontWeight: 600 }}>{new Set(sorted.map(r => r.c.id)).size} клиентов · пакет {totals.plan}</td>
                  <td style={{ padding: "14px 8px" }}><WipCell n={totals.scrInProgress} color="#42d4f4" /></td>
                  <td style={{ padding: "14px 8px" }}><WipCell n={totals.montageInProgress} color="#ffae42" /></td>
                  <td style={{ padding: "14px 8px" }}><MonthCell pubInMonth={totals.publishedInMonth} planned={totals.plannedInMonth} clientId={0} /></td>
                  <td style={{ padding: "14px 8px" }}><StageCell done={totals.published} plan={totals.plan} color="#9d6bff" /></td>
                  <td style={{ padding: "14px 8px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: totals.dueByToday === 0 ? "var(--t3)" : tColor, lineHeight: 1 }}>{totals.factByToday}</span>
                      <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600 }}>/ {totals.dueByToday}</span>
                    </div>
                    <div style={{ fontSize: 9, color: totals.dueByToday === 0 ? "var(--t3)" : tColor, fontWeight: 700, marginTop: 3, display: "inline-flex", alignItems: "center", gap: 3 }}>
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
                style={{ textAlign: "left", padding: 12, borderRadius: 14, background: "var(--inset)", border: "1px solid var(--brd)", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, opacity: r.cm.status === "closed" || r.status === "paused" ? 0.6 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <Avatar name={`${r.c.name} ${r.c.surname || ""}`} src={r.c.avatar_url} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.c.name} {r.c.surname || ""}{r.cm.status === "closed" ? " 🔒" : r.status === "paused" ? " ⏸" : ""}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: r.pace.color, textTransform: "uppercase", marginTop: 2, letterSpacing: 0.4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <PIcon size={9} strokeWidth={2.2} /> {r.pace.label}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600 }}>
                  M{r.cm.month_number} · {fmtDateShort(r.cm.start_date)} — {fmtDateShort(r.cm.end_date)} · {r.published >= r.plan ? "✓ выполнен" : r.daysToEnd < 0 ? "просрочен" : `${r.daysToEnd} дн.`}
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


/** Обёртка с состоянием фильтров — чтобы вставлять таблицу одной строкой. */
export default function ClientsTable({ clients, clientMonths, scripts, team, todayIso, overdueClientIds, selectedMonth, setSelectedMonth, currentYM, calTargets, onSetTarget, canEditPlan, onOpen }: {
  clients: Client[]; clientMonths: ClientMonth[]; scripts: Script[]; team: TeamMember[]; todayIso: string; overdueClientIds: Set<number>;
  selectedMonth: string; setSelectedMonth: (v: string) => void; currentYM: string;
  calTargets: Record<string, number>; onSetTarget: (clientId: number, ym: string, n: number) => void; canEditPlan: boolean; onOpen: (id: number) => void;
}) {
  const [view, setView] = useState<"table" | "cards">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "working" | "overdue" | "paused">("all");
  const [filterPkg, setFilterPkg] = useState<"all" | number>("all");
  const [filterMontager, setFilterMontager] = useState<"all" | number>("all");
  const [filterTeamlead, setFilterTeamlead] = useState<"all" | number>("all");
  const [sortBy, setSortBy] = useState<"progress" | "deadline" | "name" | "plan" | "month">("progress");
  const [filterMenuOpen, setFilterMenuOpen] = useState<null | "status" | "pkg" | "montager" | "teamlead" | "sort">(null);
  const [collapsedTotals, setCollapsedTotals] = useState(false);
  return (
    <ClientsBlock
      clients={clients} clientMonths={clientMonths} scripts={scripts} team={team} todayIso={todayIso} overdueClientIds={overdueClientIds}
      view={view} setView={setView}
      searchQuery={searchQuery} setSearchQuery={setSearchQuery}
      filterStatus={filterStatus} setFilterStatus={setFilterStatus}
      filterPkg={filterPkg} setFilterPkg={setFilterPkg}
      filterMontager={filterMontager} setFilterMontager={setFilterMontager}
      filterTeamlead={filterTeamlead} setFilterTeamlead={setFilterTeamlead}
      sortBy={sortBy} setSortBy={setSortBy}
      filterMenuOpen={filterMenuOpen} setFilterMenuOpen={setFilterMenuOpen}
      collapsedTotals={collapsedTotals} setCollapsedTotals={setCollapsedTotals}
      selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} currentYM={currentYM}
      calTargets={calTargets} onSetTarget={onSetTarget} canEditPlan={canEditPlan} onOpen={onOpen}
    />
  );
}
