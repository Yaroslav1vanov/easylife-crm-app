"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, ClientMonth, Script, SocialSnapshot, TeamMember, OnboardingProgress } from "@/lib/database";
import Tour, { TourButton, type TourStep } from "@/components/Tour";

type Platform = "ig" | "tt" | "yt";
type ClientProduction = { pub: number; ready: number; scr: number; total: number; month: ClientMonth | null };

const platformMeta: Record<Platform, { short: string; label: string; color: string }> = {
  ig: { short: "IG", label: "Instagram", color: "#e1306c" },
  tt: { short: "TT", label: "TikTok", color: "#25f4ee" },
  yt: { short: "YT", label: "Shorts", color: "#ff5c7a" },
};
const platforms: Platform[] = ["ig", "tt", "yt"];
const clientAccents = ["#7b3fe4", "#42d4f4", "#a8e063", "#ffae42", "#ff5c7a", "#9d6bff"];

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "—";
}

function compactNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatSnapshotDate(value?: string) {
  if (!value) return "данных пока нет";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${value}T00:00:00`));
}

function activePlatforms(client: Client, snapshots: SocialSnapshot[]): Platform[] {
  const configured = (client.platforms || []).filter((p): p is Platform => platforms.includes(p as Platform));
  const inferred: Platform[] = [
    ...(client.instagram ? ["ig" as Platform] : []),
    ...(client.tiktok ? ["tt" as Platform] : []),
    ...(client.youtube ? ["yt" as Platform] : []),
    ...snapshots.map((s) => s.platform),
  ];
  return Array.from(new Set([...configured, ...inferred]));
}

// Суммарно по ВСЕМ соцсетям клиента: охват за месяц, подписчики и их рост за 30 дней.
// Это главные цифры — их показываем клиенту на созвоне.
function totalMetrics(snapshots: SocialSnapshot[]) {
  const byPlat: Record<string, SocialSnapshot[]> = {};
  for (const s of snapshots) (byPlat[s.platform] ||= []).push(s);
  let reach = 0, followers = 0, prevFollowers = 0, hasReach = false, hasFollowers = false, hasPrev = false;
  const perPlatform: { p: Platform; reach: number | null; followers: number | null }[] = [];
  for (const p of platforms) {
    const rows = (byPlat[p] || []).sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
    const latest = rows[0];
    if (!latest) continue;
    if (latest.reach_30d != null) { reach += latest.reach_30d; hasReach = true; }
    if (latest.followers != null) { followers += latest.followers; hasFollowers = true; }
    // значение месяц назад — для роста
    const target = new Date(`${latest.snapshot_date}T00:00:00`);
    target.setDate(target.getDate() - 30);
    const prev = rows.find(r => r.snapshot_date <= target.toISOString().slice(0, 10));
    if (prev?.followers != null) { prevFollowers += prev.followers; hasPrev = true; }
    perPlatform.push({ p, reach: latest.reach_30d, followers: latest.followers });
  }
  const growth = hasFollowers && hasPrev && prevFollowers > 0
    ? Math.round((followers - prevFollowers) / prevFollowers * 1000) / 10 : null;
  const growthAbs = hasFollowers && hasPrev ? followers - prevFollowers : null;
  return {
    reach: hasReach ? reach : null,
    followers: hasFollowers ? followers : null,
    growth, growthAbs, perPlatform,
    date: snapshots.map(s => s.snapshot_date).sort().at(-1),
  };
}

function socialMetric(snapshots: SocialSnapshot[], platform: Platform) {
  const rows = snapshots
    .filter((s) => s.platform === platform)
    .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
  const latest = rows[0];
  if (!latest) return { latest: null, growth: null };
  const target = new Date(`${latest.snapshot_date}T00:00:00`);
  target.setDate(target.getDate() - 30);
  const targetDate = target.toISOString().slice(0, 10);
  const previous = rows.find((row) => row.snapshot_date <= targetDate);
  const growth = previous?.followers && latest.followers !== null
    ? ((latest.followers - previous.followers) / previous.followers) * 100
    : null;
  return { latest, growth };
}

function ClientCard({
  client,
  production,
  snapshots,
  accent,
  isOnboarding,
  onOpen,
  onSetStage,
}: {
  client: Client;
  production: ClientProduction;
  snapshots: SocialSnapshot[];
  accent: string;
  isOnboarding: boolean;
  onOpen: () => void;
  onSetStage: (stage: "active" | "paused" | "churned") => void;
}) {
  const tot = useMemo(() => totalMetrics(snapshots), [snapshots]);
  const plan = production.month?.package || client.package || production.total || 0;
  const progress = plan > 0 ? Math.min(100, Math.round((production.ready / plan) * 100)) : 0;
  const fullName = `${client.name} ${client.surname || ""}`.trim();
  const obDl = isOnboarding ? ((client as any).onboarding_deadline as string | null) : null;
  const obLeft = obDl ? Math.round((new Date(`${obDl}T00:00:00`).getTime() - new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime()) / 86400000) : null;
  const obColor = obLeft == null ? "var(--or)" : obLeft < 0 ? "#ff5c7a" : obLeft <= 2 ? "#ffae42" : "#a8e063";

  return (
    <article className="client-v2-card" style={{ "--client-accent": accent } as React.CSSProperties}>
      <div className="client-v2-head">
        <div
          className="client-v2-avatar"
          style={{ background: client.avatar_url ? `url(${client.avatar_url}) center/cover` : `linear-gradient(135deg, ${accent}, rgba(123,63,228,.42))` }}
        >
          {!client.avatar_url && initials(fullName)}
          <span className={`client-v2-status-dot ${isOnboarding ? "onboarding" : "production"}`} />
        </div>
        <div className="client-v2-title">
          <h2>{fullName}</h2>
          <p>{client.niche || "Ниша не указана"}</p>
        </div>
        <span className={`client-v2-status ${isOnboarding ? "onboarding" : "production"}`}>
          {isOnboarding ? (obDl ? `онбординг · до ${formatSnapshotDate(obDl)}` : "онбординг") : "производство"}
        </span>
      </div>

      {isOnboarding && obLeft != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "0 0 10px", padding: "6px 10px", borderRadius: 9, background: `${obColor}14`, border: `1px solid ${obColor}55` }}>
          <span style={{ fontSize: 11 }}>🚀</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: obColor }}>
            {obLeft < 0 ? `Онбординг просрочен ${-obLeft} дн` : obLeft === 0 ? "Онбординг — дедлайн сегодня" : obLeft === 1 ? "Онбординг — дедлайн завтра" : `До конца онбординга ${obLeft} дн`}
          </span>
        </div>
      )}

      {/* ГЛАВНОЕ: суммарный охват по всем соцсетям + рост подписчиков */}
      <div style={{ padding: "14px 15px", borderRadius: 13, background: "var(--inset)", border: "1px solid var(--brd)", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>Охват за месяц · все соцсети</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 30, fontWeight: 800, color: "var(--t1)", lineHeight: 1.15, marginTop: 3 }}>
              {compactNumber(tot.reach)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>Подписчики</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "var(--t1)", lineHeight: 1.2, marginTop: 3 }}>{compactNumber(tot.followers)}</div>
            {tot.growth != null ? (
              <div style={{ fontSize: 11, fontWeight: 800, color: tot.growth >= 0 ? "var(--gr)" : "var(--rd)" }}>
                {tot.growth >= 0 ? "▲" : "▼"} {Math.abs(tot.growth)}%{tot.growthAbs != null ? ` (${tot.growthAbs >= 0 ? "+" : ""}${compactNumber(tot.growthAbs)})` : ""}
              </div>
            ) : <div style={{ fontSize: 10, color: "var(--t3)" }}>рост — копим данные</div>}
          </div>
        </div>

        {/* разбивка охвата по соцсетям */}
        <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
          {platforms.map(p => {
            const meta = platformMeta[p];
            const row = tot.perPlatform.find(x => x.p === p);
            const on = !!row && (row.reach != null || row.followers != null);
            return (
              <span key={p} title={meta.label}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 8, flex: "1 1 auto", justifyContent: "center",
                  background: on ? `${meta.color}14` : "var(--inset2)", border: `1px solid ${on ? meta.color + "44" : "var(--track)"}` }}>
                <i style={{ width: 6, height: 6, borderRadius: "50%", background: on ? meta.color : "var(--t3)", display: "block" }} />
                <b style={{ fontSize: 10, color: on ? meta.color : "var(--t3)", fontWeight: 800 }}>{meta.short}</b>
                <span style={{ fontSize: 11, fontWeight: 700, color: on ? "var(--t1)" : "var(--t3)" }}>{row?.reach != null ? compactNumber(row.reach) : "—"}</span>
              </span>
            );
          })}
        </div>
        <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 8 }}>
          Metricool · обновлено {formatSnapshotDate(tot.date)}
        </div>
      </div>

      <div className="client-v2-production">
        <div><b><em>{production.ready}</em>/{plan}</b><span>ролики</span></div>
        <div><b><strong>{production.scr}</strong>/{plan}</b><span>сценарии</span></div>
        <div><b>{production.month?.package || client.package}</b><span>пакет</span></div>
      </div>

      <div className="client-v2-progress">
        <div><span>Прогресс месяца{production.month ? ` · M${production.month.month_number}` : ""}</span><b>{progress}%</b></div>
        <i><span style={{ width: `${progress}%` }} /></i>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <select
          value={client.stage || "active"}
          onChange={(e) => onSetStage(e.target.value as "active" | "paused" | "churned")}
          title="Статус клиента"
          style={{ padding: "6px 8px", borderRadius: 8, background: "var(--inset2, rgba(255,255,255,0.04))", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
        >
          <option value="active">🟢 В работе</option>
          <option value="paused">⏸ На паузе</option>
          <option value="churned">📦 Архив</option>
        </select>
        {(client as any).metricool_blog_id != null && (
          <a href={`/api/metricool/open?blogId=${(client as any).metricool_blog_id}`} target="_blank" rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, background: "rgba(66,212,244,0.12)", border: "1px solid var(--brd)", color: "var(--cy)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
            📊 Metricool ↗
          </a>
        )}
      </div>

      <footer className="client-v2-footer">
        <span><i>{initials(client.montager?.name || "—")}</i>{client.montager?.name || "Монтажёр —"}</span>
        <span><i>{initials(client.teamlead?.name || "—")}</i>{client.teamlead?.name || "Тимлид —"}</span>
        <button type="button" onClick={onOpen}>Открыть →</button>
      </footer>
    </article>
  );
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [clientMonths, setClientMonths] = useState<ClientMonth[]>([]);
  const [snapshots, setSnapshots] = useState<SocialSnapshot[]>([]);
  const [onbProgress, setOnbProgress] = useState<OnboardingProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<"active" | "paused" | "churned">("active");
  const [showAdd, setShowAdd] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [form, setForm] = useState({ name: "", surname: "", niche: "", package: 30, montager_id: 0, teamlead_id: 0, start_date: new Date().toISOString().split("T")[0], pub_date: "" });
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoadError(null);
    // 1) Сначала — сам список клиентов. Показываем его сразу, не дожидаясь тяжёлых
    //    запросов (сценарии/снапшоты): на мобильной сети они могут отвалиться,
    //    и раньше из-за этого экран оставался пустым без объяснения.
    let cls: Client[] = [];
    try {
      const [c, tm] = await Promise.all([db.getClients(supabase), db.getTeam(supabase)]);
      cls = c;
      setClients(c);
      setTeam(tm);
      if (c.length === 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) setLoadError("Сессия истекла — войди заново.");
      }
    } catch (e: any) {
      setLoadError("Не удалось загрузить клиентов: " + (e?.message || String(e)));
      setLoading(false);
      return;
    }
    setLoading(false);

    // 2) Остальное — фоном. Упадёт — список клиентов всё равно на месте.
    try {
      const ids = cls.map((c) => c.id);
      const [allScripts, monthsResult, social, onb] = await Promise.all([
        db.getScriptsForClients(supabase, ids),
        db.getClientMonths(supabase),
        db.getSocialSnapshots(supabase, ids),
        db.getAllOnboardingProgress(supabase),
      ]);
      setScripts(allScripts);
      setClientMonths(monthsResult.data || []);
      setSnapshots(social);
      setOnbProgress(onb);
    } catch (e: any) {
      console.error("clients: доп. данные не загрузились", e);
      setLoadError("Список загружен, но статистика не подтянулась — обнови страницу.");
    }
  }

  async function setStage(clientId: number, stage: "active" | "paused" | "churned") {
    setClients((arr) => arr.map((c) => c.id === clientId ? { ...c, stage } : c)); // мгновенно в UI
    await db.updateClient(supabase, clientId, { stage } as any);
    load();
  }

  async function refreshStats() {
    setSyncing(true);
    try {
      const r = await fetch("/api/metricool/refresh-snapshots");
      const j = await r.json();
      if (!r.ok) alert("Metricool: " + (j?.error || r.status));
      else if (j.written === 0 && j.note) alert(j.note);
      await load();
    } catch (e: any) { alert(String(e)); }
    setSyncing(false);
  }

  async function handleCreate() {
    if (!form.name) return;
    await db.createClient(supabase, {
      name: form.name, surname: form.surname, niche: form.niche,
      package: form.package, montager_id: form.montager_id || undefined,
      teamlead_id: form.teamlead_id || undefined,
      start_date: form.start_date, pub_date: form.pub_date || undefined,
    });
    setShowAdd(false);
    setForm({ name: "", surname: "", niche: "", package: 30, montager_id: 0, teamlead_id: 0, start_date: new Date().toISOString().split("T")[0], pub_date: "" });
    load();
  }

  if (loading) return <div style={{ color: "var(--t2)", padding: 40, textAlign: "center" }}>Загрузка...</div>;

  const montagers = team.filter(t => t.member_type === "montager");
  const leads = team.filter(t => t.member_type === "teamlead" || t.member_type === "admin");
  const latestSync = snapshots.map((s) => s.snapshot_date).sort().at(-1);

  // Группировка по статусу: активные (не пауза/не ушёл), на паузе, ушли (архив)
  const stageOf = (c: Client) => c.stage === "paused" ? "paused" : c.stage === "churned" ? "churned" : "active";
  const counts = {
    active: clients.filter(c => stageOf(c) === "active").length,
    paused: clients.filter(c => stageOf(c) === "paused").length,
    churned: clients.filter(c => stageOf(c) === "churned").length,
  };
  const visibleClients = clients.filter(c => stageOf(c) === statusTab);
  // Онбординг определяем по чек-листу: пока есть незакрытые задачи (pending > 0) — фаза онбординга.
  const onbMap = Object.fromEntries(onbProgress.map(o => [o.client_id, o])) as Record<number, OnboardingProgress>;
  const statusTabs: { key: "active" | "paused" | "churned"; label: string; color: string; count: number }[] = [
    { key: "active", label: "Активные", color: "var(--gr)", count: counts.active },
    { key: "paused", label: "На паузе", color: "var(--yl)", count: counts.paused },
    { key: "churned", label: "Архив (ушли)", color: "var(--t3)", count: counts.churned },
  ];

  function productionFor(clientId: number): ClientProduction {
    const months = clientMonths.filter((m) => m.client_id === clientId && m.status !== "cancelled");
    const month = months.find((m) => m.status === "active")
      || months.find((m) => m.status === "onboarding")
      || months.sort((a, b) => b.month_number - a.month_number)[0]
      || null;
    const rows = scripts.filter((script) => script.client_id === clientId && (!month || script.month_number === month.month_number));
    // Считаем РЕАЛЬНУЮ работу, а не висячие идеи:
    // сценарии = взяты в работу и дальше; ролики = взяты в монтаж и дальше.
    const inWork = ["inProgress", "review", "approved"];
    const inMontage = ["inProgress", "review", "ready", "published"];
    return {
      pub: rows.filter((script) => script.video_status === "published").length,
      ready: rows.filter((script) => inMontage.includes(script.video_status)).length,
      scr: rows.filter((script) => inWork.includes(script.script_status)).length,
      total: rows.length,
      month,
    };
  }

  const CLIENTS_TOUR: TourStep[] = [
    { title: "Раздел «Клиенты»", text: "Тут все клиенты агентства: их соц-статистика, объём контента за месяц и статус. Отсюда заходим внутрь клиента и берём отчёты. Покажу по шагам." },
    { target: "cl-tabs", title: "Наборы по статусу", text: "Переключай: Активные (в работе) · На паузе · Архив (ушли). Число в кружке — сколько клиентов в каждом. На паузе и в архиве клиенты не планируются в публикации." },
    { target: "cl-sync", title: "Обновить статистику из Metricool", text: "Жми «↻ Обновить статистику» — CRM подтянет из Metricool свежие подписчики, охваты и ER по всем клиентам. Слева видно, когда обновляли в последний раз." },
    { target: "cl-card", title: "Карточка клиента — что внутри", text: "Вкладки IG / TikTok / YouTube — переключают соц-цифры (подписчики, охват, ER, рост за 30 дней). Ниже — прогресс месяца: сколько роликов и сценариев готово из пакета. Кнопка «📊 Metricool ↗» открывает аналитику клиента, «Открыть →» — карточку клиента, где онбординг и кнопка месячного отчёта." },
    { target: "cl-card", title: "Статус клиента", text: "Выпадашка 🟢 В работе / ⏸ На паузе / 📦 Архив прямо на карточке — меняет статус мгновенно. Клиент уедет в соответствующую вкладку сверху.", action: () => {} },
    { target: "cl-add", title: "Добавить клиента", text: "«+ Клиент» — завести нового: имя, ниша, пакет (кол-во роликов), монтажёр, тимлид и даты старта. После создания он появится в «Активных»." },
  ];

  return (
    <div className="clients-v2">
      <div className="clients-v2-top">
        <div>
          <h1>Клиенты <span>({clients.length})</span></h1>
          <p>Клиенты в работе, контент и соц-статистика</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TourButton onClick={() => setTourOpen(true)} />
          <button type="button" data-tour="cl-add" onClick={() => setShowAdd(true)}>+ Клиент</button>
        </div>
      </div>

      {/* СВОДКА ПО ВСЕМ КЛИЕНТАМ — можно показать на созвоне */}
      {(() => {
        const ids = new Set(visibleClients.map(c => c.id));
        const mine = snapshots.filter(s => ids.has(s.client_id));
        let reach = 0, followers = 0, hasR = false, hasF = false;
        const perPlat: Record<string, number> = {};
        for (const c of visibleClients) {
          const t = totalMetrics(mine.filter(s => s.client_id === c.id));
          if (t.reach != null) { reach += t.reach; hasR = true; }
          if (t.followers != null) { followers += t.followers; hasF = true; }
          for (const x of t.perPlatform) if (x.reach != null) perPlat[x.p] = (perPlat[x.p] || 0) + x.reach;
        }
        const publishedTotal = visibleClients.reduce((sum, c) => sum + productionFor(c.id).pub, 0);
        if (!hasR && !hasF) return null;
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16,
            padding: 18, borderRadius: 16, background: "linear-gradient(135deg, rgba(123,63,228,.12), rgba(66,212,244,.05))", border: "1px solid rgba(157,107,255,.3)" }}>
            <div>
              <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>Суммарный охват / мес</div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 32, fontWeight: 800, color: "var(--cy)", lineHeight: 1.1, marginTop: 4 }}>{compactNumber(hasR ? reach : null)}</div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 4 }}>
                {platforms.map(p => perPlat[p] ? `${platformMeta[p].short} ${compactNumber(perPlat[p])}` : null).filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>Аудитория</div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 32, fontWeight: 800, color: "var(--pu)", lineHeight: 1.1, marginTop: 4 }}>{compactNumber(hasF ? followers : null)}</div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 4 }}>подписчиков суммарно</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>Выпущено роликов</div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 32, fontWeight: 800, color: "var(--gr)", lineHeight: 1.1, marginTop: 4 }}>{publishedTotal}</div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 4 }}>за всё время работы</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>Клиентов</div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 32, fontWeight: 800, color: "var(--t1)", lineHeight: 1.1, marginTop: 4 }}>{visibleClients.length}</div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 4 }}>{statusTab === "active" ? "в работе" : statusTab === "paused" ? "на паузе" : "в архиве"}</div>
            </div>
          </div>
        );
      })()}

      <div data-tour="cl-sync" className="clients-v2-sync" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <i /> Статистика Metricool · {latestSync ? `обновлено ${formatSnapshotDate(latestSync)}` : "данных пока нет"}
        </span>
        <button type="button" onClick={refreshStats} disabled={syncing}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, background: "rgba(66,212,244,0.12)", border: "1px solid var(--brd)", color: "var(--cy)", fontSize: 11, fontWeight: 700, cursor: syncing ? "default" : "pointer" }}>
          {syncing ? "Обновляю…" : "↻ Обновить статистику"}
        </button>
      </div>

      {loadError && (
        <div style={{ padding: "11px 14px", borderRadius: 11, marginBottom: 14, fontSize: 12, lineHeight: 1.55,
          background: "rgba(255,174,66,0.08)", border: "1px solid rgba(255,174,66,0.4)", color: "var(--t1)" }}>
          ⚠ {loadError}{" "}
          <button onClick={() => { setLoading(true); load(); }}
            style={{ marginLeft: 6, background: "transparent", border: "1px solid var(--brd)", borderRadius: 7, color: "var(--cy)", fontSize: 11, fontWeight: 800, padding: "3px 9px", cursor: "pointer" }}>
            ↻ Повторить
          </button>
        </div>
      )}

      {/* Вкладки по статусу */}
      <div data-tour="cl-tabs" style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {statusTabs.map(t => {
          const active = statusTab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setStatusTab(t.key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10,
                background: active ? "rgba(157,107,255,0.14)" : "transparent",
                border: `1px solid ${active ? "var(--pu)" : "var(--brd)"}`,
                color: active ? "var(--t1)" : "var(--t2)", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.color }} />
              {t.label}
              <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 6, background: active ? "rgba(157,107,255,0.2)" : "var(--track)", color: active ? "var(--pu)" : "var(--t3)" }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.72)" }}>
          <div className="card w-full max-w-lg max-h-[90vh] overflow-auto" style={{ padding: 20 }}>
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-bold" style={{ color: "var(--t1)" }}>Новый клиент</span>
              <button onClick={() => setShowAdd(false)} className="text-sm" style={{ color: "var(--t2)" }}>✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[["Имя", "name"], ["Фамилия", "surname"], ["Ниша", "niche"]].map(([label, key]) => (
                <div key={key}>
                  <label className="block text-[9px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>{label.toUpperCase()}</label>
                  <input value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} />
                </div>
              ))}
              <div>
                <label className="block text-[9px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>ПАКЕТ (РИЛСОВ)</label>
                <div className="flex gap-1 flex-wrap">
                  {[10, 15, 30, 60, 90].map(p => (
                    <button key={p} type="button" onClick={() => setForm(prev => ({ ...prev, package: p }))}
                      className="px-3 py-1 rounded text-xs" style={{ border: `1px solid ${form.package === p ? "var(--cy)" : "var(--brd)"}`, background: form.package === p ? "var(--cyd)" : "transparent", color: form.package === p ? "var(--cy)" : "var(--t2)", cursor: "pointer" }}>{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>МОНТАЖЁР</label>
                <select value={form.montager_id} onChange={e => setForm(p => ({ ...p, montager_id: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                  <option value={0}>—</option>
                  {montagers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>TEAM LEAD</label>
                <select value={form.teamlead_id} onChange={e => setForm(p => ({ ...p, teamlead_id: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                  <option value={0}>—</option>
                  {leads.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>СТАРТ</label>
                <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} />
              </div>
              <div>
                <label className="block text-[9px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>ПУБЛИКАЦИЯ</label>
                <input type="date" value={form.pub_date} onChange={e => setForm(p => ({ ...p, pub_date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} />
              </div>
            </div>
            <button onClick={handleCreate} className="w-full py-2.5 rounded-xl text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg, var(--cy), var(--pu))" }}>Создать клиента</button>
          </div>
        </div>
      )}

      {visibleClients.length === 0 ? (
        <div className="card" style={{ padding: 40, borderRadius: 16, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>
          {statusTab === "active" ? "Нет активных клиентов" : statusTab === "paused" ? "Никто не на паузе" : "Архив пуст"}
        </div>
      ) : (
        <div className="clients-v2-grid">
          {visibleClients.map((client, index) => (
            <div key={client.id} data-tour={index === 0 ? "cl-card" : undefined} style={{ opacity: statusTab === "churned" ? 0.72 : 1 }}>
              <ClientCard
                client={client}
                production={productionFor(client.id)}
                snapshots={snapshots.filter((snapshot) => snapshot.client_id === client.id)}
                accent={clientAccents[index % clientAccents.length]}
                isOnboarding={(onbMap[client.id]?.pending_tasks ?? 0) > 0}
                onOpen={() => router.push(`/dashboard/clients/${client.id}`)}
                onSetStage={(stage) => setStage(client.id, stage)}
              />
            </div>
          ))}
        </div>
      )}
      <Tour steps={CLIENTS_TOUR} open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}
