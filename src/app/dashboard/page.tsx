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
  Check, RotateCcw, PlusCircle,
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
      background: "rgba(123,63,228,0.075)",
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
        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginTop: 8 }}>
          <div style={{ width: `${Math.max(0, Math.min(100, progress))}%`, height: "100%", background: color, borderRadius: 2, transition: "width .3s" }} />
        </div>
      )}
    </div>
  );
}

/* ===== Контрактные месяцы и продления ===== */
type MonthsBlockProps = {
  clients: Client[];
  clientMonths: ClientMonth[];
  scripts: Script[];
  team: TeamMember[];
  todayIso: string;
  selectedMonth: string;
  onChange: () => Promise<void> | void;
  onOpen: (clientId: number) => void;
};

type MonthsRow = {
  c: Client;
  cm: ClientMonth;
  nextCm: ClientMonth | null;
  published: number;
  ready: number;
  plan: number;
  totalPub: number;
  totalPlan: number;
  daysToEnd: number;
  reason: "needs_renewal" | "renewed" | "onboarding";
};

function MonthsBlock(p: MonthsBlockProps) {
  const supabase = createClient();
  const [busy, setBusy] = useState<number | null>(null);
  const [editingDate, setEditingDate] = useState<number | null>(null); // cm.id
  const [editDateValue, setEditDateValue] = useState<string>("");

  async function saveEndDate(cmId: number, newEndDate: string) {
    setBusy(cmId);
    const { error } = await db.updateClientMonth(supabase, cmId, { end_date: newEndDate });
    if (error) alert("Ошибка: " + (error.message || error));
    setEditingDate(null);
    await p.onChange();
    setBusy(null);
  }
  const [renewModal, setRenewModal] = useState<{
    clientId: number;
    nextN: number;
    start_date: string;
    end_date: string;
    pkg: string;
    prevStatus: string;
  } | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  // Все строки: один M-месяц на клиента — последний созданный
  const allRows = useMemo<(MonthsRow & { archived: "paused" | "churned" | null })[]>(() => {
    const out: (MonthsRow & { archived: "paused" | "churned" | null })[] = [];
    for (const c of p.clients) {
      const all = p.clientMonths
        .filter(m => m.client_id === c.id)
        .sort((a, b) => a.month_number - b.month_number);
      if (all.length === 0) continue;
      const cm = all[all.length - 1]; // последний созданный месяц
      const nextCm = all.find(m => m.month_number === cm.month_number + 1) || null;
      const list = p.scripts.filter(s => s.client_id === c.id && s.month_number === cm.month_number);
      const published = list.filter(s => s.video_status === "published").length;
      const ready = list.filter(s => s.video_status === "ready" || s.video_status === "published").length;
      const plan = cm.package || 0;
      const totalPub = p.scripts.filter(s => s.client_id === c.id && s.video_status === "published").length;
      const totalPlan = all.reduce((s, m) => s + (m.package || 0), 0);
      const daysToEnd = daysBetween(p.todayIso, cm.end_date);
      const archived: "paused" | "churned" | null =
        c.stage === "paused" ? "paused" :
        c.stage === "churned" ? "churned" :
        cm.status === "cancelled" ? "churned" :
        null;
      // reason для активных
      const reason: MonthsRow["reason"] =
        cm.status === "onboarding" ? "onboarding"
        : nextCm ? "renewed"
        : "needs_renewal";
      out.push({ c, cm, nextCm, published, ready, plan, totalPub, totalPlan, daysToEnd, reason, archived });
    }
    return out;
  }, [p.clients, p.clientMonths, p.scripts, p.todayIso]);

  // АКТИВНЫЕ — требуют внимания
  const activeRows = useMemo(() => {
    return allRows.filter(r => {
      if (r.archived) return false;
      // closed без next → клиент закончил работу, не показываем
      if (r.cm.status === "closed" && !r.nextCm) return false;
      // active с next в planned/active И до конца >14 дней → всё ок, не светим
      if (r.cm.status === "active" && r.nextCm && r.daysToEnd > 14) return false;
      // active без next и до конца >14 дней → ещё рано
      if (r.cm.status === "active" && !r.nextCm && r.daysToEnd > 14) return false;
      return true;
    }).sort((a, b) => {
      // приоритет: needs_renewal с малыми днями → onboarding → renewed
      const ra = a.reason === "needs_renewal" ? a.daysToEnd : a.reason === "onboarding" ? 1000 : 2000;
      const rb = b.reason === "needs_renewal" ? b.daysToEnd : b.reason === "onboarding" ? 1000 : 2000;
      return ra - rb;
    });
  }, [allRows]);

  // АРХИВ
  const archivedRows = useMemo(() => allRows.filter(r => r.archived !== null), [allRows]);
  const pausedCount = archivedRows.filter(r => r.archived === "paused").length;
  const churnedCount = archivedRows.filter(r => r.archived === "churned").length;

  const renewingNow = activeRows.filter(r => r.reason === "needs_renewal" && r.daysToEnd <= 14).length;

  async function closeMonth(cmId: number) {
    setBusy(cmId);
    const { error } = await db.closeClientMonth(supabase, cmId);
    if (error) alert("Ошибка: " + (error.message || error));
    await p.onChange();
    setBusy(null);
  }

  async function reopenMonth(cmId: number) {
    setBusy(cmId);
    const { error } = await db.reopenClientMonth(supabase, cmId);
    if (error) alert("Ошибка: " + (error.message || error));
    await p.onChange();
    setBusy(null);
  }

  async function setClientStage(clientId: number, stage: string) {
    setBusy(clientId);
    const { error } = await db.updateClient(supabase, clientId, { stage });
    if (error) alert("Ошибка: " + (error.message || error));
    await p.onChange();
    setBusy(null);
  }

  function startRenew(r: MonthsRow) {
    const start = new Date(r.cm.end_date); start.setDate(start.getDate() + 1);
    const end = new Date(start); end.setDate(end.getDate() + 30);
    setRenewModal({
      clientId: r.c.id,
      nextN: r.cm.month_number + 1,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      pkg: String(r.cm.package || 20),
      prevStatus: r.cm.status,
    });
  }

  async function confirmRenew() {
    if (!renewModal) return;
    setBusy(-1);
    const pkg = parseInt(renewModal.pkg, 10);
    if (!pkg || pkg < 1) { alert("Укажи пакет"); setBusy(null); return; }
    const status: ClientMonth["status"] = renewModal.prevStatus === "closed" ? "active" : "planned";
    const { error } = await db.upsertClientMonth(supabase, {
      client_id: renewModal.clientId,
      month_number: renewModal.nextN,
      start_date: renewModal.start_date,
      end_date: renewModal.end_date,
      package: pkg,
      status,
    });
    if (error) { alert("Ошибка: " + (error.message || error)); setBusy(null); return; }
    setRenewModal(null);
    await p.onChange();
    setBusy(null);
  }

  const statusBadge = (status: string, daysToEnd: number) => {
    if (status === "closed") return { l: "✓ Закрыт", c: "var(--gr)", bg: "rgba(168,224,99,0.12)" };
    if (status === "onboarding") return { l: "🧩 Онбординг", c: "var(--cy)", bg: "rgba(66,212,244,0.12)" };
    if (status === "planned") return { l: "🕓 Запланирован", c: "var(--pu)", bg: "rgba(157,107,255,0.12)" };
    if (status === "cancelled") return { l: "— Отменён", c: "var(--t3)", bg: "rgba(255,255,255,0.04)" };
    if (daysToEnd < 0) return { l: "🔴 Просрочка", c: "var(--rd)", bg: "rgba(255,92,122,0.12)" };
    if (daysToEnd <= 5) return { l: "⏰ Заканчивается", c: "var(--or)", bg: "rgba(255,174,66,0.12)" };
    return { l: "🟢 Активен", c: "var(--gr)", bg: "rgba(168,224,99,0.12)" };
  };

  const renderRow = (r: MonthsRow & { archived?: "paused" | "churned" | null }) => {
    const tl = p.team.find(t => t.id === r.c.teamlead_id);
    const badge = statusBadge(r.cm.status, r.daysToEnd);
    const pct = r.plan > 0 ? Math.round((r.published / r.plan) * 100) : 0;
    const barColor = pct >= 80 ? "var(--gr)" : pct >= 40 ? "var(--cy)" : pct > 0 ? "var(--or)" : "var(--rd)";
    return (
      <tr key={r.cm.id} style={{ borderBottom: "1px solid rgba(157,107,255,0.08)" }}>
        <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 200, cursor: "pointer" }} onClick={() => p.onOpen(r.c.id)}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar name={`${r.c.name} ${r.c.surname || ""}`} src={r.c.avatar_url} size={32} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>{r.c.name} {r.c.surname || ""}</div>
              <div style={{ fontSize: 9, color: "var(--t3)" }}>{r.c.niche || "—"}</div>
            </div>
          </div>
        </td>
        <td style={{ padding: "12px 8px", verticalAlign: "middle", fontSize: 11, color: "var(--t2)", fontWeight: 600 }}>
          {tl ? <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar name={tl.name} src={tl.avatar_url} size={22} />{tl.name}</div> : "—"}
        </td>
        <td style={{ padding: "12px 8px", verticalAlign: "middle", textAlign: "center" }}>
          <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 16, fontWeight: 800, color: "var(--pu)" }}>M{r.cm.month_number}</span>
        </td>
        <td style={{ padding: "12px 8px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
          {editingDate === r.cm.id ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--t2)" }}>{fmtDateShort(r.cm.start_date)} →</span>
              <input
                autoFocus
                type="date"
                value={editDateValue}
                onChange={(e) => setEditDateValue(e.target.value)}
                onBlur={() => { if (editDateValue && editDateValue !== r.cm.end_date) saveEndDate(r.cm.id, editDateValue); else setEditingDate(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingDate(null);
                }}
                style={{ padding: "3px 6px", borderRadius: 5, background: "var(--bg)", border: "1px solid var(--cy)", color: "var(--t1)", fontSize: 11 }}
              />
            </div>
          ) : (
            <div
              style={{ fontSize: 11, color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}
              title="Клик — изменить дату окончания"
              onClick={(e) => { e.stopPropagation(); setEditDateValue(r.cm.end_date); setEditingDate(r.cm.id); }}
            >
              {fmtDateShort(r.cm.start_date)} → <span style={{ borderBottom: "1px dashed var(--t3)" }}>{fmtDateShort(r.cm.end_date)}</span> <span style={{ fontSize: 9, color: "var(--t3)", marginLeft: 4 }}>✎</span>
            </div>
          )}
          <div style={{ fontSize: 9, color: r.daysToEnd < 0 ? "var(--rd)" : r.daysToEnd <= 5 ? "var(--or)" : "var(--t3)", fontWeight: 600, marginTop: 1 }}>
            {r.daysToEnd < 0 ? `просрочка ${-r.daysToEnd} дн.` : `осталось ${r.daysToEnd} дн.`}
          </div>
        </td>
        <td style={{ padding: "12px 8px", verticalAlign: "middle", textAlign: "center" }}>
          <span style={{ padding: "4px 8px", borderRadius: 7, background: badge.bg, color: badge.c, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{badge.l}</span>
        </td>
        <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 160 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--t1)", fontWeight: 700 }}>📤 {r.published} / {r.plan}</span>
            <span style={{ fontSize: 10, color: barColor, fontWeight: 700 }}>{pct}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 3 }}>готово {r.ready} · буфер +{Math.max(0, r.ready - r.published)}</div>
        </td>
        <td style={{ padding: "12px 8px", verticalAlign: "middle", textAlign: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>{r.totalPub} / {r.totalPlan}</div>
          <div style={{ fontSize: 9, color: "var(--t3)" }}>за все месяцы</div>
        </td>
        <td style={{ padding: "12px 8px", verticalAlign: "middle", textAlign: "center", whiteSpace: "nowrap" }}>
          {r.archived === "paused" ? (
            <div style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
              <button onClick={() => setClientStage(r.c.id, "active")} disabled={busy === r.c.id}
                style={{ padding: "5px 9px", borderRadius: 7, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>
                ▶ Возобновить
              </button>
              <button onClick={() => { if (confirm(`Пометить ${r.c.name} как ушедшего навсегда?`)) setClientStage(r.c.id, "churned"); }}
                style={{ padding: "5px 9px", borderRadius: 7, background: "transparent", border: "1px solid var(--brd)", color: "var(--rd)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                ✕ Закрыть
              </button>
            </div>
          ) : r.archived === "churned" ? (
            <div style={{ display: "inline-flex", gap: 5, justifyContent: "center" }}>
              <button onClick={() => setClientStage(r.c.id, "active")} disabled={busy === r.c.id}
                style={{ padding: "5px 9px", borderRadius: 7, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                ↺ Вернуть
              </button>
            </div>
          ) : (
            <div style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
              {r.cm.status === "active" || r.cm.status === "onboarding" ? (
                <button onClick={() => closeMonth(r.cm.id)} disabled={busy === r.cm.id}
                  style={{ padding: "5px 9px", borderRadius: 7, background: "rgba(168,224,99,0.12)", border: "1px solid var(--gr)", color: "var(--gr)", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Check size={10} strokeWidth={2.4} /> Закрыть M
                </button>
              ) : r.cm.status === "closed" ? (
                <button onClick={() => reopenMonth(r.cm.id)} disabled={busy === r.cm.id}
                  style={{ padding: "5px 9px", borderRadius: 7, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <RotateCcw size={10} strokeWidth={2.4} /> Открыть
                </button>
              ) : null}
              {r.nextCm ? (
                <span style={{ padding: "5px 9px", borderRadius: 7, background: "rgba(157,107,255,0.12)", color: "var(--pu)", fontSize: 10, fontWeight: 700, border: "1px solid rgba(157,107,255,0.3)" }}>
                  ✓ → M{r.nextCm.month_number}
                </span>
              ) : (
                <button onClick={() => startRenew(r)}
                  style={{ padding: "5px 9px", borderRadius: 7, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 10, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <PlusCircle size={10} strokeWidth={2.4} /> + M{r.cm.month_number + 1}
                </button>
              )}
              {!r.nextCm && (
                <>
                  <button onClick={() => { if (confirm(`Поставить ${r.c.name} на паузу? Клиент скроется из списка, можно вернуть.`)) setClientStage(r.c.id, "paused"); }}
                    style={{ padding: "5px 9px", borderRadius: 7, background: "transparent", border: "1px solid var(--brd)", color: "var(--yl)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                    ⏸ Пауза
                  </button>
                  <button onClick={() => { if (confirm(`${r.c.name} больше не продлевается? Клиент уходит в архив.`)) setClientStage(r.c.id, "churned"); }}
                    style={{ padding: "5px 9px", borderRadius: 7, background: "transparent", border: "1px solid var(--brd)", color: "var(--rd)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                    ✕ Не продлевается
                  </button>
                </>
              )}
            </div>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="card" style={{ padding: 18, borderRadius: 18, marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)" }}>
          Контрактные месяцы и продления
          {renewingNow > 0 && (
            <span style={{ marginLeft: 8, padding: "2px 7px", borderRadius: 6, background: "rgba(255,174,66,0.15)", color: "var(--or)", fontSize: 10, fontWeight: 700 }}>
              {renewingNow} требует продления
            </span>
          )}
        </h3>
        <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>
          {activeRows.length} активных в работе
          {(pausedCount + churnedCount) > 0 && (
            <button onClick={() => setShowArchive(v => !v)}
              style={{ marginLeft: 12, background: "transparent", border: "none", color: "var(--cy)", fontSize: 10, fontWeight: 700, cursor: "pointer", padding: 0 }}>
              {showArchive ? "▾" : "▸"} Архив ({pausedCount + churnedCount})
            </button>
          )}
        </div>
      </div>

      {/* Активные */}
      {activeRows.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--t3)", fontSize: 12 }}>
          🎉 Никто не требует решения сейчас — все клиенты идут по плану. Когда у кого-то останется ≤14 дней до конца месяца, он появится здесь.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {["Клиент", "Тимлид", "Месяц", "Период", "Статус", "Прогресс этого месяца", "Всего по контракту", "Действия"].map((h, i) => (
                  <th key={i} style={{ textAlign: i >= 5 ? "center" : "left", padding: "10px 8px", borderBottom: "1px solid var(--brd)", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeRows.map(r => renderRow(r))}
            </tbody>
          </table>
        </div>
      )}

      {/* Архив */}
      {showArchive && archivedRows.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed var(--brd)" }}>
          <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Архив: {pausedCount > 0 && `⏸ на паузе ${pausedCount}`}{pausedCount > 0 && churnedCount > 0 && " · "}{churnedCount > 0 && `✕ ушли ${churnedCount}`}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900, opacity: 0.78 }}>
              <thead>
                <tr style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {["Клиент", "Тимлид", "Последний M", "Период", "Статус", "Прогресс", "Всего", "Действия"].map((h, i) => (
                    <th key={i} style={{ textAlign: i >= 5 ? "center" : "left", padding: "10px 8px", borderBottom: "1px solid var(--brd)", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {archivedRows.map(r => renderRow(r))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Renew modal */}
      {renewModal && (
        <div onClick={() => setRenewModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420 }}>
            <h3 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>Открыть M{renewModal.nextN}</h3>
            <p style={{ fontSize: 11, color: "var(--t3)", marginBottom: 18 }}>
              {(() => {
                const c = p.clients.find(c => c.id === renewModal.clientId);
                return c ? `${c.name} ${c.surname || ""}` : "";
              })()}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Начало</label>
                <input type="date" value={renewModal.start_date} onChange={(e) => setRenewModal({ ...renewModal, start_date: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Окончание</label>
                <input type="date" value={renewModal.end_date} onChange={(e) => setRenewModal({ ...renewModal, end_date: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12 }} />
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Пакет (роликов в месяц)</label>
              <input type="number" min={1} max={999} value={renewModal.pkg} onChange={(e) => setRenewModal({ ...renewModal, pkg: e.target.value })}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 14, fontWeight: 700 }} />
            </div>
            <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 16, padding: 10, borderRadius: 8, background: "rgba(157,107,255,0.06)", border: "1px solid var(--brd)" }}>
              {renewModal.prevStatus === "closed"
                ? "Прошлый месяц закрыт → новый станет сразу active (работа уже идёт)"
                : "Прошлый месяц ещё active → новый создастся как planned. Когда прошлый закроется — этот автоматически станет active."}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setRenewModal(null)} style={{ padding: "8px 14px", borderRadius: 8, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Отмена</button>
              <button onClick={confirmRenew} disabled={busy === -1}
                style={{ padding: "8px 18px", borderRadius: 8, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                {busy === -1 ? "..." : `Открыть M${renewModal.nextN}`}
              </button>
            </div>
          </div>
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
  sortBy: "progress" | "deadline" | "name" | "plan"; setSortBy: (v: any) => void;
  filterMenuOpen: null | "status" | "pkg" | "montager" | "teamlead" | "sort"; setFilterMenuOpen: (v: any) => void;
  collapsedTotals: boolean; setCollapsedTotals: (v: boolean) => void;
  selectedMonth: string;
  onOpen: (clientId: number) => void;
};

type ClientRow = {
  c: Client; cm: ClientMonth;
  plan: number; scrApproved: number; montage: number; ready: number; published: number;
  remaining: number; progressPct: number; daysToEnd: number; daysTotal: number;
  isOverdue: boolean; isPaused: boolean;
  status: "overdue" | "working" | "paused" | "done";
  pace: ReturnType<typeof paceOf>;
};

function ClientsBlock(p: ClientsBlockProps) {
  const rows = useMemo<ClientRow[]>(() => {
    const out: ClientRow[] = [];
    for (const c of p.clients) {
      const cm = p.clientMonths.find(m => m.client_id === c.id);
      if (!cm) continue;
      const list = p.scripts.filter(s => s.client_id === c.id && s.month_number === cm.month_number);
      const plan = cm.package || list.length || 1;
      const scrApproved = list.filter(s => s.script_status === "approved").length;
      const montage = list.filter(s => s.script_status === "approved" && (s.video_status === "inProgress" || s.video_status === "ready" || s.video_status === "published")).length;
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
      out.push({ c, cm, plan, scrApproved, montage, ready, published, remaining, progressPct, daysToEnd, daysTotal, isOverdue, isPaused, status, pace });
    }
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
    if (p.sortBy === "progress") arr.sort((a, b) => a.progressPct - b.progressPct); // меньше прогресс — выше (приоритет)
    else if (p.sortBy === "deadline") arr.sort((a, b) => a.cm.end_date.localeCompare(b.cm.end_date));
    else if (p.sortBy === "name") arr.sort((a, b) => `${a.c.name} ${a.c.surname || ""}`.localeCompare(`${b.c.name} ${b.c.surname || ""}`));
    else if (p.sortBy === "plan") arr.sort((a, b) => b.plan - a.plan);
    return arr;
  }, [filtered, p.sortBy]);

  // итоги
  const totals = useMemo(() => {
    const t = { plan: 0, scr: 0, montage: 0, ready: 0, published: 0, remaining: 0 };
    for (const r of sorted) {
      t.plan += r.plan; t.scr += r.scrApproved; t.montage += r.montage;
      t.ready += r.ready; t.published += r.published; t.remaining += r.remaining;
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
        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
        </div>
      </div>
    );
  };

  const RingProgress = ({ pct, color }: { pct: number; color: string }) => {
    const r = 16; const circ = 2 * Math.PI * r;
    return (
      <div style={{ position: "relative", width: 38, height: 38 }}>
        <svg width="38" height="38" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
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
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)" }}>
            Клиенты в работе
            <span style={{ marginLeft: 8, padding: "2px 7px", borderRadius: 6, background: "rgba(157,107,255,0.15)", color: "var(--pu)", fontSize: 10, fontWeight: 700 }}>{filtered.length}{filtered.length !== p.clients.length ? ` / ${p.clients.length}` : ""}</span>
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
                background: "rgba(0,0,0,0.25)", border: "1px solid var(--brd)",
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
            current={p.sortBy === "progress" ? "По прогрессу" : p.sortBy === "deadline" ? "По дедлайну" : p.sortBy === "name" ? "По имени" : "По плану"}
            options={[
              { v: "progress", l: "По прогрессу" },
              { v: "deadline", l: "По дедлайну" },
              { v: "name", l: "По имени" },
              { v: "plan", l: "По плану (больше)" },
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
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
            <thead>
              <tr style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {["Клиент", "Пакет", "Период", "План", "Сценарии", "Монтаж", "Готово", "Опубликовано", "Осталось", "Прогресс", "Статус", "Дедлайн", ""].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid var(--brd)", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => {
                const PIcon = r.pace.icon === "up" ? TrendingUp : r.pace.icon === "down" ? TrendingDown : Minus;
                return (
                  <tr key={r.c.id}
                    onClick={() => p.onOpen(r.c.id)}
                    style={{ borderBottom: "1px solid rgba(157,107,255,0.08)", cursor: "pointer", transition: "background .12s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(157,107,255,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    {/* Клиент */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={`${r.c.name} ${r.c.surname || ""}`} src={r.c.avatar_url} size={36} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 170 }}>
                            {r.c.name} {r.c.surname || ""}
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
                    {/* Период */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 11, color: "var(--t1)", fontWeight: 600 }}>{fmtDateShort(r.cm.start_date)} — {fmtDateShort(r.cm.end_date)}</div>
                      <div style={{ fontSize: 9, color: r.daysToEnd < 0 ? "var(--rd)" : "var(--t3)", fontWeight: 600, marginTop: 1 }}>
                        {r.daysToEnd < 0 ? `просрочка ${-r.daysToEnd}д` : `${r.daysToEnd} дней`}
                      </div>
                    </td>
                    {/* План */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", fontFamily: "'Unbounded', sans-serif", fontSize: 16, fontWeight: 800, color: "var(--t1)" }}>
                      {r.plan}
                    </td>
                    {/* Сценарии */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 110 }}><StageCell done={r.scrApproved} plan={r.plan} color="#42d4f4" /></td>
                    {/* Монтаж */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 110 }}><StageCell done={r.montage} plan={r.plan} color="#ffae42" /></td>
                    {/* Готово */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 110 }}><StageCell done={r.ready} plan={r.plan} color="#a8e063" /></td>
                    {/* Опубликовано */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", minWidth: 110 }}><StageCell done={r.published} plan={r.plan} color="#9d6bff" /></td>
                    {/* Осталось */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", fontFamily: "monospace" }}>{r.remaining}</div>
                      <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600 }}>{r.plan > 0 ? Math.round((r.remaining / r.plan) * 100) : 0}%</div>
                    </td>
                    {/* Прогресс */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle" }}>
                      <RingProgress pct={r.progressPct} color={r.progressPct >= 70 ? "#a8e063" : r.progressPct >= 40 ? "#42d4f4" : "#ffae42"} />
                    </td>
                    {/* Статус */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
                        {statusBadge(r.status)}
                        <span style={{ fontSize: 9, color: r.pace.color, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <PIcon size={9} strokeWidth={2.2} /> {r.pace.label}
                        </span>
                      </div>
                    </td>
                    {/* Дедлайн */}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)" }}>{fmtDateShort(r.cm.end_date)}</div>
                      <div style={{ fontSize: 9, color: r.daysToEnd < 0 ? "var(--rd)" : "var(--t3)", fontWeight: 600 }}>
                        {r.daysToEnd < 0 ? `${-r.daysToEnd} дн. просрочки` : `${r.daysToEnd} дней`}
                      </div>
                    </td>
                    {/* Action */}
                    <td style={{ padding: "12px 4px", verticalAlign: "middle", textAlign: "center" }}>
                      <span style={{ color: "var(--t3)", fontSize: 14 }}>⋮</span>
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={13} style={{ padding: "40px 8px", textAlign: "center", color: "var(--t3)", fontSize: 12 }}>
                  Никого не найдено по фильтрам
                </td></tr>
              )}
            </tbody>
            {/* TOTALS */}
            {sorted.length > 0 && !p.collapsedTotals && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--brd)", background: "rgba(123,63,228,0.06)" }}>
                  <td style={{ padding: "14px 8px", fontSize: 11, fontWeight: 800, color: "var(--t1)" }}>
                    Итого на {ymLabel(p.selectedMonth)}
                  </td>
                  <td style={{ padding: "14px 8px", fontSize: 11, color: "var(--t2)", fontWeight: 600 }}>{sorted.length} клиентов</td>
                  <td />
                  <td style={{ padding: "14px 8px", fontFamily: "'Unbounded', sans-serif", fontSize: 14, fontWeight: 800, color: "var(--pu)" }}>{totals.plan}</td>
                  <td style={{ padding: "14px 8px" }}><StageCell done={totals.scr} plan={totals.plan} color="#42d4f4" /></td>
                  <td style={{ padding: "14px 8px" }}><StageCell done={totals.montage} plan={totals.plan} color="#ffae42" /></td>
                  <td style={{ padding: "14px 8px" }}><StageCell done={totals.ready} plan={totals.plan} color="#a8e063" /></td>
                  <td style={{ padding: "14px 8px" }}><StageCell done={totals.published} plan={totals.plan} color="#9d6bff" /></td>
                  <td style={{ padding: "14px 8px" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", fontFamily: "monospace" }}>{totals.remaining}</div>
                    <div style={{ fontSize: 9, color: "var(--t3)" }}>{totals.plan > 0 ? Math.round((totals.remaining / totals.plan) * 100) : 0}%</div>
                  </td>
                  <td style={{ padding: "14px 8px" }}>
                    <RingProgress pct={totals.plan > 0 ? Math.round((totals.published / totals.plan) * 100) : 0} color="#9d6bff" />
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
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
              <button key={r.c.id} onClick={() => p.onOpen(r.c.id)}
                style={{ textAlign: "left", padding: 12, borderRadius: 14, background: "rgba(0,0,0,0.22)", border: "1px solid var(--brd)", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
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
                  <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", left: `${r.pace.expectedPct}%`, top: -2, bottom: -2, width: 2, background: "rgba(255,255,255,0.35)", zIndex: 2 }} />
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
    // Активные = active + closed + planned + onboarding в выбранном периоде
    // (planned тоже считаем — это уже подписанный контракт, просто ждёт старта)
    const activeMonths = clientMonths.filter(cm =>
      (cm.status === "active" || cm.status === "closed" || cm.status === "planned" || cm.status === "onboarding") &&
      cm.start_date <= me && cm.end_date >= ms
    );
    const activeClientIds = new Set(activeMonths.map(m => m.client_id));
    const activeClients = clients.filter(c => activeClientIds.has(c.id));

    // onboarding в фазе (pending > 0)
    const onboardingActive = onbProgresses.filter(o => o.pending_tasks > 0);
    const onboardingClients = onboardingActive
      .map(o => ({ progress: o, client: clients.find(c => c.id === o.client_id) }))
      .filter(x => !!x.client) as { progress: OnboardingProgress; client: Client }[];

    const planRolls = activeMonths.reduce((s, m) => s + (m.package || 0), 0);

    const scriptsByClientMonth = (cm: ClientMonth) =>
      scripts.filter(s => s.client_id === cm.client_id && s.month_number === cm.month_number);

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
      activeClients, activeMonths, planRolls,
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
        <KPICard title="Роликов в работе" value={String(data.planRolls)} caption={`план на ${shortYm(selectedMonth)}`} Icon={Film} color="#9d6bff" />
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
                <button key={c.id} onClick={() => router.push(`/dashboard/clients/${c.id}/onboarding`)} style={{ textAlign: "left", padding: 12, borderRadius: 12, background: "rgba(0,0,0,0.22)", border: "1px solid var(--brd)", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
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
                    <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
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
                <div key={client.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, background: "rgba(0,0,0,0.18)", borderLeft: `3px solid ${severity === "red" ? "var(--rd)" : "var(--yl)"}` }}>
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
              { label: "План", val: data.planRolls, color: "#9d6bff", denom: data.planRolls },
              { label: "Сценарии", val: data.scriptsApproved, color: "#42d4f4", denom: data.planRolls },
              { label: "Монтаж", val: data.videosMontage, color: "#ffae42", denom: data.planRolls },
              { label: "Готово", val: data.videosReady, color: "#a8e063", denom: data.planRolls },
              { label: "Опубликовано", val: data.videosPublished, color: "#34a853", denom: data.planRolls },
            ];
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0, alignItems: "stretch" }}>
                {stages.map((st, i) => (
                  <div key={st.label} style={{ display: "flex", flexDirection: "column", padding: "0 8px", position: "relative" }}>
                    <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, marginBottom: 6, letterSpacing: 0.3 }}>{st.label}</div>
                    <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 28, fontWeight: 800, color: st.color, lineHeight: 1, marginBottom: 8 }}>{st.val}</div>
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 4 }}>
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
                      <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 6 }}>
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
                <div key={it.id} style={{ background: "rgba(0,0,0,0.18)", borderRadius: 10, border: `1px solid ${isExpanded ? it.color + "55" : "transparent"}`, transition: "all .15s" }}>
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
                    <div style={{ minWidth: 26, height: 22, padding: "0 7px", background: it.total > 0 ? it.color : "rgba(255,255,255,0.06)", color: it.total > 0 ? "#0a0118" : "var(--t3)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{it.total}</div>
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

      {/* ===== КОНТРАКТНЫЕ МЕСЯЦЫ И ПРОДЛЕНИЯ ===== */}
      <MonthsBlock
        clients={clients}
        clientMonths={clientMonths}
        scripts={scripts}
        team={team}
        todayIso={todayIso}
        selectedMonth={selectedMonth}
        onChange={async () => {
          const cmRes = await db.getClientMonths(supabase);
          setClientMonths(cmRes?.data || []);
        }}
        onOpen={(id) => router.push(`/dashboard/clients/${id}`)}
      />

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
        selectedMonth={selectedMonth}
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
