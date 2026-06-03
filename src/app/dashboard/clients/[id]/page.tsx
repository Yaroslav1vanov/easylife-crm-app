"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, ChecklistTask, TeamMember, ClientMonth, OnboardingProgress } from "@/lib/database";
import AvatarUploader from "@/components/AvatarUploader";
import ClientMonthsTimeline from "@/components/ClientMonthsTimeline";
import ClientOverview from "@/components/ClientOverview";

export default function ClientDetailPage() {
  const { id } = useParams();
  const clientId = parseInt(id as string);
  const [client, setClient] = useState<Client | null>(null);
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
  const [editingSheet, setEditingSheet] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState("");
  const [expandedScript, setExpandedScript] = useState<number | null>(null);
  const [viewMonth, setViewMonth] = useState(1);
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
    if (cmRes?.data) setClientMonths(cmRes.data);
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

  async function addNewMonth() {
    await db.addMonthScripts(supabase, clientId);
    load();
  }

  async function saveEdit() {
    await db.updateClient(supabase, clientId, editData);
    setEditing(false); load();
  }

  if (loading) return <div style={{ color: "var(--t2)", padding: 40, textAlign: "center" }}>Загрузка...</div>;
  if (!client) return <div style={{ color: "var(--rd)", padding: 40 }}>Клиент не найден</div>;

  const c = client;
  const pub = scripts.filter(s => s.video_status === "published").length;
  const ready = scripts.filter(s => s.video_status === "ready").length;
  const editVids = scripts.filter(s => s.video_status === "inProgress" && s.script_status === "approved").length;
  const scrApp = scripts.filter(s => s.script_status === "approved").length;
  // Total scripts across all contract months for this client (replaces c.package as the
  // denominator for cards/progress, so a 2-month client shows 53/60 not 53/30).
  const totalScripts = scripts.length;
  const doneTasks = checklist.filter(t => t.status === "done").length;
  const pct = checklist.length > 0 ? Math.round(doneTasks / checklist.length * 100) : 0;
  const months = Array.from(new Set(scripts.map(s => s.month_number))).sort();
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
    { id: "scripts", label: `Сценарии (${scrApp}/${scripts.length})` },
    { id: "montage", label: `Монтаж (${inMontage + reviewVids + ready})` },
    { id: "published", label: `Опубликовано (${pub}/${totalScripts})` },
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
        activeMonth={viewMonth}
        todayIso={new Date().toISOString().slice(0, 10)}
        onEdit={() => { setEditData({ name: c.name, surname: c.surname, niche: c.niche, phone: c.phone, product: c.product, avg_check: c.avg_check, package: c.package, montager_id: c.montager_id, teamlead_id: c.teamlead_id, priority: c.priority, stage: c.stage }); setEditing(true); }}
        onAvatarChange={async (url) => { await updateClientField("avatar_url", url); }}
        onActivateMonth={(m) => setViewMonth(m)}
      />

      {/* Onboarding Phase Block */}
      {onbProgress && (() => {
        const isPending = onbProgress.pending_tasks > 0;
        const isCompleted = onbProgress.pending_tasks === 0 && onbProgress.done_tasks > 0;
        return (
          <div className="card mb-3" style={{
            padding: 16,
            borderRadius: 14,
            border: `1px solid ${isPending ? "rgba(245,196,81,0.4)" : "rgba(168,224,99,0.3)"}`,
            background: isPending
              ? "linear-gradient(135deg, rgba(245,196,81,0.08), rgba(255,174,66,0.04))"
              : "linear-gradient(135deg, rgba(168,224,99,0.08), rgba(168,224,99,0.02))",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
                <div style={{
                  minWidth: 44, height: 44, borderRadius: 12,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isPending ? "rgba(245,196,81,0.18)" : "rgba(168,224,99,0.18)",
                  color: isPending ? "var(--yl)" : "var(--gr)",
                  fontSize: 22, fontWeight: 800,
                }}>{isPending ? "🚀" : "✓"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>Фаза клиента</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t1)" }}>
                    {isPending ? `🟡 Онбординг — ${onbProgress.done_tasks}/${onbProgress.total_tasks - onbProgress.skipped_tasks} задач` : "🟢 Онбординг завершён · месячная работа"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--t2)", marginTop: 2 }}>
                    {isPending
                      ? `✅ ${onbProgress.done_tasks}  ·  ☐ ${onbProgress.pending_tasks}  ·  ⏭ ${onbProgress.skipped_tasks}${onbProgress.overdue_tasks > 0 ? `  ·  ⚠ ${onbProgress.overdue_tasks} просрочено` : ""}`
                      : `Всё закрыто или пропущено · ${onbProgress.done_tasks} done · ${onbProgress.skipped_tasks} skipped`}
                  </div>
                </div>
                {/* Mini progress bar */}
                <div style={{ minWidth: 120, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", inset: 0, width: `${onbProgress.progress_pct}%`, background: isPending ? "linear-gradient(90deg, var(--gr), var(--yl))" : "var(--gr)", borderRadius: 4, transition: ".3s" }} />
                </div>
                <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 800, color: isPending ? "var(--yl)" : "var(--gr)", minWidth: 48 }}>{onbProgress.progress_pct}%</span>
              </div>
              <button onClick={() => router.push(`/dashboard/clients/${clientId}/onboarding`)} style={{
                padding: "10px 18px", borderRadius: 10,
                background: isPending ? "linear-gradient(135deg, var(--yl), var(--or))" : "var(--card)",
                color: isPending ? "#0a0118" : "var(--t1)",
                border: isPending ? "none" : "1px solid var(--brd)",
                fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 0.3,
              }}>
                {isPending ? "🚀 Открыть онбординг →" : "Открыть онбординг (история) →"}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Google Sheets URL block */}
      <div className="card mb-3" style={{ padding: 14, borderRadius: 14, border: "1px solid var(--brd)", background: "linear-gradient(135deg, rgba(52,168,83,0.06), rgba(52,168,83,0.02))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{
            minWidth: 40, height: 40, borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(52,168,83,0.15)", fontSize: 20,
          }}>📊</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Google Sheet клиента</div>
            {editingSheet ? (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  autoFocus
                  type="text"
                  value={sheetUrlInput}
                  onChange={(e) => setSheetUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  style={{
                    flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 12,
                    background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)",
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      await updateClientField("sheet_url", sheetUrlInput.trim() || null);
                      setEditingSheet(false);
                    }
                    if (e.key === "Escape") setEditingSheet(false);
                  }}
                />
                <button onClick={async () => { await updateClientField("sheet_url", sheetUrlInput.trim() || null); setEditingSheet(false); }}
                  style={{ padding: "8px 14px", borderRadius: 8, background: "var(--gr)", color: "#0a0118", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  Сохранить
                </button>
                <button onClick={() => setEditingSheet(false)}
                  style={{ padding: "8px 12px", borderRadius: 8, background: "transparent", color: "var(--t3)", border: "1px solid var(--brd)", fontSize: 11, cursor: "pointer" }}>
                  ✕
                </button>
              </div>
            ) : c.sheet_url ? (
              <a href={c.sheet_url} target="_blank" rel="noopener noreferrer"
                style={{
                  fontSize: 13, color: "var(--t1)", fontWeight: 600,
                  display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  textDecoration: "none",
                }}
                title={c.sheet_url}>
                {c.sheet_url.replace(/^https?:\/\//, "").slice(0, 70)}{c.sheet_url.length > 76 ? "…" : ""}
              </a>
            ) : (
              <div style={{ fontSize: 12, color: "var(--t3)", fontStyle: "italic" }}>Ссылка не добавлена</div>
            )}
          </div>
          {!editingSheet && (
            <div style={{ display: "flex", gap: 6 }}>
              {c.sheet_url && (
                <a href={c.sheet_url} target="_blank" rel="noopener noreferrer"
                  style={{
                    padding: "8px 14px", borderRadius: 8,
                    background: "linear-gradient(135deg, #34a853, #1e8e3e)", color: "#fff",
                    fontSize: 11, fontWeight: 800, textDecoration: "none", letterSpacing: 0.3,
                  }}>
                  Открыть ↗
                </a>
              )}
              <button onClick={() => { setSheetUrlInput(c.sheet_url || ""); setEditingSheet(true); }}
                style={{
                  padding: "8px 12px", borderRadius: 8, background: "transparent",
                  color: "var(--t2)", border: "1px solid var(--brd)", fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>
                {c.sheet_url ? "✎ Изменить" : "+ Добавить"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contractual months timeline — теперь полностью редактируемый */}
      {clientMonths.length > 0 && (
        <ClientMonthsTimeline
          clientId={clientId}
          clientName={`${c.name} ${c.surname || ""}`.trim()}
          clientMonths={clientMonths}
          scripts={scripts}
          activeMonth={viewMonth}
          onActivateMonth={(m) => setViewMonth(m)}
          onChange={async () => { await load(); }}
          todayIso={new Date().toISOString().slice(0, 10)}
        />
      )}

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
              Месяц {m}
            </button>
          ))}
          <button onClick={addNewMonth} className="px-3 py-1 rounded-lg text-[10px] font-medium"
            style={{ border: "1px dashed var(--cy)", color: "var(--cy)", background: "transparent", cursor: "pointer" }}>+ Новый месяц</button>
        </div>
      )}

      {/* Scripts tab — all scripts with status */}
      {tab === "scripts" && (
        <div>
          {/* Status summary */}
          <div className="flex gap-3 mb-3 pb-3" style={{ borderBottom: "1px solid var(--brd)" }}>
            {[
              { l: "Не начато", v: monthScripts.filter(s => s.script_status === "notStarted").length, c: "var(--t3)" },
              { l: "В работе", v: monthScripts.filter(s => s.script_status === "inProgress").length, c: "var(--or)" },
              { l: "На утверждении", v: monthScripts.filter(s => s.script_status === "review").length, c: "var(--yl)" },
              { l: "Утверждён", v: monthScripts.filter(s => s.script_status === "approved").length, c: "var(--gr)" },
            ].map((s, i) => (
              <div key={i} className="text-center flex-1 py-2 rounded-lg" style={{ background: `${s.c}08`, border: `1px solid ${s.c}20` }}>
                <div className="text-lg font-bold font-mono" style={{ color: s.c }}>{s.v}</div>
                <div className="text-[8px]" style={{ color: "var(--t3)" }}>{s.l}</div>
              </div>
            ))}
          </div>
          {monthScripts.map(s => {
        const isExpanded = expandedScript === s.id;
        return (
          <div key={s.id} className="card mb-1" style={{ padding: 0 }}>
            <div onClick={() => setExpandedScript(isExpanded ? null : s.id)} className="flex items-center gap-2 px-3 py-2 cursor-pointer">
              <span className="text-[10px] font-mono w-5" style={{ color: "var(--t3)" }}>{s.order_num}</span>
              <span className="text-xs font-semibold flex-1" style={{ color: s.script_status === "notStarted" && !s.hook_text ? "var(--t3)" : "var(--t1)" }}>{s.hook_text || s.hook}</span>
              <span className="badge" style={{ background: `${scColor(s.script_status)}18`, color: scColor(s.script_status) }}>{scStatuses.find(x => x.value === s.script_status)?.label}</span>
              <span style={{ color: "var(--t3)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
            </div>
            {isExpanded && (
              <div className="px-3 pb-3 border-t" style={{ borderColor: "var(--brd)" }}>
                <div className="flex gap-3 py-2 flex-wrap">
                  <div><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>СТАТУС СЦЕНАРИЯ</div>
                    <select value={s.script_status} onChange={e => updateScript(s.id, { script_status: e.target.value })}
                      className="text-[10px] px-2 py-1 rounded outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                      {scStatuses.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select></div>
                </div>
                <div className="mb-2"><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--or)" }}>🎬 РЕФЕРЕНС</div>
                  <input value={s.ref_url} onChange={e => updateScript(s.id, { ref_url: e.target.value })} placeholder="https://instagram.com/reel/..."
                    className="w-full px-2 py-1.5 rounded text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} /></div>
                <div className="mb-2"><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--gr)" }}>📝 ТРАНСКРИБАЦИЯ</div>
                  <textarea value={s.transcription} onChange={e => updateScript(s.id, { transcription: e.target.value })} placeholder="Текст с референса..." rows={2}
                    className="w-full px-2 py-1.5 rounded text-xs outline-none resize-y" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontFamily: "inherit" }} /></div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--or)" }}>🎣 ХУК</div>
                    <textarea value={s.hook_text} onChange={e => updateScript(s.id, { hook_text: e.target.value })} placeholder="Крючок..." rows={2}
                      className="w-full px-2 py-1.5 rounded text-xs outline-none resize-y" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontFamily: "inherit" }} /></div>
                  <div><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--pu)" }}>📄 ОСНОВНОЙ ТЕКСТ</div>
                    <textarea value={s.body_text} onChange={e => updateScript(s.id, { body_text: e.target.value })} placeholder="Основной контент..." rows={2}
                      className="w-full px-2 py-1.5 rounded text-xs outline-none resize-y" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontFamily: "inherit" }} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--pk)" }}>📢 ПРИЗЫВ</div>
                    <textarea value={s.cta} onChange={e => updateScript(s.id, { cta: e.target.value })} placeholder="CTA..." rows={2}
                      className="w-full px-2 py-1.5 rounded text-xs outline-none resize-y" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontFamily: "inherit" }} /></div>
                  <div><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--yl)" }}>✏️ ОПИСАНИЕ</div>
                    <textarea value={s.description} onChange={e => updateScript(s.id, { description: e.target.value })} placeholder="Описание..." rows={2}
                      className="w-full px-2 py-1.5 rounded text-xs outline-none resize-y" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontFamily: "inherit" }} /></div>
                </div>
              </div>
            )}
          </div>
        );
      })}
        </div>
      )}

      {/* Montage tab — approved scripts with video status */}
      {tab === "montage" && (
        <div>
          <div className="flex gap-3 mb-3 pb-3" style={{ borderBottom: "1px solid var(--brd)" }}>
            {[
              { l: "В работе", v: monthInMontage, c: "var(--or)" },
              { l: "На утверждении", v: monthReviewVids, c: "var(--yl)" },
              { l: "Готово", v: monthReady, c: "var(--cy)" },
              { l: "Осталось", v: Math.max(0, monthScripts.length - monthPub - monthReady - monthInMontage - monthReviewVids), c: "var(--t3)" },
            ].map((s, i) => (
              <div key={i} className="text-center flex-1 py-2 rounded-lg" style={{ background: `${s.c}08`, border: `1px solid ${s.c}20` }}>
                <div className="text-lg font-bold font-mono" style={{ color: s.c }}>{s.v}</div>
                <div className="text-[8px]" style={{ color: "var(--t3)" }}>{s.l}</div>
              </div>
            ))}
          </div>
          {monthApprovedUnpublished.map(s => (
            <div key={s.id} className="card mb-1" style={{ padding: "8px 12px" }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono" style={{ color: "var(--cy)" }}>#{s.order_num}</span>
                <span className="text-xs flex-1" style={{ color: "var(--t1)" }}>{s.hook_text || s.hook}</span>
                <select value={s.video_status} onChange={e => updateScript(s.id, { video_status: e.target.value })}
                  className="text-[10px] px-2 py-0.5 rounded outline-none" style={{ background: `${viColor(s.video_status)}18`, border: "1px solid var(--brd)", color: viColor(s.video_status), cursor: "pointer" }}>
                  {viStatuses.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          ))}
          {monthApprovedUnpublished.length === 0 && (
            <div className="text-xs text-center py-8" style={{ color: "var(--t3)" }}>Все ролики этого месяца опубликованы</div>
          )}
        </div>
      )}

      {/* Published tab */}
      {tab === "published" && (
        <div>
          <div className="flex gap-3 mb-3 pb-3" style={{ borderBottom: "1px solid var(--brd)" }}>
            {[
              { l: "Опубликовано", v: monthPub, c: "var(--gr)" },
              { l: "Осталось", v: monthScripts.length - monthPub, c: "var(--t3)" },
            ].map((s, i) => (
              <div key={i} className="text-center flex-1 py-2 rounded-lg" style={{ background: `${s.c}08`, border: `1px solid ${s.c}20` }}>
                <div className="text-lg font-bold font-mono" style={{ color: s.c }}>{s.l === "✓ В норме" ? "✓" : s.v}</div>
                <div className="text-[8px]" style={{ color: "var(--t3)" }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div className="h-2 rounded-full mb-3" style={{ background: "var(--brd)" }}>
            <div className="h-full rounded-full" style={{ width: `${monthScripts.length > 0 ? monthPub / monthScripts.length * 100 : 0}%`, background: "linear-gradient(90deg, var(--cy), var(--gr))" }} />
          </div>
          {monthPublished.map(s => {
            const isExp = expandedScript === s.id;
            return (
              <div key={s.id} className="card mb-1" style={{ padding: 0 }}>
                <div onClick={() => setExpandedScript(isExp ? null : s.id)} className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                  <span className="text-[10px] font-mono" style={{ color: "var(--cy)" }}>#{s.order_num}</span>
                  <span className="text-xs flex-1" style={{ color: "var(--t1)" }}>{s.hook_text || s.hook}</span>
                  <input type="date" value={s.pub_date || ""} onClick={e => e.stopPropagation()} onChange={e => updateScript(s.id, { pub_date: e.target.value })}
                    className="text-[10px] font-mono bg-transparent border-none outline-none cursor-pointer" style={{ color: "var(--gr)" }} />
                  <span className="badge" style={{ background: "var(--grd)", color: "var(--gr)" }}>Опубликовано</span>
                  <span style={{ color: "var(--t3)", transform: isExp ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
                </div>
                {isExp && (
                  <div className="px-3 pb-3 border-t" style={{ borderColor: "var(--brd)" }}>
                    <div className="flex gap-3 py-2 flex-wrap items-end">
                      <div>
                        <div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--pu)" }}>СТАТУС РОЛИКА</div>
                        <select value={s.video_status} onChange={e => updateScript(s.id, { video_status: e.target.value })}
                          className="text-[10px] px-2 py-1 rounded outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                          {viStatuses.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--gr)" }}>ДАТА ПУБЛИКАЦИИ</div>
                        <input type="date" value={s.pub_date || ""} onChange={e => updateScript(s.id, { pub_date: e.target.value })}
                          className="text-[10px] px-2 py-1 rounded outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} />
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>🔗 ССЫЛКА НА РОЛИК</div>
                      <div className="flex gap-2">
                        <input value={s.ref_url || ""} onChange={e => updateScript(s.id, { ref_url: e.target.value })} placeholder="https://instagram.com/reel/..."
                          className="flex-1 px-2 py-1.5 rounded text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} />
                        {s.ref_url && <a href={s.ref_url.startsWith("http") ? s.ref_url : `https://${s.ref_url}`} target="_blank" rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded text-[10px] font-semibold" style={{ background: "var(--cyd)", color: "var(--cy)", border: "1px solid var(--cy)", textDecoration: "none" }}>Открыть ↗</a>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {monthPublished.length === 0 && (
            <div className="text-xs text-center py-8" style={{ color: "var(--t3)" }}>Нет опубликованных роликов за этот месяц</div>
          )}
        </div>
      )}

    </div>
  );
}
