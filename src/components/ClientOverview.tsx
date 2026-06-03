"use client";
import { useMemo } from "react";
import { Client, Script, ClientMonth, TeamMember } from "@/lib/database";
import Avatar from "@/components/Avatar";
import AvatarUploader from "@/components/AvatarUploader";
import {
  Calendar as CalendarIcon, Package, MessageCircle, MoreHorizontal,
  Film, CheckCircle2, Send, Clock, TrendingUp, TrendingDown, Minus,
  FileText, Pen, UserCheck, Scissors, AlertCircle, ExternalLink,
  Edit2, ArrowRight, Users, BarChart3,
  type LucideIcon,
} from "lucide-react";

const RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function fmtDateShort(s: string | null | undefined) {
  if (!s) return "—";
  const [y, mm, dd] = String(s).slice(0, 10).split("-");
  const m = parseInt(mm, 10), d = parseInt(dd, 10);
  if (!m || !d) return String(s);
  return `${d} ${RU_MONTHS_GEN[m - 1]} ${y}`;
}
function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

type Props = {
  client: Client;
  clientMonths: ClientMonth[];
  scripts: Script[];
  team: TeamMember[];
  activeMonth: number;
  todayIso: string;
  onEdit: () => void;
  onAvatarChange: (url: string | null) => Promise<void>;
  onActivateMonth: (m: number) => void;
};

export default function ClientOverview({ client: c, clientMonths, scripts, team, activeMonth, todayIso, onEdit, onAvatarChange, onActivateMonth }: Props) {
  // Текущий M-месяц
  const currentM = useMemo(() => {
    const sorted = [...clientMonths].sort((a, b) => a.month_number - b.month_number);
    return sorted.find(m => m.month_number === activeMonth) || sorted[sorted.length - 1] || null;
  }, [clientMonths, activeMonth]);

  const allScriptsOfCurrentM = useMemo(() => {
    if (!currentM) return [];
    return scripts.filter(s => s.month_number === currentM.month_number);
  }, [scripts, currentM]);

  const totalPlan = clientMonths.reduce((s, m) => s + (m.package || 0), 0);
  const totalPublished = scripts.filter(s => s.video_status === "published").length;

  // Pipeline
  const plan = currentM?.package || 0;
  const ideas = Math.max(0, plan - allScriptsOfCurrentM.length); // ещё не созданы записи
  const scriptsReady = allScriptsOfCurrentM.filter(s => s.script_status === "approved").length;
  const montage = allScriptsOfCurrentM.filter(s => s.script_status === "approved" && (s.video_status === "inProgress" || s.video_status === "ready" || s.video_status === "published")).length;
  const ready = allScriptsOfCurrentM.filter(s => s.video_status === "ready" || s.video_status === "published").length;
  const published = allScriptsOfCurrentM.filter(s => s.video_status === "published").length;
  const overallPct = plan > 0 ? Math.round((published / plan) * 100) : 0;
  const overallScriptsPct = plan > 0 ? Math.round((scriptsReady / plan) * 100) : 0;

  // Темп
  const pace = useMemo(() => {
    if (!currentM || plan <= 0) return { delta: 0, label: "—", color: "var(--t3)", Icon: Minus };
    const totalDays = Math.max(1, daysBetween(currentM.start_date, currentM.end_date) + 1);
    const elapsed = Math.max(0, Math.min(totalDays, daysBetween(currentM.start_date, todayIso) + 1));
    const expected = Math.round((elapsed / totalDays) * plan);
    const delta = published - expected;
    if (delta >= 2) return { delta, label: `опережаем +${delta}`, color: "var(--gr)", Icon: TrendingUp };
    if (delta >= -1) return { delta, label: "идём по плану", color: "var(--cy)", Icon: Minus };
    if (delta >= -3) return { delta, label: `отстаём ${delta}`, color: "var(--or)", Icon: TrendingDown };
    return { delta, label: `отстаём ${delta}`, color: "var(--rd)", Icon: TrendingDown };
  }, [currentM, plan, published, todayIso]);

  // Задачи команды
  const scriptsInProgress = allScriptsOfCurrentM.filter(s => s.script_status === "inProgress").length;
  const scriptsReview = allScriptsOfCurrentM.filter(s => s.script_status === "review").length;
  const tasksMontage = allScriptsOfCurrentM.filter(s => s.script_status === "approved" && s.video_status === "inProgress").length;
  const tasksPublish = allScriptsOfCurrentM.filter(s => s.video_status === "ready").length;
  const overdueDeadline = currentM ? (() => {
    const days = daysBetween(todayIso, currentM.end_date);
    if (days < 0 && published < plan) return Math.abs(days);
    return 0;
  })() : 0;

  // Team
  const teamlead = team.find(t => t.id === c.teamlead_id);
  const montager = team.find(t => t.id === c.montager_id);
  const daysToEnd = currentM ? daysBetween(todayIso, currentM.end_date) : null;

  // KPI
  const kpis: { Icon: LucideIcon; label: string; value: string; sub?: string; color: string; progress?: number }[] = [
    { Icon: Film, label: "План на месяц", value: String(plan), sub: currentM ? `M${currentM.month_number}` : "", color: "#9d6bff" },
    { Icon: CheckCircle2, label: "Готово", value: `${ready} / ${plan}`, sub: plan ? `${Math.round((ready/plan)*100)}%` : "—", color: "#a8e063", progress: plan ? (ready/plan)*100 : 0 },
    { Icon: Send, label: "Опубликовано", value: `${published} / ${plan}`, sub: `${overallPct}%`, color: "#34a853", progress: overallPct },
    { Icon: Clock, label: "Дней осталось", value: daysToEnd !== null ? String(daysToEnd) : "—", sub: daysToEnd !== null && daysToEnd < 0 ? "просрочка" : "до конца M", color: daysToEnd !== null && daysToEnd < 0 ? "#ff5c7a" : daysToEnd !== null && daysToEnd <= 5 ? "#ffae42" : "#42d4f4" },
    { Icon: pace.Icon, label: "Темп", value: pace.label, color: pace.color },
    { Icon: BarChart3, label: "Всего по контракту", value: `${totalPublished} / ${totalPlan}`, sub: totalPlan ? `${Math.round((totalPublished/totalPlan)*100)}%` : "—", color: "#7b3fe4", progress: totalPlan ? (totalPublished/totalPlan)*100 : 0 },
  ];

  // Pipeline стадии
  const stages = [
    { label: "Идеи / План", val: plan, pct: 100, color: "#9d6bff", Icon: FileText },
    { label: "Сценарии", val: scriptsReady, pct: overallScriptsPct, color: "#42d4f4", Icon: Pen },
    { label: "Монтаж", val: montage, pct: plan ? Math.round((montage / plan) * 100) : 0, color: "#ffae42", Icon: Scissors },
    { label: "Готово", val: ready, pct: plan ? Math.round((ready / plan) * 100) : 0, color: "#a8e063", Icon: CheckCircle2 },
    { label: "Опубликовано", val: published, pct: overallPct, color: "#34a853", Icon: Send },
  ];

  const stageBgColors = ["#9d6bff", "#42d4f4", "#ffae42", "#a8e063", "#34a853"];

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* ===== HERO ===== */}
      <div className="card" style={{
        padding: 24,
        borderRadius: 18,
        marginBottom: 14,
        background: "linear-gradient(135deg, rgba(123,63,228,0.14), rgba(10,1,24,0.4))",
        border: "1px solid rgba(157,107,255,0.28)",
        overflow: "hidden", position: "relative",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 24, alignItems: "center" }} className="client-hero-grid">
          {/* Avatar */}
          <AvatarUploader
            currentUrl={c.avatar_url}
            name={`${c.name} ${c.surname || ""}`}
            pathPrefix="clients"
            entityId={c.id}
            size={84}
            onUploaded={onAvatarChange}
          />

          {/* Name + niche + socials */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
              <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 26, fontWeight: 800, color: "var(--t1)", letterSpacing: -0.6, lineHeight: 1.15 }}>
                {c.name} {c.surname || ""}
              </h1>
              <span style={{
                padding: "4px 10px", borderRadius: 8,
                background: "rgba(168,224,99,0.15)", color: "var(--gr)",
                fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase",
              }}>
                {c.stage === "paused" ? "⏸ На паузе" : c.stage === "churned" ? "✕ Ушёл" : "● В работе"}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--t2)", fontWeight: 500, marginBottom: 10 }}>{c.niche || c.product || "—"}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["instagram", "tiktok", "youtube"] as const).map(key => {
                const url = c[key];
                const colors = { instagram: "#ec4899", tiktok: "#34d399", youtube: "#ef4444" };
                const labels = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };
                if (!url) return null;
                return (
                  <a key={key} href={url.startsWith("http") ? url : `https://${url}`} target="_blank" rel="noopener noreferrer"
                    style={{
                      padding: "5px 11px", borderRadius: 7,
                      background: `${colors[key]}18`, border: `1px solid ${colors[key]}44`,
                      color: colors[key],
                      fontSize: 11, fontWeight: 700, textDecoration: "none",
                      display: "inline-flex", alignItems: "center", gap: 5,
                    }}>{labels[key]} <ExternalLink size={9} /></a>
                );
              })}
            </div>
          </div>

          {/* Контракт block */}
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(66,212,244,0.12)", color: "#42d4f4", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(66,212,244,0.3)" }}>
              <CalendarIcon size={16} strokeWidth={1.8} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Контракт</div>
              <div style={{ fontSize: 12, color: "var(--t1)", fontWeight: 700, lineHeight: 1.2 }}>
                {currentM ? `M${currentM.month_number} · ${fmtDateShort(currentM.start_date).replace(/\s\d{4}/, "")} → ${fmtDateShort(currentM.end_date).replace(/\s\d{4}/, "")}` : "—"}
              </div>
              <div style={{ fontSize: 10, color: daysToEnd !== null && daysToEnd < 0 ? "var(--rd)" : daysToEnd !== null && daysToEnd <= 5 ? "var(--or)" : "var(--t3)", marginTop: 1, fontWeight: 600 }}>
                {daysToEnd !== null ? (daysToEnd < 0 ? `просрочка ${-daysToEnd} дн.` : `осталось ${daysToEnd} дн.`) : "нет активного M"}
              </div>
            </div>
          </div>

          {/* Менеджер */}
          {teamlead && (
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Avatar name={teamlead.name} src={teamlead.avatar_url} size={36} />
              <div>
                <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Менеджер</div>
                <div style={{ fontSize: 12, color: "var(--t1)", fontWeight: 700 }}>{teamlead.name}</div>
                <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>{teamlead.role_title || "Team Lead"}</div>
              </div>
            </div>
          )}

          {/* Пакет */}
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(168,224,99,0.12)", color: "#a8e063", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(168,224,99,0.3)" }}>
              <Package size={16} strokeWidth={1.8} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Пакет</div>
              <div style={{ fontSize: 12, color: "var(--t1)", fontWeight: 700 }}>{plan} роликов / мес</div>
              {c.avg_check && <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>{c.avg_check} / мес</div>}
            </div>
          </div>
        </div>

        {/* Top-right actions */}
        <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 6 }}>
          <button onClick={onEdit} style={{
            padding: "6px 12px", borderRadius: 8,
            background: "rgba(157,107,255,0.12)", border: "1px solid rgba(157,107,255,0.3)",
            color: "var(--pu)", fontSize: 10, fontWeight: 700, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 5,
          }}>
            <Edit2 size={11} strokeWidth={2} /> Редактировать
          </button>
        </div>
      </div>

      {/* ===== KPI ROW ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 14 }} className="client-kpi-row">
        {kpis.map((it, idx) => {
          const I = it.Icon;
          return (
            <div key={idx} style={{ background: "rgba(123,63,228,0.075)", border: "1px solid var(--brd)", borderRadius: 14, padding: 14, minHeight: 102, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `${it.color}22`, color: it.color, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${it.color}44` }}>
                <I size={15} strokeWidth={1.8} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600, marginBottom: 3 }}>{it.label}</div>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, color: "var(--t1)", lineHeight: 1 }}>{it.value}</div>
                {it.sub && <div style={{ fontSize: 10, color: it.color, fontWeight: 600, marginTop: 3 }}>{it.sub}</div>}
                {typeof it.progress === "number" && (
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", marginTop: 6, overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, it.progress))}%`, height: "100%", background: it.color, borderRadius: 2 }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== PIPELINE ===== */}
      <div className="card" style={{ padding: 18, borderRadius: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>Производственный конвейер</h3>
          {currentM && <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>M{currentM.month_number} · {fmtDateShort(currentM.start_date)} → {fmtDateShort(currentM.end_date)}</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0, alignItems: "stretch", marginBottom: 14 }}>
          {stages.map((st, i) => {
            const SI = st.Icon;
            return (
              <div key={st.label} style={{ display: "flex", flexDirection: "column", padding: "0 10px", position: "relative", alignItems: "center", textAlign: "center" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `${st.color}22`, color: st.color, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${st.color}44`, marginBottom: 8 }}>
                  <SI size={18} strokeWidth={1.8} />
                </div>
                <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, marginBottom: 4, letterSpacing: 0.3, textTransform: "uppercase" }}>{st.label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                  <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, color: st.color, lineHeight: 1 }}>{st.val}</span>
                  <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600 }}>/ {plan}</span>
                </div>
                <div style={{ fontSize: 10, color: st.color, fontWeight: 700 }}>{st.pct}%</div>
                {i < stages.length - 1 && (
                  <ArrowRight size={14} style={{ position: "absolute", right: -7, top: 16, color: "var(--t3)", background: "var(--card)", borderRadius: "50%", padding: 1 }} />
                )}
              </div>
            );
          })}
        </div>
        {/* Общий прогресс полоска */}
        <div style={{ paddingTop: 12, borderTop: "1px solid var(--brd)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>Общий прогресс этого M</span>
            <span style={{ fontSize: 11, color: "var(--t1)", fontWeight: 700 }}>{overallPct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", display: "flex" }}>
            {(() => {
              const segments = [
                { val: published, color: "#34a853" },           // опубликовано
                { val: Math.max(0, ready - published), color: "#a8e063" },     // готово но не опубл
                { val: Math.max(0, montage - ready), color: "#ffae42" },       // монтаж но не готово
                { val: Math.max(0, scriptsReady - montage), color: "#42d4f4" },// сценарий готов но не в монтаже
              ];
              const left = Math.max(0, plan - segments.reduce((s, x) => s + x.val, 0));
              return (
                <>
                  {segments.map((s, i) => s.val > 0 && (
                    <div key={i} style={{ width: `${(s.val / plan) * 100}%`, height: "100%", background: s.color }} />
                  ))}
                  {left > 0 && <div style={{ width: `${(left / plan) * 100}%`, height: "100%", background: "rgba(255,255,255,0.04)" }} />}
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ===== 3-column: Команда / Задачи / Контракт ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }} className="client-3col">
        {/* Команда клиента */}
        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <h3 style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <Users size={13} style={{ color: "var(--pu)" }} strokeWidth={1.8} />
            Команда клиента
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { tm: teamlead, role: "Team Lead", color: "#9d6bff" },
              { tm: montager, role: "Монтажёр", color: "#ffae42" },
            ].filter(x => !!x.tm).map(({ tm, role, color }) => (
              <div key={tm!.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Avatar name={tm!.name} src={tm!.avatar_url} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>{tm!.name}</div>
                  <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600 }}>{role}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: color }}>● </span>
              </div>
            ))}
            {!teamlead && !montager && (
              <div style={{ fontSize: 11, color: "var(--t3)", textAlign: "center", padding: 10 }}>Команда не назначена</div>
            )}
          </div>
        </div>

        {/* Задачи и дедлайны */}
        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <h3 style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertCircle size={13} style={{ color: "var(--or)" }} strokeWidth={1.8} />
            Задачи и дедлайны
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { v: scriptsReview, l: "На согласовании", c: "#42d4f4" },
              { v: tasksMontage, l: "В монтаже", c: "#ffae42" },
              { v: tasksPublish, l: "Готовы публиковать", c: "#a8e063" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, color: s.v > 0 ? s.c : "var(--t3)", lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600, marginTop: 4, letterSpacing: 0.3 }}>{s.l}</div>
              </div>
            ))}
          </div>
          {overdueDeadline > 0 && (
            <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8, background: "rgba(255,92,122,0.1)", border: "1px solid rgba(255,92,122,0.3)", color: "var(--rd)", fontSize: 10, fontWeight: 700, textAlign: "center" }}>
              🔴 Просрочка дедлайна на {overdueDeadline} дн.
            </div>
          )}
        </div>

        {/* Контракт статус */}
        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <h3 style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <CalendarIcon size={13} style={{ color: "var(--cy)" }} strokeWidth={1.8} />
            Контракт
          </h3>
          {currentM ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Row label="Текущий M" value={`M${currentM.month_number}`} />
              <Row label="Период" value={`${fmtDateShort(currentM.start_date)} → ${fmtDateShort(currentM.end_date)}`} small />
              <Row label="План" value={`${plan} роликов`} />
              <Row label="Готово / опубл" value={`${ready} / ${published}`} />
              <Row label="Темп" value={pace.label} color={pace.color} />
              {c.sheet_url && (
                <a href={c.sheet_url} target="_blank" rel="noopener noreferrer" style={{
                  marginTop: 4, padding: "6px 10px", borderRadius: 7,
                  background: "linear-gradient(135deg, #34a853, #1e8e3e)",
                  color: "#fff", fontSize: 10, fontWeight: 800,
                  textDecoration: "none", textAlign: "center",
                  display: "block",
                }}>📊 Google Sheet клиента ↗</a>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--t3)", textAlign: "center", padding: 10 }}>Нет активного M</div>
          )}
        </div>
      </div>

      {/* responsive */}
      <style jsx>{`
        @media (max-width: 1280px) {
          :global(.client-kpi-row) { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 1024px) {
          :global(.client-hero-grid) { grid-template-columns: auto 1fr !important; }
          :global(.client-hero-grid) > :nth-child(n+3) { grid-column: 1 / -1; }
          :global(.client-3col) { grid-template-columns: 1fr !important; }
          :global(.client-kpi-row) { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

function Row({ label, value, small, color }: { label: string; value: string; small?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: small ? 10 : 11, color: color || "var(--t1)", fontWeight: 700, textAlign: "right" }}>{value}</span>
    </div>
  );
}
