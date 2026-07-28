"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, TeamMember, ClientMonth } from "@/lib/database";
import Avatar from "@/components/Avatar";
import Tour, { TourButton, type TourStep } from "@/components/Tour";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, Wand2,
  Filter, ChevronDown, ChevronLeft, ChevronRight, X, ExternalLink, CalendarDays, List, type LucideIcon,
} from "lucide-react";

const RU_MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function ymOfDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function ymShift(ym: string, delta: number) { const [y, m] = ym.split("-").map(Number); return ymOfDate(new Date(y, m - 1 + delta, 1)); }
function ymLabel(ym: string) { const [y, m] = ym.split("-").map(Number); return `${RU_MONTHS[m - 1]} ${y}`; }
function isoOf(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function fmtDay(iso: string) { const [, mm, dd] = iso.split("-"); return `${parseInt(dd, 10)} ${RU_MONTHS_GEN[parseInt(mm, 10) - 1]}`; }
function addDaysIso(iso: string, n: number) { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(y, m - 1, d + n); return isoOf(dt); }

function buildCalendar(ym: string): (string | null)[][] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const startWd = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

type SlotStatus = "published" | "overdue" | "today" | "ready_waiting" | "not_ready" | "planned";
const STATUS_META: Record<SlotStatus, { color: string; label: string }> = {
  published: { color: "#34a853", label: "Опубликовано" },
  overdue: { color: "#ff5c7a", label: "Просрочено" },
  today: { color: "#ffae42", label: "Сегодня" },
  ready_waiting: { color: "#42d4f4", label: "Готово, ждёт" },
  not_ready: { color: "#6b7280", label: "Не готово" },
  planned: { color: "#9d6bff", label: "Слот (план)" },
};
// «Взят в работу» = сценарий уже начали (не «идея»). Только такие могут быть просрочены.
const isTaken = (s: Script) => !!s.script_status && s.script_status !== "notStarted";
// Пустой слот-скелет: только дата, без содержимого и не начат.
const isEmptySlot = (s: Script) => !isTaken(s) && !s.hook_text && !s.hook && !s.body_text && !s.ref_url && !s.ref_text && (!s.video_status || s.video_status === "notStarted");
function slotStatus(s: Script, todayIso: string): SlotStatus {
  if (s.video_status === "published") return "published";
  const ready = s.video_status === "ready";
  // Пустой запланированный слот (скелет) — не просрочка, это план
  if (isEmptySlot(s)) return "planned";
  // Просрочка — только для взятых в работу (по договорённости)
  if (isTaken(s) && s.pub_date && s.pub_date < todayIso) return "overdue";
  if (s.pub_date === todayIso) return "today";
  return ready ? "ready_waiting" : "not_ready";
}

export default function PublicationsPage() {
  const router = useRouter();
  const supabase = createClient();
  const today = new Date();
  const todayIso = isoOf(today);
  const currentYM = ymOfDate(today);

  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [allScripts, setAllScripts] = useState<Script[]>([]);
  const [clientMonths, setClientMonths] = useState<ClientMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [ym, setYm] = useState(currentYM);
  const [clientFilter, setClientFilter] = useState<"all" | number>("all");
  const [tlFilter, setTlFilter] = useState<"all" | number>("all");
  const [menuOpen, setMenuOpen] = useState<null | "client" | "tl">(null);
  const [view, setView] = useState<"calendar" | "archive">("calendar");
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [poolOpen, setPoolOpen] = useState(true);
  const [slotMenu, setSlotMenu] = useState<string | null>(null); // dayIso с открытым меню «+ Рилз/Карусель»
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const cls = await db.getClients(supabase);
    const tm = await db.getTeam(supabase);
    setClients(cls); setTeam(tm);
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

  // Активный контрактный месяц клиента (куда крепим слот)
  function activeMonthOf(clientId: number): number {
    const ms = clientMonths.filter(m => m.client_id === clientId && m.status !== "closed" && m.status !== "cancelled");
    return (ms.find(m => m.status === "active") || ms.find(m => m.status === "onboarding") || ms.sort((a, b) => b.month_number - a.month_number)[0])?.month_number || 1;
  }
  // Создать пустой слот-дату (скелет плана) для клиента на день, с типом контента
  async function createSlot(clientId: number, dayIso: string, contentType: "reel" | "carousel") {
    const { data } = await supabase.from("scripts").insert({
      client_id: clientId, month_number: activeMonthOf(clientId), order_num: 0,
      hook: "", ref_url: "", ref_text: "", transcription: "", hook_text: "", body_text: "", cta: "",
      description: "", script_status: "notStarted", video_status: "notStarted", pub_date: dayIso, ready_at: null,
      content_type: contentType,
    }).select().single();
    if (data) setAllScripts(arr => [...arr, data as Script]);
    setSlotMenu(null);
  }
  async function deleteSlot(id: number) {
    await db.deleteScript(supabase, id);
    setAllScripts(arr => arr.filter(s => s.id !== id));
  }

  const teamleads = useMemo(() => team.filter(t => t.member_type === "teamlead" || t.member_type === "admin"), [team]);
  const clientById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])) as Record<number, Client>, [clients]);

  // Статус контрактного месяца по ключу client:month
  const monthStatusOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const cm of clientMonths) m[`${cm.client_id}:${cm.month_number}`] = cm.status;
    return m;
  }, [clientMonths]);
  // «Реальная работа» — сценарий взят в работу или ролик уже в производстве/опубликован (не сырая идея).
  const inWork = (s: Script) =>
    s.script_status === "approved" || s.script_status === "inProgress" || s.script_status === "review" ||
    ["inProgress", "review", "ready", "published"].includes(s.video_status || "");
  // Что планируем в публикациях: активные месяцы — всё; закрытый месяц — только реальную работу
  // (чтобы неопубликованные ролики/сценарии не пропадали из плана после закрытия месяца);
  // отменённый месяц — ничего.
  const isPlannable = (s: Script) => {
    const st = monthStatusOf[`${s.client_id}:${s.month_number}`];
    if (st === "cancelled") return false;
    if (st === "closed") return inWork(s);
    return true;
  };

  const visible = useMemo(() => allScripts.filter(s => {
    const c = clientById[s.client_id];
    if (!c) return false;
    if (c.stage === "paused") return false; // на паузе — не планируем публикации
    if (clientFilter !== "all" && s.client_id !== clientFilter) return false;
    if (tlFilter !== "all" && c.teamlead_id !== tlFilter) return false;
    return true;
  }), [allScripts, clientFilter, tlFilter, clientById]);

  // Для планирования (календарь/пул/плашки): активные месяцы + реальная работа с закрытых.
  const activeVisible = useMemo(() => visible.filter(isPlannable), [visible, monthStatusOf]);

  const scheduledByDay = useMemo(() => {
    const map: Record<string, Script[]> = {};
    for (const s of activeVisible) {
      if (!s.pub_date) continue;
      if (s.pub_date.slice(0, 7) !== ym) continue;
      (map[s.pub_date] ||= []).push(s);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.client_id - b.client_id || a.order_num - b.order_num);
    return map;
  }, [activeVisible, ym]);

  const pool = useMemo(() => activeVisible.filter(s => !s.pub_date && s.video_status !== "published")
    .sort((a, b) => a.client_id - b.client_id || a.month_number - b.month_number || a.order_num - b.order_num), [activeVisible]);

  const alerts = useMemo(() => {
    let overdue = 0, todayCnt = 0, ready = 0, soon = 0;
    const soonLimit = addDaysIso(todayIso, 3);
    for (const s of activeVisible) {
      if (s.video_status === "published") continue;
      const st = slotStatus(s, todayIso);
      if (st === "overdue") overdue++;
      else if (st === "today") todayCnt++;
      if (s.video_status === "ready") ready++;
      if (st === "not_ready" && s.pub_date && s.pub_date > todayIso && s.pub_date <= soonLimit) soon++;
    }
    return { overdue, todayCnt, ready, soon };
  }, [activeVisible, todayIso]);

  async function handleDropDay(dayIso: string) {
    if (dragId == null) return;
    const id = dragId;
    setDragId(null); setDragOverDay(null);
    const s = allScripts.find(x => x.id === id);
    if (!s) return;
    // Совмещение: если на этот день у клиента есть пустой слот-скелет — «наполняем» его
    const emptyOnDay = allScripts.find(x => x.id !== id && x.client_id === s.client_id && x.pub_date === dayIso && isEmptySlot(x));
    let ctPatch: Partial<Script> = {};
    if (emptyOnDay && !isEmptySlot(s)) {
      ctPatch = { content_type: emptyOnDay.content_type || "reel" }; // сценарий занимает тип слота
      await db.deleteScript(supabase, emptyOnDay.id);
      setAllScripts(arr => arr.filter(x => x.id !== emptyOnDay.id));
    }
    if (s.pub_date !== dayIso || ctPatch.content_type) await updateScript(id, { pub_date: dayIso, ...ctPatch });
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;

  const weeks = buildCalendar(ym);
  const openScript = openId != null ? allScripts.find(s => s.id === openId) || null : null;

  const alertCards: { Icon: LucideIcon; label: string; val: number; color: string }[] = [
    { Icon: AlertTriangle, label: "Просрочено", val: alerts.overdue, color: "#ff5c7a" },
    { Icon: CalendarClock, label: "Сегодня публиковать", val: alerts.todayCnt, color: "#ffae42" },
    { Icon: CheckCircle2, label: "Готово к публикации", val: alerts.ready, color: "#42d4f4" },
    { Icon: Clock, label: "Скоро (3 дня), не готово", val: alerts.soon, color: "#9d6bff" },
  ];

  const PUB_TOUR: TourStep[] = [
    { title: "Раздел «Публикации» — контент-план", text: "Тут расставляем ролики и карусели по дням месяца: кто, что и когда выходит. Это план — сама заливка в соцсети идёт в разделе «Metricool».", action: () => setOpenId(null) },
    { target: "pub-alerts", title: "Сводка по плану", text: "Мгновенно видно: сколько просрочено, что публиковать сегодня, сколько роликов готово и что горит в ближайшие 3 дня, но ещё не готово.", action: () => setOpenId(null) },
    { target: "pub-filters", title: "Фильтры — сначала выбери клиента", text: "Чтобы расставлять даты, выбери здесь клиента. Пока выбрано «Все» — кнопки «+» на днях не появятся (иначе непонятно, кому планировать).", action: () => setOpenId(null) },
    { target: "pub-calendar", title: "Календарь — ставим даты выхода", text: "У выбранного клиента на нужном дне жми «+» → выбери 🎬 Рилз или 🖼 Карусель — появится слот. Готовый сценарий перетащи из пула на день. Крестик × на плашке — убрать из плана. Цвет плашки = статус (легенда внизу).", action: () => setOpenId(null) },
    { target: "pub-pool", title: "Пул «Не запланировано»", text: "Здесь ролики без даты. Перетаскивай их прямо на дни календаря — или используй авто-раскладку (следующий шаг).", action: () => setOpenId(null) },
    { target: "pub-auto", title: "«Разложить по дням» — автоматом", text: "Не хочешь тащить вручную — жми: выбери клиента, дату старта и шаг (напр. каждый 1 день) — CRM сама расставит все незапланированные ролики по календарю.", action: () => setOpenId(null) },
  ];

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, color: "var(--t1)", letterSpacing: -0.5 }}>Публикации</h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4, fontWeight: 500 }}>План публикаций по дням · {ymLabel(ym)}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <TourButton onClick={() => setTourOpen(true)} />
          <div style={{ display: "flex", borderRadius: 10, border: "1px solid var(--brd)", overflow: "hidden" }}>
            {([["calendar", "Календарь", CalendarDays], ["archive", "Архив", List]] as const).map(([v, lbl, Ic]) => (
              <button key={v} onClick={() => setView(v)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: view === v ? "rgba(157,107,255,0.15)" : "transparent", color: view === v ? "var(--pu)" : "var(--t2)", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                <Ic size={13} /> {lbl}
              </button>
            ))}
          </div>
          <button data-tour="pub-auto" onClick={() => setAutoOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 10, background: "linear-gradient(135deg, var(--cy), var(--pu))", color: "#fff", border: "none", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
            <Wand2 size={13} /> Разложить по дням
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)" }}>
            <button onClick={() => setYm(s => ymShift(s, -1))} style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", display: "flex" }}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", minWidth: 96, textAlign: "center" }}>{ymLabel(ym)}</span>
            <button onClick={() => setYm(s => ymShift(s, 1))} style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", display: "flex" }}><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {/* ALERT PLASHKI */}
      <div data-tour="pub-alerts" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }} className="pub-alerts">
        {alertCards.map(a => {
          const I = a.Icon;
          const on = a.val > 0;
          return (
            <div key={a.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, background: on ? `${a.color}14` : "rgba(123,63,228,0.05)", border: `1px solid ${on ? a.color + "55" : "var(--brd)"}` }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${a.color}22`, color: a.color, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${a.color}44`, flexShrink: 0 }}>
                <I size={17} strokeWidth={1.9} />
              </div>
              <div>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, color: on ? "var(--t1)" : "var(--t3)", lineHeight: 1 }}>{a.val}</div>
                <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600, marginTop: 3 }}>{a.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* FILTERS */}
      <div data-tour="pub-filters" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <FilterDropdown label="Клиент" open={menuOpen === "client"} onToggle={() => setMenuOpen(menuOpen === "client" ? null : "client")}
          value={clientFilter === "all" ? "Все" : (clientById[clientFilter]?.name || "—")}>
          <button onClick={() => { setClientFilter("all"); setMenuOpen(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px" }}>Все клиенты</button>
          {clients.map(c => (
            <button key={c.id} onClick={() => { setClientFilter(c.id); setMenuOpen(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px", gap: 8 }}>
              <Avatar name={c.name} src={c.avatar_url} size={20} /> {c.name} {c.surname || ""}
            </button>
          ))}
        </FilterDropdown>
        <FilterDropdown label="Тимлид" open={menuOpen === "tl"} onToggle={() => setMenuOpen(menuOpen === "tl" ? null : "tl")}
          value={tlFilter === "all" ? "Все" : (team.find(t => t.id === tlFilter)?.name || "—")}>
          <button onClick={() => { setTlFilter("all"); setMenuOpen(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px" }}>Все тимлиды</button>
          {teamleads.map(t => (
            <button key={t.id} onClick={() => { setTlFilter(t.id); setMenuOpen(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px", gap: 8 }}>
              <Avatar name={t.name} src={t.avatar_url} size={20} /> {t.name}
            </button>
          ))}
        </FilterDropdown>
        {(clientFilter !== "all" || tlFilter !== "all") && (
          <button onClick={() => { setClientFilter("all"); setTlFilter("all"); }}
            style={{ padding: "8px 10px", borderRadius: 10, background: "transparent", border: "1px solid var(--brd)", color: "var(--rd)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            <X size={11} style={{ display: "inline", verticalAlign: "middle" }} /> Сбросить
          </button>
        )}
      </div>

      {view === "calendar" ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: 11, background: "rgba(157,107,255,0.06)", border: "1px solid var(--brd)", marginBottom: 12, fontSize: 12, color: "var(--t2)", flexWrap: "wrap" }}>
            🗓️ <b style={{ color: "var(--t1)" }}>План месяца:</b>
            {clientFilter === "all"
              ? <span>выбери клиента в фильтре ↑ — на днях появится «+», чтобы расставить даты выхода рилзов.</span>
              : <span>жми <b style={{ color: "var(--pu)" }}>+</b> на дне → выбери <b>🎬 Рилз</b> или <b>🖼 Карусель</b>. Потом перетащи готовый сценарий из пула на слот. Удалить слот — крестик <b>×</b> на нём.</span>}
          </div>
          {pool.length > 0 && (
            <div data-tour="pub-pool" className="card" style={{ padding: 14, borderRadius: 14, marginBottom: 14 }}>
              <button onClick={() => setPoolOpen(v => !v)} style={{ background: "transparent", border: "none", color: "var(--t1)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, marginBottom: poolOpen ? 10 : 0 }}>
                <ChevronDown size={14} style={{ transform: poolOpen ? "none" : "rotate(-90deg)", transition: ".15s" }} />
                Не запланировано <span style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(157,107,255,0.15)", color: "var(--pu)", fontSize: 10, fontWeight: 700 }}>{pool.length}</span>
                <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 500 }}>— перетащи на день или нажми «Разложить»</span>
              </button>
              {poolOpen && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {pool.slice(0, 60).map(s => {
                    const c = clientById[s.client_id];
                    return (
                      <div key={s.id} draggable onDragStart={() => setDragId(s.id)} onDragEnd={() => { setDragId(null); setDragOverDay(null); }}
                        onClick={() => setOpenId(s.id)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 8, background: "var(--inset2)", border: "1px solid var(--brd)", cursor: "grab", opacity: dragId === s.id ? 0.4 : 1 }}>
                        <Avatar name={c ? `${c.name} ${c.surname || ""}` : "?"} src={c?.avatar_url} size={18} />
                        <span style={{ fontSize: 10, color: "var(--t1)", fontWeight: 600 }}>{c?.name} · M{s.month_number}·#{s.order_num}</span>
                      </div>
                    );
                  })}
                  {pool.length > 60 && <span style={{ fontSize: 10, color: "var(--t3)", alignSelf: "center" }}>+{pool.length - 60} ещё…</span>}
                </div>
              )}
            </div>
          )}

          <div data-tour="pub-calendar" className="card" style={{ padding: 14, borderRadius: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
              {WD.map(d => <div key={d} style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 }}>{d}</div>)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {weeks.map((week, wi) => (
                <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                  {week.map((dayIso, di) => {
                    if (!dayIso) return <div key={di} style={{ minHeight: 96, borderRadius: 10, background: "var(--inset)" }} />;
                    const items = scheduledByDay[dayIso] || [];
                    const isToday = dayIso === todayIso;
                    const isOver = dragOverDay === dayIso;
                    const dnum = parseInt(dayIso.split("-")[2], 10);
                    return (
                      <div key={di}
                        onDragOver={(e) => { e.preventDefault(); setDragOverDay(dayIso); }}
                        onDragLeave={() => { if (dragOverDay === dayIso) setDragOverDay(null); }}
                        onDrop={(e) => { e.preventDefault(); handleDropDay(dayIso); }}
                        style={{
                          minHeight: 96, borderRadius: 10, padding: 7, position: "relative",
                          background: isOver ? "rgba(157,107,255,0.12)" : isToday ? "rgba(66,212,244,0.06)" : "var(--inset)",
                          border: `1px solid ${isOver ? "var(--pu)" : isToday ? "var(--cy)" : "var(--brd)"}`,
                          display: "flex", flexDirection: "column", gap: 4, transition: "border-color .12s, background .12s",
                        }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: isToday ? "var(--cy)" : "var(--t2)" }}>{dnum}{isToday ? " · сегодня" : ""}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            {items.length > 0 && <span style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700 }}>{items.length}</span>}
                            {clientFilter !== "all" && (
                              <button onClick={(e) => { e.stopPropagation(); setSlotMenu(m => m === dayIso ? null : dayIso); }}
                                title="Запланировать на этот день" style={{ width: 18, height: 18, borderRadius: 6, background: "rgba(157,107,255,0.15)", border: "1px solid var(--brd)", color: "var(--pu)", cursor: "pointer", fontSize: 13, fontWeight: 800, lineHeight: 1, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                            )}
                          </div>
                        </div>
                        {slotMenu === dayIso && clientFilter !== "all" && (
                          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 26, right: 6, zIndex: 40, background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 9, padding: 4, boxShadow: "0 12px 30px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 2, minWidth: 120 }}>
                            <button onClick={() => createSlot(clientFilter as number, dayIso, "reel")} className="nav-item" style={{ fontSize: 11, padding: "6px 8px", gap: 7 }}>🎬 Рилз</button>
                            <button onClick={() => createSlot(clientFilter as number, dayIso, "carousel")} className="nav-item" style={{ fontSize: 11, padding: "6px 8px", gap: 7 }}>🖼 Карусель</button>
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, overflow: "hidden" }}>
                          {items.slice(0, 4).map(s => {
                            const c = clientById[s.client_id];
                            const meta = STATUS_META[slotStatus(s, todayIso)];
                            const empty = isEmptySlot(s);
                            const tIcon = s.content_type === "carousel" ? "🖼" : "🎬";
                            return (
                              <div key={s.id} draggable onDragStart={() => setDragId(s.id)} onDragEnd={() => { setDragId(null); setDragOverDay(null); }}
                                onClick={() => setOpenId(s.id)} title={`${c?.name} · ${s.content_type === "carousel" ? "карусель" : "рилз"} · ${meta.label}${empty ? " — пусто, перетащи сюда сценарий" : ""}`}
                                style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 5px", borderRadius: 6, background: `${meta.color}1c`, border: `1px ${empty ? "dashed" : "solid"} ${meta.color}${empty ? "66" : "40"}`, cursor: "grab", opacity: dragId === s.id ? 0.4 : 1 }}>
                                <span style={{ fontSize: 10, flexShrink: 0 }}>{tIcon}</span>
                                <Avatar name={c ? `${c.name} ${c.surname || ""}` : "?"} src={c?.avatar_url} size={14} />
                                <span style={{ fontSize: 9, color: "var(--t1)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{empty ? "слот" : c?.name}</span>
                                <button onClick={(e) => { e.stopPropagation(); if (empty || confirm("Удалить эту публикацию из плана?")) deleteSlot(s.id); }}
                                  title="Удалить" style={{ flexShrink: 0, width: 14, height: 14, borderRadius: 4, background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                              </div>
                            );
                          })}
                          {items.length > 4 && <span style={{ fontSize: 8, color: "var(--t3)" }}>+{items.length - 4}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--brd)" }}>
              {(Object.keys(STATUS_META) as SlotStatus[]).map(k => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_META[k].color }} />
                  <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>{STATUS_META[k].label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <ArchiveTable scripts={visible.filter(s => s.video_status === "published").sort((a, b) => (b.pub_date || "").localeCompare(a.pub_date || ""))} clientById={clientById} onOpen={setOpenId} />
      )}

      {openScript && (
        <PublicationModal script={openScript} client={clientById[openScript.client_id]} todayIso={todayIso}
          onClose={() => setOpenId(null)} onUpdate={updateScript} onOpenClient={() => router.push(`/dashboard/clients/${openScript.client_id}`)} />
      )}

      {autoOpen && (
        <AutoDistributeModal clients={clients} allScripts={allScripts.filter(isPlannable)} defaultStart={`${ym}-01`} onClose={() => setAutoOpen(false)}
          onApply={async (assignments) => {
            for (const a of assignments) { await db.updateScript(supabase, a.id, { pub_date: a.date }); }
            setAllScripts(arr => arr.map(s => { const a = assignments.find(x => x.id === s.id); return a ? { ...s, pub_date: a.date } : s; }));
            setAutoOpen(false);
          }} />
      )}

      <Tour steps={PUB_TOUR} open={tourOpen} onClose={() => setTourOpen(false)} />
      <style jsx>{`
        @media (max-width: 900px) { :global(.pub-alerts) { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>
    </div>
  );
}

function FilterDropdown({ label, value, open, onToggle, children }: { label: string; value: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      <button onClick={onToggle}
        style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
        <Filter size={11} strokeWidth={1.8} />
        <span style={{ color: "var(--t3)" }}>{label}:</span>{value}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, minWidth: 200, background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 10, padding: 4, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", maxHeight: 320, overflowY: "auto" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function ArchiveTable({ scripts, clientById, onOpen }: { scripts: Script[]; clientById: Record<number, Client>; onOpen: (id: number) => void }) {
  if (scripts.length === 0) return <div className="card" style={{ padding: 40, borderRadius: 14, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>Пока нет опубликованных роликов</div>;
  return (
    <div className="card" style={{ padding: 0, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.8fr 1.2fr 80px", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--brd)", fontSize: 10, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
        <span>Клиент</span><span>Тема</span><span>Дата</span><span>Ссылка</span><span></span>
      </div>
      {scripts.map(s => {
        const c = clientById[s.client_id];
        return (
          <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.8fr 1.2fr 80px", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--brd)", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Avatar name={c ? `${c.name} ${c.surname || ""}` : "?"} src={c?.avatar_url} size={24} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "var(--t1)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c?.name} {c?.surname || ""}</div>
                <div style={{ fontSize: 9, color: "var(--t3)", fontFamily: "monospace" }}>M{s.month_number} · #{s.order_num}</div>
              </div>
            </div>
            <span style={{ fontSize: 11, color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.hook_text || s.hook || "—"}</span>
            <span style={{ fontSize: 11, color: "var(--t1)", fontWeight: 600 }}>{s.pub_date ? fmtDay(s.pub_date) : "—"}</span>
            <span style={{ minWidth: 0 }}>
              {s.video_url ? (
                <a href={s.video_url.startsWith("http") ? s.video_url : `https://${s.video_url}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: "var(--cy)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                  <ExternalLink size={11} /> {s.video_url.replace(/^https?:\/\//, "").slice(0, 28)}
                </a>
              ) : <span style={{ fontSize: 10, color: "var(--t3)", fontStyle: "italic" }}>нет ссылки</span>}
            </span>
            <button onClick={() => onOpen(s.id)} style={{ padding: "4px 8px", borderRadius: 7, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Открыть</button>
          </div>
        );
      })}
    </div>
  );
}

function PublicationModal({ script: s, client: c, todayIso, onClose, onUpdate, onOpenClient }: {
  script: Script; client?: Client; todayIso: string;
  onClose: () => void; onUpdate: (id: number, patch: Partial<Script>) => Promise<void> | void; onOpenClient: () => void;
}) {
  const [pubDate, setPubDate] = useState(s.pub_date || "");
  const [videoUrl, setVideoUrl] = useState(s.video_url || "");
  useEffect(() => { setPubDate(s.pub_date || ""); setVideoUrl(s.video_url || ""); }, [s.id]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const isPublished = s.video_status === "published";
  const meta = STATUS_META[slotStatus(s, todayIso)];
  const ta: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 9, background: "var(--inset2)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, outline: "none" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 18, width: "100%", maxWidth: 460, padding: 22, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 24px 70px rgba(0,0,0,0.55)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Avatar name={c ? `${c.name} ${c.surname || ""}` : "?"} src={c?.avatar_url} size={38} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)" }}>{c?.name} {c?.surname || ""}</div>
              <div style={{ fontSize: 10, color: "var(--t3)", fontFamily: "monospace" }}>M{s.month_number} · сценарий #{s.order_num}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: "var(--track)", border: "1px solid var(--brd)", color: "var(--t2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={15} /></button>
        </div>

        <div style={{ fontSize: 12, color: "var(--t1)", fontWeight: 600, lineHeight: 1.4 }}>{s.hook_text || s.hook || "Без темы"}</div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 8, background: `${meta.color}1c`, border: `1px solid ${meta.color}44`, alignSelf: "flex-start" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color }} />
          <span style={{ fontSize: 11, color: meta.color, fontWeight: 700 }}>{meta.label}</span>
        </div>

        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 5 }}>📅 Плановая дата публикации</label>
          <input type="date" value={pubDate} onChange={(e) => setPubDate(e.target.value)}
            onBlur={() => { if (pubDate !== (s.pub_date || "")) onUpdate(s.id, { pub_date: pubDate || null }); }} style={ta} />
        </div>

        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: "var(--gr)", textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 5 }}>▶ Ссылка на опубликованное видео</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
              onBlur={() => { if (videoUrl !== (s.video_url || "")) onUpdate(s.id, { video_url: videoUrl }); }} placeholder="https://instagram.com/reel/…" style={ta} />
            {s.video_url && (
              <a href={s.video_url.startsWith("http") ? s.video_url : `https://${s.video_url}`} target="_blank" rel="noopener noreferrer"
                style={{ flexShrink: 0, padding: "0 13px", borderRadius: 9, background: "rgba(168,224,99,0.14)", border: "1px solid rgba(168,224,99,0.3)", color: "var(--gr)", display: "inline-flex", alignItems: "center" }}><ExternalLink size={14} /></a>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 4 }}>
          <button onClick={onOpenClient} style={{ padding: "8px 12px", borderRadius: 9, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>К карточке →</button>
          {isPublished ? (
            <button onClick={() => onUpdate(s.id, { video_status: "ready" })}
              style={{ padding: "9px 16px", borderRadius: 9, background: "transparent", border: "1px solid var(--or)", color: "var(--or)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>↩ Снять отметку</button>
          ) : (
            <button onClick={() => onUpdate(s.id, { video_status: "published", pub_date: pubDate || todayIso })}
              style={{ padding: "9px 16px", borderRadius: 9, background: "linear-gradient(135deg, var(--gr), #1e8e3e)", border: "none", color: "#04210f", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>✓ Опубликовано</button>
          )}
        </div>
      </div>
    </div>
  );
}

function AutoDistributeModal({ clients, allScripts, defaultStart, onClose, onApply }: {
  clients: Client[]; allScripts: Script[]; defaultStart: string;
  onClose: () => void; onApply: (assignments: { id: number; date: string }[]) => Promise<void> | void;
}) {
  const [clientId, setClientId] = useState<number | "">("");
  const [start, setStart] = useState(defaultStart);
  const [everyDays, setEveryDays] = useState(1);
  const [onlyUnscheduled, setOnlyUnscheduled] = useState(true);
  const [busy, setBusy] = useState(false);

  const targets = useMemo(() => {
    if (clientId === "") return [];
    return allScripts
      .filter(s => s.client_id === clientId && s.video_status !== "published" && (!onlyUnscheduled || !s.pub_date))
      .sort((a, b) => a.month_number - b.month_number || a.order_num - b.order_num);
  }, [clientId, allScripts, onlyUnscheduled]);

  const preview = useMemo(() => targets.map((s, i) => ({ id: s.id, date: addDaysIso(start, i * Math.max(1, everyDays)) })), [targets, start, everyDays]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 18, width: "100%", maxWidth: 460, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        <h3 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 17, fontWeight: 800, color: "var(--t1)", display: "flex", alignItems: "center", gap: 8 }}><Wand2 size={16} style={{ color: "var(--pu)" }} /> Разложить по дням</h3>
        <div>
          <label style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5, display: "block" }}>Клиент</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value ? parseInt(e.target.value, 10) : "")}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 9, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, cursor: "pointer" }}>
            <option value="">— выбери клиента —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name} {c.surname || ""}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5, display: "block" }}>Старт</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 9, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5, display: "block" }}>Шаг (дней)</label>
            <input type="number" min={1} max={14} value={everyDays} onChange={(e) => setEveryDays(Math.max(1, parseInt(e.target.value || "1", 10)))}
              style={{ width: "100%", padding: "9px 11px", borderRadius: 9, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13 }} />
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--t2)", cursor: "pointer" }}>
          <input type="checkbox" checked={onlyUnscheduled} onChange={(e) => setOnlyUnscheduled(e.target.checked)} />
          Только без даты (не трогать уже запланированные)
        </label>
        <div style={{ fontSize: 11, color: "var(--t3)", padding: 10, borderRadius: 9, background: "rgba(157,107,255,0.06)", border: "1px solid var(--brd)" }}>
          {clientId === "" ? "Выбери клиента" : targets.length === 0 ? "Нет роликов для раскладки" :
            `Разложу ${targets.length} ${targets.length === 1 ? "ролик" : "роликов"}: ${fmtDay(preview[0].date)} → ${fmtDay(preview[preview.length - 1].date)}`}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 14px", borderRadius: 9, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Отмена</button>
          <button disabled={targets.length === 0 || busy} onClick={async () => { setBusy(true); await onApply(preview); setBusy(false); }}
            style={{ padding: "9px 18px", borderRadius: 9, background: targets.length === 0 ? "var(--card)" : "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: targets.length === 0 ? "default" : "pointer", opacity: targets.length === 0 ? 0.5 : 1 }}>
            {busy ? "Раскладываю…" : "Разложить"}
          </button>
        </div>
      </div>
    </div>
  );
}
