"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Client, ClientMonth, Script, TeamMember, OnboardingProgress } from "@/lib/database";
import Avatar from "@/components/Avatar";
import { VIDEO_LEAD, SCRIPT_LEAD, addDaysIso, fmtDateShort } from "@/components/ScriptModal";
import { batchFor, BATCH_BUFFER_DAYS, wdName } from "@/lib/batches";
import { AlertTriangle, CheckCircle2, Film, Users, ArrowRight, Package } from "lucide-react";

// Дашборд сотрудника: только его клиенты и только его задачи.
// Показывается тимлиду/монтажёру вместо общего, а владельцу — при «Смотреть как».

type Props = {
  member: TeamMember;
  clients: Client[];
  clientMonths: ClientMonth[];
  scripts: Script[];
  todayIso: string;
  onbProgresses?: OnboardingProgress[];
  viewedByOwner?: boolean;
};

export default function EmployeeDashboard({ member, clients, clientMonths, scripts, todayIso, onbProgresses = [], viewedByOwner }: Props) {
  const router = useRouter();
  const isMg = member.member_type === "montager";

  const v = useMemo(() => {
    const mine = clients.filter(c => c.stage === "active" && (isMg
      ? (c.montager_id === member.id || (c.extra_montager_ids || []).includes(member.id))
      : c.teamlead_id === member.id));
    const ids = new Set(mine.map(c => c.id));
    const scr = scripts.filter(s => ids.has(s.client_id));

    // Мои задачи: у монтажёра — смонтировать, у тимлида — написать/согласовать сценарий
    const tasks = scr
      .filter(s => {
        if (!s.pub_date) return false;
        if (isMg) return s.script_status === "approved" && !["ready", "published"].includes(s.video_status);
        return s.script_status !== "approved";
      })
      .map(s => ({ s, c: mine.find(x => x.id === s.client_id)!, due: addDaysIso(s.pub_date!, -(isMg ? VIDEO_LEAD : SCRIPT_LEAD)) }))
      .sort((a, b) => a.due.localeCompare(b.due));

    const overdue = tasks.filter(t => t.due < todayIso);
    const todayTasks = tasks.filter(t => t.due === todayIso);

    // Сделано за текущий месяц: монтажёр — по дате сдачи, тимлид — по публикациям
    const ym = todayIso.slice(0, 7);
    const doneMonth = isMg
      ? scr.filter(s => ["ready", "published"].includes(s.video_status) && (s.ready_at || s.pub_date || "").slice(0, 7) === ym).length
      : scr.filter(s => s.video_status === "published" && (s.pub_date || "").slice(0, 7) === ym).length;

    // План месяца по моим клиентам
    const planMonth = mine.reduce((sum, c) => {
      const cm = clientMonths.find(m => m.client_id === c.id && (m.status === "active" || m.status === "onboarding"));
      return sum + ((cm?.package ?? c.package) || 0);
    }, 0);

    // Недельные партии (только монтажёру, у кого задан день сдачи)
    const batches = isMg
      ? mine.map(c => batchFor(c, scripts, todayIso)).filter(Boolean).sort((a, b) => a!.deliveryIso.localeCompare(b!.deliveryIso))
      : [];

    // строки таблицы «Мои клиенты в работе»
    const rows = mine.map(c => {
      const cm = clientMonths.find(m => m.client_id === c.id && (m.status === "active" || m.status === "onboarding")) || null;
      const cs = scr.filter(s => s.client_id === c.id && (!cm || s.month_number === cm.month_number));
      const plan = (cm?.package ?? c.package) || 0;
      const pub = cs.filter(s => s.video_status === "published").length;
      const inWork = isMg
        ? cs.filter(s => s.script_status === "approved" && s.video_status === "inProgress").length
        : cs.filter(s => ["inProgress", "review"].includes(s.script_status)).length;
      const ready = cs.filter(s => s.video_status === "ready").length;
      const pubMonth = cs.filter(s => s.video_status === "published" && (s.pub_date || "").slice(0, 7) === ym).length;
      const daysLeft = cm ? Math.round((Date.parse(cm.end_date) - Date.parse(todayIso)) / 86400000) : 0;
      return { c, cm, plan, pub, inWork, ready, pubMonth, daysLeft, pct: plan ? Math.min(100, Math.round(pub / plan * 100)) : 0 };
    }).sort((a, b) => a.daysLeft - b.daysLeft);

    // Клиенты в фазе онбординга — их надо довести до первой публикации
    const onboarding = mine.map(c => {
      const pr = onbProgresses.find(o => o.client_id === c.id);
      if (!pr || pr.pending_tasks === 0) return null;
      const start = (c as any).onboarding_start || c.start_date || null;
      const day = start ? Math.max(1, Math.floor((Date.parse(todayIso) - Date.parse(start)) / 86400000) + 1) : null;
      const dl = (c as any).onboarding_deadline || null;
      const left = dl ? Math.round((Date.parse(dl) - Date.parse(todayIso)) / 86400000) : null;
      return { c, pr, day, dl, left };
    }).filter(Boolean) as { c: Client; pr: OnboardingProgress; day: number | null; dl: string | null; left: number | null }[];
    onboarding.sort((a, b) => (a.left ?? 999) - (b.left ?? 999));

    return { mine, tasks, overdue, todayTasks, doneMonth, planMonth, batches, rows, onboarding };
  }, [member, clients, clientMonths, scripts, todayIso, isMg, onbProgresses]);

  const KPI = ({ icon: I, label, value, sub, color, attention }: any) => (
    <div className="card" style={{ padding: 16, borderRadius: 14, border: attention ? `1px solid ${color}66` : undefined, background: attention ? `${color}0f` : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: `${color}22`, color, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${color}44` }}>
          <I size={15} strokeWidth={1.9} />
        </div>
        <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 26, fontWeight: 800, color: "var(--t1)", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 5 }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }}>
      {viewedByOwner && (
        <div style={{ padding: "9px 13px", borderRadius: 11, marginBottom: 14, fontSize: 12,
          background: "rgba(157,107,255,.08)", border: "1px solid rgba(157,107,255,.35)", color: "var(--t2)" }}>
          👁 Это экран <b style={{ color: "var(--t1)" }}>{member.name}</b> — ровно то, что видит {isMg ? "монтажёр" : "тимлид"} у себя.
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
          {isMg ? "🎬" : "✍️"} {member.name}
        </h1>
        <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>
          {isMg ? "Твои ролики и партии к сдаче" : "Твои сценарии и клиенты"} · {v.mine.length} {v.mine.length === 1 ? "клиент" : "клиентов"}
        </p>
      </div>

      {/* KPI — только про него */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }} className="emp-kpi">
        <KPI icon={AlertTriangle} label="Просрочено" value={v.overdue.length} color="#ff5c7a" attention={v.overdue.length > 0}
          sub={v.overdue.length ? "разобрать в первую очередь" : "чисто"} />
        <KPI icon={CheckCircle2} label="Сегодня" value={v.todayTasks.length} color="#ffae42"
          sub={isMg ? "сдать сегодня" : "написать сегодня"} />
        <KPI icon={Film} label={isMg ? "Смонтировано в месяце" : "Опубликовано в месяце"} value={v.doneMonth} color="#a8e063"
          sub={`план по моим клиентам: ${v.planMonth}`} />
        <KPI icon={Users} label="Мои клиенты" value={v.mine.length} color="#42d4f4" sub="в работе" />
      </div>

      {/* Партии на неделю — монтажёру */}
      {isMg && v.batches.length > 0 && (
        <div className="card" style={{ padding: 16, borderRadius: 15, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Package size={16} style={{ color: "var(--or)" }} />
            <span style={{ fontSize: 14, fontWeight: 800 }}>Партии к сдаче</span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--t3)" }}>готовность за {BATCH_BUFFER_DAYS} дня до сдачи</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 9 }}>
            {v.batches.map(b => {
              const left = b!.quota - b!.done;
              const hot = b!.readyByIso <= todayIso && left > 0;
              const col = hot ? "#ff5c7a" : left > 0 ? "#ffae42" : "#a8e063";
              return (
                <button key={b!.client.id} onClick={() => router.push(`/dashboard/montage`)}
                  style={{ textAlign: "left", padding: 12, borderRadius: 12, background: "var(--inset2)", border: `1px solid ${hot ? col : "var(--track)"}`, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <Avatar name={`${b!.client.name} ${b!.client.surname || ""}`} src={b!.client.avatar_url} size={24} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b!.client.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--t2)" }}>
                    сдать <b style={{ color: col }}>{wdName(b!.client.delivery_day)}</b> · {fmtDateShort(b!.deliveryIso)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3 }}>
                    готово {b!.done} из {b!.quota}{left > 0 ? ` · осталось ${left}` : " ✓"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Онбординг — если у сотрудника есть новые клиенты */}
      {v.onboarding.length > 0 && (
        <div className="card" style={{ padding: 16, borderRadius: 15, marginBottom: 14,
          borderColor: "rgba(255,174,66,0.3)", background: "linear-gradient(135deg, rgba(255,174,66,0.06), rgba(123,63,228,0.03))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>🚀 Онбординг</span>
            <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 7, background: "rgba(255,174,66,.18)", color: "var(--or)" }}>{v.onboarding.length}</span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--t3)" }}>довести до первой публикации — 10 дней</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 9 }}>
            {v.onboarding.map(({ c, pr, day, dl, left }) => {
              const col = left == null ? "var(--t3)" : left < 0 ? "#ff5c7a" : left <= 2 ? "#ffae42" : "#a8e063";
              return (
                <button key={c.id} onClick={() => router.push(`/dashboard/clients/${c.id}/onboarding`)}
                  style={{ textAlign: "left", padding: 12, borderRadius: 12, background: "var(--inset)", border: `1px solid ${left != null && left < 0 ? col : "var(--brd)"}`, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
                    <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={30} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name} {c.surname || ""}</div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: col, marginTop: 2 }}>
                        {day ? `День ${day} из 10` : "старт не задан"}{left != null ? ` · ${left < 0 ? `просрочен ${-left} дн` : left === 0 ? "дедлайн сегодня" : `осталось ${left} дн`}` : ""}
                      </div>
                    </div>
                    <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 17, fontWeight: 800, color: "var(--or)" }}>{pr.progress_pct}%</div>
                  </div>
                  <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600, marginBottom: 4 }}>
                    задач: {pr.done_tasks}/{pr.total_tasks - pr.skipped_tasks}{pr.overdue_tasks > 0 ? ` · ⚠ ${pr.overdue_tasks} просрочено` : ""}
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "var(--track)", overflow: "hidden" }}>
                    <div style={{ width: `${pr.progress_pct}%`, height: "100%", background: "linear-gradient(90deg, #ffae42, #ff5c7a)" }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Мои задачи */}
      <div className="card" style={{ padding: 16, borderRadius: 15, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{isMg ? "Что смонтировать" : "Что написать"}</span>
          <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 7, background: "rgba(157,107,255,.15)", color: "var(--pu)" }}>{v.tasks.length}</span>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--t3)" }}>срок = публикация − {isMg ? VIDEO_LEAD : SCRIPT_LEAD} дн.</span>
        </div>
        {v.tasks.length === 0 ? (
          <div style={{ padding: 22, textAlign: "center", color: "var(--gr)", fontSize: 13, fontWeight: 700 }}>✓ Всё сделано</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {v.tasks.slice(0, 15).map(({ s, c, due }) => {
              const diff = Math.round((Date.parse(due) - Date.parse(todayIso)) / 86400000);
              const col = diff < 0 ? "#ff5c7a" : diff <= 1 ? "#ffae42" : "#9d6bff";
              const txt = diff < 0 ? `просрочено ${-diff} дн` : diff === 0 ? "сегодня" : diff === 1 ? "завтра" : `через ${diff} дн`;
              return (
                <button key={s.id} onClick={() => router.push(`${isMg ? "/dashboard/montage" : "/dashboard/scripts"}?open=${s.id}`)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 10, textAlign: "left", cursor: "pointer",
                    background: diff < 0 ? "rgba(255,92,122,.07)" : "var(--inset2)", border: `1px solid ${diff < 0 ? col : "var(--track)"}` }}>
                  <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={26} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>{c.name} {c.surname || ""}</div>
                    <div style={{ fontSize: 10, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      M{s.month_number} · {s.hook_text || s.hook || "без темы"}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <div style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 7, fontSize: 10, fontWeight: 800, background: `${col}1f`, color: col }}>к {fmtDateShort(due)}</div>
                    <div style={{ fontSize: 9, color: col, marginTop: 2 }}>{txt}</div>
                  </div>
                </button>
              );
            })}
            {v.tasks.length > 15 && <div style={{ fontSize: 11, color: "var(--t3)", textAlign: "center", paddingTop: 4 }}>…и ещё {v.tasks.length - 15}</div>}
          </div>
        )}
      </div>

      <style jsx>{`@media (max-width: 900px) { :global(.emp-kpi) { grid-template-columns: repeat(2, 1fr) !important; } }`}</style>
    </div>
  );
}
