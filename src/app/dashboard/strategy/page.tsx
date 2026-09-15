"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useIsOwner } from "@/components/RoleContext";
import { Target, Brain, Check, Plus, CalendarDays, AlertTriangle, RotateCcw, X } from "lucide-react";

/* Стратегия EasyLife AI: дорожная карта сентябрь–октябрь 2026 (сценарий Б), задачи и «мозг системы» —
   CEO-агент @CEO_EasyLifeAi_bot пишет сюда планы и пуши и читает отсюда задачи. Только владелец. */

type Task = {
  id: number; text: string; status: string; priority: string; direction: string | null;
  planned_for: string | null; owner: string | null; result: string | null; source: string | null;
  created_at: string; updated_at: string; done_at: string | null;
};
type Entry = { id: number; kind: string; day: string; text: string; source: string; created_at: string };

const GOAL_DATE = "2026-10-31";
const GOAL_CLIENTS = 18;
const DIRECTIONS = ["Удержание", "Трафик", "Продажи", "Производство", "HR", "Деньги", "Разгрузка", "Итог"];
const DIR_COLOR: Record<string, string> = {
  "Удержание": "var(--gr)", "Трафик": "var(--cy)", "Продажи": "var(--pu)", "Производство": "var(--or)",
  "HR": "var(--pk)", "Деньги": "var(--yl)", "Разгрузка": "#5b8cff", "Итог": "var(--t2)",
};
const PERIODS = [
  { label: "Сентябрь · 8–20", from: "2026-09-01", to: "2026-09-20" },
  { label: "Сентябрь · 21–30", from: "2026-09-21", to: "2026-09-30" },
  { label: "Октябрь · 1–15", from: "2026-10-01", to: "2026-10-15" },
  { label: "Октябрь · 16–31", from: "2026-10-16", to: "2026-10-31" },
];
// Суть направления по периодам — из дорожной карты (~/easylife-strategy-sep-oct)
const ROADMAP: Record<string, string[]> = {
  "Трафик": ["Обновить креативы, $40/день на широкие", "Нишевые на тест $15/день", "$58/день, вес на нишевые", "Широкие погашены, всё в авто + пластику"],
  "Продажи": ["Отказы: отсев vs потеря", "Оффер продажнику №2", "Продажник №2 на квалификации", "Зумы с трафика на нём"],
  "Удержание": ["6 разговоров M1→M2, слайд ожиданий", "Отчёт на 20-й день, звонок за 7 дней", "Допродажи 3 клиентам", "Замер M1→M2"],
  "Производство": ["Онбординг монтажёра №6", "300 роликов за месяц", "Онбординг №7, качество", "340 роликов за месяц"],
  "HR": ["Офферы: ТЛ №4 + монтажёр №6", "Оффер ТЛ №5", "Монтажёр №7 по триггеру", "Подбор операционного"],
  "Деньги": ["Бюджет, поле «источник» в CRM", "Сверка воронки", "Раздельная оплата сервисов", "Платёжный контур под США"],
  "Разгрузка": ["Выбрать аналитика из ТЛ", "Первый аудит вместе", "Аналитик сам, Ярослав проверяет", "Выход из аудитов"],
};
const KIND_LABEL: Record<string, string> = { plan: "План дня", push: "Пуш", review: "Итог дня", decision: "Решение", note: "Заметка" };
const KIND_COLOR: Record<string, string> = { plan: "var(--gr)", push: "var(--cy)", review: "var(--pu)", decision: "var(--or)", note: "var(--t2)" };

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
const dm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "без даты");
const stripDir = (t: string) => t.replace(/^(Удержание|Трафик|Продажи|Производство|HR|Деньги|Разгрузка|Итог плана|Итог)\s*:\s*/i, "");

const S = `
.stg{max-width:1180px;margin:0 auto}
.stg .badge{display:inline-flex;align-items:center;gap:7px;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--gr);border:1px solid rgba(168,224,99,.35);border-radius:100px;padding:6px 14px;margin-bottom:14px}
.stg h1{font-family:'Unbounded',sans-serif;font-weight:800;font-size:clamp(24px,4vw,36px);line-height:1.08;color:var(--t1)}
.stg h1 .g{color:var(--gr)}
.stg .lead{color:var(--t2);font-size:14px;margin-top:10px;max-width:720px;line-height:1.6}
.stg .sec{display:flex;align-items:center;gap:9px;font-family:'Unbounded',sans-serif;font-weight:700;font-size:11.5px;letter-spacing:1.5px;text-transform:uppercase;color:var(--t3);margin:34px 0 14px}
.stg .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:22px}
.stg .kpi{background:var(--card);border:1px solid var(--brd);border-radius:16px;padding:16px 16px 14px}
.stg .kpi .l{font-size:10.5px;color:var(--t3);text-transform:uppercase;letter-spacing:1px;font-weight:700}
.stg .kpi .v{font-family:'Unbounded',sans-serif;font-weight:800;font-size:28px;color:var(--t1);margin-top:8px;line-height:1}
.stg .kpi .v small{font-size:14px;color:var(--t3);font-weight:700}
.stg .kpi .d{font-size:12px;color:var(--t2);margin-top:7px}
.stg .bar{height:6px;border-radius:4px;background:var(--track);overflow:hidden;margin-top:10px}.stg .bar i{display:block;height:100%;background:var(--gr)}
.stg .two{display:grid;grid-template-columns:1.25fr 1fr;gap:14px;align-items:start}
.stg .card{background:var(--card);border:1px solid var(--brd);border-radius:18px;padding:18px}
.stg .brain pre{white-space:pre-wrap;font-family:inherit;font-size:13.5px;line-height:1.6;color:var(--t1);margin:0;max-height:430px;overflow:auto}
.stg .muted{color:var(--t3)}.stg .small{font-size:12px}
.stg .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.stg .tab{border:1px solid var(--brd);background:transparent;color:var(--t2);border-radius:100px;padding:6px 12px;font-size:12.5px;font-weight:700;cursor:pointer}
.stg .tab.on{background:var(--pud);color:var(--t1);border-color:var(--pu)}
.stg .task{display:flex;gap:10px;align-items:flex-start;padding:10px 4px;border-bottom:1px solid var(--brd)}
.stg .task:last-child{border-bottom:none}
.stg .chk{width:22px;height:22px;flex:none;border-radius:7px;border:1.5px solid var(--brd);background:var(--inset);display:flex;align-items:center;justify-content:center;cursor:pointer;margin-top:1px;color:#fff}
.stg .chk.on{background:var(--gr);border-color:var(--gr)}
.stg .tt{flex:1;min-width:0;font-size:13.5px;line-height:1.5;color:var(--t1)}
.stg .tt.done{color:var(--t3);text-decoration:line-through}
.stg .meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px;align-items:center}
.stg .chip{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:100px;border:1px solid var(--brd);color:var(--t2);white-space:nowrap}
.stg .chip.over{color:var(--rd);border-color:rgba(255,92,122,.4)}
.stg .chip.tod{color:var(--gr);border-color:rgba(168,224,99,.4)}
.stg .date{background:var(--inset);border:1px solid var(--brd);color:var(--t2);border-radius:8px;font-size:11.5px;padding:2px 6px}
.stg .ib{background:none;border:none;color:var(--t3);cursor:pointer;padding:3px;border-radius:6px}.stg .ib:hover{color:var(--t1);background:var(--inset)}
.stg .add{display:grid;grid-template-columns:1fr 130px 140px 70px auto;gap:8px;margin-top:12px}
.stg .inp{background:var(--inp);border:1px solid var(--brd);color:var(--t1);border-radius:10px;padding:8px 10px;font-size:13px;min-width:0}
.stg .btn{background:var(--pu);color:#fff;border:none;border-radius:10px;padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;justify-content:center}
.stg .rm{overflow-x:auto;border:1px solid var(--brd);border-radius:18px;background:var(--card)}
.stg .rm table{width:100%;border-collapse:collapse;min-width:880px}
.stg .rm th,.stg .rm td{padding:10px;border-bottom:1px solid var(--brd);vertical-align:top;text-align:left}
.stg .rm th{font-size:10.5px;color:var(--t3);text-transform:uppercase;letter-spacing:1px}
.stg .rm td.dir{font-weight:800;font-size:13px;white-space:nowrap}
.stg .rm .goal{font-size:12px;color:var(--t2);margin-bottom:6px;line-height:1.45}
.stg .dot{display:flex;gap:6px;align-items:flex-start;font-size:11.5px;line-height:1.4;color:var(--t1);margin-top:4px}
.stg .dot i{width:8px;height:8px;border-radius:50%;flex:none;margin-top:4px;background:var(--t3)}
.stg .dot.done{color:var(--t3)}.stg .dot.done i{background:var(--gr)}
.stg .dot.over i{background:var(--rd)}
.stg .cur{background:var(--pud)}
.stg .j{padding:11px 2px;border-bottom:1px solid var(--brd)}
.stg .j:last-child{border-bottom:none}
.stg .j .h{display:flex;gap:8px;align-items:center;font-size:11.5px;color:var(--t3);margin-bottom:5px}
.stg .j .x{white-space:pre-wrap;font-size:13px;line-height:1.55;color:var(--t1);max-height:160px;overflow:hidden}
.stg .j.open .x{max-height:none}
@media(max-width:900px){.stg .kpis{grid-template-columns:repeat(2,1fr)}.stg .two{grid-template-columns:1fr}.stg .add{grid-template-columns:1fr 1fr}}
`;

export default function StrategyPage() {
  const supabase = createClient();
  const owner = useIsOwner();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [journal, setJournal] = useState<Entry[]>([]);
  const [activeClients, setActiveClients] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"now" | "soon" | "all" | "done">("now");
  const [kind, setKind] = useState("all");
  const [openJ, setOpenJ] = useState<number | null>(null);
  const [draft, setDraft] = useState({ text: "", date: todayIso(), direction: "Удержание", priority: "A" });
  const [note, setNote] = useState({ text: "", kind: "decision" });
  const today = todayIso();

  useEffect(() => { load(); }, []);
  async function load() {
    const [t, j, c] = await Promise.all([
      supabase.from("strategy_tasks").select("*").order("planned_for", { ascending: true, nullsFirst: false }).order("id"),
      supabase.from("strategy_journal").select("*").order("id", { ascending: false }).limit(120),
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("stage", "active"),
    ]);
    if (t.error) setErr(t.error.message.includes("does not exist") ? "Таблицы стратегии ещё не созданы — нужно прогнать миграцию MIGRATION_2026-09-15_strategy.sql" : t.error.message);
    setTasks((t.data || []) as Task[]);
    setJournal((j.data || []) as Entry[]);
    setActiveClients(c.count ?? null);
    setLoading(false);
  }

  async function patch(id: number, fields: Partial<Task>) {
    const next = { ...fields, updated_at: new Date().toISOString() };
    setTasks(ts => ts.map(x => (x.id === id ? { ...x, ...next } as Task : x)));
    const { error } = await supabase.from("strategy_tasks").update(next).eq("id", id);
    if (error) { setErr(error.message); load(); }
  }
  const toggle = (t: Task) => patch(t.id, t.status === "done" ? { status: "open", done_at: null } : { status: "done", done_at: new Date().toISOString() });

  async function addTask() {
    if (!draft.text.trim()) return;
    const { data, error } = await supabase.from("strategy_tasks").insert({
      text: `${draft.direction}: ${draft.text.trim()}`, planned_for: draft.date || null, direction: draft.direction,
      priority: draft.priority, status: "open", source: "crm",
    }).select("*").single();
    if (error) { setErr(error.message); return; }
    setTasks(ts => [...ts, data as Task]);
    setDraft(d => ({ ...d, text: "" }));
  }
  async function addNote() {
    if (!note.text.trim()) return;
    const { data, error } = await supabase.from("strategy_journal").insert({ kind: note.kind, day: today, text: note.text.trim(), source: "crm" }).select("*").single();
    if (error) { setErr(error.message); return; }
    setJournal(j => [data as Entry, ...j]);
    setNote(n => ({ ...n, text: "" }));
  }

  const live = tasks.filter(t => t.status !== "cancelled");
  const done = live.filter(t => t.status === "done");
  const open = live.filter(t => t.status === "open" || t.status === "delegated");
  const overdue = open.filter(t => t.planned_for && t.planned_for < today);
  const lists = useMemo(() => ({
    now: open.filter(t => t.planned_for && t.planned_for <= today),
    soon: open.filter(t => t.planned_for && t.planned_for > today && t.planned_for <= addDays(today, 14)),
    all: open,
    done: [...done].sort((a, b) => (b.done_at || "").localeCompare(a.done_at || "")),
  }), [tasks, today]);

  const latestPlan = journal.find(e => e.kind === "plan");
  const feed = journal.filter(e => kind === "all" || e.kind === kind);
  const curPeriod = PERIODS.findIndex(p => today >= p.from && today <= p.to);
  const daysLeft = Math.max(0, daysBetween(today, GOAL_DATE));

  if (!owner) return <div style={{ padding: 40, color: "var(--t2)" }}>Раздел доступен только владельцу.</div>;

  const TaskRow = ({ t }: { t: Task }) => {
    const isOver = t.status !== "done" && !!t.planned_for && t.planned_for < today;
    const isToday = t.planned_for === today;
    return (
      <div className="task">
        <div className={`chk ${t.status === "done" ? "on" : ""}`} onClick={() => toggle(t)} title={t.status === "done" ? "Вернуть в работу" : "Выполнено"}>
          {t.status === "done" && <Check size={14} strokeWidth={3} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={`tt ${t.status === "done" ? "done" : ""}`}>{stripDir(t.text)}</div>
          <div className="meta">
            {t.direction && <span className="chip" style={{ color: DIR_COLOR[t.direction], borderColor: DIR_COLOR[t.direction] }}>{t.direction}</span>}
            <span className="chip">{t.priority}</span>
            {isOver && <span className="chip over">просрочено {daysBetween(t.planned_for!, today)} дн.</span>}
            {isToday && t.status !== "done" && <span className="chip tod">сегодня</span>}
            {t.status === "delegated" && <span className="chip">делегировано{t.owner ? ` · ${t.owner}` : ""}</span>}
            {t.status === "done" && t.done_at && <span className="chip">сделано {dm(t.done_at.slice(0, 10))}</span>}
            {t.status !== "done" && (
              <input type="date" className="date" value={t.planned_for || ""} onChange={e => patch(t.id, { planned_for: e.target.value || null })} />
            )}
            {t.result && <span className="small muted">· {t.result}</span>}
          </div>
        </div>
        {t.status !== "done" && <button className="ib" title="Отменить задачу" onClick={() => patch(t.id, { status: "cancelled" })}><X size={15} /></button>}
      </div>
    );
  };

  return (
    <div className="stg">
      <style>{S}</style>
      <div className="badge"><Target size={12} /> Стратегия · сентябрь–октябрь 2026 · сценарий Б</div>
      <h1>18 клиентов к 31 октября и <span className="g">3–4 часа в день</span> с 1 ноября</h1>
      <p className="lead">Дорожная карта, задачи и «мозг системы» в одном месте. CEO-бот в Telegram работает с этими же задачами: закрыл задачу здесь — бот это видит, отметил в боте — отметится здесь. Его планы дня и пуши попадают в журнал ниже.</p>

      {err && <div className="card" style={{ marginTop: 16, borderColor: "rgba(255,92,122,.45)", color: "var(--rd)" }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {err}</div>}

      <div className="kpis">
        <div className="kpi">
          <div className="l">Активных клиентов</div>
          <div className="v">{activeClients ?? "—"} <small>/ {GOAL_CLIENTS}</small></div>
          <div className="bar"><i style={{ width: `${Math.min(100, ((activeClients || 0) / GOAL_CLIENTS) * 100)}%` }} /></div>
          <div className="d">цель на 31.10 · по CRM</div>
        </div>
        <div className="kpi">
          <div className="l">Задач выполнено</div>
          <div className="v">{done.length} <small>/ {live.length}</small></div>
          <div className="bar"><i style={{ width: `${live.length ? (done.length / live.length) * 100 : 0}%` }} /></div>
          <div className="d">по дорожной карте и добавленные</div>
        </div>
        <div className="kpi">
          <div className="l">Просрочено</div>
          <div className="v" style={{ color: overdue.length ? "var(--rd)" : "var(--gr)" }}>{overdue.length}</div>
          <div className="d">{overdue.length ? "уточнить статус или перенести" : "всё в срок"}</div>
        </div>
        <div className="kpi">
          <div className="l">До конца плана</div>
          <div className="v">{daysLeft} <small>дн.</small></div>
          <div className="d">{curPeriod >= 0 ? `сейчас: ${PERIODS[curPeriod].label}` : "31.10.2026"}</div>
        </div>
      </div>

      <div className="two" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="tabs">
            {([["now", `Сегодня и просрочено · ${lists.now.length}`], ["soon", `14 дней · ${lists.soon.length}`], ["all", `Все открытые · ${lists.all.length}`], ["done", `Выполнено · ${lists.done.length}`]] as const).map(([k, l]) => (
              <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {loading ? <div className="muted small">Загрузка…</div> : lists[tab].length === 0
            ? <div className="muted small" style={{ padding: "14px 4px" }}>{tab === "now" ? "На сегодня задач нет." : "Пусто."}</div>
            : lists[tab].map(t => <TaskRow key={t.id} t={t} />)}
          <div className="add">
            <input className="inp" placeholder="Новая задача…" value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} onKeyDown={e => e.key === "Enter" && addTask()} />
            <input className="inp" type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} />
            <select className="inp" value={draft.direction} onChange={e => setDraft({ ...draft, direction: e.target.value })}>
              {DIRECTIONS.map(d => <option key={d}>{d}</option>)}
            </select>
            <select className="inp" value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value })}>
              {["A", "B", "C"].map(p => <option key={p}>{p}</option>)}
            </select>
            <button className="btn" onClick={addTask}><Plus size={15} /> Добавить</button>
          </div>
        </div>

        <div className="card brain">
          <div className="sec" style={{ margin: "0 0 12px" }}><Brain size={14} /> Мозг сегодня</div>
          {latestPlan ? (
            <>
              <div className="small muted" style={{ marginBottom: 8 }}>План дня от CEO-бота · {dm(latestPlan.day)}{latestPlan.day !== today ? " (сегодняшнего ещё нет)" : ""}</div>
              <pre>{latestPlan.text}</pre>
            </>
          ) : <div className="muted small">Бот ещё не присылал план. Утренний план приходит в 08:00, или напиши боту /plan.</div>}
          <button className="tab" style={{ marginTop: 12 }} onClick={load}><RotateCcw size={12} style={{ verticalAlign: -2 }} /> Обновить</button>
        </div>
      </div>

      <div className="sec"><CalendarDays size={14} /> Дорожная карта по направлениям</div>
      <div className="rm">
        <table>
          <thead><tr><th>Направление</th>{PERIODS.map((p, i) => <th key={p.label} className={i === curPeriod ? "cur" : ""}>{p.label}</th>)}</tr></thead>
          <tbody>
            {DIRECTIONS.filter(d => ROADMAP[d] || live.some(t => t.direction === d)).map(d => (
              <tr key={d}>
                <td className="dir" style={{ color: DIR_COLOR[d] }}>{d}</td>
                {PERIODS.map((p, i) => {
                  const cell = live.filter(t => t.direction === d && t.planned_for && t.planned_for >= p.from && t.planned_for <= p.to);
                  return (
                    <td key={p.label} className={i === curPeriod ? "cur" : ""}>
                      {ROADMAP[d] && <div className="goal">{ROADMAP[d][i]}</div>}
                      {cell.map(t => {
                        const over = t.status !== "done" && t.planned_for! < today;
                        return <div key={t.id} className={`dot ${t.status === "done" ? "done" : over ? "over" : ""}`}><i />{dm(t.planned_for)} · {stripDir(t.text).slice(0, 70)}{stripDir(t.text).length > 70 ? "…" : ""}</div>;
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sec"><Brain size={14} /> Журнал мозга — планы, пуши, решения</div>
      <div className="card">
        <div className="tabs">
          {["all", "plan", "push", "review", "decision", "note"].map(k => (
            <button key={k} className={`tab ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{k === "all" ? "Всё" : KIND_LABEL[k]}</button>
          ))}
        </div>
        <div className="add" style={{ gridTemplateColumns: "1fr 150px auto", marginTop: 0, marginBottom: 8 }}>
          <input className="inp" placeholder="Записать решение или заметку — бот учтёт в планах…" value={note.text} onChange={e => setNote({ ...note, text: e.target.value })} onKeyDown={e => e.key === "Enter" && addNote()} />
          <select className="inp" value={note.kind} onChange={e => setNote({ ...note, kind: e.target.value })}>
            <option value="decision">Решение</option><option value="note">Заметка</option>
          </select>
          <button className="btn" onClick={addNote}><Plus size={15} /> Записать</button>
        </div>
        {feed.length === 0 ? <div className="muted small" style={{ padding: "10px 2px" }}>Записей пока нет.</div> : feed.map(e => (
          <div key={e.id} className={`j ${openJ === e.id ? "open" : ""}`} onClick={() => setOpenJ(openJ === e.id ? null : e.id)} style={{ cursor: "pointer" }}>
            <div className="h">
              <span className="chip" style={{ color: KIND_COLOR[e.kind], borderColor: KIND_COLOR[e.kind] }}>{KIND_LABEL[e.kind] || e.kind}</span>
              <span>{dm(e.day)} · {new Date(e.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
              <span>{e.source === "crm" ? "из CRM" : "CEO-бот"}</span>
            </div>
            <div className="x">{e.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
