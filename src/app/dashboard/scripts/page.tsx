"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, ClientMonth, TeamMember } from "@/lib/database";
import { getStore, setStore, patchScriptInStore } from "@/lib/store";
import Avatar from "@/components/Avatar";
import KanbanBoard from "@/components/KanbanBoard";
import ScriptModal, { SCRIPT_LEAD, fmtDateShort, addDaysIso } from "@/components/ScriptModal";
import { SCRIPT_COLUMNS } from "@/components/kanbanConfigs";
import {
  Filter, ChevronDown, ChevronLeft, ChevronRight, X, CalendarDays, Table as TableIcon,
} from "lucide-react";

const RU_MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
function isoOf(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function ymOfDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function ymShift(ym: string, delta: number) { const [y, m] = ym.split("-").map(Number); return ymOfDate(new Date(y, m - 1 + delta, 1)); }
function ymLabel(ym: string) { const [y, m] = ym.split("-").map(Number); return `${RU_MONTHS[m - 1]} ${y}`; }
function mondayOf(d: Date) { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return isoOf(x); }
function daysBetween(a: string, b: string) { return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000); }
const FOCUS_OPTS = [{ v: "all", l: "Все" }, { v: "today", l: "📌 Сегодня" }, { v: "tomorrow", l: "Завтра" }, { v: "overdue", l: "⚠ Просрочено" }] as const;
function buildCalendar(ym: string): (string | null)[][] {
  const [y, m] = ym.split("-").map(Number);
  const startWd = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export default function ScriptsPage() {
  const supabase = createClient();
  const todayIso = isoOf(new Date());
  const tomorrowIso = addDaysIso(todayIso, 1);

  const cached = getStore();
  const [clients, setClients] = useState<Client[]>(cached.clients || []);
  const [allScripts, setAllScripts] = useState<Script[]>(cached.scripts || []);
  const [clientMonths, setClientMonths] = useState<ClientMonth[]>(cached.clientMonths || []);
  const [team, setTeam] = useState<TeamMember[]>(cached.team || []);
  const [loading, setLoading] = useState(!cached.scripts);
  const [view, setView] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState(mondayOf(new Date()));
  const [ym, setYm] = useState(ymOfDate(new Date()));
  const [clientFilter, setClientFilter] = useState<"all" | number>("all");
  const [tlFilter, setTlFilter] = useState<"all" | number>("all");
  const [focus, setFocus] = useState<"all" | "today" | "tomorrow" | "overdue">("all");
  const [menu, setMenu] = useState<null | "client" | "tl" | "focus">(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [me, setMe] = useState<TeamMember | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    // кэш уже показан из getStore() — обновляем в фоне
    const [cls, tm] = await Promise.all([db.getClients(supabase), db.getTeam(supabase)]);
    setClients(cls); setTeam(tm);
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (uid) setMe(tm.find(t => t.profile_id === uid) || null);
    const [all, cmRes] = await Promise.all([db.getScriptsForClients(supabase, cls.map(c => c.id)), db.getClientMonths(supabase)]);
    setAllScripts(all); setClientMonths(cmRes?.data || []);
    setStore({ clients: cls, team: tm, scripts: all, clientMonths: cmRes?.data || [] });
    setLoading(false);
  }
  async function updateScript(id: number, patch: Partial<Script>) {
    await db.updateScript(supabase, id, patch);
    setAllScripts(arr => arr.map(s => s.id === id ? { ...s, ...patch } : s));
    patchScriptInStore(id, patch);
  }

  const clientById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])) as Record<number, Client>, [clients]);
  const teamleads = useMemo(() => team.filter(t => t.member_type === "teamlead" || t.member_type === "admin"), [team]);
  const canMine = !!me && (me.member_type === "teamlead" || me.member_type === "admin");
  const mineActive = !!me && tlFilter === me.id;
  const toggleMine = () => { if (me) setTlFilter(mineActive ? "all" : me.id); };
  const cname = (id: number) => clientById[id]?.name || "?";
  const inScope = (cid: number) => {
    const c = clientById[cid]; if (!c) return false;
    if (clientFilter !== "all" && cid !== clientFilter) return false;
    if (tlFilter !== "all" && c.teamlead_id !== tlFilter) return false;
    // неактивных (пауза / ушёл) скрываем — пока их явно не выбрали в фильтре «Клиент»
    if (c.stage !== "active" && clientFilter !== cid) return false;
    return true;
  };

  type Slot = { s: Script; due: string; status: "done" | "overdue" | "due" | "frozen" };
  const planSlots = useMemo<Slot[]>(() => {
    const out: Slot[] = [];
    for (const s of allScripts) {
      if (!s.pub_date || !inScope(s.client_id)) continue;
      const due = addDaysIso(s.pub_date, -SCRIPT_LEAD);
      const frozen = clientById[s.client_id]?.stage !== "active";
      const status: Slot["status"] = s.script_status === "approved" ? "done" : frozen ? "frozen" : (due < todayIso ? "overdue" : "due");
      if (focus === "today" && due !== todayIso) continue;
      if (focus === "tomorrow" && due !== tomorrowIso) continue;
      if (focus === "overdue" && status !== "overdue") continue;
      out.push({ s, due, status });
    }
    return out;
  }, [allScripts, clientFilter, tlFilter, focus, todayIso, tomorrowIso, clientById]);

  const byClientDay = useMemo(() => {
    const m: Record<string, Record<string, Slot[]>> = {};
    for (const sl of planSlots) { ((m[sl.s.client_id] ||= {})[sl.due] ||= []).push(sl); }
    return m;
  }, [planSlots]);
  const byDay = useMemo(() => {
    const m: Record<string, Slot[]> = {};
    for (const sl of planSlots) (m[sl.due] ||= []).push(sl);
    return m;
  }, [planSlots]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)), [weekStart]);
  const weekClients = useMemo(() => {
    const ids = new Set<number>();
    for (const sl of planSlots) if (sl.due >= weekDays[0] && sl.due <= weekDays[6]) ids.add(sl.s.client_id);
    return Array.from(ids).sort((a, b) => cname(a).localeCompare(cname(b)));
  }, [planSlots, weekDays]);

  const summary = useMemo(() => {
    const all = allScripts.filter(s => s.pub_date && inScope(s.client_id) && clientById[s.client_id]?.stage === "active");
    const today = all.filter(s => s.script_status !== "approved" && addDaysIso(s.pub_date!, -SCRIPT_LEAD) === todayIso).length;
    const overdue = all.filter(s => s.script_status !== "approved" && addDaysIso(s.pub_date!, -SCRIPT_LEAD) < todayIso).length;
    const week = planSlots.filter(sl => sl.due >= weekDays[0] && sl.due <= weekDays[6]).length;
    return { today, overdue, week };
  }, [allScripts, clientFilter, tlFilter, todayIso, planSlots, weekDays]);

  // Канбан снизу — все сценарии в скоупе фильтров
  const kanbanScripts = useMemo(() => allScripts.filter(s => inScope(s.client_id)), [allScripts, clientFilter, tlFilter, clientById]);
  const scopeCount = clients.filter(c => inScope(c.id)).length;
  const openScript = openId != null ? allScripts.find(s => s.id === openId) || null : null;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;

  const statusCol = (st: Slot["status"]) => st === "done" ? "#a8e063" : st === "overdue" ? "#ff5c7a" : st === "frozen" ? "#8a8f98" : "#42d4f4";
  const chip = (sl: Slot) => {
    const col = statusCol(sl.status);
    const title = sl.s.hook_text || sl.s.hook || "";
    const txt = `#${sl.s.order_num}${title ? " · " + title : ""}`;
    return (
      <div key={sl.s.id} onClick={() => setOpenId(sl.s.id)} title={txt}
        style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 6, background: `${col}1f`, border: `1px solid ${col}55`, color: col, fontSize: 10, fontWeight: 700, cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: "100%" }}>
        {sl.status === "done" ? "✓" : sl.status === "overdue" ? "⚠" : sl.status === "frozen" ? "❄" : ""} {txt}
      </div>
    );
  };

  const Drop = ({ label, value, kind, children }: any) => (
    <div style={{ position: "relative" }}>
      <button onClick={() => setMenu(menu === kind ? null : kind)} style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
        <Filter size={11} /><span style={{ color: "var(--t3)" }}>{label}:</span>{value}<ChevronDown size={11} />
      </button>
      {menu === kind && <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, minWidth: 190, background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 10, padding: 4, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", maxHeight: 320, overflowY: "auto" }}>{children}</div>}
    </div>
  );

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Сценарии · контент-план</h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>
            На какую дату нужен сценарий по клиенту · дата = публикация − {SCRIPT_LEAD} дн.
            {(tlFilter !== "all" || clientFilter !== "all") && <span style={{ color: "var(--pu)", fontWeight: 700 }}> · {scopeCount} {scopeCount === 1 ? "клиент" : scopeCount < 5 ? "клиента" : "клиентов"} в фильтре</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", border: "1px solid var(--brd)", borderRadius: 10, overflow: "hidden" }}>
            {([["week", "Неделя", TableIcon], ["month", "Месяц", CalendarDays]] as const).map(([v, l, Ic]) => (
              <button key={v} onClick={() => setView(v)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: view === v ? "rgba(157,107,255,0.15)" : "transparent", color: view === v ? "var(--pu)" : "var(--t2)", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Ic size={13} /> {l}</button>
            ))}
          </div>
          {canMine && me && (
            <button onClick={toggleMine} title={`Только мои сценарии (${me.name})`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: `1px solid ${mineActive ? "var(--pu)" : "var(--brd)"}`, background: mineActive ? "rgba(157,107,255,0.18)" : "transparent", color: mineActive ? "var(--pu)" : "var(--t2)", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
              <Avatar name={me.name} src={me.avatar_url} size={18} /> {mineActive ? "Мои ✓" : "Мои"}
            </button>
          )}
          <Drop label="Клиент" kind="client" value={clientFilter === "all" ? "Все" : cname(clientFilter)}>
            <button onClick={() => { setClientFilter("all"); setMenu(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px" }}>Все клиенты</button>
            {clients.map(c => <button key={c.id} onClick={() => { setClientFilter(c.id); setMenu(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px", gap: 8 }}><Avatar name={c.name} src={c.avatar_url} size={20} /> {c.name} {c.surname || ""}</button>)}
          </Drop>
          <Drop label="Тимлид" kind="tl" value={tlFilter === "all" ? "Все" : (team.find(t => t.id === tlFilter)?.name || "—")}>
            <button onClick={() => { setTlFilter("all"); setMenu(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px" }}>Все тимлиды</button>
            {teamleads.map(t => <button key={t.id} onClick={() => { setTlFilter(t.id); setMenu(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px", gap: 8 }}><Avatar name={t.name} src={t.avatar_url} size={20} /> {t.name}</button>)}
          </Drop>
          <Drop label="Показать" kind="focus" value={FOCUS_OPTS.find(o => o.v === focus)!.l}>
            {FOCUS_OPTS.map(o => <button key={o.v} onClick={() => { setFocus(o.v); setMenu(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px", color: focus === o.v ? "var(--pu)" : undefined }}>{o.l}</button>)}
          </Drop>
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 10, background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)" }}>
            <button onClick={() => view === "week" ? setWeekStart(addDaysIso(weekStart, -7)) : setYm(ymShift(ym, -1))} style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", display: "flex" }}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 12, fontWeight: 700, minWidth: 110, textAlign: "center" }}>{view === "week" ? `${fmtDateShort(weekDays[0])} — ${fmtDateShort(weekDays[6])}` : ymLabel(ym)}</span>
            <button onClick={() => view === "week" ? setWeekStart(addDaysIso(weekStart, 7)) : setYm(ymShift(ym, 1))} style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", display: "flex" }}><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {/* SUMMARY */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {[{ v: summary.today, l: "на сегодня", c: "#42d4f4" }, { v: summary.overdue, l: "просрочено", c: "#ff5c7a" }, { v: summary.week, l: "за неделю", c: "#9d6bff" }].map((x, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 13, border: `1px solid ${x.v > 0 ? x.c + "55" : "var(--brd)"}`, background: x.v > 0 ? `${x.c}14` : "var(--card)" }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: x.c }} />
            <div><div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: x.v > 0 ? "var(--t1)" : "var(--t3)" }}>{x.v}</div><div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>{x.l}</div></div>
          </div>
        ))}
      </div>

      {/* CONTENT PLAN */}
      {focus !== "all" ? (
        <div className="card" style={{ padding: 0, borderRadius: 16, marginBottom: 18, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--brd)", fontSize: 12, fontWeight: 800, color: "var(--t1)" }}>
            {FOCUS_OPTS.find(o => o.v === focus)!.l} · {planSlots.length} шт.
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--t3)", marginLeft: 8 }}>— клик, чтобы открыть и поправить дату</span>
          </div>
          {planSlots.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>Ничего не найдено</div>
          ) : (
            Array.from(planSlots).sort((a, b) => a.due.localeCompare(b.due)).map(sl => {
              const c = clientById[sl.s.client_id];
              const col = statusCol(sl.status);
              const od = daysBetween(sl.due, todayIso);
              const reason = sl.status === "done" ? "готов" : sl.status === "frozen" ? "заморожен" : sl.status === "overdue" ? `просрочен ${od} дн.` : sl.due === todayIso ? "на сегодня" : sl.due === tomorrowIso ? "на завтра" : `к ${fmtDateShort(sl.due)}`;
              return (
                <button key={sl.s.id} onClick={() => setOpenId(sl.s.id)}
                  style={{ width: "100%", display: "grid", gridTemplateColumns: "1.5fr 1.4fr auto auto", gap: 12, alignItems: "center", padding: "11px 16px", borderBottom: "1px solid var(--brd)", background: "transparent", borderLeft: "none", borderRight: "none", borderTop: "none", cursor: "pointer", textAlign: "left", color: "var(--t1)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                    <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={28} />
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name} {c.surname || ""}</div><div style={{ fontSize: 9, color: "var(--t3)" }}>M{sl.s.month_number} · #{sl.s.order_num} · {team.find(t => t.id === c.teamlead_id)?.name || "—"}</div></div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sl.s.hook_text || sl.s.hook || "— без темы —"}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)", whiteSpace: "nowrap" }}>📅 {fmtDateShort(sl.due)}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: col, background: `${col}1f`, border: `1px solid ${col}55`, padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>{reason}</span>
                </button>
              );
            })
          )}
        </div>
      ) : view === "week" ? (
        <div className="card" style={{ padding: 14, borderRadius: 16, marginBottom: 18, overflowX: "auto" }}>
          {weekClients.length === 0 ? (
            <div style={{ padding: "30px", textAlign: "center", color: "var(--t3)", fontSize: 13 }}>На эту неделю сценариев не запланировано (даты ставятся в «Публикациях»)</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 6 }}>
              <thead><tr>
                <th></th>
                {weekDays.map((d, i) => <th key={d} style={{ fontSize: 10, color: d === todayIso ? "var(--cy)" : "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, padding: "6px 4px", textAlign: "center" }}>{WD[i]} {parseInt(d.split("-")[2], 10)}{d === todayIso ? " · сегодня" : ""}</th>)}
              </tr></thead>
              <tbody>
                {weekClients.map(cid => {
                  const c = clientById[cid];
                  return (
                    <tr key={cid}>
                      <td style={{ minWidth: 170, background: "var(--inset)", borderRadius: 10, padding: "8px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={26} />
                          <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>{c.name} {c.surname || ""}</div><div style={{ fontSize: 9, color: "var(--t3)" }}>{team.find(t => t.id === c.teamlead_id)?.name || "—"}</div></div>
                        </div>
                      </td>
                      {weekDays.map(d => {
                        const slots = (byClientDay[cid]?.[d] || []);
                        return (
                          <td key={d} style={{ verticalAlign: "top", background: d === todayIso ? "rgba(66,212,244,0.06)" : "var(--inset)", border: `1px solid ${d === todayIso ? "var(--cy)" : "var(--brd)"}`, borderRadius: 10, padding: 6, height: 78, minWidth: 130 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{slots.map(chip)}</div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div style={{ display: "flex", gap: 16, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--brd)", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--t2)", display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: "#42d4f4" }} />к сдаче</span>
            <span style={{ fontSize: 11, color: "var(--t2)", display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: "#ff5c7a" }} />просрочен</span>
            <span style={{ fontSize: 11, color: "var(--t2)", display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: "#a8e063" }} />готов</span>
            <span style={{ fontSize: 11, color: "var(--t3)", marginLeft: "auto" }}>Клик по сценарию → откроется карточка (референс/транскрибация/наш текст + даты)</span>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 14, borderRadius: 16, marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>{WD.map(d => <div key={d} style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 }}>{d}</div>)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {buildCalendar(ym).map((week, wi) => (
              <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                {week.map((d, di) => {
                  if (!d) return <div key={di} style={{ minHeight: 96, borderRadius: 10, background: "rgba(0,0,0,0.12)" }} />;
                  const slots = byDay[d] || [];
                  const isToday = d === todayIso;
                  return (
                    <div key={di} style={{ minHeight: 96, borderRadius: 10, padding: 7, background: isToday ? "rgba(66,212,244,0.06)" : "var(--inset)", border: `1px solid ${isToday ? "var(--cy)" : "var(--brd)"}`, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? "var(--cy)" : "var(--t2)" }}>{parseInt(d.split("-")[2], 10)}{isToday ? " · сегодня" : ""}</div>
                      {slots.slice(0, 4).map(sl => {
                        const col = statusCol(sl.status);
                        return <div key={sl.s.id} onClick={() => setOpenId(sl.s.id)} title={`${cname(sl.s.client_id)} · #${sl.s.order_num}`} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 5px", borderRadius: 6, background: `${col}1c`, border: `1px solid ${col}44`, color: col, fontSize: 9, fontWeight: 700, cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: col, flexShrink: 0 }} />{cname(sl.s.client_id)}</div>;
                      })}
                      {slots.length > 4 && <span style={{ fontSize: 8, color: "var(--t3)" }}>+{slots.length - 4}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KANBAN (доска — как сейчас) */}
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, color: "var(--t2)" }}>Доска сценариев</div>
      <KanbanBoard scripts={kanbanScripts} clients={clients} columns={SCRIPT_COLUMNS} onUpdate={updateScript} showClient emptyHint="Пусто"
        deadlineLeadDays={SCRIPT_LEAD}
        deadlineDone={(s) => s.script_status === "approved"} />

      {openScript && (
        <ScriptModal script={openScript} client={clientById[openScript.client_id]} onClose={() => setOpenId(null)} onUpdate={updateScript} />
      )}
    </div>
  );
}
