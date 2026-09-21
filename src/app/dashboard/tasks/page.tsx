"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, TeamMember } from "@/lib/database";
import { myClients, seesAllClients } from "@/lib/scope";
import { useRole } from "@/components/RoleContext";
import Avatar from "@/components/Avatar";
import { TASK_META, type TaskKind } from "@/lib/clientTasks";
import { Check, ChevronDown, ChevronRight, AlertTriangle, CalendarDays, Database, RotateCcw } from "lucide-react";

/* «Задачи по клиентам» — что проджект делает по каждому клиенту и когда.
   Задачи создаёт CRM сама (крон /api/cron/client-tasks) по датам клиента:
   разговор на 15-й день, недельный отчёт, оплата заранее, контроль оплаты, итоги месяца. */

type Task = {
  id: number; client_id: number; kind: TaskKind; title: string; description: string | null;
  due_date: string; month_number: number | null; assignee_id: number | null;
  status: "open" | "done" | "skipped"; result: string | null; done_at: string | null;
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const RU_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const RU_WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const longDate = (s: string) => { const d = new Date(s + "T00:00:00"); return `${RU_WD[d.getDay()]}, ${d.getDate()} ${RU_GEN[d.getMonth()]}`; };
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);

export default function ClientTasksPage() {
  const supabase = createClient();
  const router = useRouter();
  const role = useRole();
  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [me, setMe] = useState<TeamMember | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [tab, setTab] = useState<"open" | "done">("open");
  const [clientFilter, setClientFilter] = useState<"all" | number>("all");
  const [busy, setBusy] = useState(false);
  const today = iso(new Date());

  useEffect(() => { load(); }, []);
  async function load() {
    const [cls, tm] = await Promise.all([db.getClients(supabase), db.getTeam(supabase)]);
    const { data: { session } } = await supabase.auth.getSession();
    const mine0 = session?.user?.id ? tm.find(t => t.profile_id === session.user.id) || null : null;
    setTeam(tm); setMe(mine0);
    const mine = myClients(role, mine0, cls).filter(c => c.stage === "active");
    setClients(mine);
    if (!mine.length) { setTasks([]); setLoading(false); return; }
    const { data, error } = await supabase.from("client_tasks").select("*")
      .in("client_id", mine.map(c => c.id)).order("due_date");
    if (error && /does not exist|schema cache/i.test(error.message)) setMissing(true);
    setTasks((data || []) as Task[]);
    setLoading(false);
  }

  async function patch(id: number, fields: Partial<Task>) {
    setTasks(ts => ts.map(t => (t.id === id ? { ...t, ...fields } as Task : t)));
    const { error } = await supabase.from("client_tasks").update(fields).eq("id", id);
    if (error) { alert(error.message); load(); }
  }
  const complete = (t: Task) => patch(t.id, { status: "done", done_at: new Date().toISOString(), done_by: me?.id ?? null } as any);

  async function generate() {
    setBusy(true);
    try { const r = await fetch("/api/cron/client-tasks", { cache: "no-store" }); const j = await r.json();
      if (!r.ok) alert(j?.error || "не удалось создать задачи"); await load();
      if (r.ok) alert(j.created ? `Создано задач: ${j.created}` : "Новых задач нет — всё уже создано");
    } catch (e: any) { alert(String(e)); }
    setBusy(false);
  }

  const clientById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])) as Record<number, Client>, [clients]);
  const visible = tasks.filter(t => (clientFilter === "all" || t.client_id === clientFilter) && (tab === "done" ? t.status !== "open" : t.status === "open"));
  const groups = useMemo(() => {
    const g: { key: string; title: string; cls?: string; items: Task[] }[] = [];
    if (tab === "done") return [{ key: "done", title: "Выполненные", items: [...visible].sort((a, b) => (b.done_at || "").localeCompare(a.done_at || "")) }];
    const over = visible.filter(t => t.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date));
    const now = visible.filter(t => t.due_date === today);
    const soon = visible.filter(t => t.due_date > today).sort((a, b) => a.due_date.localeCompare(b.due_date));
    if (over.length) g.push({ key: "over", title: "Просрочено", cls: "over", items: over });
    g.push({ key: "today", title: `Сегодня · ${longDate(today)}`, cls: "today", items: now });
    const byDay = new Map<string, Task[]>();
    soon.forEach(t => byDay.set(t.due_date, [...(byDay.get(t.due_date) || []), t]));
    byDay.forEach((items, d) => g.push({ key: d, title: longDate(d), items }));
    return g;
  }, [visible, tab, today]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;

  const Row = ({ t }: { t: Task }) => {
    const c = clientById[t.client_id];
    const meta = TASK_META[t.kind] || { label: t.kind, color: "var(--t3)", icon: "•" };
    const late = t.status === "open" && t.due_date < today ? daysBetween(t.due_date, today) : 0;
    const open = openId === t.id;
    return (
      <div className="ct-row" style={{ borderLeft: `3px solid ${meta.color}` }}>
        <div className="ct-head" onClick={() => setOpenId(open ? null : t.id)}>
          <button className={`ct-chk ${t.status === "done" ? "on" : ""}`} onClick={e => { e.stopPropagation(); t.status === "done" ? patch(t.id, { status: "open", done_at: null }) : complete(t); }}>
            {t.status === "done" && <Check size={12} strokeWidth={3.5} />}
          </button>
          {c && <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={24} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ct-title" style={{ textDecoration: t.status !== "open" ? "line-through" : "none", color: t.status !== "open" ? "var(--t3)" : "var(--t1)" }}>
              {meta.icon} {t.title}
            </div>
            <div className="ct-sub">
              <span style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</span>
              <span>· {c ? `${c.name} ${c.surname || ""}` : "клиент"}</span>
              {t.month_number ? <span>· M{t.month_number}</span> : null}
              {late > 0 && <span style={{ color: "var(--rd)", fontWeight: 700 }}>· просрочено {late} дн.</span>}
              {seesAllClients(role) && t.assignee_id ? <span>· {team.find(x => x.id === t.assignee_id)?.name || ""}</span> : null}
            </div>
          </div>
          {open ? <ChevronDown size={15} style={{ color: "var(--t3)" }} /> : <ChevronRight size={15} style={{ color: "var(--t3)" }} />}
        </div>
        {open && (
          <div className="ct-body">
            <pre>{t.description || "Инструкции нет."}</pre>
            <div className="ct-acts">
              <button className="ct-btn" onClick={() => router.push(`/dashboard/clients/${t.client_id}`)}>Открыть клиента</button>
              {t.kind === "weekly_report" && <a className="ct-btn" href={`/api/clients/${t.client_id}/report-week`} target="_blank" rel="noreferrer">Собрать отчёт</a>}
              {t.kind === "month_review" && <a className="ct-btn" href={`/api/clients/${t.client_id}/report`} target="_blank" rel="noreferrer">Отчёт за месяц</a>}
              {t.status === "open" && <button className="ct-btn ok" onClick={() => complete(t)}><Check size={13} /> Выполнено</button>}
              {t.status === "open" && <button className="ct-btn ghost" onClick={() => patch(t.id, { status: "skipped" })}>Не нужно</button>}
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="ct-lbl">Итог · что ответил клиент, о чём договорились</div>
              <textarea defaultValue={t.result || ""} onBlur={e => e.target.value !== (t.result || "") && patch(t.id, { result: e.target.value })}
                rows={3} placeholder="Например: оплата 28-го, просит больше роликов про цены" className="ct-ta" />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif", maxWidth: 1000 }}>
      <style>{S}</style>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800 }}>Задачи по клиентам</h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>
            CRM ставит их сама по датам клиента: разговор на 15-й день, недельный отчёт, оплата заранее, контроль оплаты, итоги месяца
          </p>
        </div>
        <button className="ct-btn" onClick={generate} disabled={busy}><RotateCcw size={13} /> {busy ? "Обновляю…" : "Обновить список"}</button>
      </div>

      {missing && (
        <div className="card" style={{ padding: 18, borderColor: "rgba(255,174,66,.4)", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800, marginBottom: 6 }}><Database size={15} style={{ color: "var(--or)" }} /> Таблица задач ещё не создана</div>
          <div style={{ fontSize: 13, color: "var(--t2)" }}>Прогони <code>MIGRATION_2026-09-21_client_tasks.sql</code> в Supabase → SQL Editor.</div>
        </div>
      )}

      <div className="ct-tabs">
        <button className={tab === "open" ? "on" : ""} onClick={() => setTab("open")}>В работе · {tasks.filter(t => t.status === "open").length}</button>
        <button className={tab === "done" ? "on" : ""} onClick={() => setTab("done")}>Закрытые · {tasks.filter(t => t.status !== "open").length}</button>
        <select value={String(clientFilter)} onChange={e => setClientFilter(e.target.value === "all" ? "all" : Number(e.target.value))} className="ct-sel">
          <option value="all">Все клиенты</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name} {c.surname || ""}</option>)}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>
          {tab === "open" ? "Задач нет. Нажми «Обновить список» — CRM создаст их по датам клиентов." : "Закрытых задач пока нет."}
        </div>
      ) : groups.filter(g => g.items.length).map(g => (
        <div key={g.key} style={{ marginBottom: 16 }}>
          <div className={`ct-gh ${g.cls || ""}`}>
            {g.cls === "over" ? <AlertTriangle size={13} /> : <CalendarDays size={13} />} {g.title}
            <span style={{ color: "var(--t3)", fontWeight: 700 }}>{g.items.length}</span>
          </div>
          <div className="ct-list">{g.items.map(t => <Row key={t.id} t={t} />)}</div>
        </div>
      ))}
    </div>
  );
}

const S = `
.ct-tabs{display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap}
.ct-tabs button{border:1px solid var(--brd);background:transparent;color:var(--t2);border-radius:100px;padding:7px 13px;font-size:12.5px;font-weight:700;cursor:pointer}
.ct-tabs button.on{background:var(--pud);color:var(--t1);border-color:var(--pu)}
.ct-sel{margin-left:auto;background:var(--inp);border:1px solid var(--brd);color:var(--t1);border-radius:10px;padding:7px 10px;font-size:12.5px}
.ct-gh{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;color:var(--t2);padding:0 4px 8px}
.ct-gh.over{color:var(--rd)}.ct-gh.today{color:var(--gr)}
.ct-list{display:flex;flex-direction:column;gap:8px}
.ct-row{background:var(--card);border:1px solid var(--brd);border-radius:14px;overflow:hidden}
.ct-head{display:flex;align-items:center;gap:11px;padding:12px 14px;cursor:pointer}
.ct-head:hover{background:var(--cardH)}
.ct-chk{width:20px;height:20px;flex:none;border-radius:50%;border:2px solid var(--t3);background:transparent;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.ct-chk.on{background:var(--gr);border-color:var(--gr)}
.ct-title{font-size:14px;line-height:1.4;font-weight:600}
.ct-sub{display:flex;gap:6px;flex-wrap:wrap;font-size:11.5px;color:var(--t3);margin-top:3px}
.ct-body{padding:0 14px 14px 45px;border-top:1px solid var(--brd)}
.ct-body pre{white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.6;color:var(--t1);margin:12px 0 0;max-height:420px;overflow:auto}
.ct-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.ct-btn{display:inline-flex;align-items:center;gap:6px;background:var(--inp);border:1px solid var(--brd);color:var(--t1);border-radius:10px;padding:7px 12px;font-size:12.5px;font-weight:700;cursor:pointer;text-decoration:none}
.ct-btn.ok{background:var(--gr);color:#0a0118;border-color:var(--gr)}
.ct-btn.ghost{color:var(--t2)}
.ct-lbl{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:6px}
.ct-ta{width:100%;background:var(--inp);border:1px solid var(--brd);color:var(--t1);border-radius:10px;padding:9px 11px;font-size:13px;font-family:inherit;line-height:1.5;resize:vertical}
@media(max-width:640px){.ct-body{padding-left:14px}}
`;
