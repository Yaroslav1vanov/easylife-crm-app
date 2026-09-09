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
import ClientAttention from "@/components/ClientAttention";
import KanbanBoard from "@/components/KanbanBoard";
import Avatar from "@/components/Avatar";
import Sheet, { SheetOption } from "@/components/Sheet";
import { useIsMobile } from "@/lib/useMedia";
import { fmtDateShort } from "@/components/ScriptModal";
import { SCRIPT_COLUMNS, MONTAGE_COLUMNS } from "@/components/kanbanConfigs";
import { handleOf } from "@/lib/socialHandles";
import { Camera, Music2, Play } from "lucide-react";

// Соцсети клиента в шапке: иконка + хэндл, клик открывает профиль
const SOCIALS = [
  { key: "instagram", cls: "ig", label: "Instagram", Icon: Camera, color: "#ec4899" },
  { key: "tiktok", cls: "tt", label: "TikTok", Icon: Music2, color: "#34d399" },
  { key: "youtube", cls: "yt", label: "YouTube", Icon: Play, color: "#ef4444" },
] as const;


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
  const [ctab, setCtab] = useState<"work" | "set">("work");
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = useIsMobile();
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
    await db.createScript(supabase, clientId, viewMonth || currentMonthNum || 1);
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
  // Повторяющиеся сценарии: один и тот же текст заведён дважды (часто — в разных месяцах,
  // поэтому глазами не заметить: вкладка показывает только один месяц).
  const dupGroups = (() => {
    const norm = (t?: string | null) => (t || "").toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "").slice(0, 60);
    const by: Record<string, Script[]> = {};
    for (const sc of scripts) {
      const k = norm(sc.hook_text || sc.hook || sc.body_text);
      if (k.length < 12) continue;
      (by[k] ||= []).push(sc);
    }
    return Object.values(by).filter(g => g.length > 1);
  })();

  // Какой сейчас день онбординга. Начало — заданное явно, иначе старт работы с клиентом.
  const obStart = c.onboarding_start || c.start_date || null;
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
  const monthScripts = viewMonth === 0 ? scripts : scripts.filter(s => s.month_number === viewMonth);
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

  const teamlead = team.find(t => t.id === c.teamlead_id);
  const montager = team.find(t => t.id === c.montager_id);
  const stageChip = c.stage === "paused" ? { cls: "or", l: "⏸ На паузе" } : c.stage === "churned" ? { cls: "rd", l: "✕ Ушёл" } : { cls: "gr", l: "● В работе" };
  const socials = (["instagram", "tiktok", "youtube"] as const).filter(k => !!c[k]);
  const curScr = currentMonthScripts;
  const pipe = {
    writing: curScr.filter(s => s.script_status === "inProgress" || s.script_status === "review").length,
    montage: curScr.filter(s => s.script_status === "approved" && ["inProgress", "review"].includes(s.video_status)).length,
    ready: curScr.filter(s => s.video_status === "ready").length,
    published: curScr.filter(s => s.video_status === "published").length,
  };
  const monthDaysLeft = currentM ? Math.round((new Date(`${currentM.end_date}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86400000) : null;
  const selStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none", cursor: "pointer", maxWidth: "100%" };
  const inpStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none", maxWidth: "100%" };

  return (
    <div className="client-detail-v2 v2">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button onClick={() => router.back()} style={{ color: "var(--cy)", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>← Назад</button>
      </div>

      {/* ===== Шапка клиента ===== */}
      <div className="v2-hero">
        <AvatarUploader currentUrl={c.avatar_url} name={`${c.name} ${c.surname || ""}`} pathPrefix="clients" entityId={c.id} size={isMobile ? 56 : 72} compact onUploaded={async (url) => { await updateClientField("avatar_url", url); }} />
        <div style={{ minWidth: 0 }}>
          <h1>{c.name} {c.surname || ""}</h1>
          <p>{c.niche || c.product || "—"}</p>
          <div className="team">
            <span className={`v2-chip ${stageChip.cls}`}>{stageChip.l}</span>
            {teamlead && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Avatar name={teamlead.name} src={teamlead.avatar_url} size={20} />{teamlead.name}</span>}
            {montager && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Avatar name={montager.name} src={montager.avatar_url} size={20} />{montager.name}</span>}
            {currentM && <span className="v2-chip mut">M{currentM.month_number} · до {fmtDateShort(currentM.end_date)}{monthDaysLeft != null && monthDaysLeft < 0 ? ` · просрочка ${-monthDaysLeft} дн` : ""}</span>}
          </div>
          <div className="v2-soc">
            {SOCIALS.map(({ key, cls, label, Icon, color }) => {
              const raw = (c as any)[key] as string | undefined;
              if (!raw) return null;
              const href = raw.startsWith("http") ? raw : `https://${raw}`;
              const handle = handleOf(raw, key === "instagram" ? "ig" : key === "tiktok" ? "tt" : "yt");
              return (
                <a key={key} className={cls} href={href} target="_blank" rel="noopener noreferrer" title={`Открыть ${label}`}>
                  <Icon size={13} style={{ color }} />
                  <span>{label}</span>
                  {handle && <span className="h">@{handle}</span>}
                </a>
              );
            })}
            {SOCIALS.every(({ key }) => !(c as any)[key]) && (
              <button className="add" onClick={() => { setEditData({ name: c.name, surname: c.surname, niche: c.niche, phone: c.phone, product: c.product, avg_check: c.avg_check, package: c.package, montager_id: c.montager_id, teamlead_id: c.teamlead_id, stage: c.stage, instagram: c.instagram, tiktok: c.tiktok, youtube: c.youtube, birthday: c.birthday || "" }); setEditing(true); }}>
                + добавить соцсети
              </button>
            )}
          </div>
        </div>
        <button className="v2-iconbtn" onClick={() => setMenuOpen(true)} aria-label="Действия" style={{ fontSize: 18, lineHeight: 1 }}>⋯</button>
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={`${c.name} ${c.surname || ""}`} sub="действия по клиенту">
        <div className="v2-opts">
          <SheetOption color="#42d4f4" label="Контент-план" hint={currentM ? `M${currentM.month_number}` : ""} onClick={() => router.push(`/dashboard/plan?client=${clientId}${currentM ? `&m=${currentM.month_number}` : ""}`)} />
          <SheetOption color="#ffae42" label="Онбординг" hint={onbProgress ? (onbProgress.pending_tasks > 0 ? `${onbProgress.progress_pct}%` : "завершён") : ""} onClick={() => router.push(`/dashboard/clients/${clientId}/onboarding`)} />
          <SheetOption color="#9d6bff" label="Редактировать профиль" hint="имя, ниша, соцсети" onClick={() => { setMenuOpen(false); setEditData({ name: c.name, surname: c.surname, niche: c.niche, phone: c.phone, product: c.product, avg_check: c.avg_check, package: c.package, montager_id: c.montager_id, teamlead_id: c.teamlead_id, stage: c.stage, instagram: c.instagram, tiktok: c.tiktok, youtube: c.youtube, birthday: c.birthday || "" }); setEditing(true); }} />
          {c.metricool_blog_id ? <SheetOption color="#a8e063" label="Отчёт клиенту" hint={reportMonth} onClick={() => window.open(`/api/clients/${clientId}/report?month=${reportMonth}`, "_blank")} /> : null}
          <SheetOption color={c.stage === "paused" ? "#a8e063" : "#f5c451"} label={c.stage === "paused" ? "Снять с паузы" : "Поставить на паузу"} onClick={async () => { setMenuOpen(false); await updateClientField("stage", c.stage === "paused" ? "active" : "paused"); }} />
          {userRole === "admin" && <SheetOption danger label="Удалить клиента" hint="безвозвратно" onClick={async () => { if (confirm("Удалить клиента? Все данные будут потеряны.")) { await db.deleteClient(supabase, clientId); router.push("/dashboard/clients"); } }} />}
        </div>
      </Sheet>

      <div className="v2-segc">
        <button className={ctab === "work" ? "on" : ""} onClick={() => setCtab("work")}>Работа</button>
        <button className={ctab === "set" ? "on" : ""} onClick={() => setCtab("set")}>Настройки</button>
      </div>

      {ctab === "set" && (
        <div className="v2-form">
          <div className="v2-fg">
            <h4>Контракт</h4>
            <div className="v2-fr"><span>Пакет</span><b>{c.package} роликов / мес</b></div>
            <div className="v2-fr"><span>Текущий месяц</span><b>{currentM ? `M${currentM.month_number} · ${fmtDateShort(currentM.start_date)} → ${fmtDateShort(currentM.end_date)}` : "—"}</b></div>
            <div className="v2-fr"><span>Контрактные месяцы</span><b>{clientMonths.length}</b></div>
            <div className="v2-hint">Даты и пакет каждого месяца правятся в блоке «Контрактные месяцы» на вкладке «Работа».</div>
          </div>
          <div className="v2-fg">
            <h4>Команда</h4>
            <div className="v2-fr"><span>Тимлид</span>
              <select style={selStyle} value={c.teamlead_id ?? ""} onChange={(e) => updateTeam({ teamlead_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— не назначен —</option>
                {team.filter(t => t.member_type === "teamlead" || t.member_type === "admin").map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
            <div className="v2-fr"><span>Монтажёр</span>
              <select style={selStyle} value={c.montager_id ?? ""} onChange={(e) => updateTeam({ montager_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— не назначен —</option>
                {team.filter(t => t.member_type === "montager").map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
            <div className="v2-fr"><span>Доп. доступ в Монтаж</span>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {team.filter(t => t.member_type === "montager" && t.id !== c.montager_id).map(t => { const on = (c.extra_montager_ids || []).includes(t.id); return (
                  <button key={t.id} className={`v2-chip ${on ? "pu" : "mut"}`} style={{ cursor: "pointer" }} onClick={() => updateTeam({ extra_montager_ids: on ? (c.extra_montager_ids || []).filter(x => x !== t.id) : [...(c.extra_montager_ids || []), t.id] })}>{t.name}</button>
                ); })}
              </div></div>
            <div className="v2-hint">Доп. доступ не влияет на ЗП — она считается по основному монтажёру.</div>
          </div>
          <div className="v2-fg">
            <h4>Онбординг</h4>
            <div className="v2-fr"><span>Чек-лист</span><button className="v2-act" style={{ height: 32 }} onClick={() => router.push(`/dashboard/clients/${clientId}/onboarding`)}>{onbProgress ? (onbProgress.pending_tasks > 0 ? `${onbProgress.done_tasks}/${onbProgress.total_tasks - onbProgress.skipped_tasks} · ${onbProgress.progress_pct}%` : "✓ завершён") : "открыть"} →</button></div>
            <div className="v2-fr"><span>Начало</span><input type="date" style={{ ...inpStyle, colorScheme: "dark" }} defaultValue={c.onboarding_start || c.start_date || ""} onBlur={(e) => { const v = e.target.value || null; if (v !== (c.onboarding_start || null)) updateClientField("onboarding_start", v); }} /></div>
            <div className="v2-fr"><span>Дедлайн</span><input type="date" style={{ ...inpStyle, colorScheme: "dark" }} defaultValue={obDeadline || ""} onBlur={(e) => { const v = e.target.value || null; if (v !== obDeadline) updateClientField("onboarding_deadline", v); }} /></div>
            {!obDone && obWhen && <div className="v2-hint" style={{ color: obColor }}>{obDay ? `День ${obDay} из 10 · ` : ""}{obWhen}</div>}
          </div>
          <div className="v2-fg">
            <h4>Публикации</h4>
            <div className="v2-fr" style={{ display: "block" }}>
              <span style={{ display: "block", marginBottom: 6 }}>Соцсети, куда публикуем</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([["ig", "Instagram"], ["tt", "TikTok"], ["yt", "YouTube Shorts"], ["threads", "Threads"]] as const).map(([k, l]) => {
                  const cur = (c.platforms || []) as string[]; const on = cur.includes(k);
                  return <button key={k} className={`v2-chip ${on ? "pu" : "mut"}`} style={{ height: 32, padding: "0 12px", cursor: "pointer", opacity: on ? 1 : .6 }}
                    onClick={() => updateClientField("platforms", on ? cur.filter(x => x !== k) : [...cur, k])}>{on ? "✓ " : ""}{l}</button>;
                })}
              </div>
              <div className="v2-hint">Только эти сети получат посты из «Публикаций». Должны быть подключены в том сервисе, через который публикуем.</div>
            </div>
            <div className="v2-fr"><span>Через что публикуем</span>
              <select style={selStyle} value={c.publisher || "metricool"} onChange={(e) => updateClientField("publisher", e.target.value)}>
                <option value="metricool">Metricool (наш аккаунт)</option>
                <option value="uploadpost">Upload-Post (аккаунт клиента)</option>
              </select></div>
            {(c.publisher || "metricool") === "uploadpost" ? (
              <>
                <div className="v2-fr"><span>Профиль Upload-Post</span>
                  <input style={{ ...inpStyle, width: 200 }} defaultValue={c.uploadpost_profile ?? ""} placeholder="напр. Edeal_Business"
                    onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (c.uploadpost_profile ?? null)) updateClientField("uploadpost_profile", v); }} /></div>
                <div className="v2-hint">Имя профиля из аккаунта Upload-Post клиента. Соцсети клиент подключает у себя — мы только отправляем ролики.</div>
              </>
            ) : (
              <div className="v2-fr" style={{ display: "block" }}><span style={{ display: "block", marginBottom: 6 }}>Бренд в Metricool</span>
                <MetricoolBrandPicker blogId={c.metricool_blog_id ?? null} onPick={(v) => { if (v !== (c.metricool_blog_id ?? null)) updateClientField("metricool_blog_id", v); }} /></div>
            )}
            <div className="v2-fr"><span>Часовой пояс</span>
              <select style={selStyle} value={c.timezone || DEFAULT_TZ} onChange={(e) => updateClientField("timezone", e.target.value)}>{CLIENT_TIMEZONES.map(t => <option key={t.tz} value={t.tz}>{t.label}</option>)}</select></div>
            <div className="v2-hint">в этом поясе задаётся время публикаций · сейчас там {nowInTz(c.timezone || DEFAULT_TZ)}</div>
            <div className="v2-fr"><span>Telegram topic ID</span>
              <input type="number" style={{ ...inpStyle, width: 120 }} defaultValue={c.telegram_topic_id ?? ""} placeholder="напр. 12" onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== (c.telegram_topic_id ?? null)) updateClientField("telegram_topic_id", v); }} /></div>
            <div className="v2-hint">id топика клиента в ТГ — по нему бот понимает, чьё это видео</div>
            {c.metricool_blog_id ? (
              <div className="v2-fr"><span>Отчёт клиенту</span>
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <select style={selStyle} value={reportMonth} onChange={(e) => setReportMonth(e.target.value)}>
                    {Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; const RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]; return <option key={v} value={v}>{RU[d.getMonth()]} {d.getFullYear()}</option>; })}
                  </select>
                  <a href={`/api/clients/${clientId}/report?month=${reportMonth}`} target="_blank" rel="noreferrer" className="v2-act gr" style={{ height: 32 }}>Сгенерировать →</a>
                </span></div>
            ) : <div className="v2-hint">Отчёт клиенту появится после привязки бренда Metricool.</div>}
          </div>
          <div className="v2-fg">
            <h4>Ритм сдачи</h4>
            <div className="v2-fr"><span>День сдачи видео</span>
              <select style={selStyle} value={c.delivery_day ?? ""} onChange={(e) => updateClientField("delivery_day", e.target.value ? Number(e.target.value) : null)}><option value="">не задан</option>{WEEKDAYS_RU.map((w, i) => <option key={i} value={i + 1}>{w}</option>)}</select></div>
            <div className="v2-fr"><span>Роликов в неделю</span>
              <input type="number" style={{ ...inpStyle, width: 110 }} defaultValue={c.weekly_quota ?? ""} placeholder={`авто: ${weeklyQuotaOf(c)}`} onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== (c.weekly_quota ?? null)) updateClientField("weekly_quota", v); }} /></div>
            <div className="v2-hint">партия на неделю вперёд · готовность за {BATCH_BUFFER_DAYS} дня до сдачи</div>
            <div className="v2-fr"><span>День проверки контента</span>
              <select style={selStyle} value={c.review_day ?? ""} onChange={(e) => updateClientField("review_day", e.target.value ? Number(e.target.value) : null)}><option value="">не задан</option>{WEEKDAYS_RU.map((w, i) => <option key={i} value={i + 1}>{w}</option>)}</select></div>
            <div className="v2-hint">в этот день тимлид сдаёт референсы и сценарии по клиенту на проверку</div>
          </div>
          <div className="v2-fg span2">
            <h4>Тон голоса <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>· в этом стиле AI пишет описания под соцсети</span></h4>
            <textarea defaultValue={c.brand_voice || ""} rows={4}
              onBlur={(e) => { if (e.target.value !== (c.brand_voice || "")) updateClientField("brand_voice", e.target.value || null); }}
              placeholder="Напр.: Экспертно, без воды. 1–2 эмодзи max. Только русский. Любит цифры и конкретику. Без clickbait."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 9, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
          </div>
          {c.sheet_url && <div className="v2-fg"><h4>Файлы</h4><div className="v2-fr"><span>Google Sheet</span><a href={c.sheet_url} target="_blank" rel="noreferrer" className="v2-act" style={{ height: 32 }}>Открыть →</a></div></div>}
        </div>
      )}

      {ctab === "work" && (<>
      <div className="v2-pipe">
        <div><b style={{ color: "var(--pu)" }}>{pipe.writing}</b><span>пишутся</span></div>
        <div><b style={{ color: "var(--or)" }}>{pipe.montage}</b><span>монтаж</span></div>
        <div><b style={{ color: "var(--cy)" }}>{pipe.ready}</b><span>готов</span></div>
        <div><b style={{ color: "var(--gr)" }}>{pipe.published}</b><span>вышло</span></div>
      </div>
      {/* Онбординг — пока не закрыт, это главная работа по клиенту: держим на виду */}
      {onbProgress && onbProgress.pending_tasks > 0 && (
        <div className="card mb-3" style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(66,212,244,0.4)", background: "rgba(66,212,244,0.06)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20 }}>🧩</span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>
              Онбординг · {onbProgress.done_tasks} из {onbProgress.total_tasks - onbProgress.skipped_tasks}
              {onbProgress.overdue_tasks > 0 && <span style={{ color: "var(--rd)", marginLeft: 8 }}>⚠ просрочено {onbProgress.overdue_tasks}</span>}
            </div>
            <div style={{ height: 6, borderRadius: 4, background: "var(--track)", overflow: "hidden" }}>
              <div style={{ width: `${onbProgress.progress_pct}%`, height: "100%", background: "linear-gradient(90deg, var(--cy), var(--pu))", borderRadius: 4 }} />
            </div>
          </div>
          <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--cy)" }}>{onbProgress.progress_pct}%</span>
          <button className="v2-act pri" style={{ height: 36 }} onClick={() => router.push(`/dashboard/clients/${clientId}/onboarding`)}>Открыть чек-лист →</button>
        </div>
      )}
      {onbProgress && onbProgress.pending_tasks === 0 && onbProgress.total_tasks > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
          <span className="v2-chip gr" style={{ height: 32 }}>✓ Онбординг завершён</span>
          <button className="v2-act" style={{ height: 32 }} onClick={() => router.push(`/dashboard/clients/${clientId}/onboarding`)}>посмотреть →</button>
        </div>
      )}

      {currentM && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <button className="v2-act pri" onClick={() => router.push(`/dashboard/plan?client=${clientId}&m=${currentM.month_number}`)}>📅 Контент-план M{currentM.month_number} →</button>
          <span className="v2-chip mut" style={{ height: 36 }}>{pipe.published} / {currentM.package} за месяц · {monthDaysLeft != null && monthDaysLeft >= 0 ? `осталось ${monthDaysLeft} дн.` : `просрочка ${-(monthDaysLeft || 0)} дн.`}</span>
        </div>
      )}

      {dupGroups.length > 0 && (
        <div className="card mb-3" style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,174,66,0.45)", background: "rgba(255,174,66,0.07)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--or)", marginBottom: 6 }}>⚠ Повторяющиеся сценарии: {dupGroups.length}</div>
          <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.55, marginBottom: 10 }}>Один и тот же текст заведён несколько раз. Лишнюю копию удали, а если сценарий переехал — открой его и смени месяц в шапке карточки.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {dupGroups.slice(0, 6).map((g, i) => (
              <div key={i} style={{ padding: "8px 10px", borderRadius: 9, background: "var(--inset2)", border: "1px solid var(--track)" }}>
                <div style={{ fontSize: 12, color: "var(--t1)", marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(g[0].hook_text || g[0].hook || "").slice(0, 70) || "без темы"}…</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {g.map(sc => { const pubd = sc.video_status === "published"; return (
                    <button key={sc.id} onClick={() => { setViewMonth(sc.month_number); setExpandedScript(sc.id); }} className={`v2-chip ${pubd ? "gr" : "or"}`} style={{ cursor: "pointer" }}>M{sc.month_number} · #{sc.order_num || "—"} · {pubd ? "опубликован" : sc.video_status === "ready" ? "готов" : "не смонтирован"}</button>
                  ); })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {clientMonths.length === 0 && (
        <div className="card mb-3" style={{ padding: "16px 18px", borderRadius: 14, border: "1px solid rgba(255,174,66,0.45)", background: "rgba(255,174,66,0.07)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--or)", marginBottom: 6 }}>⚠ У клиента нет контрактного месяца</div>
          <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.6, marginBottom: 12 }}>Без него не считается план, ЗП и клиент не виден в «Команде». Создам M1 на 30 дней от даты старта.</div>
          <button className="v2-act pri" onClick={async () => {
            const start = c.start_date || todayIso;
            const [y, mo, d] = start.split("-").map(Number);
            const end = new Date(y, mo - 1, d + 30).toISOString().slice(0, 10);
            const { error } = await supabase.from("client_months").insert({ client_id: clientId, month_number: 1, status: "onboarding", package: c.package || 30, start_date: start, end_date: end });
            if (error) alert("Не получилось: " + error.message);
            else { if (c.stage !== "active") await db.updateClient(supabase, clientId, { stage: "active" } as any); await load(); }
          }}>+ Создать первый месяц (M1, пакет {c.package || 30})</button>
        </div>
      )}
      {clientMonths.length > 0 && (
        <ClientMonthsTimeline clientId={clientId} clientName={`${c.name} ${c.surname || ""}`.trim()} clientMonths={clientMonths} scripts={scripts}
          activeMonth={viewMonth} onActivateMonth={(m) => setViewMonth(m)} onChange={async () => { await load(); }} todayIso={todayIso} />
      )}
      <ClientAttention currentM={currentM} scripts={currentMonthScripts} todayIso={todayIso} />

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
          <button onClick={() => setViewMonth(0)} className="px-3 py-1 rounded-lg text-[10px] font-semibold"
            title="Показать карточки всех месяцев — как в общем разделе «Монтаж»"
            style={{ border: `1px solid ${viewMonth === 0 ? "var(--pu)" : "var(--brd)"}`, background: viewMonth === 0 ? "rgba(157,107,255,0.14)" : "transparent", color: viewMonth === 0 ? "var(--pu)" : "var(--t2)", cursor: "pointer" }}>
            Все месяцы
          </button>
          {(() => {
            // Незакрытая работа в других месяцах — её видно в разделе «Монтаж», но не на этой вкладке
            if (viewMonth === 0) return null;
            const elsewhere = scripts.filter(s => s.month_number !== viewMonth
              && s.script_status === "approved" && ["notStarted", "inProgress", "ready"].includes(s.video_status));
            if (!elsewhere.length) return null;
            const byM: Record<number, number> = {};
            for (const s of elsewhere) byM[s.month_number] = (byM[s.month_number] || 0) + 1;
            return (
              <button onClick={() => setViewMonth(0)} className="px-3 py-1 rounded-lg text-[10px] font-semibold"
                style={{ border: "1px solid rgba(255,174,66,0.45)", background: "rgba(255,174,66,0.09)", color: "var(--or)", cursor: "pointer" }}>
                ⚠ ещё {elsewhere.length} в работе: {Object.entries(byM).map(([m, n]) => `M${m} — ${n}`).join(", ")}
              </button>
            );
          })()}
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
                  // в списке опубликованного ведём на сам пост; если ссылки ещё нет — на файл ролика
                  const src = s.published_url || s.video_url;
                  const vurl = src ? (src.startsWith("http") ? src : `https://${src}`) : null;
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

      </>)}


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
                <div><label style={lbl}>🎂 День рождения</label><input type="date" style={inp} value={editData.birthday || ""} onChange={(e) => set("birthday", e.target.value)} /></div>
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
