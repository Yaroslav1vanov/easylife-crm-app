"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase-browser";
import { useRole, isOwner } from "@/components/RoleContext";
import {
  Target, Brain, Check, Plus, AlertTriangle, X, Sun, Sunrise, CalendarRange, CheckCircle2,
  Flag, ListChecks, Trash2, Flame, ChevronRight,
} from "lucide-react";

/* Стратегия EasyLife AI — менеджер задач по «забегам» (2 месяца). Задачи с датами и дедлайнами,
   карточка задачи с описанием и подзадачами. Те же задачи ведёт CEO-бот @CEO_EasyLifeAi_bot,
   его планы и пуши — в «Мозге системы». Видят владелец и ассистент. */

type Sub = { text: string; done: boolean };
type Task = {
  id: number; text: string; status: string; priority: string; direction: string | null;
  planned_for: string | null; owner: string | null; result: string | null; source: string | null;
  description: string | null; subtasks: Sub[] | null; sprint_id: number | null;
  created_at: string; updated_at: string; done_at: string | null;
};
type Entry = { id: number; kind: string; day: string; text: string; source: string; created_at: string };
type Sprint = { id: number; title: string; start_date: string; end_date: string; goals: string | null; client_target: number | null; status: string };
type View = { type: "today" | "tomorrow" | "week" | "done" | "brain" } | { type: "month"; ym: string; sprintId: number };

const DIRECTIONS = ["Удержание", "Трафик", "Владельцы", "Рекомендации", "Продажи", "Производство", "HR", "Деньги", "Разгрузка", "Итог"];
const DIR_COLOR: Record<string, string> = {
  "Удержание": "#a8e063", "Трафик": "#42d4f4", "Продажи": "#9d6bff", "Производство": "#ffae42",
  "HR": "#ec4899", "Деньги": "#f5c451", "Разгрузка": "#5b8cff", "Итог": "#a890d0",
  "Владельцы": "#2ee6c8", "Рекомендации": "#a98bff",
};
const PRI_COLOR: Record<string, string> = { A: "#ff5c7a", B: "#ffae42", C: "#77658f" };
const PRI_LABEL: Record<string, string> = { A: "Высокий", B: "Средний", C: "Низкий" };
const KIND_LABEL: Record<string, string> = { plan: "План дня", push: "Пуш", review: "Итог дня", decision: "Решение", note: "Заметка" };
const KIND_COLOR: Record<string, string> = { plan: "var(--gr)", push: "var(--cy)", review: "var(--pu)", decision: "var(--or)", note: "var(--t2)" };
const RU_MONTH = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const RU_MONTH_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const RU_WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// 31 — личный аккаунт Ярослава (не клиент); 14 + 15 — Иван Панченко (TikTok и Instagram), один клиент.
const DEFAULT_COUNT_RULE = { exclude: [31], merge: [[14, 15]] };
function countClients(ids: number[], ruleJson?: string | null): number {
  let rule: { exclude?: number[]; merge?: number[][] } = DEFAULT_COUNT_RULE;
  try { if (ruleJson) rule = JSON.parse(ruleJson); } catch {}
  const excl = new Set(rule.exclude || []);
  const keyOf = new Map<number, string>();
  (rule.merge || []).forEach((g, i) => g.forEach(id => keyOf.set(id, `g${i}`)));
  return new Set(ids.filter(id => !excl.has(id)).map(id => keyOf.get(id) || `c${id}`)).size;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
const dm = (s: string | null) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : "без срока");
const longDate = (s: string) => { const d = new Date(s + "T00:00:00"); return `${RU_WD[d.getDay()]}, ${d.getDate()} ${RU_MONTH_GEN[d.getMonth()]}`; };
const stripDir = (t: string) => t.replace(/^(Удержание|Трафик|Владельцы|Рекомендации|Продажи|Производство|HR|Деньги|Разгрузка|Итог плана|Итог забега|Итог)\s*:\s*/i, "");
const monthsOf = (sp: Sprint) => {
  const out: string[] = []; let y = +sp.start_date.slice(0, 4), m = +sp.start_date.slice(5, 7);
  const endKey = sp.end_date.slice(0, 7);
  while (true) { const k = `${y}-${String(m).padStart(2, "0")}`; out.push(k); if (k >= endKey || out.length > 12) break; m++; if (m > 12) { m = 1; y++; } }
  return out;
};
const priRank = (p: string) => ({ A: 0, B: 1, C: 2 } as Record<string, number>)[p] ?? 3;
const byDate = (a: Task, b: Task) => (a.planned_for || "9999").localeCompare(b.planned_for || "9999") || priRank(a.priority) - priRank(b.priority) || a.id - b.id;

const S = `
.st{display:grid;grid-template-columns:232px 1fr;gap:18px;max-width:1240px;margin:0 auto;align-items:start}
.st .rail{position:sticky;top:12px;background:var(--card);border:1px solid var(--brd);border-radius:18px;padding:10px}
.st .ri{display:flex;align-items:center;gap:10px;width:100%;border:none;background:transparent;color:var(--t2);font-size:13.5px;font-weight:600;padding:9px 10px;border-radius:10px;cursor:pointer;text-align:left}
.st .ri:hover{background:var(--inset)}
.st .ri.on{background:var(--pud);color:var(--t1)}
.st .ri .n{margin-left:auto;font-size:11.5px;color:var(--t3);font-weight:700}
.st .ri .n.red{color:var(--rd)}
.st .rh{font-size:10px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:var(--t3);padding:14px 10px 6px;display:flex;align-items:center;gap:6px}
.st .sub{padding-left:26px}
.st .prog{height:4px;border-radius:3px;background:var(--track);margin:2px 10px 4px 36px;overflow:hidden}.st .prog i{display:block;height:100%;background:var(--gr)}
.st .main{min-width:0}
.st h1{font-family:'Unbounded',sans-serif;font-weight:800;font-size:clamp(20px,3vw,28px);color:var(--t1);line-height:1.15}
.st .hsub{color:var(--t2);font-size:13px;margin-top:6px}
.st .goals{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.st .goal{font-size:12px;color:var(--t1);background:var(--card);border:1px solid var(--brd);border-radius:100px;padding:5px 11px}
.st .kp{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}
.st .k{background:var(--card);border:1px solid var(--brd);border-radius:14px;padding:12px 14px}
.st .k .l{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:1px;font-weight:700}
.st .k .v{font-family:'Unbounded',sans-serif;font-weight:800;font-size:22px;color:var(--t1);margin-top:6px}
.st .k .v small{font-size:12px;color:var(--t3)}
.st .add{display:flex;gap:8px;margin:16px 0 6px;background:var(--card);border:1px solid var(--brd);border-radius:14px;padding:8px}
.st .add input,.st .add select{background:transparent;border:none;color:var(--t1);font-size:14px;outline:none;min-width:0}
.st .add .t{flex:1}
.st .add select,.st .add input[type=date]{color:var(--t2);font-size:12.5px;border-left:1px solid var(--brd);padding-left:8px}
.st .btn{background:var(--pu);color:#fff;border:none;border-radius:10px;padding:8px 13px;font-weight:700;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.st .grp{margin-top:18px}
.st .gh{display:flex;align-items:baseline;gap:8px;font-size:12.5px;font-weight:800;color:var(--t2);padding:0 4px 7px}
.st .gh.today{color:var(--gr)}.st .gh.over{color:var(--rd)}
.st .gh .c{font-size:11px;color:var(--t3);font-weight:700}
.st .list{background:var(--card);border:1px solid var(--brd);border-radius:14px;overflow:hidden}
.st .row{display:flex;align-items:center;gap:11px;padding:11px 13px;border-bottom:1px solid var(--brd);cursor:pointer}
.st .row:last-child{border-bottom:none}
.st .row:hover{background:var(--cardH)}
.st .chk{width:20px;height:20px;flex:none;border-radius:50%;border:2px solid var(--pc,var(--t3));display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;background:transparent;padding:0}
.st .chk.on{background:var(--gr);border-color:var(--gr)}
.st .rt{flex:1;min-width:0}
.st .rt .x{font-size:14px;color:var(--t1);line-height:1.4}
.st .rt .x.done{color:var(--t3);text-decoration:line-through}
.st .rm{display:flex;gap:10px;flex-wrap:wrap;margin-top:3px;font-size:11.5px;color:var(--t3);align-items:center}
.st .dd{display:inline-flex;align-items:center;gap:5px}
.st .dd i{width:7px;height:7px;border-radius:50%}
.st .red{color:var(--rd)}
.st .empty{color:var(--t3);font-size:13px;padding:22px 14px;text-align:center}
.st .hint{font-size:12px;color:var(--t3);margin-top:4px}
.st .card{background:var(--card);border:1px solid var(--brd);border-radius:16px;padding:16px}
.st pre{white-space:pre-wrap;font-family:inherit;font-size:13.5px;line-height:1.6;color:var(--t1);margin:0}
.st .j{padding:11px 2px;border-bottom:1px solid var(--brd);cursor:pointer}.st .j:last-child{border-bottom:none}
.st .j .h{display:flex;gap:8px;align-items:center;font-size:11.5px;color:var(--t3);margin-bottom:5px}
.st .j .tx{white-space:pre-wrap;font-size:13px;line-height:1.55;color:var(--t1);max-height:120px;overflow:hidden}.st .j.open .tx{max-height:none}
.st .chip{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:100px;border:1px solid var(--brd);color:var(--t2);white-space:nowrap}
@media(max-width:860px){.st{grid-template-columns:1fr}.st .rail{position:static;display:flex;overflow-x:auto;gap:4px;padding:6px}.st .rh,.st .prog{display:none}.st .ri{white-space:nowrap;width:auto}.st .sub{padding-left:10px}.st .kp{grid-template-columns:repeat(2,1fr)}.st .add{flex-wrap:wrap}}
.sd-bg{position:fixed;inset:0;background:rgba(5,0,15,.55);z-index:1000}
.sd{position:fixed;top:0;right:0;bottom:0;width:min(520px,100vw);background:var(--bg2);border-left:1px solid var(--brd);z-index:1001;overflow-y:auto;padding:18px 20px 40px;box-shadow:-20px 0 60px rgba(0,0,0,.35)}
.sd .top{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.sd .ttl{width:100%;background:transparent;border:none;color:var(--t1);font-family:'Unbounded',sans-serif;font-weight:700;font-size:17px;line-height:1.35;resize:none;outline:none}
.sd .f{display:grid;grid-template-columns:110px 1fr;gap:8px 12px;align-items:center;margin:14px 0;font-size:13px}
.sd .f label{color:var(--t3);font-size:12px;font-weight:700}
.sd .f input,.sd .f select{background:var(--inp);border:1px solid var(--brd);color:var(--t1);border-radius:9px;padding:7px 9px;font-size:13px;min-width:0}
.sd h4{font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--t3);margin:20px 0 8px;display:flex;align-items:center;gap:6px}
.sd textarea.ds{width:100%;min-height:150px;background:var(--inp);border:1px solid var(--brd);color:var(--t1);border-radius:12px;padding:11px 12px;font-size:13.5px;line-height:1.6;font-family:inherit;resize:vertical;outline:none}
.sd .si{display:flex;align-items:center;gap:9px;padding:7px 2px;border-bottom:1px solid var(--brd);font-size:13.5px;color:var(--t1)}
.sd .si.done span{color:var(--t3);text-decoration:line-through}
.sd .si span{flex:1}
.sd .ib{background:none;border:none;color:var(--t3);cursor:pointer;padding:3px;border-radius:6px;display:inline-flex}.sd .ib:hover{color:var(--t1);background:var(--inset)}
.sd .sadd{display:flex;gap:8px;margin-top:8px}.sd .sadd input{flex:1;background:var(--inp);border:1px solid var(--brd);color:var(--t1);border-radius:9px;padding:7px 9px;font-size:13px}
.sd .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:22px}
.sd .btn{background:var(--pu);color:#fff;border:none;border-radius:10px;padding:9px 14px;font-weight:700;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.sd .btn.ok{background:var(--gr);color:#0a0118}.sd .btn.ghost{background:transparent;color:var(--t2);border:1px solid var(--brd)}.sd .btn.danger{background:transparent;color:var(--rd);border:1px solid rgba(255,92,122,.4)}
.sd .meta{font-size:11.5px;color:var(--t3);margin-top:16px;line-height:1.6}
`;

export default function StrategyPage() {
  const supabase = createClient();
  const role = useRole();
  const allowed = isOwner(role) || role === "assistant";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [journal, setJournal] = useState<Entry[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [activeClients, setActiveClients] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>({ type: "today" });
  const [hideDone, setHideDone] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ text: "", date: "", direction: "Удержание", priority: "B" });
  const [note, setNote] = useState({ text: "", kind: "decision" });
  const [openJ, setOpenJ] = useState<number | null>(null);
  const [newSprint, setNewSprint] = useState<{ title: string; start: string; end: string; goals: string; target: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const today = iso(new Date());
  const tomorrow = addDays(today, 1);

  useEffect(() => { setMounted(true); load(); }, []);
  async function load() {
    const [t, j, sp, c, rule] = await Promise.all([
      supabase.from("strategy_tasks").select("*").order("planned_for", { ascending: true, nullsFirst: false }).order("id"),
      supabase.from("strategy_journal").select("*").order("id", { ascending: false }).limit(120),
      supabase.from("strategy_sprints").select("*").order("start_date"),
      supabase.from("clients").select("id").eq("stage", "active"),
      supabase.from("app_settings").select("value").eq("key", "strategy_client_count").maybeSingle(),
    ]);
    const e = t.error || sp.error;
    if (e) setErr(/does not exist|column|relation/.test(e.message) ? "Нужно прогнать миграцию MIGRATION_2026-09-15b_strategy_sprints.sql" : e.message);
    setTasks(((t.data || []) as Task[]).filter(x => x.status !== "cancelled"));
    setJournal((j.data || []) as Entry[]);
    setSprints((sp.data || []) as Sprint[]);
    setActiveClients(countClients((c.data || []).map((x: any) => x.id), rule.data?.value));
    setLoading(false);
  }

  const sprintOf = (d: string | null) => (d ? sprints.find(s => d >= s.start_date && d <= s.end_date) : undefined);
  const curSprint = sprintOf(today) || sprints.find(s => s.status === "active") || sprints[sprints.length - 1];

  async function patch(id: number, fields: Partial<Task>) {
    const next: any = { ...fields, updated_at: new Date().toISOString() };
    if ("planned_for" in fields) next.sprint_id = sprintOf(fields.planned_for || null)?.id ?? null;
    setTasks(ts => ts.map(x => (x.id === id ? { ...x, ...next } : x)));
    const { error } = await supabase.from("strategy_tasks").update(next).eq("id", id);
    if (error) { setErr(error.message); load(); }
  }
  const toggle = (t: Task) => patch(t.id, t.status === "done" ? { status: "open", done_at: null } : { status: "done", done_at: new Date().toISOString() });

  const defaultDate = () => {
    if (view.type === "tomorrow") return tomorrow;
    if (view.type === "month") return view.ym === today.slice(0, 7) ? today : `${view.ym}-01`;
    return today;
  };
  async function addTask() {
    const text = draft.text.trim(); if (!text) return;
    const date = draft.date || defaultDate();
    const { data, error } = await supabase.from("strategy_tasks").insert({
      text: `${draft.direction}: ${text}`, planned_for: date, direction: draft.direction, priority: draft.priority,
      status: "open", source: "crm", sprint_id: sprintOf(date)?.id ?? null, subtasks: [],
    }).select("*").single();
    if (error) { setErr(error.message); return; }
    setTasks(ts => [...ts, data as Task]);
    setDraft(d => ({ ...d, text: "", date: "" }));
  }
  async function addNote() {
    if (!note.text.trim()) return;
    const { data, error } = await supabase.from("strategy_journal").insert({ kind: note.kind, day: today, text: note.text.trim(), source: "crm" }).select("*").single();
    if (error) { setErr(error.message); return; }
    setJournal(j => [data as Entry, ...j]); setNote(n => ({ ...n, text: "" }));
  }
  async function createSprint() {
    if (!newSprint?.title || !newSprint.start || !newSprint.end) return;
    const { data, error } = await supabase.from("strategy_sprints").insert({
      title: newSprint.title, start_date: newSprint.start, end_date: newSprint.end, goals: newSprint.goals || null,
      client_target: newSprint.target ? Number(newSprint.target) : null, status: newSprint.start > today ? "planned" : "active",
    }).select("*").single();
    if (error) { setErr(error.message); return; }
    const sp = data as Sprint;
    setSprints(s => [...s, sp].sort((a, b) => a.start_date.localeCompare(b.start_date)));
    setNewSprint(null);
    setView({ type: "month", ym: sp.start_date.slice(0, 7), sprintId: sp.id });
  }

  const open = tasks.filter(t => t.status !== "done");
  const overdue = open.filter(t => t.planned_for && t.planned_for < today).sort(byDate);
  const counts = {
    today: open.filter(t => t.planned_for === today).length + overdue.length,
    tomorrow: open.filter(t => t.planned_for === tomorrow).length,
    week: open.filter(t => t.planned_for && t.planned_for >= today && t.planned_for <= addDays(today, 6)).length,
    done: tasks.filter(t => t.status === "done").length,
  };
  const monthStat = (ym: string) => { const m = tasks.filter(t => t.planned_for?.startsWith(ym)); return { all: m.length, done: m.filter(t => t.status === "done").length, over: m.filter(t => t.status !== "done" && t.planned_for! < today).length }; };

  const groups = useMemo(() => {
    const g: { key: string; title: string; cls?: string; items: Task[] }[] = [];
    const dateGroups = (list: Task[]) => {
      const m = new Map<string, Task[]>();
      [...list].sort(byDate).forEach(t => { const k = t.planned_for || "—"; m.set(k, [...(m.get(k) || []), t]); });
      m.forEach((items, k) => g.push({
        key: k, items,
        title: k === "—" ? "Без срока" : `${longDate(k)}${k === today ? " · сегодня" : k === tomorrow ? " · завтра" : ""}`,
        cls: k === today ? "today" : k !== "—" && k < today && items.some(t => t.status !== "done") ? "over" : undefined,
      }));
    };
    if (view.type === "today") {
      if (overdue.length) g.push({ key: "over", title: "Просрочено", cls: "over", items: overdue });
      g.push({ key: "today", title: `${longDate(today)} · сегодня`, cls: "today", items: tasks.filter(t => t.planned_for === today).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || byDate(a, b)) });
    } else if (view.type === "tomorrow") {
      g.push({ key: "tm", title: `${longDate(tomorrow)} · завтра`, items: tasks.filter(t => t.planned_for === tomorrow).sort(byDate) });
    } else if (view.type === "week") {
      dateGroups(open.filter(t => t.planned_for && t.planned_for >= today && t.planned_for <= addDays(today, 6)));
    } else if (view.type === "done") {
      g.push({ key: "done", title: "Выполнено", items: tasks.filter(t => t.status === "done").sort((a, b) => (b.done_at || "").localeCompare(a.done_at || "")) });
    } else if (view.type === "month") {
      dateGroups(tasks.filter(t => t.planned_for?.startsWith(view.ym) && (!hideDone || t.status !== "done")));
    }
    return g;
  }, [tasks, view, hideDone, today]);

  if (!allowed) return <div style={{ padding: 40, color: "var(--t2)" }}>Раздел доступен владельцу и ассистенту.</div>;

  const openTask = tasks.find(t => t.id === openId) || null;
  const sprintTasks = curSprint ? tasks.filter(t => t.planned_for && t.planned_for >= curSprint.start_date && t.planned_for <= curSprint.end_date) : [];
  const sprintDone = sprintTasks.filter(t => t.status === "done").length;

  const Row = ({ t }: { t: Task }) => {
    const subs = t.subtasks || [];
    const isOver = t.status !== "done" && !!t.planned_for && t.planned_for < today;
    return (
      <div className="row" onClick={() => setOpenId(t.id)}>
        <button className={`chk ${t.status === "done" ? "on" : ""}`} style={{ ["--pc" as any]: PRI_COLOR[t.priority] }}
          onClick={e => { e.stopPropagation(); toggle(t); }} title={t.status === "done" ? "Вернуть в работу" : "Выполнено"}>
          {t.status === "done" && <Check size={12} strokeWidth={3.5} />}
        </button>
        <div className="rt">
          <div className={`x ${t.status === "done" ? "done" : ""}`}>{stripDir(t.text)}</div>
          <div className="rm">
            {t.direction && <span className="dd"><i style={{ background: DIR_COLOR[t.direction] }} />{t.direction}</span>}
            {(view.type === "today" || view.type === "done") && t.planned_for && <span className={isOver ? "red" : ""}>{isOver ? `просрочено с ${dm(t.planned_for)}` : dm(t.planned_for)}</span>}
            {subs.length > 0 && <span className="dd"><ListChecks size={12} />{subs.filter(s => s.done).length}/{subs.length}</span>}
            {t.owner && <span>· {t.owner}</span>}
          </div>
        </div>
        <ChevronRight size={15} style={{ color: "var(--t3)" }} />
      </div>
    );
  };

  const header = () => {
    if (view.type === "brain") return <><h1>Мозг системы</h1><div className="hsub">Планы дня, пуши и итоги от CEO-бота. Решения и заметки отсюда бот учитывает в следующих планах.</div></>;
    if (view.type === "month") {
      const sp = sprints.find(s => s.id === view.sprintId);
      const st = monthStat(view.ym);
      const [y, m] = view.ym.split("-").map(Number);
      return (
        <>
          <h1>{RU_MONTH[m - 1]} {y}</h1>
          <div className="hsub">Забег «{sp?.title}» · {st.done} из {st.all} задач выполнено{st.over ? ` · ${st.over} просрочено` : ""}</div>
          {sp?.goals && <div className="goals">{sp.goals.split("\n").filter(Boolean).map(g => <span key={g} className="goal"><Target size={11} style={{ verticalAlign: -1, marginRight: 5, color: "var(--gr)" }} />{g}</span>)}</div>}
        </>
      );
    }
    const t = { today: "Сегодня", tomorrow: "Завтра", week: "Ближайшие 7 дней", done: "Выполнено" }[view.type];
    return <><h1>{t}</h1><div className="hsub">{longDate(today)}{curSprint ? ` · забег «${curSprint.title}»` : ""}</div></>;
  };

  return (
    <div className="st">
      <style>{S}</style>

      <aside className="rail">
        <button className={`ri ${view.type === "today" ? "on" : ""}`} onClick={() => setView({ type: "today" })}><Sun size={16} color="#ffae42" />Сегодня<span className={`n ${overdue.length ? "red" : ""}`}>{counts.today || ""}</span></button>
        <button className={`ri ${view.type === "tomorrow" ? "on" : ""}`} onClick={() => setView({ type: "tomorrow" })}><Sunrise size={16} color="#42d4f4" />Завтра<span className="n">{counts.tomorrow || ""}</span></button>
        <button className={`ri ${view.type === "week" ? "on" : ""}`} onClick={() => setView({ type: "week" })}><CalendarRange size={16} color="#9d6bff" />7 дней<span className="n">{counts.week || ""}</span></button>
        <button className={`ri ${view.type === "done" ? "on" : ""}`} onClick={() => setView({ type: "done" })}><CheckCircle2 size={16} color="#a8e063" />Выполнено<span className="n">{counts.done || ""}</span></button>
        <button className={`ri ${view.type === "brain" ? "on" : ""}`} onClick={() => setView({ type: "brain" })}><Brain size={16} color="#ec4899" />Мозг системы</button>

        {[...sprints].reverse().map(sp => (
          <div key={sp.id}>
            <div className="rh"><Flame size={11} />{sp.title}</div>
            {monthsOf(sp).map(ym => {
              const st = monthStat(ym); const m = +ym.slice(5, 7);
              const on = view.type === "month" && view.ym === ym && view.sprintId === sp.id;
              return (
                <div key={ym}>
                  <button className={`ri sub ${on ? "on" : ""}`} onClick={() => setView({ type: "month", ym, sprintId: sp.id })}>
                    {RU_MONTH[m - 1]}<span className={`n ${st.over ? "red" : ""}`}>{st.all ? `${st.done}/${st.all}` : ""}</span>
                  </button>
                  <div className="prog"><i style={{ width: `${st.all ? (st.done / st.all) * 100 : 0}%` }} /></div>
                </div>
              );
            })}
          </div>
        ))}
        <button className="ri" style={{ marginTop: 8, color: "var(--pu)" }} onClick={() => {
          const last = sprints[sprints.length - 1];
          const start = last ? addDays(last.end_date, 1) : today;
          const endD = new Date(start + "T00:00:00"); endD.setMonth(endD.getMonth() + 2); endD.setDate(0);
          const s = +start.slice(5, 7), e = endD.getMonth() + 1;
          setNewSprint({ title: `${RU_MONTH[s - 1]} — ${RU_MONTH[e - 1]} ${endD.getFullYear()}`, start, end: iso(endD), goals: "", target: "" });
        }}><Plus size={16} />Новый забег</button>
      </aside>

      <div className="main">
        {err && <div className="card" style={{ marginBottom: 12, borderColor: "rgba(255,92,122,.45)", color: "var(--rd)" }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {err}</div>}
        {header()}

        {view.type !== "brain" && view.type !== "done" && view.type !== "month" && curSprint && (
          <div className="kp">
            <div className="k"><div className="l">Активных клиентов</div><div className="v">{activeClients ?? "—"} <small>/ {curSprint.client_target ?? "—"}</small></div></div>
            <div className="k"><div className="l">Задач забега</div><div className="v">{sprintDone} <small>/ {sprintTasks.length}</small></div></div>
            <div className="k"><div className="l">Просрочено</div><div className="v" style={{ color: overdue.length ? "var(--rd)" : "var(--gr)" }}>{overdue.length}</div></div>
            <div className="k"><div className="l">До конца забега</div><div className="v">{Math.max(0, daysBetween(today, curSprint.end_date))} <small>дн.</small></div></div>
          </div>
        )}

        {view.type === "brain" ? (
          <>
            {(() => { const p = journal.find(e => e.kind === "plan"); return (
              <div className="card" style={{ marginTop: 14 }}>
                <div className="hint" style={{ marginBottom: 8, marginTop: 0 }}>{p ? `Последний план дня · ${dm(p.day)}` : "Бот ещё не присылал план — утренний приходит в 08:00, или напиши боту /plan"}</div>
                {p && <pre>{p.text}</pre>}
              </div>
            ); })()}
            <div className="add" style={{ marginTop: 14 }}>
              <input className="t" placeholder="Записать решение или заметку для бота…" value={note.text} onChange={e => setNote({ ...note, text: e.target.value })} onKeyDown={e => e.key === "Enter" && addNote()} />
              <select value={note.kind} onChange={e => setNote({ ...note, kind: e.target.value })}><option value="decision">Решение</option><option value="note">Заметка</option></select>
              <button className="btn" onClick={addNote}><Plus size={14} />Записать</button>
            </div>
            <div className="card" style={{ marginTop: 10 }}>
              {journal.length === 0 ? <div className="empty">Записей пока нет.</div> : journal.map(e => (
                <div key={e.id} className={`j ${openJ === e.id ? "open" : ""}`} onClick={() => setOpenJ(openJ === e.id ? null : e.id)}>
                  <div className="h"><span className="chip" style={{ color: KIND_COLOR[e.kind], borderColor: KIND_COLOR[e.kind] }}>{KIND_LABEL[e.kind] || e.kind}</span>{dm(e.day)} · {new Date(e.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · {e.source === "crm" ? "из CRM" : "CEO-бот"}</div>
                  <div className="tx">{e.text}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {view.type !== "done" && (
              <div className="add">
                <Plus size={18} style={{ color: "var(--pu)", alignSelf: "center", flex: "none" }} />
                <input className="t" placeholder={`Добавить задачу${view.type === "today" ? " на сегодня" : view.type === "tomorrow" ? " на завтра" : ""}… (Enter)`} value={draft.text}
                  onChange={e => setDraft({ ...draft, text: e.target.value })} onKeyDown={e => e.key === "Enter" && addTask()} />
                <input type="date" value={draft.date || defaultDate()} onChange={e => setDraft({ ...draft, date: e.target.value })} />
                <select value={draft.direction} onChange={e => setDraft({ ...draft, direction: e.target.value })}>{DIRECTIONS.map(d => <option key={d}>{d}</option>)}</select>
                <select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value })}>{["A", "B", "C"].map(p => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}</select>
              </div>
            )}
            {view.type === "month" && (
              <label className="hint" style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} /> скрыть выполненные
              </label>
            )}
            {loading ? <div className="empty">Загрузка…</div> : groups.every(g => g.items.length === 0) ? (
              <div className="empty" style={{ marginTop: 20 }}>{view.type === "today" ? "На сегодня задач нет" : "Задач нет."}</div>
            ) : groups.filter(g => g.items.length).map(g => (
              <div key={g.key} className="grp">
                <div className={`gh ${g.cls || ""}`}>{g.title}<span className="c">{g.items.filter(t => t.status === "done").length}/{g.items.length}</span></div>
                <div className="list">{g.items.map(t => <Row key={t.id} t={t} />)}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {mounted && openTask && createPortal(
        <TaskDrawer task={openTask} today={today} onClose={() => setOpenId(null)} onPatch={f => patch(openTask.id, f)}
          onDelete={async () => { const id = openTask.id; setOpenId(null); await patch(id, { status: "cancelled" }); setTasks(ts => ts.filter(x => x.id !== id)); }} />,
        document.body)}

      {mounted && newSprint && createPortal(
        <>
          <style>{S}</style>
          <div className="sd-bg" onClick={() => setNewSprint(null)} />
          <div className="sd">
            <div className="top"><Flame size={18} color="#ffae42" /><b style={{ color: "var(--t1)" }}>Новый забег</b><span style={{ flex: 1 }} /><button className="ib" onClick={() => setNewSprint(null)}><X size={18} /></button></div>
            <div className="f">
              <label>Название</label><input value={newSprint.title} onChange={e => setNewSprint({ ...newSprint, title: e.target.value })} />
              <label>Начало</label><input type="date" value={newSprint.start} onChange={e => setNewSprint({ ...newSprint, start: e.target.value })} />
              <label>Конец</label><input type="date" value={newSprint.end} onChange={e => setNewSprint({ ...newSprint, end: e.target.value })} />
              <label>Цель, клиентов</label><input type="number" value={newSprint.target} onChange={e => setNewSprint({ ...newSprint, target: e.target.value })} />
            </div>
            <h4><Target size={12} />Цели забега — по одной на строку</h4>
            <textarea className="ds" value={newSprint.goals} onChange={e => setNewSprint({ ...newSprint, goals: e.target.value })} placeholder={"22 активных клиента к 31.12\nОперационный руководитель вышел в работу"} />
            <div className="acts"><button className="btn" onClick={createSprint}><Plus size={14} />Создать забег</button><button className="btn ghost" onClick={() => setNewSprint(null)}>Отмена</button></div>
          </div>
        </>, document.body)}
    </div>
  );
}

function TaskDrawer({ task, today, onClose, onPatch, onDelete }: {
  task: Task; today: string; onClose: () => void; onPatch: (f: Partial<Task>) => void; onDelete: () => void;
}) {
  const [title, setTitle] = useState(stripDir(task.text));
  const [desc, setDesc] = useState(task.description || "");
  const [result, setResult] = useState(task.result || "");
  const [owner, setOwner] = useState(task.owner || "");
  const [subText, setSubText] = useState("");
  useEffect(() => { setTitle(stripDir(task.text)); setDesc(task.description || ""); setResult(task.result || ""); setOwner(task.owner || ""); }, [task.id]);
  const subs = task.subtasks || [];
  const saveTitle = () => { const t = title.trim(); if (t && t !== stripDir(task.text)) onPatch({ text: task.direction ? `${task.direction}: ${t}` : t }); };
  const setSubs = (next: Sub[]) => onPatch({ subtasks: next });
  const isOver = task.status !== "done" && !!task.planned_for && task.planned_for < today;
  const done = task.status === "done";

  return (
    <>
      <style>{S}</style>
      <div className="sd-bg" onClick={onClose} />
      <div className="sd">
        <div className="top">
          <button onClick={() => onPatch(done ? { status: "open", done_at: null } : { status: "done", done_at: new Date().toISOString() })}
            style={{ width: 24, height: 24, borderRadius: "50%", border: `2px solid ${done ? "var(--gr)" : PRI_COLOR[task.priority]}`, background: done ? "var(--gr)" : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
            {done && <Check size={13} strokeWidth={3.5} />}
          </button>
          <span style={{ fontSize: 12, color: done ? "var(--gr)" : isOver ? "var(--rd)" : "var(--t3)", fontWeight: 700 }}>
            {done ? `Выполнено ${task.done_at ? dm(task.done_at.slice(0, 10)) : ""}` : isOver ? `Просрочено на ${daysBetween(task.planned_for!, today)} дн.` : task.planned_for ? `Срок: ${longDate(task.planned_for)}` : "Без срока"}
          </span>
          <span style={{ flex: 1 }} />
          <button className="ib" onClick={onClose}><X size={18} /></button>
        </div>

        <textarea className="ttl" rows={2} value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle} />

        <div className="f">
          <label>Срок</label><input type="date" value={task.planned_for || ""} onChange={e => onPatch({ planned_for: e.target.value || null })} />
          <label>Направление</label>
          <select value={task.direction || ""} onChange={e => onPatch({ direction: e.target.value || null, text: e.target.value ? `${e.target.value}: ${stripDir(task.text)}` : stripDir(task.text) })}>
            <option value="">—</option>{DIRECTIONS.map(d => <option key={d}>{d}</option>)}
          </select>
          <label>Приоритет</label>
          <select value={task.priority} onChange={e => onPatch({ priority: e.target.value })}>{["A", "B", "C"].map(p => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}</select>
          <label>Исполнитель</label><input placeholder="Ярослав, ассистент, Марат…" value={owner} onChange={e => setOwner(e.target.value)} onBlur={() => owner !== (task.owner || "") && onPatch({ owner: owner || null })} />
        </div>

        <h4><Flag size={12} />Описание</h4>
        <textarea className="ds" placeholder="Что именно сделать, зачем, критерий готовности…" value={desc} onChange={e => setDesc(e.target.value)} onBlur={() => desc !== (task.description || "") && onPatch({ description: desc || null })} />

        <h4><ListChecks size={12} />Подзадачи {subs.length > 0 && <span style={{ color: "var(--t2)" }}>{subs.filter(s => s.done).length}/{subs.length}</span>}</h4>
        {subs.map((s, i) => (
          <div key={i} className={`si ${s.done ? "done" : ""}`}>
            <button className="ib" onClick={() => setSubs(subs.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}>
              {s.done ? <CheckCircle2 size={17} color="var(--gr)" /> : <span style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid var(--t3)", display: "inline-block" }} />}
            </button>
            <span>{s.text}</span>
            <button className="ib" onClick={() => setSubs(subs.filter((_, j) => j !== i))}><X size={14} /></button>
          </div>
        ))}
        <div className="sadd">
          <input placeholder="Добавить подзадачу… (Enter)" value={subText} onChange={e => setSubText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && subText.trim()) { setSubs([...subs, { text: subText.trim(), done: false }]); setSubText(""); } }} />
        </div>

        <h4>Итог / комментарий</h4>
        <textarea className="ds" style={{ minHeight: 70 }} placeholder="Что получилось, ссылка на результат…" value={result} onChange={e => setResult(e.target.value)} onBlur={() => result !== (task.result || "") && onPatch({ result: result || null })} />

        <div className="acts">
          {!done
            ? <button className="btn ok" onClick={() => onPatch({ status: "done", done_at: new Date().toISOString() })}><Check size={14} />Выполнено</button>
            : <button className="btn ghost" onClick={() => onPatch({ status: "open", done_at: null })}>Вернуть в работу</button>}
          {!done && <button className="btn ghost" onClick={() => onPatch({ planned_for: addDays(task.planned_for && task.planned_for > today ? task.planned_for : today, 1) })}>Перенести на день</button>}
          <button className="btn danger" onClick={onDelete}><Trash2 size={14} />Удалить</button>
        </div>
        <div className="meta">
          {task.source === "roadmap_sep_oct" ? "Из дорожной карты сентябрь–октябрь" : task.source === "goal_auto_oct" ? "Из цели «Авто до 09.10»" : task.source === "crm" ? "Добавлена в CRM" : `Источник: ${task.source}`} · создана {dm(task.created_at.slice(0, 10))}
          <br />CEO-бот видит эту задачу и её статус.
        </div>
      </div>
    </>
  );
}
