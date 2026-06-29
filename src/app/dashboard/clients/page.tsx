"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, ClientMonth, Script, SocialSnapshot, TeamMember, OnboardingProgress } from "@/lib/database";

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
}: {
  client: Client;
  production: ClientProduction;
  snapshots: SocialSnapshot[];
  accent: string;
  isOnboarding: boolean;
  onOpen: () => void;
}) {
  const available = useMemo(() => activePlatforms(client, snapshots), [client, snapshots]);
  const [selected, setSelected] = useState<Platform>(available[0] || "ig");
  useEffect(() => {
    if (!available.includes(selected)) setSelected(available[0] || "ig");
  }, [available, selected]);

  const { latest, growth } = socialMetric(snapshots, selected);
  const plan = production.total || production.month?.package || client.package || 0;
  const progress = plan > 0 ? Math.min(100, Math.round((production.ready / plan) * 100)) : 0;
  const fullName = `${client.name} ${client.surname || ""}`.trim();

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
          {isOnboarding ? "онбординг" : "производство"}
        </span>
      </div>

      <div className="client-v2-platform-tabs">
        {platforms.map((platform) => {
          const meta = platformMeta[platform];
          const enabled = available.includes(platform);
          return (
            <button
              key={platform}
              type="button"
              disabled={!enabled}
              onClick={() => setSelected(platform)}
              className={`client-v2-platform ${selected === platform && enabled ? "active" : ""}`}
              style={{ "--platform-color": meta.color } as React.CSSProperties}
            >
              <i /> {meta.short} <span>{meta.label}</span>
            </button>
          );
        })}
      </div>

      <div className="client-v2-social">
        <div><b>{compactNumber(latest?.followers)}</b><span>подписчики</span></div>
        <div><b>{compactNumber(latest?.reach_30d)}</b><span>охват / мес</span></div>
        <div><b>{latest?.engagement_rate !== null && latest?.engagement_rate !== undefined ? `${latest.engagement_rate}%` : "—"}</b><span>ER</span></div>
        <div><b className={growth === null ? "" : growth >= 0 ? "positive" : "negative"}>{growth === null ? "—" : `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`}</b><span>рост 30д</span></div>
        <small>Metricool · обновлено {formatSnapshotDate(latest?.snapshot_date)}</small>
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
  const [form, setForm] = useState({ name: "", surname: "", niche: "", package: 30, montager_id: 0, teamlead_id: 0, start_date: new Date().toISOString().split("T")[0], pub_date: "" });
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { load(); }, []);

  async function load() {
    const [cls, tm] = await Promise.all([db.getClients(supabase), db.getTeam(supabase)]);
    const ids = cls.map((c) => c.id);
    const [allScripts, monthsResult, social, onb] = await Promise.all([
      db.getScriptsForClients(supabase, ids),
      db.getClientMonths(supabase),
      db.getSocialSnapshots(supabase, ids),
      db.getAllOnboardingProgress(supabase),
    ]);
    setClients(cls);
    setTeam(tm);
    setScripts(allScripts);
    setClientMonths(monthsResult.data || []);
    setSnapshots(social);
    setOnbProgress(onb);
    setLoading(false);
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
    return {
      pub: rows.filter((script) => script.video_status === "published").length,
      ready: rows.filter((script) => script.video_status === "ready" || script.video_status === "published").length,
      scr: rows.filter((script) => script.script_status === "approved").length,
      total: rows.length,
      month,
    };
  }

  return (
    <div className="clients-v2">
      <div className="clients-v2-top">
        <div>
          <h1>Клиенты <span>({clients.length})</span></h1>
          <p>Клиенты в работе, контент и соц-статистика</p>
        </div>
        <button type="button" onClick={() => setShowAdd(true)}>+ Клиент</button>
      </div>

      <div className="clients-v2-sync" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <i /> Статистика Metricool · {latestSync ? `обновлено ${formatSnapshotDate(latestSync)}` : "данных пока нет"}
        </span>
        <button type="button" onClick={refreshStats} disabled={syncing}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, background: "rgba(66,212,244,0.12)", border: "1px solid var(--brd)", color: "var(--cy)", fontSize: 11, fontWeight: 700, cursor: syncing ? "default" : "pointer" }}>
          {syncing ? "Обновляю…" : "↻ Обновить статистику"}
        </button>
      </div>

      {/* Вкладки по статусу */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
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
            <div key={client.id} style={{ opacity: statusTab === "churned" ? 0.72 : 1 }}>
              <ClientCard
                client={client}
                production={productionFor(client.id)}
                snapshots={snapshots.filter((snapshot) => snapshot.client_id === client.id)}
                accent={clientAccents[index % clientAccents.length]}
                isOnboarding={(onbMap[client.id]?.pending_tasks ?? 0) > 0}
                onOpen={() => router.push(`/dashboard/clients/${client.id}`)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
