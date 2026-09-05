"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Client, ClientMonth, Script, TeamMember, OnboardingProgress } from "@/lib/database";
import Avatar from "@/components/Avatar";
import { VIDEO_LEAD, SCRIPT_LEAD, addDaysIso, fmtDateShort } from "@/components/ScriptModal";
import { upcomingBirthdays, daysLabel } from "@/lib/birthdays";
import { ChevronLeft, ChevronRight, Plus, CalendarCheck, Rocket, RefreshCw, Cake } from "lucide-react";
import ClientsTable from "@/components/ClientsTable";
import { isPlaceholder } from "@/lib/scriptFlags";

/* ============================================================
   Дашборд владельца v2 — «где мы по каждому клиенту»:
   план-факт месяца, темп к сегодня, где проседаем, что делать сейчас.
   ============================================================ */

const RU_M = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const ymLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${RU_M[m - 1]} ${y}`; };
const ymShift = (ym: string, d: number) => { const [y, m] = ym.split("-").map(Number); const x = new Date(y, m - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

type Problem = { txt: string; sev: "red" | "or" };
type Row = {
  c: Client; cm: ClientMonth | null; tl: TeamMember | null; mg: TeamMember | null;
  pkg: number; pub: number; pct: number; daysLeft: number | null;
  pubYm: number; target: number | null; dueByToday: number; delta: number;
  writing: number; montage: number; ready: number; noDate: number; overdueVideos: number;
  daysSincePub: number | null; problems: Problem[]; sev: "red" | "or" | "gr";
};

function currentMonthOf(months: ClientMonth[], todayIso: string): ClientMonth | null {
  const ms = months.filter(m => m.status !== "cancelled");
  if (!ms.length) return null;
  return ms.find(m => m.start_date <= todayIso && todayIso <= m.end_date) || ms.find(m => m.status === "active") || ms.find(m => m.status === "onboarding") || [...ms].sort((a, b) => b.month_number - a.month_number)[0];
}

type Props = {
  clients: Client[]; clientMonths: ClientMonth[]; scripts: Script[]; team: TeamMember[];
  onbProgresses: OnboardingProgress[]; overdueTasks: any[];
  calTargets: Record<string, number>; onSetTarget: (clientId: number, ym: string, n: number) => void;
  selectedMonth: string; setSelectedMonth: (ym: string) => void; currentYM: string;
  todayIso: string; role: string; meName: string;
};

export default function OwnerDashboard({ clients, clientMonths, scripts, team, onbProgresses, overdueTasks, calTargets, onSetTarget, selectedMonth, setSelectedMonth, currentYM, todayIso, role, meName }: Props) {
  const router = useRouter();
  const [openKind, setOpenKind] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const overdueTaskIds = new Set(overdueTasks.map((t: any) => t.client_id));
    return clients.filter(c => c.stage === "active").map(c => {
      const cm = currentMonthOf(clientMonths.filter(m => m.client_id === c.id), todayIso);
      const all = scripts.filter(s => s.client_id === c.id);
      const ms = cm ? all.filter(s => s.month_number === cm.month_number) : [];
      const pkg = cm?.package || 0;
      const pub = ms.filter(s => s.video_status === "published").length;
      const pct = pkg ? Math.min(100, Math.round(pub / pkg * 100)) : 0;
      const daysLeft = cm ? daysBetween(todayIso, cm.end_date) : null;
      const pubYm = all.filter(s => s.video_status === "published" && (s.pub_date || "").startsWith(selectedMonth)).length;
      const target = calTargets[`${c.id}:${selectedMonth}`] ?? null;
      const dueByToday = all.filter(s => s.pub_date && s.pub_date.startsWith(selectedMonth) && s.pub_date <= todayIso).length;
      const delta = pubYm - dueByToday;
      const writing = ms.filter(s => s.script_status === "inProgress" || s.script_status === "review").length;
      const montage = ms.filter(s => s.script_status === "approved" && (s.video_status === "inProgress" || s.video_status === "review")).length;
      const ready = ms.filter(s => s.video_status === "ready").length;
      const noDate = ms.filter(s => !s.pub_date && s.video_status !== "published").length;
      const overdueVideos = ms.filter(s => s.pub_date && s.pub_date < todayIso && s.video_status !== "published" && !isPlaceholder(s)).length;
      const stalePlaceholders = ms.filter(s => s.pub_date && s.pub_date < todayIso && isPlaceholder(s)).length;
      const lastPub = all.filter(s => s.video_status === "published" && s.pub_date).map(s => s.pub_date!).sort().pop();
      const daysSincePub = lastPub ? daysBetween(lastPub, todayIso) : null;
      const problems: Problem[] = [];
      if (overdueVideos) problems.push({ txt: `${overdueVideos} ${overdueVideos === 1 ? "ролик просрочен" : "роликов просрочено"}`, sev: "red" });
      if (daysSincePub != null && daysSincePub > 7) problems.push({ txt: `нет публикаций ${daysSincePub} дн`, sev: "red" });
      if (cm && daysLeft != null && daysLeft < 0 && pub < pkg) problems.push({ txt: `месяц просрочен на ${-daysLeft} дн`, sev: "red" });
      if (overdueTaskIds.has(c.id)) problems.push({ txt: "просрочены задачи онбординга", sev: "or" });
      if (cm && daysLeft != null && daysLeft >= 0 && pkg - pub > daysLeft) problems.push({ txt: `осталось ${pkg - pub} за ${daysLeft} дн`, sev: "or" });
      if (selectedMonth === currentYM && target == null && cm) problems.push({ txt: "нет плана на месяц", sev: "or" });
      if (!cm) problems.push({ txt: "нет контрактного месяца", sev: "red" });
      if (stalePlaceholders) problems.push({ txt: `${stalePlaceholders} пустых слотов в прошлом`, sev: "or" });
      const sev: Row["sev"] = problems.some(p => p.sev === "red") ? "red" : problems.length ? "or" : "gr";
      return { c, cm, tl: team.find(t => t.id === c.teamlead_id) || null, mg: team.find(t => t.id === c.montager_id) || null,
        pkg, pub, pct, daysLeft, pubYm, target, dueByToday, delta, writing, montage, ready, noDate, overdueVideos, daysSincePub, problems, sev };
    }).sort((a, b) => (a.sev === "red" ? 0 : a.sev === "or" ? 1 : 2) - (b.sev === "red" ? 0 : b.sev === "or" ? 1 : 2) || a.delta - b.delta || (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
  }, [clients, clientMonths, scripts, team, overdueTasks, calTargets, selectedMonth, todayIso, currentYM]);

  const onbByClient = useMemo(() => Object.fromEntries(onbProgresses.map(o => [o.client_id, o])) as Record<number, OnboardingProgress>, [onbProgresses]);

  const tot = useMemo(() => {
    const pubYm = rows.reduce((s, r) => s + r.pubYm, 0);
    const target = rows.reduce((s, r) => s + (r.target || 0), 0);
    const due = rows.reduce((s, r) => s + r.dueByToday, 0);
    const overdue = rows.reduce((s, r) => s + r.overdueVideos, 0);
    const overdueClients = rows.filter(r => r.overdueVideos > 0).length;
    const onb = rows.filter(r => (onbByClient[r.c.id]?.pending_tasks || 0) > 0).length;
    const behind = rows.filter(r => r.sev === "red").length;
    return { pubYm, target, due, overdue, overdueClients, onb, behind };
  }, [rows, onbByClient]);

  // «Что делать сейчас» — по этапам, с клиентами (текущие контрактные месяцы, срок ≤ сегодня)
  const todo = useMemo(() => {
    const kinds: Record<string, { t: string; c: string; items: { s: Script; c: Client; due: string }[] }> = {
      write: { t: "Написать сценарий", c: "#9d6bff", items: [] },
      send: { t: "Отправить клиенту", c: "#42d4f4", items: [] },
      wait: { t: "Ждём согласования", c: "#ffae42", items: [] },
      montage: { t: "Смонтировать", c: "#ffae42", items: [] },
      publish: { t: "Опубликовать", c: "#a8e063", items: [] },
    };
    const byId = Object.fromEntries(rows.map(r => [r.c.id, r]));
    for (const s of scripts) {
      const r = byId[s.client_id]; if (!r || !r.cm || s.month_number !== r.cm.month_number || !s.pub_date) continue;
      if (s.video_status === "published" || isPlaceholder(s)) continue;
      if (s.video_status === "ready") { kinds.publish.items.push({ s, c: r.c, due: s.pub_date }); continue; }
      if (s.script_status !== "approved") {
        const due = addDaysIso(s.pub_date, -SCRIPT_LEAD);
        const k = s.script_status === "review" ? "wait" : s.script_status === "inProgress" ? "send" : "write";
        kinds[k].items.push({ s, c: r.c, due });
      } else {
        kinds.montage.items.push({ s, c: r.c, due: addDaysIso(s.pub_date, -VIDEO_LEAD) });
      }
    }
    const now = Object.entries(kinds).map(([k, v]) => ({ k, ...v, now: v.items.filter(i => i.due <= todayIso).length }));
    const nowTotal = now.reduce((s, x) => s + x.now, 0);
    return { list: now, nowTotal };
  }, [scripts, rows, todayIso]);

  // Команда: загрузка по текущим контрактным месяцам
  const teamLoad = useMemo(() => team.map(tm => {
    const asTl = rows.filter(r => r.c.teamlead_id === tm.id);
    const asMg = rows.filter(r => r.c.montager_id === tm.id);
    const isMg = asMg.length > 0 && asTl.length === 0;
    const mine = isMg ? asMg : asTl;
    if (!mine.length) return null;
    const plan = mine.reduce((s, r) => s + r.pkg, 0);
    let done = 0, a = 0, b = 0;
    for (const r of mine) {
      const ms = r.cm ? scripts.filter(s => s.client_id === r.c.id && s.month_number === r.cm!.month_number) : [];
      if (isMg) { done += ms.filter(s => s.video_status === "ready" || s.video_status === "published").length; a += r.montage; b += r.ready; }
      else { done += ms.filter(s => s.script_status === "approved").length; a += r.writing; b += ms.filter(s => s.script_status === "review").length; }
    }
    const late = mine.reduce((s, r) => s + r.overdueVideos, 0);
    return { tm, isMg, n: mine.length, plan, done, a, b, late, pct: plan ? Math.round(done / plan * 100) : 0 };
  }).filter(Boolean) as { tm: TeamMember; isMg: boolean; n: number; plan: number; done: number; a: number; b: number; late: number; pct: number }[], [team, rows, scripts]);

  const onboarding = rows.map(r => ({ r, pr: onbByClient[r.c.id] })).filter(x => x.pr && x.pr.pending_tasks > 0).map(({ r, pr }) => {
    const start = r.c.onboarding_start || r.c.start_date || null;
    const day = start ? Math.max(1, daysBetween(start, todayIso) + 1) : null;
    const left = r.c.onboarding_deadline ? daysBetween(todayIso, r.c.onboarding_deadline) : null;
    return { r, pr, day, left };
  }).sort((a, b) => (a.left ?? 999) - (b.left ?? 999));

  const renewals = rows.filter(r => r.cm && (r.cm.status === "active" || r.cm.status === "onboarding") && r.daysLeft != null && r.daysLeft <= 7
    && !clientMonths.some(m => m.client_id === r.c.id && m.month_number > r.cm!.month_number && m.status !== "cancelled")).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  const birthdays = (role === "owner" || role === "admin" || role === "assistant") ? upcomingBirthdays([
    ...clients.filter(c => c.stage !== "churned").map(c => ({ kind: "client" as const, id: c.id, name: `${c.name} ${c.surname || ""}`.trim(), role: c.niche, avatarUrl: c.avatar_url, birthday: c.birthday })),
    ...team.map(t => ({ kind: "team" as const, id: t.id, name: t.name, role: t.role_title, avatarUrl: t.avatar_url, birthday: t.birthday })),
  ], todayIso, 30) : [];

  const Bar = ({ pct, color }: { pct: number; color: string }) => <div className="v2-bar"><i style={{ width: `${Math.min(100, pct)}%`, background: color }} /></div>;

  const hour = new Date().getHours();
  const greet = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const dateRu = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const monthNav = (
    <span className="v2-seg" style={{ alignItems: "center" }}>
      <button onClick={() => setSelectedMonth(ymShift(selectedMonth, -1))} style={{ padding: "6px 8px" }}><ChevronLeft size={14} /></button>
      <span style={{ fontSize: 12, fontWeight: 800, minWidth: 110, textAlign: "center", color: "var(--t1)" }}>{ymLabel(selectedMonth)}</span>
      {selectedMonth !== currentYM && <button onClick={() => setSelectedMonth(currentYM)} style={{ color: "var(--cy)", padding: "6px 6px" }}>сейчас</button>}
      <button onClick={() => setSelectedMonth(ymShift(selectedMonth, 1))} style={{ padding: "6px 8px" }}><ChevronRight size={14} /></button>
    </span>
  );

  return (
    <div className="v2">
      <div className="v2-hdr">
        <div><h1>{greet}, {meName.split(" ")[0]}</h1><p>{dateRu} · {rows.length} клиентов в работе{tot.onb ? ` · ${tot.onb} на онбординге` : ""}</p></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {monthNav}
          <button className="v2-act" onClick={() => router.push("/dashboard/today")}><CalendarCheck size={14} /> Сегодня</button>
          <button className="v2-act pri" onClick={() => router.push("/dashboard/clients?add=1")}><Plus size={14} /> Клиент</button>
        </div>
      </div>

      {/* ===== KPI ===== */}
      <div className="v2-stat v2-stat4">
        <div><b>{tot.pubYm}<em>/{tot.target || "—"}</em></b><span>вышло в {ymLabel(selectedMonth).split(" ")[0]} · план</span>
          <div className="v2-hint" style={{ color: tot.pubYm >= tot.due ? "var(--gr)" : "var(--or)" }}>к сегодня должно быть {tot.due}{tot.pubYm - tot.due !== 0 ? ` · ${tot.pubYm - tot.due > 0 ? "+" : ""}${tot.pubYm - tot.due}` : " · по плану"}</div></div>
        <div className={tot.overdue ? "rd" : ""}><b>{tot.overdue}</b><span>роликов просрочено</span><div className="v2-hint">{tot.overdueClients ? `у ${tot.overdueClients} клиентов` : "чисто"}</div></div>
        <div className={tot.behind ? "rd" : ""}><b>{tot.behind}</b><span>клиентов проседают</span><div className="v2-hint">{rows.filter(r => r.sev === "or").length} с предупреждением</div></div>
        <div className="pu"><b>{todo.nowTotal}</b><span>действий на сегодня</span><div className="v2-hint">просроченные и сегодняшние</div></div>
      </div>

      {/* ===== Таблица «Клиенты в работе» (v1, без изменений) ===== */}
      <div className="v2-sec">
        <ClientsTable
          clients={clients} clientMonths={clientMonths} scripts={scripts} team={team} todayIso={todayIso}
          overdueClientIds={new Set(overdueTasks.map((t: any) => t.client_id))}
          selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} currentYM={currentYM}
          calTargets={calTargets} onSetTarget={onSetTarget} canEditPlan={role !== "montager"}
          onOpen={(id) => router.push(`/dashboard/clients/${id}`)}
        />
      </div>

      {/* ===== Что делать сейчас + Команда ===== */}
      <div className="v2-two">
        <div className="v2-sec">
          <div className="v2-sec-h">Что делать сейчас<span className="cnt">{todo.nowTotal}</span><button className="v2-act ghost" style={{ marginLeft: "auto", height: 28, textTransform: "none", letterSpacing: 0 }} onClick={() => router.push("/dashboard/today")}>Открыть «Сегодня» →</button></div>
          <div className="v2-list">
            {todo.list.map(k => {
              const opened = openKind === k.k;
              const byClient: Record<number, { c: Client; n: number; late: number }> = {};
              for (const it of k.items) { const b = (byClient[it.c.id] ||= { c: it.c, n: 0, late: 0 }); b.n++; if (it.due < todayIso) b.late++; }
              const cl = Object.values(byClient).sort((a, b) => b.late - a.late || b.n - a.n);
              return (
                <div key={k.k} className="v2-card" style={{ borderLeft: `3px solid ${k.c}`, marginBottom: 0 }}>
                  <button onClick={() => setOpenKind(opened ? null : k.k)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: 0, color: "var(--t1)", cursor: "pointer", textAlign: "left", padding: 0 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, flex: 1 }}>{k.t}</span>
                    {k.now > 0 && <span className="v2-chip rd">{k.now} сейчас</span>}
                    <span className="v2-chip mut">{k.items.length} всего</span>
                  </button>
                  {opened && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {cl.map(x => <button key={x.c.id} className={`v2-chip ${x.late ? "rd" : "mut"}`} style={{ cursor: "pointer" }} onClick={() => router.push(`/dashboard/clients/${x.c.id}`)}>{x.c.name} · {x.n}{x.late ? ` (${x.late} просроч.)` : ""}</button>)}
                    {cl.length === 0 && <span className="v2-hint">пусто</span>}
                  </div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="v2-sec">
          <div className="v2-sec-h">Команда<span className="cnt">{teamLoad.length}</span><button className="v2-act ghost" style={{ marginLeft: "auto", height: 28, textTransform: "none", letterSpacing: 0 }} onClick={() => router.push("/dashboard/team")}>Вся команда →</button></div>
          <div className="v2-list">
            {teamLoad.sort((a, b) => b.late - a.late || b.plan - a.plan).map(x => (
              <button key={x.tm.id} className="v2-row" onClick={() => router.push(`/dashboard/today?as=${x.tm.id}`)}>
                <Avatar name={x.tm.name} src={x.tm.avatar_url} size={32} />
                <div>
                  <div className="t">{x.tm.name} <span style={{ color: "var(--t3)", fontWeight: 600, fontSize: 11 }}>· {x.isMg ? "монтажёр" : "тимлид"} · {x.n} кл.</span></div>
                  <Bar pct={x.pct} color={x.isMg ? "var(--or)" : "var(--cy)"} />
                  <div className="s" style={{ marginTop: 4 }}>{x.isMg ? `${x.a} в монтаже · ${x.b} готово` : `${x.a} в работе · ${x.b} на согласовании`}{x.late ? ` · ` : ""}{x.late ? <b style={{ color: "var(--rd)" }}>{x.late} просроч.</b> : null}</div>
                </div>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}><b style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 14 }}>{x.done}</b><span style={{ color: "var(--t3)", fontSize: 11 }}>/{x.plan}</span></span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Онбординг / продления / ДР ===== */}
      <div className="v2-grid3">
        {onboarding.length > 0 && (
          <div className="v2-sec">
            <div className="v2-sec-h"><Rocket size={14} style={{ color: "var(--or)" }} /> Онбординг<span className="cnt">{onboarding.length}</span></div>
            <div className="v2-list">{onboarding.map(({ r, pr, day, left }) => (
              <button key={r.c.id} className={`v2-row ${left != null && left < 0 ? "late" : ""}`} onClick={() => router.push(`/dashboard/clients/${r.c.id}/onboarding`)}>
                <Avatar name={r.c.name} src={r.c.avatar_url} size={32} />
                <div><div className="t">{r.c.name} {r.c.surname || ""}</div><div className="s">{day ? `день ${day} · ` : ""}{pr.done_tasks}/{pr.total_tasks - pr.skipped_tasks} задач{left != null ? ` · ${left < 0 ? `просрочен ${-left} дн` : left === 0 ? "дедлайн сегодня" : `${left} дн`}` : ""}</div></div>
                <span className={`v2-chip ${left != null && left < 0 ? "rd" : "or"}`}>{pr.progress_pct}%</span>
              </button>
            ))}</div>
          </div>
        )}
        {renewals.length > 0 && (
          <div className="v2-sec">
            <div className="v2-sec-h"><RefreshCw size={14} style={{ color: "var(--cy)" }} /> Контракты на продление<span className="cnt">{renewals.length}</span></div>
            <div className="v2-list">{renewals.map(r => (
              <button key={r.c.id} className="v2-row" onClick={() => router.push(`/dashboard/clients/${r.c.id}`)}>
                <Avatar name={r.c.name} src={r.c.avatar_url} size={32} />
                <div><div className="t">{r.c.name} {r.c.surname || ""}</div><div className="s">M{r.cm!.month_number} {r.daysLeft! < 0 ? `просрочен ${-r.daysLeft!} дн` : r.daysLeft === 0 ? "заканчивается сегодня" : `заканчивается через ${r.daysLeft} дн`} · {r.pub}/{r.pkg}</div></div>
                <span className="v2-chip cy">Продлить →</span>
              </button>
            ))}</div>
          </div>
        )}
        {birthdays.length > 0 && (
          <div className="v2-sec">
            <div className="v2-sec-h"><Cake size={14} style={{ color: "var(--pk)" }} /> Дни рождения<span className="cnt">{birthdays.length}</span></div>
            <div className="v2-list">{birthdays.slice(0, 5).map(b => (
              <div key={`${b.kind}-${b.id}`} className="v2-row" style={{ cursor: "default" }}>
                <Avatar name={b.name} src={b.avatarUrl} size={32} />
                <div><div className="t">{b.name}</div><div className="s">{b.kind === "team" ? "команда" : "клиент"}{b.role ? ` · ${b.role}` : ""} · {b.when}{b.turns ? ` · ${b.turns}` : ""}</div></div>
                <span className={`v2-chip ${b.inDays === 0 ? "gr" : "mut"}`}>{daysLabel(b.inDays)}</span>
              </div>
            ))}</div>
          </div>
        )}
      </div>
    </div>
  );
}
