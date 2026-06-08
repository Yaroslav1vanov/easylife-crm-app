"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, ClientMonth } from "@/lib/database";
import {
  ChevronLeft, ChevronRight, X, Filter, ChevronDown, CalendarDays, List as ListIcon,
} from "lucide-react";

const RU_MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const SCRIPT_LEAD = 5, VIDEO_LEAD = 2; // дней до публикации

function ymOfDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function ymShift(ym: string, delta: number) { const [y, m] = ym.split("-").map(Number); return ymOfDate(new Date(y, m - 1 + delta, 1)); }
function ymLabel(ym: string) { const [y, m] = ym.split("-").map(Number); return `${RU_MONTHS[m - 1]} ${y}`; }
function isoOf(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function addDaysIso(iso: string, n: number) { const [y, m, d] = iso.split("-").map(Number); return isoOf(new Date(y, m - 1, d + n)); }
function fmtDay(iso: string) { const [, mm, dd] = iso.split("-"); return `${parseInt(dd, 10)} ${RU_MONTHS_GEN[parseInt(mm, 10) - 1]}`; }
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

type Kind = "onb" | "pub" | "dl";
type Ev = { kind: Kind; id: number; clientId: number; date: string; label: string };
const KIND_META: Record<Kind | "scr" | "vid", { color: string; label: string }> = {
  onb: { color: "#f5c451", label: "Онбординг" },
  scr: { color: "#42d4f4", label: "Сценарии к сдаче" },
  vid: { color: "#ffae42", label: "Видео готово" },
  pub: { color: "#a8e063", label: "Публикация" },
  dl: { color: "#ff5c7a", label: "Дедлайн месяца" },
};

export default function CalendarPage() {
  const router = useRouter();
  const supabase = createClient();
  const todayIso = isoOf(new Date());
  const currentYM = ymOfDate(new Date());

  const [clients, setClients] = useState<Client[]>([]);
  const [allScripts, setAllScripts] = useState<Script[]>([]);
  const [clientMonths, setClientMonths] = useState<ClientMonth[]>([]);
  const [tasks, setTasks] = useState<{ id: number; client_id: number; task_name: string; phase: string; status: string; deadline: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [ym, setYm] = useState(currentYM);
  const [view, setView] = useState<"month" | "list">("month");
  const [clientFilter, setClientFilter] = useState<"all" | number>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | Kind | "scr" | "vid">("all");
  const [menu, setMenu] = useState<null | "client" | "type">(null);
  const [dragEv, setDragEv] = useState<Ev | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [modalEv, setModalEv] = useState<Ev | null>(null);
  const [listModal, setListModal] = useState<{ kind: "scr" | "vid"; date: string; items: { id: number; clientId: number }[] } | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    const cls = await db.getClients(supabase);
    setClients(cls);
    const [all, cmRes, dt] = await Promise.all([
      db.getScriptsForClients(supabase, cls.map(c => c.id)),
      db.getClientMonths(supabase),
      db.getDatedTasks(supabase),
    ]);
    setAllScripts(all);
    setClientMonths(cmRes?.data || []);
    setTasks(dt);
    setLoading(false);
  }

  const clientById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])) as Record<number, Client>, [clients]);
  const cname = (id: number) => { const c = clientById[id]; return c ? c.name : "?"; };

  // Все события-«якори» (перетаскиваемые)
  const events = useMemo<Ev[]>(() => {
    const out: Ev[] = [];
    for (const s of allScripts) if (s.pub_date) out.push({ kind: "pub", id: s.id, clientId: s.client_id, date: s.pub_date, label: cname(s.client_id) });
    for (const cm of clientMonths) if ((cm.status === "active" || cm.status === "onboarding") && cm.end_date) out.push({ kind: "dl", id: cm.id, clientId: cm.client_id, date: cm.end_date, label: `${cname(cm.client_id)} · сдать` });
    for (const t of tasks) if (t.status !== "done" && t.status !== "skipped") out.push({ kind: "onb", id: t.id, clientId: t.client_id, date: t.deadline.slice(0, 10), label: `${cname(t.client_id)} · ${t.task_name}` });
    return out;
  }, [allScripts, clientMonths, tasks, clientById]);

  const passes = (e: { clientId: number; kind: Ev["kind"] }) =>
    (clientFilter === "all" || e.clientId === clientFilter) && (typeFilter === "all" || typeFilter === e.kind);

  // Производные дедлайны (read-only): сценарий = pub-5 (если не утверждён), видео = pub-2 (если не готово)
  const derived = useMemo(() => {
    const scr: Record<string, { id: number; clientId: number }[]> = {}, vid: Record<string, { id: number; clientId: number }[]> = {};
    for (const s of allScripts) {
      if (!s.pub_date) continue;
      if (clientFilter !== "all" && s.client_id !== clientFilter) continue;
      if (s.script_status !== "approved" && (typeFilter === "all" || typeFilter === "scr")) {
        const d = addDaysIso(s.pub_date, -SCRIPT_LEAD); (scr[d] ||= []).push({ id: s.id, clientId: s.client_id });
      }
      if (s.video_status !== "ready" && s.video_status !== "published" && (typeFilter === "all" || typeFilter === "vid")) {
        const d = addDaysIso(s.pub_date, -VIDEO_LEAD); (vid[d] ||= []).push({ id: s.id, clientId: s.client_id });
      }
    }
    return { scr, vid };
  }, [allScripts, clientFilter, typeFilter]);
  // Группировка имён для подсказки: «Дмитрий ×2, Иван ×1»
  const groupNames = (items: { clientId: number }[]) => {
    const m: Record<string, number> = {};
    for (const it of items) { const n = cname(it.clientId); m[n] = (m[n] || 0) + 1; }
    return Object.entries(m).map(([n, c]) => c > 1 ? `${n} ×${c}` : n).join(", ");
  };

  const byDay = useMemo(() => {
    const m: Record<string, Ev[]> = {};
    for (const e of events) { if (!passes(e)) continue; (m[e.date] ||= []).push(e); }
    return m;
  }, [events, clientFilter, typeFilter]);

  // Сводка «сегодня горит»
  const summary = useMemo(() => {
    const todays = (byDay[todayIso] || []);
    const overdue = events.filter(e => passes(e) && e.date < todayIso && e.kind !== "pub").length
      + allScripts.filter(s => s.pub_date && s.pub_date < todayIso && s.video_status !== "published" && (clientFilter === "all" || s.client_id === clientFilter)).length;
    return {
      onb: todays.filter(e => e.kind === "onb").length,
      scr: (derived.scr[todayIso] || []).length,
      vid: (derived.vid[todayIso] || []).length,
      pub: todays.filter(e => e.kind === "pub").length,
      overdue,
    };
  }, [byDay, derived, events, todayIso, clientFilter, typeFilter, allScripts]);

  async function reschedule(ev: Ev, dayIso: string) {
    setDragEv(null); setDragOverDay(null);
    if (ev.date === dayIso) return;
    if (ev.kind === "pub") { await db.updateScript(supabase, ev.id, { pub_date: dayIso }); setAllScripts(a => a.map(s => s.id === ev.id ? { ...s, pub_date: dayIso } : s)); }
    else if (ev.kind === "dl") { await db.updateClientMonth(supabase, ev.id, { end_date: dayIso }); setClientMonths(a => a.map(m => m.id === ev.id ? { ...m, end_date: dayIso } : m)); }
    else if (ev.kind === "onb") { await db.updateTask(supabase, ev.id, { deadline: dayIso } as any); setTasks(a => a.map(t => t.id === ev.id ? { ...t, deadline: dayIso } : t)); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;

  const weeks = buildCalendar(ym);
  const sumCards = [
    { k: "onb", v: summary.onb, ic: "🧩", l: "онбординг сегодня", c: "#f5c451" },
    { k: "scr", v: summary.scr, ic: "✍️", l: "сценариев к сдаче", c: "#42d4f4" },
    { k: "vid", v: summary.vid, ic: "🎬", l: "видео готовы", c: "#ffae42" },
    { k: "pub", v: summary.pub, ic: "🚀", l: "публикации сегодня", c: "#a8e063" },
    { k: "od", v: summary.overdue, ic: "⚠️", l: "просрочено", c: "#ff5c7a" },
  ];

  const chip = (e: Ev) => {
    const meta = KIND_META[e.kind];
    const over = e.date < todayIso && e.kind !== "pub";
    return (
      <div key={`${e.kind}-${e.id}`} draggable onDragStart={() => setDragEv(e)} onDragEnd={() => { setDragEv(null); setDragOverDay(null); }}
        onClick={() => setModalEv(e)} title={e.label}
        style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 6, background: `${meta.color}1f`, border: `1px solid ${meta.color}${over ? "" : "55"}`, color: meta.color, fontSize: 10, fontWeight: 700, cursor: "grab", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", opacity: dragEv?.kind === e.kind && dragEv?.id === e.id ? 0.4 : 1 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{e.kind === "pub" ? e.label : e.kind === "dl" ? `${cname(e.clientId)} · сдать` : cname(e.clientId)}</span>
      </div>
    );
  };
  const countChip = (items: { id: number; clientId: number }[] | undefined, kind: "scr" | "vid", day: string) => items && items.length > 0 ? (
    <div onClick={() => setListModal({ kind, date: day, items })} title={groupNames(items)}
      style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 6, background: `${KIND_META[kind].color}1a`, border: `1px dashed ${KIND_META[kind].color}66`, color: KIND_META[kind].color, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: KIND_META[kind].color }} />{items.length} {kind === "scr" ? "сцен." : "видео"} ›
    </div>
  ) : null;

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Календарь</h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>Все дедлайны производства · {ymLabel(ym)}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", border: "1px solid var(--brd)", borderRadius: 10, overflow: "hidden" }}>
            {([["month", "Месяц", CalendarDays], ["list", "Список", ListIcon]] as const).map(([v, l, Ic]) => (
              <button key={v} onClick={() => setView(v)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: view === v ? "rgba(157,107,255,0.15)" : "transparent", color: view === v ? "var(--pu)" : "var(--t2)", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Ic size={13} /> {l}</button>
            ))}
          </div>
          <Drop label="Клиент" kind="client" value={clientFilter === "all" ? "Все" : cname(clientFilter)}>
            <button onClick={() => { setClientFilter("all"); setMenu(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px" }}>Все клиенты</button>
            {clients.map(c => <button key={c.id} onClick={() => { setClientFilter(c.id); setMenu(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px" }}>{c.name} {c.surname || ""}</button>)}
          </Drop>
          <Drop label="Тип" kind="type" value={typeFilter === "all" ? "Все" : KIND_META[typeFilter].label}>
            <button onClick={() => { setTypeFilter("all"); setMenu(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px" }}>Все типы</button>
            {(["onb", "scr", "vid", "pub", "dl"] as const).map(k => <button key={k} onClick={() => { setTypeFilter(k); setMenu(null); }} className="nav-item" style={{ fontSize: 11, padding: "7px 10px", gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: KIND_META[k].color }} />{KIND_META[k].label}</button>)}
          </Drop>
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 10, background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)" }}>
            <button onClick={() => setYm(s => ymShift(s, -1))} style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", display: "flex" }}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 12, fontWeight: 700, minWidth: 92, textAlign: "center" }}>{ymLabel(ym)}</span>
            <button onClick={() => setYm(s => ymShift(s, 1))} style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", display: "flex" }}><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {/* СВОДКА */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 14 }} className="cal-sum">
        {sumCards.map(s => (
          <div key={s.k} style={{ display: "flex", alignItems: "center", gap: 11, padding: 13, borderRadius: 14, background: s.v > 0 ? `${s.c}14` : "rgba(123,63,228,0.05)", border: `1px solid ${s.v > 0 ? s.c + "55" : "var(--brd)"}` }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `${s.c}22`, color: s.c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{s.ic}</div>
            <div><div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 800, color: s.v > 0 ? "var(--t1)" : "var(--t3)", lineHeight: 1 }}>{s.v}</div><div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600, marginTop: 3 }}>{s.l}</div></div>
          </div>
        ))}
      </div>

      {/* ЛЕГЕНДА */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12, padding: "0 2px" }}>
        {(["onb", "scr", "vid", "pub", "dl"] as const).map(k => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--t2)", fontWeight: 600 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: KIND_META[k].color }} />{KIND_META[k].label}</span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--t3)" }}>Перетащи событие на другой день, чтобы перенести ✎</span>
      </div>

      {view === "month" ? (
        <div className="card" style={{ padding: 14, borderRadius: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
            {WD.map(d => <div key={d} style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 }}>{d}</div>)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                {week.map((day, di) => {
                  if (!day) return <div key={di} style={{ minHeight: 116, borderRadius: 11, background: "rgba(0,0,0,0.12)" }} />;
                  const evs = byDay[day] || [];
                  const isToday = day === todayIso, isOver = dragOverDay === day;
                  const dnum = parseInt(day.split("-")[2], 10);
                  const shown = evs.slice(0, 3);
                  return (
                    <div key={di} onDragOver={e => { e.preventDefault(); setDragOverDay(day); }} onDragLeave={() => { if (dragOverDay === day) setDragOverDay(null); }} onDrop={e => { e.preventDefault(); if (dragEv) reschedule(dragEv, day); }}
                      style={{ minHeight: 116, borderRadius: 11, padding: 7, display: "flex", flexDirection: "column", gap: 3, background: isOver ? "rgba(157,107,255,0.12)" : isToday ? "rgba(66,212,244,0.06)" : "var(--inset)", border: `1px solid ${isOver ? "var(--pu)" : isToday ? "var(--cy)" : "var(--brd)"}`, transition: ".12s" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? "var(--cy)" : "var(--t2)" }}>{dnum}{isToday ? " · сегодня" : ""}</div>
                      {countChip(derived.scr[day], "scr", day)}
                      {countChip(derived.vid[day], "vid", day)}
                      {shown.map(chip)}
                      {evs.length > 3 && <span style={{ fontSize: 9, color: "var(--t3)" }}>+{evs.length - 3} ещё</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, borderRadius: 16, overflow: "hidden" }}>
          {(() => {
            const upcoming = events.filter(passes).filter(e => e.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date));
            const days = Array.from(new Set(upcoming.map(e => e.date)));
            if (days.length === 0) return <div style={{ padding: 40, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>Нет предстоящих событий</div>;
            return days.map(d => (
              <div key={d} style={{ borderBottom: "1px solid var(--brd)", padding: "12px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: d === todayIso ? "var(--cy)" : "var(--t1)", marginBottom: 8 }}>{fmtDay(d)}{d === todayIso ? " · сегодня" : ""}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{(upcoming.filter(e => e.date === d)).map(chip)}</div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* MODAL */}
      {modalEv && (
        <div onClick={() => setModalEv(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 18, width: "100%", maxWidth: 420, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 16 }}>{KIND_META[modalEv.kind].label}</h3>
              <button onClick={() => setModalEv(null)} style={{ width: 30, height: 30, borderRadius: 9, background: "var(--track)", border: "1px solid var(--brd)", color: "var(--t2)", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: "var(--t1)", fontWeight: 600, marginBottom: 14 }}>{modalEv.label}</div>
            <label style={{ fontSize: 10, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700, display: "block", marginBottom: 5 }}>Перенести на дату</label>
            <input type="date" defaultValue={modalEv.date} onChange={async e => { if (e.target.value) { await reschedule(modalEv, e.target.value); setModalEv(null); } }}
              style={{ width: "100%", padding: "9px 11px", borderRadius: 9, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none", marginBottom: 14 }} />
            {modalEv.kind === "pub" && <div style={{ fontSize: 11, color: "var(--t3)", padding: 10, borderRadius: 9, background: "rgba(157,107,255,0.06)", border: "1px solid var(--brd)", marginBottom: 14 }}>Связанные дедлайны (сценарий −{SCRIPT_LEAD} дн., видео −{VIDEO_LEAD} дн.) сдвинутся автоматически.</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => router.push(`/dashboard/clients/${modalEv.clientId}`)} style={{ padding: "8px 14px", borderRadius: 9, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>К карточке →</button>
              <button onClick={() => setModalEv(null)} style={{ padding: "8px 18px", borderRadius: 9, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Готово</button>
            </div>
          </div>
        </div>
      )}

      {/* СПИСОК: кто именно (по клику на счётчик сценариев/видео) */}
      {listModal && (() => {
        const meta = KIND_META[listModal.kind];
        const grouped: Record<number, number> = {};
        for (const it of listModal.items) grouped[it.clientId] = (grouped[it.clientId] || 0) + 1;
        const rows = Object.entries(grouped).map(([cid, n]) => ({ cid: Number(cid), n })).sort((a, b) => b.n - a.n);
        return (
          <div onClick={() => setListModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 18, width: "100%", maxWidth: 420, padding: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <h3 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 16, color: meta.color }}>{listModal.kind === "scr" ? "Сценарии к сдаче" : "Видео готовы"}</h3>
                <button onClick={() => setListModal(null)} style={{ width: 30, height: 30, borderRadius: 9, background: "var(--track)", border: "1px solid var(--brd)", color: "var(--t2)", cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 14 }}>{fmtDay(listModal.date)} · {listModal.items.length} шт.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
                {rows.map(r => (
                  <button key={r.cid} onClick={() => router.push(`/dashboard/clients/${r.cid}`)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 10, background: "var(--inset)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                    <span>{cname(r.cid)} {clientById[r.cid]?.surname || ""}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, color: meta.color }}>{r.n}</span>
                      <span style={{ color: "var(--t3)" }}>→</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      <style jsx>{`@media (max-width: 900px){ :global(.cal-sum){ grid-template-columns: repeat(2, 1fr) !important; } }`}</style>
    </div>
  );
}
