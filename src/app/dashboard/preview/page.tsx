"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, ClientMonth, Script, TeamMember } from "@/lib/database";
import Avatar from "@/components/Avatar";
import { VIDEO_LEAD, SCRIPT_LEAD, addDaysIso } from "@/components/ScriptModal";
import { Flame, TrendingUp, ArrowRight, Eye } from "lucide-react";

// ЧЕРНОВИК нового дашборда. Живёт отдельной страницей, чтобы посмотреть и решить —
// переносить на главную или нет. Главную не трогает.

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const RU = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const fmt = (s?: string | null) => { if (!s) return "—"; const [, m, d] = s.slice(0,10).split("-"); return `${+d} ${RU[+m-1]}`; };

type Issue = { client: Client; sev: "red" | "yellow"; title: string; detail: string; go: string };

export default function DashboardPreview() {
  const supabase = createClient();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [months, setMonths] = useState<ClientMonth[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [viewAs, setViewAs] = useState<number | null>(null);   // null = смотрю как владелец
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    const cls = await db.getClients(supabase);
    setClients(cls);
    const [cm, scr, tm] = await Promise.all([
      db.getClientMonths(supabase),
      db.getScriptsForClients(supabase, cls.map(c => c.id)),
      db.getTeam(supabase),
    ]);
    setMonths(cm?.data || []); setScripts(scr); setTeam(tm); setLoading(false);
  })(); }, []);

  const today = iso(new Date());
  const yest = iso(new Date(Date.now() - 86400000));
  const ym = today.slice(0, 7);

  const v = useMemo(() => {
    // только клиенты в работе; если смотрим глазами сотрудника — ещё и его клиенты
    const me = viewAs != null ? team.find(t => t.id === viewAs) || null : null;
    const isMg = me?.member_type === "montager";
    const work = clients.filter(c => c.stage === "active" && (!me ? true
      : isMg ? (c.montager_id === me.id || (c.extra_montager_ids || []).includes(me.id))
             : c.teamlead_id === me.id));
    const wid = new Set(work.map(c => c.id));
    const mine = scripts.filter(s => wid.has(s.client_id));

    // ---- ПЛАН/ФАКТ МЕСЯЦА (по вчерашний день: сегодня ещё заполняют) ----
    const planned = mine.filter(s => s.pub_date && s.pub_date.slice(0, 7) === ym);
    const doneByYest = planned.filter(s => s.video_status === "published" && (s.pub_date || "") <= yest);
    const dueByYest = planned.filter(s => (s.pub_date || "") <= yest);
    const lag = dueByYest.length - doneByYest.length;          // отставание от графика
    const daysLeft = Math.max(0, new Date(`${ym}-01T00:00:00`).getMonth() === new Date().getMonth()
      ? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate() : 0);
    const left = planned.length - planned.filter(s => s.video_status === "published").length;
    const perDay = daysLeft > 0 ? (left / daysLeft) : left;

    // ---- ЧТО ГОРИТ ----
    const issues: Issue[] = [];
    for (const c of work) {
      const cs = mine.filter(s => s.client_id === c.id);
      // 1) просроченные публикации
      const od = cs.filter(s => s.video_status !== "published" && s.pub_date && s.pub_date < today
        && ["inProgress", "review", "approved"].includes(s.script_status));
      if (od.length) issues.push({ client: c, sev: "red", title: `${od.length} ${od.length === 1 ? "ролик просрочен" : "роликов просрочено"}`,
        detail: `самый старый — ${fmt(od.map(s => s.pub_date!).sort()[0])}`, go: `/dashboard/clients/${c.id}` });
      // 2) давно не публиковали
      const lastPub = cs.filter(s => s.video_status === "published" && s.pub_date).map(s => s.pub_date!).sort().at(-1);
      if (lastPub) {
        const gap = Math.round((Date.parse(today) - Date.parse(lastPub)) / 86400000);
        if (gap > 7) issues.push({ client: c, sev: gap > 14 ? "red" : "yellow", title: `Нет публикаций ${gap} дн.`,
          detail: `последняя — ${fmt(lastPub)}`, go: `/dashboard/clients/${c.id}` });
      }
      // 3) месяц скоро закрывается, а пакет не добран
      const cm = months.find(m => m.client_id === c.id && m.status === "active");
      if (cm) {
        const pub = cs.filter(s => s.month_number === cm.month_number && s.video_status === "published").length;
        const need = (cm.package || 0) - pub;
        const dl = Math.round((Date.parse(cm.end_date) - Date.parse(today)) / 86400000);
        if (need > 0 && dl >= 0 && dl <= 7 && need > dl)
          issues.push({ client: c, sev: "yellow", title: `Не успеваем по M${cm.month_number}`,
            detail: `${pub}/${cm.package} · осталось ${dl} дн, нужно ещё ${need}`, go: `/dashboard/clients/${c.id}` });
      }
    }
    issues.sort((a, b) => (a.sev === "red" ? 0 : 1) - (b.sev === "red" ? 0 : 1));

    // «Мои дедлайны» глазами выбранного сотрудника: у монтажёра — сдать видео,
    // у тимлида — написать/согласовать сценарий. Дата = публикация − запас.
    const myTasks = !me ? [] : mine
      .filter(s => {
        if (!s.pub_date) return false;
        const c = work.find(x => x.id === s.client_id); if (!c) return false;
        if (isMg) return s.script_status === "approved" && !["ready", "published"].includes(s.video_status);
        return s.script_status !== "approved";
      })
      .map(s => ({ s, c: work.find(x => x.id === s.client_id)!, due: addDaysIso(s.pub_date!, -(isMg ? VIDEO_LEAD : SCRIPT_LEAD)) }))
      .sort((a, b) => a.due.localeCompare(b.due));

    return { work, planned, doneByYest, dueByYest, lag, left, daysLeft, perDay, issues, me, isMg, myTasks };
  }, [clients, months, scripts, today, yest, ym, viewAs, team]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;

  const pct = v.planned.length ? Math.round(v.planned.filter(s => s.video_status === "published").length / v.planned.length * 100) : 0;
  const onTrack = v.lag <= 0;

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Черновик дашборда</h1>
        <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>Так это может выглядеть на главной. Главная пока не тронута — смотри и решай.</p>
      </div>

      {/* Смотреть глазами сотрудника — чтобы понять, что видят тимлиды и монтажёры */}
      <div className="card" style={{ padding: "12px 14px", borderRadius: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <Eye size={15} style={{ color: "var(--pu)" }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--t2)" }}>Смотреть как:</span>
        <button onClick={() => setViewAs(null)}
          style={{ padding: "6px 12px", borderRadius: 9, fontSize: 11, fontWeight: 800, cursor: "pointer",
            border: `1px solid ${viewAs === null ? "var(--pu)" : "var(--brd)"}`,
            background: viewAs === null ? "rgba(157,107,255,.15)" : "transparent",
            color: viewAs === null ? "var(--pu)" : "var(--t3)" }}>
          Я (владелец)
        </button>
        {team.filter(t => t.member_type === "teamlead" || t.member_type === "montager")
          .sort((a, b) => a.member_type.localeCompare(b.member_type) || a.name.localeCompare(b.name))
          .map(t => {
            const on = viewAs === t.id;
            const col = t.member_type === "montager" ? "#ffae42" : "#9d6bff";
            return (
              <button key={t.id} onClick={() => setViewAs(t.id)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px 5px 5px", borderRadius: 999,
                  border: `1px solid ${on ? col : "var(--brd)"}`, background: on ? `${col}22` : "transparent",
                  color: on ? col : "var(--t2)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                <Avatar name={t.name} src={t.avatar_url} size={20} />
                {t.name}
                <span style={{ fontSize: 9, opacity: .7 }}>{t.member_type === "montager" ? "монтаж" : "ТЛ"}</span>
              </button>
            );
          })}
      </div>

      {v.me && (
        <div style={{ padding: "10px 14px", borderRadius: 11, marginBottom: 14, fontSize: 12, lineHeight: 1.55,
          background: "rgba(157,107,255,.08)", border: "1px solid rgba(157,107,255,.35)", color: "var(--t2)" }}>
          👁 Показано так, как это видит <b style={{ color: "var(--t1)" }}>{v.me.name}</b> ({v.isMg ? "монтажёр" : "тимлид"}):
          только {v.work.length} {v.work.length === 1 ? "его клиент" : "его клиентов"}. Ты просто смотришь — ничего не меняется.
        </div>
      )}

      {/* 1. КЛИЕНТЫ В РАБОТЕ + ПЛАН/ФАКТ */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, marginBottom: 14 }} className="prev-top">
        <div className="card" style={{ padding: 18, borderRadius: 16, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Клиентов в работе</div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 40, fontWeight: 800, color: "var(--cy)", lineHeight: 1.1, marginTop: 6 }}>{v.work.length}</div>
          <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4 }}>на паузе и в архиве — не в счёт</div>
        </div>

        <div className="card" style={{ padding: 18, borderRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <TrendingUp size={16} style={{ color: onTrack ? "var(--gr)" : "var(--or)" }} />
              <span style={{ fontSize: 14, fontWeight: 800 }}>План месяца</span>
              <span style={{ fontSize: 11, color: "var(--t3)" }}>данные по вчера — сегодня ещё заполняется</span>
            </div>
            <span style={{ padding: "4px 11px", borderRadius: 8, fontSize: 11, fontWeight: 800,
              background: onTrack ? "rgba(168,224,99,.14)" : "rgba(255,174,66,.14)", color: onTrack ? "var(--gr)" : "var(--or)" }}>
              {onTrack ? "✓ идём по графику" : `⚠ отстаём на ${v.lag}`}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
            <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 34, fontWeight: 800, color: "var(--t1)" }}>{v.doneByYest.length}</span>
            <span style={{ fontSize: 16, color: "var(--t3)", fontWeight: 700 }}>из {v.dueByYest.length} к вчерашнему дню</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--t3)" }}>всего в плане месяца: <b style={{ color: "var(--t2)" }}>{v.planned.length}</b></span>
          </div>

          <div style={{ height: 10, borderRadius: 6, background: "var(--track)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, var(--gr), var(--cy))", borderRadius: 6 }} />
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 10, fontSize: 12, color: "var(--t2)", flexWrap: "wrap" }}>
            <span>📅 осталось <b style={{ color: "var(--t1)" }}>{v.daysLeft} дн</b></span>
            <span>🎬 выпустить ещё <b style={{ color: "var(--t1)" }}>{v.left}</b></span>
            <span>⚡ темп нужен <b style={{ color: v.perDay > 8 ? "var(--or)" : "var(--t1)" }}>{v.perDay.toFixed(1)}/день</b></span>
          </div>
        </div>
      </div>

      {/* Задачи выбранного сотрудника — то, что он видит у себя */}
      {v.me && (
        <div className="card" style={{ padding: 18, borderRadius: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{v.isMg ? "🎬 Его дедлайны · монтаж" : "✍️ Его дедлайны · сценарии"}</span>
            <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 7, background: "rgba(157,107,255,.15)", color: "var(--pu)" }}>{v.myTasks.length}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--t3)" }}>
              срок = публикация − {v.isMg ? VIDEO_LEAD : SCRIPT_LEAD} дн.
            </span>
          </div>
          {v.myTasks.length === 0 ? (
            <div style={{ padding: 18, textAlign: "center", color: "var(--gr)", fontSize: 13, fontWeight: 700 }}>✓ Нет горящих задач</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {v.myTasks.slice(0, 12).map(({ s, c, due }) => {
                const diff = Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
                const col = diff < 0 ? "#ff5c7a" : diff <= 1 ? "#ffae42" : "#9d6bff";
                const txt = diff < 0 ? `просрочено ${-diff} дн` : diff === 0 ? "сегодня" : diff === 1 ? "завтра" : `через ${diff} дн`;
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 10,
                    background: diff < 0 ? "rgba(255,92,122,.07)" : "var(--inset2)", border: `1px solid ${diff < 0 ? col : "var(--track)"}` }}>
                    <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={26} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>{c.name} {c.surname || ""}</div>
                      <div style={{ fontSize: 10, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        M{s.month_number} · {s.hook_text || s.hook || "без темы"}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <div style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 7, fontSize: 10, fontWeight: 800, background: `${col}1f`, color: col }}>сдать {fmt(due)}</div>
                      <div style={{ fontSize: 9, color: col, marginTop: 2 }}>{txt}</div>
                    </div>
                  </div>
                );
              })}
              {v.myTasks.length > 12 && <div style={{ fontSize: 11, color: "var(--t3)", textAlign: "center", paddingTop: 4 }}>…и ещё {v.myTasks.length - 12}</div>}
            </div>
          )}
        </div>
      )}

      {/* 2. ЧТО ГОРИТ — вместо трёх блоков */}
      <div className="card" style={{ padding: 18, borderRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
          <Flame size={17} style={{ color: "var(--rd)" }} />
          <h2 style={{ fontSize: 15, fontWeight: 800 }}>Что горит</h2>
          <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 7, background: "rgba(255,92,122,.14)", color: "var(--rd)" }}>{v.issues.length}</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--t3)" }}>заменяет «Требуют внимания» + «Что нужно сделать» + таблицу</span>
        </div>

        {v.issues.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--gr)", fontSize: 13, fontWeight: 700 }}>✓ Всё под контролем</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {v.issues.map((it, i) => {
              const col = it.sev === "red" ? "#ff5c7a" : "#ffae42";
              return (
                <button key={i} onClick={() => router.push(it.go)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 11,
                    background: it.sev === "red" ? "rgba(255,92,122,.06)" : "var(--inset2)",
                    border: `1px solid ${it.sev === "red" ? "rgba(255,92,122,.3)" : "var(--track)"}`, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 6, height: 32, borderRadius: 3, background: col, flexShrink: 0 }} />
                  <Avatar name={`${it.client.name} ${it.client.surname || ""}`} src={it.client.avatar_url} size={30} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--t1)" }}>{it.client.name} {it.client.surname || ""}</div>
                    <div style={{ fontSize: 11, color: "var(--t3)" }}>{it.detail}</div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: col, whiteSpace: "nowrap" }}>{it.title}</span>
                  <ArrowRight size={14} style={{ color: "var(--t3)", flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`@media (max-width: 900px) { :global(.prev-top) { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
