"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, MonthlyPlan } from "@/lib/database";

const RU_MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function ymLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${RU_MONTHS[m - 1]} ${y}`;
}

function ymOfDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ymShift(ym: string, monthsDelta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + monthsDelta, 1);
  return ymOfDate(d);
}

function isClientActiveInMonth(c: Client, ym: string): boolean {
  if (!c.start_date) return true;
  const monthStart = new Date(`${ym}-01T00:00:00`);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  const start = new Date(c.start_date);
  return start < monthEnd;
}

export default function DashboardPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [allScripts, setAllScripts] = useState<Script[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<any[]>([]);
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllViolations, setShowAllViolations] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const today = new Date();
  const todayStr = today.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const currentYM = ymOfDate(today);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYM); // "all" or "YYYY-MM"
  const [planEdits, setPlanEdits] = useState<Record<string, string>>({}); // key = `${clientId}-${ym}`

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [cls, tasks, plans] = await Promise.all([
      db.getClients(supabase),
      db.getAllOverdueTasks(supabase),
      db.getMonthlyPlans(supabase),
    ]);
    setClients(cls);
    setOverdueTasks(tasks);
    setMonthlyPlans(plans);
    const scripts: Script[] = [];
    for (const c of cls) {
      const s = await db.getScripts(supabase, c.id);
      scripts.push(...s);
    }
    setAllScripts(scripts);
    setLoading(false);
  }

  const monthsList = useMemo(() => {
    const months = new Set<string>();
    months.add(currentYM);
    months.add(ymShift(currentYM, 1));
    months.add(ymShift(currentYM, 2));
    clients.forEach((c) => {
      if (c.start_date) months.add(c.start_date.slice(0, 7));
    });
    allScripts.forEach((s) => {
      if (s.pub_date) months.add(s.pub_date.slice(0, 7));
    });
    return Array.from(months).sort();
  }, [clients, allScripts, currentYM]);

  if (loading) return <div style={{ color: "var(--t2)", padding: 40, textAlign: "center" }}>Загрузка...</div>;

  const isAllTime = selectedMonth === "all";

  // ----- Helpers scoped to selected month or all-time -----
  function scriptsForView(): Script[] {
    if (isAllTime) return allScripts;
    return allScripts.filter((s) => s.pub_date?.startsWith(selectedMonth));
  }

  function publishedInMonth(clientId: number, ym: string): number {
    return allScripts.filter(
      (s) => s.client_id === clientId && s.pub_date?.startsWith(ym) && s.video_status === "published"
    ).length;
  }

  function inMontageForClient(clientId: number): number {
    return allScripts.filter(
      (s) => s.client_id === clientId && s.video_status === "inProgress" && s.script_status === "approved"
    ).length;
  }

  function readyForClient(clientId: number): number {
    return allScripts.filter((s) => s.client_id === clientId && s.video_status === "ready").length;
  }

  function planFor(client: Client, ym: string): number {
    const plan = monthlyPlans.find((mp) => mp.client_id === client.id && mp.year_month === ym);
    if (plan) return plan.planned_videos;
    if (!isClientActiveInMonth(client, ym)) return 0;
    return client.package || 0;
  }

  async function savePlan(clientId: number, ym: string, val: number) {
    const key = `${clientId}-${ym}`;
    setPlanEdits((p) => ({ ...p, [key]: "saving" }));
    const { error } = await db.upsertMonthlyPlan(supabase, clientId, ym, val);
    if (error) {
      alert(`Не удалось сохранить план: ${error.message || ""}. Возможно нужна миграция monthly_plans — см. SQL в README.`);
      setPlanEdits((p) => ({ ...p, [key]: String(val) }));
      return;
    }
    const plans = await db.getMonthlyPlans(supabase);
    setMonthlyPlans(plans);
    setPlanEdits((p) => {
      const next = { ...p };
      delete next[key];
      return next;
    });
  }

  // ----- KPI computation -----
  let kpiClientsCount: number;
  let kpiClientsTag: string;
  let kpiTotalPlan: number;
  let kpiTotalPub: number;
  let kpiInMontage: number;
  let kpiReady: number;
  let kpiScriptApproved: number;

  if (isAllTime) {
    kpiClientsCount = clients.length;
    kpiClientsTag = `${clients.filter((c) => c.stage === "Производство").length} в производстве`;
    kpiTotalPlan = allScripts.length;
    kpiTotalPub = allScripts.filter((s) => s.video_status === "published").length;
    kpiInMontage = allScripts.filter((s) => s.video_status === "inProgress" && s.script_status === "approved").length;
    kpiReady = allScripts.filter((s) => s.video_status === "ready").length;
    kpiScriptApproved = allScripts.filter((s) => s.script_status === "approved").length;
  } else {
    const active = clients.filter((c) => isClientActiveInMonth(c, selectedMonth));
    kpiClientsCount = active.length;
    kpiClientsTag = `активны в ${ymLabel(selectedMonth)}`;
    kpiTotalPlan = active.reduce((sum, c) => sum + planFor(c, selectedMonth), 0);
    kpiTotalPub = active.reduce((sum, c) => sum + publishedInMonth(c.id, selectedMonth), 0);
    kpiInMontage = active.reduce((sum, c) => sum + inMontageForClient(c.id), 0);
    kpiReady = active.reduce((sum, c) => sum + readyForClient(c.id), 0);
    kpiScriptApproved = allScripts.filter((s) => s.script_status === "approved").length;
  }
  const vidGap = Math.max(0, kpiTotalPlan - kpiTotalPub);

  const stats = [
    {
      icon: "👥",
      l: "КЛИЕНТОВ",
      val: kpiClientsCount,
      tag: kpiClientsTag,
      tagColor: "var(--cy)",
      ck: () => router.push("/dashboard/clients"),
    },
    {
      icon: "📝",
      l: "СЦЕНАРИЕВ",
      val: kpiScriptApproved,
      valSub: `/ ${allScripts.length}`,
      tag: kpiScriptApproved >= allScripts.length ? "✓ Все готовы" : "В работе",
      tagColor: kpiScriptApproved >= allScripts.length ? "var(--gr)" : "var(--or)",
      bar: true,
      barPct: allScripts.length > 0 ? (kpiScriptApproved / allScripts.length) * 100 : 0,
      barColor: "var(--gr)",
      ck: () => router.push("/dashboard/scripts"),
    },
    {
      icon: "🎬",
      l: "В МОНТАЖЕ",
      val: kpiInMontage,
      valSub: `+ ${kpiReady} готово`,
      tag: kpiInMontage > 0 ? "В работе" : "—",
      tagColor: kpiInMontage > 0 ? "var(--or)" : "var(--t3)",
      bar: true,
      barPct: kpiTotalPlan > 0 ? ((kpiInMontage + kpiReady) / kpiTotalPlan) * 100 : 0,
      barColor: "var(--or)",
      ck: () => router.push("/dashboard/montage"),
    },
    {
      icon: "✅",
      l: "ОПУБЛИКОВАНО",
      val: kpiTotalPub,
      valSub: `/ ${kpiTotalPlan}`,
      tag: vidGap > 0 ? `Отстаём на ${vidGap}` : "✓ В норме",
      tagColor: vidGap > 0 ? "var(--rd)" : "var(--gr)",
      bar: true,
      barPct: kpiTotalPlan > 0 ? (kpiTotalPub / kpiTotalPlan) * 100 : 0,
      barColor: vidGap > 0 ? "var(--rd)" : "var(--gr)",
      ck: () => router.push("/dashboard/montage"),
    },
  ];

  // ----- Violations (only for all-time view) -----
  const violations: { client: string; msg: string; days: number; cid: number; severity: string }[] = [];
  if (isAllTime) {
    clients.forEach((c) => {
      const cScripts = allScripts.filter((s) => s.client_id === c.id);
      const cPub = cScripts.filter((s) => s.video_status === "published").length;
      const cReady = cScripts.filter((s) => s.video_status === "ready").length;
      const cScrApp = cScripts.filter((s) => s.script_status === "approved").length;
      const scrBuffer = cScrApp - cPub;
      if (c.first_pub_date) {
        const daysSinceFirst = Math.round((today.getTime() - new Date(c.first_pub_date).getTime()) / 86400000);
        if (daysSinceFirst >= 0) {
          const expectedByNow = Math.min(daysSinceFirst + 1, c.package);
          if (cPub < expectedByNow) {
            violations.push({
              client: c.name,
              msg: `Ролики: ${cPub} из ${expectedByNow} ожид.`,
              days: expectedByNow - cPub,
              cid: c.id,
              severity: "high",
            });
          }
        }
      }
      if (c.scripts_deadline && scrBuffer < 5 && cPub < c.package) {
        violations.push({
          client: c.name,
          msg: `Запас сценариев: ${scrBuffer} (мин. 5)`,
          days: 5 - scrBuffer,
          cid: c.id,
          severity: scrBuffer < 0 ? "high" : "med",
        });
      }
      if (c.videos_deadline && cReady < 3 && cPub < c.package) {
        violations.push({
          client: c.name,
          msg: `Запас роликов: ${cReady} готовых (мин. 3)`,
          days: 3 - cReady,
          cid: c.id,
          severity: cReady === 0 ? "high" : "med",
        });
      }
    });
    violations.sort((a, b) => b.days - a.days);
  }

  const tabs: { value: string; label: string }[] = [
    { value: "all", label: "Все время" },
    ...monthsList.map((ym) => ({ value: ym, label: ymLabel(ym) + (ym === currentYM ? " (сейчас)" : "") })),
  ];

  return (
    <div>
      {/* Header */}
      <div className="card mb-3 flex justify-between items-start">
        <div>
          <h1 className="text-lg font-extrabold" style={{ color: "var(--t1)" }}>Главный дашборд</h1>
          <p className="text-xs mt-1" style={{ color: "var(--t2)" }}>
            {isAllTime ? "Состояние производства за всё время" : `Состояние за ${ymLabel(selectedMonth)}`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-semibold tracking-wider" style={{ color: "var(--cy)" }}>СЕГОДНЯ</div>
          <div className="text-sm font-bold" style={{ color: "var(--t1)" }}>{todayStr}</div>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="card mb-3"
        style={{ overflowX: "auto", padding: "8px 12px" }}
      >
        <div style={{ display: "flex", gap: 6, minWidth: "max-content" }}>
          {tabs.map((t) => {
            const active = t.value === selectedMonth;
            return (
              <button
                key={t.value}
                onClick={() => setSelectedMonth(t.value)}
                style={{
                  border: "1px solid " + (active ? "var(--cy)" : "var(--brd)"),
                  background: active ? "rgba(34,211,238,0.12)" : "transparent",
                  color: active ? "var(--cy)" : "var(--t1)",
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {stats.map((s, i) => (
          <div key={i} onClick={s.ck} className="card cursor-pointer">
            <div className="flex justify-between items-center mb-2">
              <span className="text-base">{s.icon}</span>
              <span className="text-[9px] font-semibold" style={{ color: s.tagColor }}>{s.tag}</span>
            </div>
            <div className="text-[9px] font-semibold tracking-wider" style={{ color: "var(--t2)" }}>{s.l}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold font-mono" style={{ color: "var(--t1)" }}>{s.val}</span>
              {s.valSub && <span className="text-xs" style={{ color: "var(--t3)" }}>{s.valSub}</span>}
            </div>
            {s.bar && (
              <div className="h-1.5 rounded-full mt-2" style={{ background: "var(--brd)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${s.barPct}%`, background: s.barColor }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Per-month per-client table */}
      {!isAllTime && (
        <div className="card mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold" style={{ color: "var(--t1)" }}>
              📅 Планы и факт за {ymLabel(selectedMonth)}
            </div>
            <div className="text-[10px]" style={{ color: "var(--t3)" }}>
              Клик по числу плана → редактирование
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--t2)", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Клиент</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Тимлид</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>План</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Сделано</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Готово</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Монтаж</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Прогресс</th>
                </tr>
              </thead>
              <tbody>
                {clients
                  .filter((c) => isClientActiveInMonth(c, selectedMonth))
                  .map((c) => {
                    const plan = planFor(c, selectedMonth);
                    const done = publishedInMonth(c.id, selectedMonth);
                    const ready = readyForClient(c.id);
                    const montage = inMontageForClient(c.id);
                    const pct = plan > 0 ? Math.min(100, Math.round((done / plan) * 100)) : 0;
                    const editKey = `${c.id}-${selectedMonth}`;
                    const editing = planEdits[editKey] !== undefined && planEdits[editKey] !== "saving";
                    const saving = planEdits[editKey] === "saving";
                    const barColor =
                      pct >= 100 ? "var(--gr)" : pct >= 50 ? "var(--cy)" : pct > 0 ? "var(--or)" : "var(--rd)";
                    return (
                      <tr key={c.id} style={{ borderTop: "1px solid var(--brd)" }}>
                        <td
                          style={{ padding: "8px", cursor: "pointer", color: "var(--t1)", fontWeight: 600 }}
                          onClick={() => router.push(`/dashboard/clients/${c.id}`)}
                        >
                          {c.name} {c.surname || ""}
                        </td>
                        <td style={{ padding: "8px", color: "var(--t2)" }}>{c.teamlead?.name || "—"}</td>
                        <td style={{ padding: "8px", textAlign: "center" }}>
                          {editing ? (
                            <input
                              type="number"
                              min={0}
                              max={999}
                              autoFocus
                              value={planEdits[editKey]}
                              onChange={(e) =>
                                setPlanEdits((p) => ({ ...p, [editKey]: e.target.value }))
                              }
                              onBlur={() => {
                                const n = parseInt(planEdits[editKey], 10);
                                if (!Number.isNaN(n) && n !== plan) savePlan(c.id, selectedMonth, n);
                                else
                                  setPlanEdits((p) => {
                                    const next = { ...p };
                                    delete next[editKey];
                                    return next;
                                  });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape")
                                  setPlanEdits((p) => {
                                    const next = { ...p };
                                    delete next[editKey];
                                    return next;
                                  });
                              }}
                              style={{
                                width: 48,
                                padding: "2px 6px",
                                borderRadius: 4,
                                border: "1px solid var(--cy)",
                                background: "var(--bg2)",
                                color: "var(--t1)",
                                fontSize: 12,
                                textAlign: "center",
                              }}
                            />
                          ) : saving ? (
                            <span style={{ color: "var(--t3)" }}>...</span>
                          ) : (
                            <span
                              onClick={() =>
                                setPlanEdits((p) => ({ ...p, [editKey]: String(plan) }))
                              }
                              style={{
                                cursor: "pointer",
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontWeight: 700,
                                color: "var(--t1)",
                                background: "var(--bg2)",
                              }}
                            >
                              {plan}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center", color: "var(--gr)", fontWeight: 700 }}>
                          {done}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center", color: "var(--cy)" }}>{ready}</td>
                        <td style={{ padding: "8px", textAlign: "center", color: "var(--or)" }}>{montage}</td>
                        <td style={{ padding: "8px", minWidth: 120 }}>
                          <div className="flex items-center gap-2">
                            <div
                              style={{
                                flex: 1,
                                height: 6,
                                borderRadius: 3,
                                background: "var(--brd)",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{ width: `${pct}%`, height: "100%", background: barColor }}
                              />
                            </div>
                            <span
                              style={{
                                color: "var(--t2)",
                                fontSize: 10,
                                fontFamily: "monospace",
                                minWidth: 36,
                                textAlign: "right",
                              }}
                            >
                              {pct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: "var(--t3)" }}>
            «План» — таргет публикаций на этот календарный месяц. По умолчанию = пакет клиента (если активен в этом месяце). Если не сходится с реальностью —
            кликните, отредактируйте, сохранится в <code>monthly_plans</code>.
          </div>
        </div>
      )}

      {/* Progress chart (all-time only) */}
      {isAllTime && (
        <div className="card mb-3">
          <div className="text-xs font-bold mb-3" style={{ color: "var(--t1)" }}>📊 Прогресс по клиентам (всё время)</div>
          {clients.map((c) => {
            const cScripts = allScripts.filter((s) => s.client_id === c.id);
            const cPub = cScripts.filter((s) => s.video_status === "published").length;
            const cReady = cScripts.filter((s) => s.video_status === "ready").length;
            const cEdit = cScripts.filter((s) => s.video_status === "inProgress" && s.script_status === "approved").length;
            const total = cScripts.length || 1;
            return (
              <div key={c.id} onClick={() => router.push(`/dashboard/clients/${c.id}`)} className="mb-2 cursor-pointer">
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-medium" style={{ color: "var(--t1)" }}>
                    {c.name} {c.surname}
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: "var(--t2)" }}>
                    {cPub}/{total}
                  </span>
                </div>
                <div className="flex h-2 rounded overflow-hidden" style={{ background: "var(--brd)" }}>
                  {cPub > 0 && <div style={{ width: `${(cPub / total) * 100}%`, background: "var(--gr)" }} />}
                  {cReady > 0 && <div style={{ width: `${(cReady / total) * 100}%`, background: "var(--cy)" }} />}
                  {cEdit > 0 && <div style={{ width: `${(cEdit / total) * 100}%`, background: "var(--or)" }} />}
                </div>
              </div>
            );
          })}
          <div className="flex gap-3 mt-2">
            {[
              { c: "var(--gr)", l: "Опубликовано" },
              { c: "var(--cy)", l: "Готово" },
              { c: "var(--or)", l: "Монтаж" },
            ].map((lg, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm" style={{ background: lg.c }} />
                <span className="text-[9px]" style={{ color: "var(--t3)" }}>{lg.l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Violations + Tasks (all-time only) */}
      {isAllTime && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-3">
          <div className="card" style={{ borderColor: violations.length > 0 ? "rgba(239,68,68,0.3)" : "var(--brd)" }}>
            <div className="flex items-center gap-1 mb-2">
              <span style={{ color: "var(--rd)" }}>⚠️</span>
              <span
                className="text-[11px] font-bold"
                style={{ color: violations.length > 0 ? "var(--rd)" : "var(--gr)" }}
              >
                {violations.length > 0 ? `НАРУШЕНИЯ СРОКОВ (${violations.length})` : "Всё по плану ✓"}
              </span>
            </div>
            {violations.slice(0, showAllViolations ? violations.length : 6).map((v, i) => (
              <div
                key={i}
                onClick={() => router.push(`/dashboard/clients/${v.cid}`)}
                className="flex items-center gap-1 py-1.5 px-2 rounded cursor-pointer text-xs"
                style={{
                  borderLeft: `3px solid ${v.severity === "high" ? "var(--rd)" : "var(--or)"}`,
                  marginBottom: 2,
                }}
              >
                <span className="font-semibold" style={{ color: "var(--t1)" }}>{v.client}</span>
                <span style={{ color: "var(--t2)", flex: 1 }}>— {v.msg}</span>
                <span
                  className="badge"
                  style={{
                    background: v.severity === "high" ? "rgba(239,68,68,0.15)" : "rgba(249,115,22,0.15)",
                    color: v.severity === "high" ? "var(--rd)" : "var(--or)",
                    padding: "3px 8px",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {v.severity === "high" ? `-${v.days}д` : `⚠ ${v.days}`}
                </span>
              </div>
            ))}
            {violations.length > 6 && (
              <button
                onClick={() => setShowAllViolations(!showAllViolations)}
                style={{
                  marginTop: 6,
                  border: "none",
                  background: "transparent",
                  color: "var(--cy)",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {showAllViolations ? "Свернуть ↑" : `Показать все ${violations.length} →`}
              </button>
            )}
          </div>
          <div className="card">
            <div className="text-[11px] font-bold mb-2" style={{ color: "var(--t1)" }}>📋 ЗАДАЧИ ({overdueTasks.length})</div>
            {overdueTasks.slice(0, 5).map((t: any, i: number) => (
              <div
                key={i}
                onClick={() => router.push(`/dashboard/clients/${t.client_id}`)}
                className="flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer text-xs"
                style={{ borderLeft: "3px solid var(--or)" }}
              >
                <div style={{ flex: 1 }}>
                  <div className="font-semibold" style={{ color: "var(--t1)" }}>{t.client?.name}</div>
                  <div style={{ color: "var(--t2)", fontSize: 9 }}>{t.task_name}</div>
                </div>
                <span className="badge" style={{ background: "rgba(239,68,68,0.15)", color: "var(--rd)" }}>
                  {t.deadline
                    ? `-${Math.round((today.getTime() - new Date(t.deadline).getTime()) / 86400000)}д`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Client cards (all-time only) */}
      {isAllTime && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {clients.map((c) => {
            const cScripts = allScripts.filter((s) => s.client_id === c.id);
            const pub = cScripts.filter((s) => s.video_status === "published").length;
            const scr = cScripts.filter((s) => s.script_status === "approved").length;
            return (
              <div
                key={c.id}
                onClick={() => router.push(`/dashboard/clients/${c.id}`)}
                className="card cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: "var(--pud)", color: "var(--pu)" }}
                  >
                    {c.name[0]}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold" style={{ color: "var(--t1)" }}>
                      {c.name} {c.surname}
                    </div>
                    <div className="text-[9px]" style={{ color: "var(--t2)" }}>{c.niche}</div>
                  </div>
                  <span className="badge" style={{ background: "var(--pud)", color: "var(--pu)" }}>
                    {c.stage}
                  </span>
                </div>
                <div className="flex gap-1">
                  {[
                    { v: `${pub}/${cScripts.length}`, l: "Рол." },
                    { v: `${scr}/${cScripts.length}`, l: "Сц." },
                  ].map((s, i) => (
                    <div
                      key={i}
                      className="flex-1 py-1 rounded text-center"
                      style={{ background: "var(--bg2)" }}
                    >
                      <div className="text-xs font-bold font-mono" style={{ color: "var(--cy)" }}>
                        {s.v}
                      </div>
                      <div className="text-[7px]" style={{ color: "var(--t3)" }}>
                        {s.l}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
