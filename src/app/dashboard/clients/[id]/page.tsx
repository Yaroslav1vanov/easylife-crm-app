"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, ChecklistTask, TeamMember, ClientMonth, OnboardingProgress } from "@/lib/database";
import AvatarUploader from "@/components/AvatarUploader";
import MetricoolBrandPicker from "@/components/MetricoolBrandPicker";
import { CLIENT_TIMEZONES, DEFAULT_TZ, nowInTz } from "@/lib/tz";
import { WEEKDAYS_RU, weeklyQuotaOf, BATCH_BUFFER_DAYS } from "@/lib/batches";
import ClientMonthsTimeline from "@/components/ClientMonthsTimeline";
import ClientOverview from "@/components/ClientOverview";
import ClientProduction from "@/components/ClientProduction";
import ClientAttention from "@/components/ClientAttention";
import KanbanBoard from "@/components/KanbanBoard";
import { fmtDateShort } from "@/components/ScriptModal";
import { SCRIPT_COLUMNS, MONTAGE_COLUMNS } from "@/components/kanbanConfigs";

/** Реальный текущий рабочий месяц: тот, в чьи даты попадает сегодня; иначе active; иначе последний. */
function computeCurrentMonth(months: ClientMonth[], todayIso: string): number {
  if (!months.length) return 1;
  const byDate = months.find(m => m.start_date <= todayIso && todayIso <= m.end_date);
  if (byDate) return byDate.month_number;
  const active = months.find(m => m.status === "active");
  if (active) return active.month_number;
  return [...months].sort((a, b) => b.month_number - a.month_number)[0].month_number;
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const clientId = parseInt(id as string);
  const [client, setClient] = useState<Client | null>(null);
  const [reportMonth, setReportMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [scripts, setScripts] = useState<Script[]>([]);
  const [checklist, setChecklist] = useState<ChecklistTask[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [clientMonths, setClientMonths] = useState<ClientMonth[]>([]);
  const [onbProgress, setOnbProgress] = useState<OnboardingProgress | null>(null);
  const [tab, setTab] = useState("scripts");
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [editSocial, setEditSocial] = useState<string | null>(null);
  const [socialUrl, setSocialUrl] = useState("");
  const [expandedScript, setExpandedScript] = useState<number | null>(null);
  const [viewMonth, setViewMonth] = useState(1);
  const [monthInit, setMonthInit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { load(); }, [clientId]);

  async function load() {
    const [c, s, ch, tm, profile, cmRes, onb] = await Promise.all([
      db.getClient(supabase, clientId),
      db.getScripts(supabase, clientId),
      db.getChecklist(supabase, clientId),
      db.getTeam(supabase),
      db.getProfile(supabase),
      db.getClientMonthsForClient(supabase, clientId),
      db.getOnboardingProgress(supabase, clientId),
    ]);
    setClient(c); setScripts(s); setChecklist(ch); setTeam(tm);
    if (cmRes?.data) {
      setClientMonths(cmRes.data);
      // На первой загрузке открываем канбан на реальном текущем месяце.
      if (!monthInit && cmRes.data.length) {
        setViewMonth(computeCurrentMonth(cmRes.data, new Date().toISOString().slice(0, 10)));
        setMonthInit(true);
      }
    }
    if (profile) setUserRole(profile.role);
    setOnbProgress(onb);
    setLoading(false);
  }

  async function updateClientField(field: string, value: any) {
    await db.updateClient(supabase, clientId, { [field]: value } as any);
    load();
  }

  async function updateScript(scriptId: number, updates: Partial<Script>) {
    await db.updateScript(supabase, scriptId, updates);
    load();
  }

  async function toggleTask(taskId: number, current: string) {
    await db.updateTask(supabase, taskId, { status: current === "done" ? "todo" : "done" });
    load();
  }

  async function updateTaskField(taskId: number, field: string, value: any) {
    await db.updateTask(supabase, taskId, { [field]: value } as any);
    load();
  }

  async function addCard() {
    await db.createScript(supabase, clientId, viewMonth);
    await load();
  }

  async function deleteCard(scriptId: number) {
    await db.deleteScript(supabase, scriptId);
    await load();
  }

  async function updateTeam(patch: { teamlead_id?: number | null; montager_id?: number | null; extra_montager_ids?: number[] }) {
    await db.updateClient(supabase, clientId, patch as any);
    await load();
  }

  async function saveEdit() {
    await db.updateClient(supabase, clientId, editData);
    setEditing(false); load();
  }

  if (loading) return <div style={{ color: "var(--t2)", padding: 40, textAlign: "center" }}>Загрузка...</div>;
  if (!client) return <div style={{ color: "var(--rd)", padding: 40 }}>Клиент не найден</div>;

  const c = client;
  const todayIso = new Date().toISOString().slice(0, 10);
  const obDeadline = c.onboarding_deadline || null;
  const obDaysLeft = obDeadline ? Math.round((new Date(`${obDeadline}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86400000) : null;
  const obDone = !!onbProgress && onbProgress.pending_tasks === 0;
  const obColor = obDone ? "var(--gr)" : obDaysLeft == null ? "var(--t3)" : obDaysLeft < 0 ? "var(--rd)" : obDaysLeft <= 2 ? "var(--or)" : "var(--t2)";
  const obWhen = obDaysLeft == null ? "" : obDaysLeft < 0 ? `просрочен ${-obDaysLeft} дн` : obDaysLeft === 0 ? "сегодня" : obDaysLeft === 1 ? "завтра" : `осталось ${obDaysLeft} дн`;
  // Какой сейчас день онбординга (считаем от старта клиента, как на странице онбординга)
  const obStart = c.start_date || null;
  const obDay = obStart
    ? Math.max(1, Math.floor((new Date(`${todayIso}T00:00:00`).getTime() - new Date(`${obStart}T00:00:00`).getTime()) / 86400000) + 1)
    : null;
  const currentMonthNum = computeCurrentMonth(clientMonths, todayIso);
  const currentM = clientMonths.find(m => m.month_number === currentMonthNum) || null;
  const currentMonthScripts = scripts.filter(s => s.month_number === currentMonthNum);
  const pub = scripts.filter(s => s.video_status === "published").length;
  const ready = scripts.filter(s => s.video_status === "ready").length;
  const editVids = scripts.filter(s => s.video_status === "inProgress" && s.script_status === "approved").length;
  const scrApp = scripts.filter(s => s.script_status === "approved").length;
  // Total scripts across all contract months for this client (replaces c.package as the
  // denominator for cards/progress, so a 2-month client shows 53/60 not 53/30).
  const totalScripts = scripts.length;
  // Знаменатель по ПАКЕТУ (сумма пакетов всех контрактных месяцев), а не по числу карточек.
  const contractPlan = clientMonths.reduce((s, m) => s + (m.package || 0), 0) || totalScripts;
  const viewMonthPkg = clientMonths.find(m => m.month_number === viewMonth)?.package || 0;
  const doneTasks = checklist.filter(t => t.status === "done").length;
  const pct = checklist.length > 0 ? Math.round(doneTasks / checklist.length * 100) : 0;
  // Вкладки месяцев = контрактные месяцы + те, где уже есть сценарии.
  // Только по сценариям нельзя: у только что открытого месяца их ещё нет,
  // и получался тупик — вкладки нет, значит некуда добавить первый сценарий.
  const months = Array.from(new Set([
    ...scripts.map(s => s.month_number),
    ...clientMonths.filter(m => m.status !== "cancelled").map(m => m.month_number),
  ])).sort((a, b) => a - b);
  const monthScripts = scripts.filter(s => s.month_number === viewMonth);
  const monthPub = monthScripts.filter(s => s.video_status === "published").length;
  const monthReady = monthScripts.filter(s => s.video_status === "ready").length;
  const monthInMontage = monthScripts.filter(s => s.video_status === "inProgress" && s.script_status === "approved").length;
  const monthReviewVids = monthScripts.filter(s => s.video_status === "review").length;
  const monthApprovedUnpublished = monthScripts.filter(s => s.script_status === "approved" && s.video_status !== "published");
  const monthPublished = monthScripts.filter(s => s.video_status === "published");

  const scStatuses = [{ value: "notStarted", label: "Не начато" }, { value: "inProgress", label: "В работе" }, { value: "review", label: "На утверждение" }, { value: "approved", label: "Утверждён" }];
  const viStatuses = [{ value: "notStarted", label: "—" }, { value: "inProgress", label: "В работе" }, { value: "review", label: "На утверждение" }, { value: "ready", label: "Готово" }, { value: "published", label: "Опубликовано" }];
  const scColor = (s: string) => s === "approved" ? "var(--gr)" : s === "review" ? "var(--yl)" : s === "inProgress" ? "var(--or)" : "var(--t3)";
  const viColor = (s: string) => s === "published" ? "var(--gr)" : s === "ready" ? "var(--cy)" : s === "review" ? "var(--yl)" : s === "inProgress" ? "var(--or)" : "var(--t3)";

  // Smart deadline calculation
  const now = new Date();
  const daysDiff = (d: string) => Math.round((now.getTime() - new Date(d).getTime()) / 86400000);

  // Calculate expected published count based on first pub date
  let expectedPub = 0;
  let pubOnTrack = true;
  if (c.first_pub_date) {
    const daysSinceFirstPub = daysDiff(c.first_pub_date);
    if (daysSinceFirstPub >= 0) {
      expectedPub = Math.min(daysSinceFirstPub + 1, totalScripts || c.package); // 1 reel per day, capped by total scripts
      pubOnTrack = pub >= expectedPub;
    }
  }

  // Scripts deadline: check if enough scripts are approved ahead
  let scrOnTrack = true;
  let scrAhead = scrApp - pub; // how many scripts ahead of published
  if (c.scripts_deadline) {
    const daysPastScr = daysDiff(c.scripts_deadline);
    if (daysPastScr > 0) {
      scrOnTrack = scrAhead >= 5; // need 5 scripts buffer
    }
  }

  // Videos deadline: check if enough ready videos ahead
  let vidOnTrack = true;
  if (c.videos_deadline) {
    const daysPastVid = daysDiff(c.videos_deadline);
    if (daysPastVid > 0) {
      vidOnTrack = ready >= 3; // need 3 videos buffer
    }
  }

  const inMontage = scripts.filter(s => s.video_status === "inProgress" && s.script_status === "approved").length;
  const reviewVids = scripts.filter(s => s.video_status === "review").length;

  const tabs = [
    { id: "scripts", label: `Сценарии (${scrApp}/${contractPlan})` },
    { id: "montage", label: `Монтаж (${inMontage + reviewVids + ready})` },
    { id: "published", label: `Опубликовано (${pub}/${contractPlan})` },
  ];

  return (
    <div className="client-detail-v2">
      <div className="flex justify-between items-center mb-2">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-xs" style={{ color: "var(--cy)", background: "none", border: "none", cursor: "pointer" }}>← Назад</button>
        {userRole === "admin" && <button onClick={async () => { if (confirm("Удалить клиента? Все данные будут потеряны.")) { await db.deleteClient(supabase, clientId); router.push("/dashboard/clients"); } }}
          className="px-3 py-1 rounded-lg text-[10px] font-semibold"
          style={{ color: "var(--rd)", border: "1px solid var(--rd)", background: "transparent", cursor: "pointer" }}>
          🗑 Удалить
        </button>}
      </div>

      {/* Client Overview — Hero + KPI + Pipeline + 3-column */}
      <ClientOverview
        client={c}
        clientMonths={clientMonths}
        scripts={scripts}
        team={team}
        activeMonth={currentMonthNum}
        todayIso={todayIso}
        onEdit={() => { setEditData({ name: c.name, surname: c.surname, niche: c.niche, phone: c.phone, product: c.product, avg_check: c.avg_check, package: c.package, montager_id: c.montager_id, teamlead_id: c.teamlead_id, priority: c.priority, stage: c.stage, instagram: c.instagram || "", tiktok: c.tiktok || "", youtube: c.youtube || "" }); setEditing(true); }}
        onAvatarChange={async (url) => { await updateClientField("avatar_url", url); }}
        onUpdateTeam={updateTeam}
        onTogglePause={async () => { await updateClientField("stage", c.stage === "paused" ? "active" : "paused"); }}
      />

      {/* Compact strip: онбординг + Google Sheet */}
      <div className="card mb-3" style={{ padding: "10px 14px", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {onbProgress && (
            <button onClick={() => router.push(`/dashboard/clients/${clientId}/onboarding`)}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 9, background: "transparent", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: onbProgress.pending_tasks > 0 ? "var(--yl)" : "var(--gr)" }} />
              {onbProgress.pending_tasks > 0 && obDay != null && (
                <span style={{ color: obDay > 10 ? "var(--rd)" : "var(--yl)", fontWeight: 800 }}>
                  День {obDay} из 10 ·
                </span>
              )}
              Онбординг: {onbProgress.pending_tasks > 0 ? `${onbProgress.done_tasks}/${onbProgress.total_tasks - onbProgress.skipped_tasks} · ${onbProgress.progress_pct}%` : "завершён"}
              <span style={{ color: "var(--t3)" }}>→</span>
            </button>
          )}
          {/* Дедлайн онбординга — редактируемая дата + отсчёт */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 9, background: "rgba(255,174,66,0.07)", border: "1px solid var(--brd)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t2)" }}>🚀 Онбординг до</span>
            <input type="date" defaultValue={obDeadline || ""} onBlur={(e) => { const v = e.target.value || null; if (v !== obDeadline) updateClientField("onboarding_deadline", v); }}
              style={{ padding: "3px 6px", borderRadius: 7, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, outline: "none", colorScheme: "dark" }} />
            {obDone ? <span style={{ fontSize: 10, fontWeight: 700, color: "var(--gr)" }}>✓ завершён</span>
              : obWhen && <span style={{ fontSize: 10, fontWeight: 800, color: obColor }}>{obWhen}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 10 }} />
        </div>
      </div>

      {/* Тон голоса — основа AI-адаптации текстов под соцсети (раздел Metricool) */}
      <div className="card mb-3" style={{ padding: "12px 14px", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--t1)", textTransform: "uppercase", letterSpacing: 0.5 }}>🗣 Тон голоса</span>
          <span style={{ fontSize: 10, color: "var(--t3)" }}>— в этом стиле AI пишет описания под соцсети</span>
        </div>
        <textarea
          defaultValue={c.brand_voice || ""}
          onBlur={(e) => { if (e.target.value !== (c.brand_voice || "")) updateClientField("brand_voice", e.target.value || null); }}
          rows={4}
          placeholder="Напр.: Экспертно, без воды. 1–2 эмодзи max. Только русский. Любит цифры и конкретику. Без clickbait."
          style={{ width: "100%", padding: "10px 12px", borderRadius: 9, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
        />
        <div style={{ marginTop: 10 }}>
          <MetricoolBrandPicker
            blogId={c.metricool_blog_id ?? null}
            onPick={(v) => { if (v !== (c.metricool_blog_id ?? null)) updateClientField("metricool_blog_id", v); }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t2)" }}>🕒 Часовой пояс клиента:</span>
          <select
            value={c.timezone || DEFAULT_TZ}
            onChange={(e) => updateClientField("timezone", e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, outline: "none", cursor: "pointer" }}
          >
            {CLIENT_TIMEZONES.map(t => <option key={t.tz} value={t.tz}>{t.label}</option>)}
          </select>
          <span style={{ fontSize: 10, color: "var(--t3)" }}>в этом поясе задаётся время публикаций · сейчас там {nowInTz(c.timezone || DEFAULT_TZ)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t2)" }}>📨 Telegram topic ID:</span>
          <input
            type="number"
            defaultValue={c.telegram_topic_id ?? ""}
            onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== (c.telegram_topic_id ?? null)) updateClientField("telegram_topic_id", v); }}
            placeholder="напр. 12"
            style={{ width: 160, padding: "6px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, outline: "none" }}
          />
          <span style={{ fontSize: 10, color: "var(--t3)" }}>id топика (папки) клиента в ТГ — по нему бот понимает, чьё это видео</span>
        </div>
        {/* Недельные партии: день сдачи видео + квота + день проверки контента */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap", paddingTop: 10, borderTop: "1px dashed var(--brd)" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t2)" }}>📦 День сдачи видео:</span>
          <select
            value={c.delivery_day ?? ""}
            onChange={(e) => updateClientField("delivery_day", e.target.value ? Number(e.target.value) : null)}
            style={{ padding: "6px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, outline: "none", cursor: "pointer" }}
          >
            <option value="">не задан</option>
            {WEEKDAYS_RU.map((w, i) => <option key={i} value={i + 1}>{w}</option>)}
          </select>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t2)", marginLeft: 6 }}>Роликов/нед:</span>
          <input
            type="number"
            defaultValue={c.weekly_quota ?? ""}
            placeholder={`авто: ${weeklyQuotaOf(c)}`}
            onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== (c.weekly_quota ?? null)) updateClientField("weekly_quota", v); }}
            style={{ width: 90, padding: "6px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, outline: "none" }}
          />
          <span style={{ fontSize: 10, color: "var(--t3)" }}>партия на неделю вперёд · готовность за {BATCH_BUFFER_DAYS} дня до сдачи</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t2)" }}>📋 День проверки контента:</span>
          <select
            value={c.review_day ?? ""}
            onChange={(e) => updateClientField("review_day", e.target.value ? Number(e.target.value) : null)}
            style={{ padding: "6px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, outline: "none", cursor: "pointer" }}
          >
            <option value="">не задан</option>
            {WEEKDAYS_RU.map((w, i) => <option key={i} value={i + 1}>{w}</option>)}
          </select>
          <span style={{ fontSize: 10, color: "var(--t3)" }}>в этот день тимлид сдаёт референсы и сценарии по клиенту на проверку</span>
        </div>
      </div>

      {/* 📄 Отчёт клиенту за месяц (из Metricool) */}
      <div className="card mb-3" style={{ padding: "12px 14px", borderRadius: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)" }}>📄 Отчёт клиенту</span>
        {c.metricool_blog_id ? (
          <>
            <select value={reportMonth} onChange={(e) => setReportMonth(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, cursor: "pointer" }}>
              {Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; const RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]; return <option key={v} value={v}>{RU[d.getMonth()]} {d.getFullYear()}</option>; })}
            </select>
            <a href={`/api/clients/${clientId}/report?month=${reportMonth}`} target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, background: "linear-gradient(135deg, #2ee6c8, #b6f500)", color: "#070526", fontSize: 12, fontWeight: 800, textDecoration: "none" }}>
              Сгенерировать →
            </a>
            <span style={{ fontSize: 10, color: "var(--t3)" }}>откроется в новой вкладке · данные из Metricool · Cmd+P → PDF</span>
          </>
        ) : (
          <span style={{ fontSize: 11, color: "var(--t3)" }}>сначала привяжи бренд Metricool (кнопка «Привязать бренд» выше)</span>
        )}
      </div>

      {/* Контрактные месяцы + Что требует внимания */}
      {clientMonths.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 14, marginBottom: 14 }} className="months-attention-grid">
          <ClientMonthsTimeline
            clientId={clientId}
            clientName={`${c.name} ${c.surname || ""}`.trim()}
            clientMonths={clientMonths}
            scripts={scripts}
            activeMonth={viewMonth}
            onActivateMonth={(m) => setViewMonth(m)}
            onChange={async () => { await load(); }}
            todayIso={todayIso}
          />
          <ClientAttention currentM={currentM} scripts={currentMonthScripts} todayIso={todayIso} />
        </div>
      )}

      {/* Производство — всегда текущий рабочий месяц */}
      <ClientProduction currentM={currentM} scripts={currentMonthScripts} />

      <style jsx>{`
        @media (max-width: 1024px) {
          :global(.months-attention-grid) { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Tabs */}
      <div className="flex gap-0 border-b mb-3 overflow-x-auto" style={{ borderColor: "var(--brd)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-[11px] font-semibold shrink-0"
            style={{ background: "transparent", border: "none", borderBottom: tab === t.id ? "2px solid var(--cy)" : "2px solid transparent", color: tab === t.id ? "var(--cy)" : "var(--t2)", cursor: "pointer" }}>{t.label}</button>
        ))}
      </div>

      {/* Month selector */}
      {["scripts", "montage", "published"].includes(tab) && (
        <div className="flex gap-1 mb-3 flex-wrap items-center">
          {months.map(m => (
            <button key={m} onClick={() => setViewMonth(m)} className="px-3 py-1 rounded-lg text-[10px] font-semibold"
              style={{ border: `1px solid ${viewMonth === m ? "var(--cy)" : "var(--brd)"}`, background: viewMonth === m ? "var(--cyd)" : "transparent", color: viewMonth === m ? "var(--cy)" : "var(--t2)", cursor: "pointer" }}>
              Месяц {m}{m === currentMonthNum ? " · текущий" : ""}
            </button>
          ))}
        </div>
      )}

      {/* Scripts tab — all scripts with status */}
      {tab === "scripts" && (
        <KanbanBoard
          scripts={monthScripts}
          clients={[c]}
          columns={SCRIPT_COLUMNS}
          onUpdate={async (id, patch) => {
            // Кап: согласованных не больше пакета месяца (идей — сколько угодно).
            if (patch.script_status === "approved") {
              const approvedNow = monthScripts.filter(s => s.script_status === "approved" && s.id !== id).length;
              if (viewMonthPkg && approvedNow >= viewMonthPkg) {
                alert(`Согласовано уже ${approvedNow} из пакета ${viewMonthPkg}. Пакет укомплектован — увеличь пакет месяца или согласуй этот ролик в следующем M.`);
                return;
              }
            }
            await db.updateScript(supabase, id, patch); await load();
          }}
          onAddCard={addCard}
          onDelete={deleteCard}
          emptyHint="Сюда — перетащи карточку"
          monthOptionsFor={() => clientMonths.filter(m => m.status !== "cancelled").map(m => m.month_number).sort((a, b) => a - b)}
        />
      )}

      {tab === "montage" && (
        <KanbanBoard
          scripts={monthScripts.filter(s => s.script_status === "approved")}
          clients={[c]}
          columns={MONTAGE_COLUMNS}
          onUpdate={async (id, patch) => { await db.updateScript(supabase, id, patch); await load(); }}
          onDelete={deleteCard}
          emptyHint="Сюда — перетащи карточку"
          monthOptionsFor={() => clientMonths.filter(m => m.status !== "cancelled").map(m => m.month_number).sort((a, b) => a - b)}
        />
      )}

      {tab === "published" && (() => {
        const pubList = monthScripts
          .filter(s => s.video_status === "published")
          .sort((a, b) => (a.pub_date || "9999-99-99").localeCompare(b.pub_date || "9999-99-99") || (a.order_num || 0) - (b.order_num || 0));
        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>
                Опубликовано за Месяц {viewMonth}: <span style={{ color: "var(--gr)", fontFamily: "'Unbounded', sans-serif" }}>{pubList.length}</span>
                {viewMonthPkg ? <span style={{ color: "var(--t3)", fontWeight: 600 }}> из {viewMonthPkg}</span> : null} видео
              </div>
              <span style={{ fontSize: 10, color: "var(--t3)" }}>по дате публикации ↑</span>
            </div>
            {pubList.length === 0 ? (
              <div className="card" style={{ padding: 30, borderRadius: 14, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>Нет опубликованных в этом месяце</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pubList.map((s, i) => {
                  const vurl = s.video_url ? (s.video_url.startsWith("http") ? s.video_url : `https://${s.video_url}`) : null;
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 11, background: "var(--inset2)", border: "1px solid var(--track)" }}>
                      <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: "rgba(168,224,99,0.14)", border: "1px solid rgba(168,224,99,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Unbounded', sans-serif", fontSize: 13, fontWeight: 800, color: "var(--gr)" }}>{i + 1}</div>
                      <div style={{ flexShrink: 0, width: 74, fontSize: 11, fontWeight: 700, color: "var(--t2)" }}>{s.pub_date ? fmtDateShort(s.pub_date) : "без даты"}</div>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.hook_text || s.hook || `Сценарий #${s.order_num || "—"}`}</div>
                      {vurl
                        ? <a href={vurl} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--gr)", textDecoration: "none", padding: "5px 10px", borderRadius: 8, background: "rgba(168,224,99,0.1)", border: "1px solid rgba(168,224,99,0.3)" }}>▶ видео</a>
                        : <span style={{ flexShrink: 0, fontSize: 10, color: "var(--t3)", fontStyle: "italic" }}>нет ссылки</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ===== Модалка редактирования клиента ===== */}
      {editing && (() => {
        const set = (k: string, v: any) => setEditData((d: any) => ({ ...d, [k]: v }));
        const inp: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 9, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none" };
        const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 5 };
        const socials: { key: "instagram" | "tiktok" | "youtube"; label: string; color: string; ph: string }[] = [
          { key: "instagram", label: "Instagram", color: "#ec4899", ph: "instagram.com/username" },
          { key: "tiktok", label: "TikTok", color: "#34d399", ph: "tiktok.com/@username" },
          { key: "youtube", label: "YouTube Shorts", color: "#ef4444", ph: "youtube.com/@channel" },
        ];
        return (
          <div onClick={() => setEditing(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 18, width: "100%", maxWidth: 540, padding: 24, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 24px 70px rgba(0,0,0,0.55)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <h3 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--t1)" }}>Редактировать клиента</h3>
                <button onClick={() => setEditing(false)} style={{ width: 32, height: 32, borderRadius: 9, background: "var(--track)", border: "1px solid var(--brd)", color: "var(--t2)", cursor: "pointer" }}>✕</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label style={lbl}>Имя</label><input style={inp} value={editData.name || ""} onChange={(e) => set("name", e.target.value)} /></div>
                <div><label style={lbl}>Фамилия</label><input style={inp} value={editData.surname || ""} onChange={(e) => set("surname", e.target.value)} /></div>
              </div>
              <div><label style={lbl}>Ниша / специализация</label><input style={inp} value={editData.niche || ""} onChange={(e) => set("niche", e.target.value)} placeholder="Пластический хирург, тренер по паделу…" /></div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {socials.map(s => (
                  <div key={s.key}>
                    <label style={{ ...lbl, color: s.color }}>{s.label}</label>
                    <input style={inp} value={editData[s.key] || ""} onChange={(e) => set(s.key, e.target.value)} placeholder={s.ph} />
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Статус</label>
                  <select style={{ ...inp, cursor: "pointer" }} value={editData.stage || "active"} onChange={(e) => set("stage", e.target.value)}>
                    <option value="active">● В работе</option>
                    <option value="paused">⏸ На паузе</option>
                    <option value="churned">✕ Ушёл</option>
                  </select>
                </div>
                <div><label style={lbl}>Телефон</label><input style={inp} value={editData.phone || ""} onChange={(e) => set("phone", e.target.value)} placeholder="+1 …" /></div>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
                <button onClick={() => setEditing(false)} style={{ padding: "9px 16px", borderRadius: 9, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Отмена</button>
                <button onClick={saveEdit} style={{ padding: "9px 20px", borderRadius: 9, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Сохранить</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
