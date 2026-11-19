"use client";
import { useEffect, useState } from "react";
import { enterPortal } from "@/lib/portalMode";
import type { Client, Script, ClientMonth } from "@/lib/database";
import AvatarUploader from "@/components/AvatarUploader";
import KanbanBoard from "@/components/KanbanBoard";
import ClientPlanTab from "@/components/plan/ClientPlanTab";
import ClientStatsTab from "@/components/ClientStatsTab";
import ViewsBreakdown from "@/components/stats/ViewsBreakdown";
import NoticeHost from "@/components/NoticeHost";
import { fmtDateShort } from "@/components/ScriptModal";
import { SCRIPT_COLUMNS, MONTAGE_COLUMNS } from "@/components/kanbanConfigs";
import { handleOf } from "@/lib/socialHandles";
import { useIsMobile } from "@/lib/useMedia";
import { Camera, Music2, Play } from "lucide-react";

/* Кабинет клиента — та же карточка клиента CRM, только просмотр и только вкладки
   «Работа», «План», «Статистика». Компоненты те же, что в /dashboard/clients/[id]:
   выглядят и считают одинаково. Данные — через «клиент только для чтения» (lib/portalClient). */

const SOCIALS = [
  { key: "instagram", cls: "ig", label: "Instagram", Icon: Camera, color: "#ec4899" },
  { key: "tiktok", cls: "tt", label: "TikTok", Icon: Music2, color: "#34d399" },
  { key: "youtube", cls: "yt", label: "YouTube", Icon: Play, color: "#ef4444" },
] as const;

function computeCurrentMonth(months: ClientMonth[], todayIso: string): number {
  if (!months.length) return 1;
  const byDate = months.find(m => m.start_date <= todayIso && todayIso <= m.end_date);
  if (byDate) return byDate.month_number;
  const active = months.find(m => m.status === "active");
  if (active) return active.month_number;
  return [...months].sort((a, b) => b.month_number - a.month_number)[0].month_number;
}
const noop = async () => {};

export default function PortalView({ token, client, scripts, clientMonths }: { token: string; client: Client; scripts: Script[]; clientMonths: ClientMonth[] }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { enterPortal({ token, clientId: client.id }); setReady(true); }, [token, client.id]);
  if (!ready) return <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--t3)", padding: 40, textAlign: "center" }}>Загрузка…</div>;
  return <Body client={client} scripts={scripts} clientMonths={clientMonths} />;
}

function Body({ client: c, scripts, clientMonths }: { client: Client; scripts: Script[]; clientMonths: ClientMonth[] }) {
  const isMobile = useIsMobile();
  const [ctab, setCtab] = useState<"work" | "plan" | "stats">("work");
  const [tab, setTab] = useState<"scripts" | "montage" | "published">("scripts");
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMonthNum = computeCurrentMonth(clientMonths, todayIso);
  const [viewMonth, setViewMonth] = useState<number>(currentMonthNum);
  const currentM = clientMonths.find(m => m.month_number === currentMonthNum) || null;
  const monthDaysLeft = currentM ? Math.round((new Date(`${currentM.end_date}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86400000) : null;

  // те же цифры, что в карточке клиента CRM
  const curScr = scripts.filter(s => s.month_number === currentMonthNum);
  const pipe = {
    writing: curScr.filter(s => s.script_status === "inProgress" || s.script_status === "review").length,
    montage: curScr.filter(s => s.script_status === "approved" && ["inProgress", "review"].includes(s.video_status)).length,
    ready: curScr.filter(s => s.video_status === "ready").length,
    published: curScr.filter(s => s.video_status === "published").length,
  };
  const pub = scripts.filter(s => s.video_status === "published").length;
  const ready = scripts.filter(s => s.video_status === "ready").length;
  const scrApp = scripts.filter(s => s.script_status === "approved").length;
  const totalScripts = scripts.length;
  const contractPlan = clientMonths.reduce((s, m) => s + (m.package || 0), 0) || totalScripts;
  const viewMonthPkg = clientMonths.find(m => m.month_number === viewMonth)?.package || 0;
  const inMontage = scripts.filter(s => s.video_status === "inProgress" && s.script_status === "approved").length;
  const reviewVids = scripts.filter(s => s.video_status === "review").length;
  const months = Array.from(new Set([
    ...scripts.map(s => s.month_number),
    ...clientMonths.filter(m => m.status !== "cancelled").map(m => m.month_number),
  ])).sort((a, b) => a - b);
  const monthScripts = viewMonth === 0 ? scripts : scripts.filter(s => s.month_number === viewMonth);
  const tabs = [
    { id: "scripts" as const, label: `Сценарии (${scrApp}/${contractPlan})` },
    { id: "montage" as const, label: `Монтаж (${inMontage + reviewVids + ready})` },
    { id: "published" as const, label: `Опубликовано (${pub}/${contractPlan})` },
  ];
  const stageChip = c.stage === "paused" ? { cls: "or", l: "⏸ На паузе" } : c.stage === "churned" ? { cls: "rd", l: "✕ Ушёл" } : { cls: "gr", l: "● В работе" };

  return (
    <>
      <NoticeHost />
      <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
        <main className="v2-main flex-1 p-3 md:p-5 overflow-auto min-w-0">
          <div className="client-detail-v2 v2">
            {/* ===== Шапка клиента ===== */}
            <div className="v2-hero">
              <AvatarUploader currentUrl={c.avatar_url} name={`${c.name} ${c.surname || ""}`} pathPrefix="clients" entityId={c.id} size={isMobile ? 56 : 72} compact readonly onUploaded={() => {}} />
              <div style={{ minWidth: 0 }}>
                <h1>{c.name} {c.surname || ""}</h1>
                <div className="team">
                  <span className={`v2-chip ${stageChip.cls}`}>{stageChip.l}</span>
                  {currentM && <span className="v2-chip mut">M{currentM.month_number} · до {fmtDateShort(currentM.end_date)}</span>}
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
                </div>
              </div>
            </div>

            <div className="v2-segc" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <button className={ctab === "work" ? "on" : ""} onClick={() => setCtab("work")}>Работа</button>
              <button className={ctab === "plan" ? "on" : ""} onClick={() => setCtab("plan")}>План</button>
              <button className={ctab === "stats" ? "on" : ""} onClick={() => setCtab("stats")}>Статистика</button>
            </div>

            {ctab === "stats" && !!c.metricool_blog_id && <ViewsBreakdown clientId={c.id} />}
            {ctab === "stats" && <ClientStatsTab clientId={c.id} hasMetricool={!!c.metricool_blog_id} />}
            {ctab === "plan" && <ClientPlanTab client={c} scripts={scripts}
              monthOptions={clientMonths.filter(m => m.status !== "cancelled").map(m => m.month_number).sort((a, b) => a - b)}
              canEdit={false} canEditReadyAt={false} onChanged={() => {}} />}

            {ctab === "work" && (<>
              <div className="v2-pipe">
                <div><b style={{ color: "var(--pu)" }}>{pipe.writing}</b><span>пишутся</span></div>
                <div><b style={{ color: "var(--or)" }}>{pipe.montage}</b><span>монтаж</span></div>
                <div><b style={{ color: "var(--cy)" }}>{pipe.ready}</b><span>готов</span></div>
                <div><b style={{ color: "var(--gr)" }}>{pipe.published}</b><span>вышло</span></div>
              </div>

              {currentM && (
                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                  <span className="v2-chip mut" style={{ height: 36 }}>{pipe.published} / {currentM.package} за месяц · {monthDaysLeft != null && monthDaysLeft >= 0 ? `осталось ${monthDaysLeft} дн` : "месяц завершён"}</span>
                </div>
              )}

              <div className="flex gap-0 border-b mb-3 overflow-x-auto" style={{ borderColor: "var(--brd)" }}>
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-[11px] font-semibold shrink-0"
                    style={{ background: "transparent", border: "none", borderBottom: tab === t.id ? "2px solid var(--cy)" : "2px solid transparent", color: tab === t.id ? "var(--cy)" : "var(--t2)", cursor: "pointer" }}>{t.label}</button>
                ))}
              </div>

              <div className="flex gap-1 mb-3 flex-wrap items-center">
                {months.map(m => (
                  <button key={m} onClick={() => setViewMonth(m)} className="px-3 py-1 rounded-lg text-[10px] font-semibold"
                    style={{ border: `1px solid ${viewMonth === m ? "var(--cy)" : "var(--brd)"}`, background: viewMonth === m ? "var(--cyd)" : "transparent", color: viewMonth === m ? "var(--cy)" : "var(--t2)", cursor: "pointer" }}>
                    Месяц {m}{m === currentMonthNum ? " · текущий" : ""}
                  </button>
                ))}
                <button onClick={() => setViewMonth(0)} className="px-3 py-1 rounded-lg text-[10px] font-semibold"
                  style={{ border: `1px solid ${viewMonth === 0 ? "var(--pu)" : "var(--brd)"}`, background: viewMonth === 0 ? "rgba(157,107,255,0.14)" : "transparent", color: viewMonth === 0 ? "var(--pu)" : "var(--t2)", cursor: "pointer" }}>
                  Все месяцы
                </button>
              </div>

              {tab === "scripts" && (
                <KanbanBoard scripts={monthScripts} clients={[c]} columns={SCRIPT_COLUMNS} onUpdate={noop} canEditScript={false} emptyHint="Пусто" />
              )}
              {tab === "montage" && (
                <KanbanBoard scripts={monthScripts.filter(s => s.script_status === "approved")} clients={[c]} columns={MONTAGE_COLUMNS} onUpdate={noop} canEditScript={false} emptyHint="Пусто" />
              )}
              {tab === "published" && (() => {
                const pubList = monthScripts
                  .filter(s => s.video_status === "published")
                  .sort((a, b) => (a.pub_date || "9999-99-99").localeCompare(b.pub_date || "9999-99-99") || (a.order_num || 0) - (b.order_num || 0));
                return (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>
                        Опубликовано за {viewMonth === 0 ? "все месяцы" : `Месяц ${viewMonth}`}: <span style={{ color: "var(--gr)", fontFamily: "'Unbounded', sans-serif" }}>{pubList.length}</span>
                        {viewMonthPkg && viewMonth !== 0 ? <span style={{ color: "var(--t3)", fontWeight: 600 }}> из {viewMonthPkg}</span> : null} видео
                      </div>
                      <span style={{ fontSize: 10, color: "var(--t3)" }}>по дате публикации ↑</span>
                    </div>
                    {pubList.length === 0 ? (
                      <div className="card" style={{ padding: 30, borderRadius: 14, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>Нет опубликованных в этом месяце</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {pubList.map((s, i) => {
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
          </div>
        </main>
      </div>
    </>
  );
}
