"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, ClientMonth } from "@/lib/database";

const RU_MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function ymLabel(ym: string): string {
  const parts = ym.split("-");
  const y = parseInt(parts[0] || "0", 10);
  const m = parseInt(parts[1] || "0", 10);
  if (!y || !m || m < 1 || m > 12) return ym;
  return `${RU_MONTHS[m - 1]} ${y}`;
}
function ymOfDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function ymShift(ym: string, monthsDelta: number): string {
  const parts = ym.split("-");
  const y = parseInt(parts[0] || "0", 10);
  const m = parseInt(parts[1] || "0", 10);
  if (!y || !m) return ym;
  return ymOfDate(new Date(y, m - 1 + monthsDelta, 1));
}
function ymRange(ym: string): { start: string; end: string } {
  const parts = ym.split("-");
  const y = parseInt(parts[0] || "0", 10);
  const m = parseInt(parts[1] || "0", 10);
  if (!y || !m || m < 1 || m > 12) {
    return { start: "1900-01-01", end: "2999-12-31" };
  }
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const parts = String(s).slice(0, 10).split("-");
  if (parts.length < 3) return String(s);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (!m || !d || m < 1 || m > 12) return String(s);
  return `${d} ${RU_MONTHS[m - 1]}`;
}
function daysBetween(a: string, b: string): number {
  try {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
  } catch {
    return 0;
  }
}
function addDaysIso(s: string, days: number): string {
  const d = new Date(s);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function firstPublishedDate(scripts: Script[], clientId: number, monthNumber: number): string | null {
  const dates = scripts
    .filter((s) => s.client_id === clientId && s.month_number === monthNumber && s.video_status === "published" && typeof s.pub_date === "string")
    .map((s) => s.pub_date as string)
    .sort();
  return dates[0] || null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; info: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    this.setState({ error, info: info?.componentStack || null });
    // eslint-disable-next-line no-console
    console.error("[Dashboard ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#f87171", fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            Dashboard error — please screenshot and send back:
          </div>
          <div style={{ marginBottom: 8 }}>{String(this.state.error.message || this.state.error)}</div>
          <div style={{ opacity: 0.7 }}>{this.state.error.stack || ""}</div>
          {this.state.info && (
            <div style={{ marginTop: 12, opacity: 0.5 }}>
              <div>Component stack:</div>
              <div>{this.state.info}</div>
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

function DashboardInner() {
  const [clients, setClients] = useState<Client[]>([]);
  const [allScripts, setAllScripts] = useState<Script[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<any[]>([]);
  const [clientMonths, setClientMonths] = useState<ClientMonth[]>([]);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAllViolations, setShowAllViolations] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [editingPlanValue, setEditingPlanValue] = useState<string>("");
  const [savingPlanId, setSavingPlanId] = useState<number | null>(null);
  const [openNewFor, setOpenNewFor] = useState<{ clientId: number; nextN: number; defaultStart: string; defaultPkg: number } | null>(null);
  const [openNewForm, setOpenNewForm] = useState<{ start_date: string; end_date: string; pkg: string }>({
    start_date: "",
    end_date: "",
    pkg: "30",
  });
  const router = useRouter();
  const supabase = createClient();
  const today = new Date();
  const todayStr = today.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const currentYM = ymOfDate(today);
  const todayIso = today.toISOString().slice(0, 10);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYM);

  useEffect(() => {
    (async () => {
      try {
        const [cls, tasks, cmResult] = await Promise.all([
          db.getClients(supabase),
          db.getAllOverdueTasks(supabase),
          db.getClientMonths(supabase),
        ]);
        setClients(cls || []);
        setOverdueTasks(tasks || []);
        setClientMonths(cmResult?.data || []);
        setMigrationMissing(!!cmResult?.missing);
        const scripts = await db.getScriptsForClients(supabase, (cls || []).map((c) => c.id));
        setAllScripts(scripts);
      } catch (e: any) {
        setLoadError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthsList = useMemo(() => {
    const months = new Set<string>();
    months.add(currentYM);
    months.add(ymShift(currentYM, 1));
    months.add(ymShift(currentYM, 2));
    for (const c of clients) {
      if (typeof c.start_date === "string" && c.start_date.length >= 7) {
        months.add(c.start_date.slice(0, 7));
      }
    }
    for (const cm of clientMonths) {
      if (typeof cm.start_date === "string" && cm.start_date.length >= 7) {
        months.add(cm.start_date.slice(0, 7));
      }
      if (typeof cm.end_date === "string" && cm.end_date.length >= 7) {
        months.add(cm.end_date.slice(0, 7));
      }
    }
    return Array.from(months).filter((s) => /^\d{4}-\d{2}$/.test(s)).sort();
  }, [clients, clientMonths, currentYM]);

  if (loading) return <div style={{ color: "var(--t2)", padding: 40, textAlign: "center" }}>Загрузка...</div>;
  if (loadError) {
    return (
      <div style={{ padding: 24, color: "#f87171", fontFamily: "monospace", fontSize: 12 }}>
        Load error: {loadError}
      </div>
    );
  }

  const isAllTime = selectedMonth === "all";

  const monthsForClient = (clientId: number): ClientMonth[] =>
    clientMonths.filter((cm) => cm.client_id === clientId).sort((a, b) => a.month_number - b.month_number);

  const shouldCountMonth = (m: ClientMonth) => m.status === "active" || m.status === "closed";
  const onboardingRows = clientMonths
    .filter((m) => m.status === "onboarding")
    .map((m) => ({ m, client: clients.find((c) => c.id === m.client_id) }))
    .filter((x) => !!x.client)
    .sort((a, b) => a.m.start_date.localeCompare(b.m.start_date));

  const activeMonthFor = (clientId: number, ym: string): ClientMonth | null => {
    if (ym === "all") return null;
    const { start, end } = ymRange(ym);
    const list = monthsForClient(clientId);
    if (list.length === 0) return null;
    const overlapping = list.filter(
      (m) => shouldCountMonth(m) && typeof m.start_date === "string" && typeof m.end_date === "string" && m.start_date <= end && m.end_date >= start
    );
    if (overlapping.length > 0) {
      return overlapping.find((m) => m.status === "active") || overlapping[overlapping.length - 1];
    }
    if (ym >= currentYM) {
      const overdue = list
        .filter((m) => m.status === "active" && typeof m.end_date === "string" && m.end_date < start)
        .sort((a, b) => b.month_number - a.month_number)[0];
      if (overdue) return overdue;
    }
    return null;
  };

  async function savePlan(cmId: number, newPkg: number) {
    setSavingPlanId(cmId);
    const { error } = await db.updateClientMonth(supabase, cmId, { package: newPkg });
    if (error) {
      alert(`Не удалось сохранить план: ${error.message || error}`);
    } else {
      const cmResult = await db.getClientMonths(supabase);
      setClientMonths(cmResult?.data || []);
    }
    setSavingPlanId(null);
    setEditingPlanId(null);
  }

  async function closeMonth(cmId: number) {
    const current = clientMonths.find((m) => m.id === cmId);
    const { error } = await db.closeClientMonth(supabase, cmId);
    if (error) {
      alert(`Ошибка: ${error.message || error}`);
      return;
    }
    if (current) {
      const next = clientMonths.find((m) => m.client_id === current.client_id && m.month_number === current.month_number + 1 && m.status === "planned");
      if (next) {
        const start = addDaysIso(todayIso, 1);
        const end = addDaysIso(start, 30);
        const { error: nextErr } = await db.updateClientMonth(supabase, next.id, {
          status: "active",
          start_date: start,
          end_date: end,
          calendar_split: null,
        });
        if (nextErr) alert(`Месяц закрыт, но не удалось активировать следующий: ${nextErr.message || nextErr}`);
      }
    }
    const cmResult = await db.getClientMonths(supabase);
    setClientMonths(cmResult?.data || []);
  }

  async function startProduction(cm: ClientMonth, client: Client) {
    const firstPub = firstPublishedDate(allScripts, client.id, cm.month_number);
    const start = firstPub || todayIso;
    const end = addDaysIso(start, 30);
    const { error } = await db.updateClientMonth(supabase, cm.id, {
      status: "active",
      start_date: start,
      end_date: end,
      calendar_split: null,
    });
    if (error) {
      alert(`Не удалось запустить производство: ${error.message || error}`);
      return;
    }
    await db.updateClient(supabase, client.id, { first_pub_date: start } as Partial<Client>);
    const cmResult = await db.getClientMonths(supabase);
    setClientMonths(cmResult?.data || []);
    const cls = await db.getClients(supabase);
    setClients(cls || []);
  }

  async function reopenMonth(cmId: number) {
    if (!confirm("Снова открыть этот месяц (status='active')?")) return;
    const current = clientMonths.find((m) => m.id === cmId);
    const { error } = await db.reopenClientMonth(supabase, cmId);
    if (error) {
      alert(`Ошибка: ${error.message || error}`);
      return;
    }
    if (current) {
      const next = clientMonths.find((m) => m.client_id === current.client_id && m.month_number === current.month_number + 1 && m.status === "active");
      if (next) {
        const { error: nextErr } = await db.updateClientMonth(supabase, next.id, { status: "planned" });
        if (nextErr) alert(`Месяц открыт, но не удалось вернуть следующий в planned: ${nextErr.message || nextErr}`);
      }
    }
    const cmResult = await db.getClientMonths(supabase);
    setClientMonths(cmResult?.data || []);
  }

  async function createNextMonth() {
    if (!openNewFor) return;
    const start = openNewForm.start_date || openNewFor.defaultStart;
    let end = openNewForm.end_date;
    if (!end) {
      const d = new Date(start);
      d.setDate(d.getDate() + 30);
      end = d.toISOString().slice(0, 10);
    }
    const pkg = parseInt(openNewForm.pkg, 10) || openNewFor.defaultPkg;
    const prevMonth = clientMonths.find((m) => m.client_id === openNewFor.clientId && m.month_number === openNewFor.nextN - 1);
    const status: ClientMonth["status"] = prevMonth && prevMonth.status !== "closed" ? "planned" : "active";
    const { error } = await db.upsertClientMonth(supabase, {
      client_id: openNewFor.clientId,
      month_number: openNewFor.nextN,
      start_date: start,
      end_date: end,
      package: pkg,
      status,
    } as any);
    if (error) {
      alert(`Не удалось создать месяц: ${error.message || error}`);
      return;
    }
    // Also create the N empty scripts so the client page (and tim leads) see them.
    const { error: scriptsErr } = await db.addScriptsForMonth(supabase, openNewFor.clientId, openNewFor.nextN, pkg);
    if (scriptsErr) {
      alert(`М создан, но не удалось создать ${pkg} скриптов: ${scriptsErr.message || scriptsErr}`);
    }
    const cmResult = await db.getClientMonths(supabase);
    setClientMonths(cmResult?.data || []);
    // Refresh scripts so card totals update
    const scripts = await db.getScriptsForClients(supabase, clients.map((c) => c.id));
    setAllScripts(scripts);
    setOpenNewFor(null);
  }

  function targetForCalendarMonth(cm: ClientMonth, ym: string): number {
    if (cm.calendar_split && cm.calendar_split[ym] !== undefined && cm.calendar_split[ym] !== null) {
      return cm.calendar_split[ym];
    }
    const { start: monthStart, end: monthEnd } = ymRange(ym);
    const cStart = cm.start_date;
    const cEnd = cm.end_date;
    const overlapStart = monthStart > cStart ? monthStart : cStart;
    const overlapEnd = monthEnd < cEnd ? monthEnd : cEnd;
    if (overlapStart > overlapEnd) return 0;
    const overlapDays = daysBetween(overlapStart, overlapEnd) + 1;
    const totalDays = Math.max(1, daysBetween(cStart, cEnd) + 1);
    const pkg = cm.package || 0;
    return Math.round((pkg * overlapDays) / totalDays);
  }

  function expectedByToday(cm: ClientMonth, ym: string): { pub: number; made: number } {
    const target = targetForCalendarMonth(cm, ym);
    if (target === 0) return { pub: 0, made: 0 };
    const { start: monthStart, end: monthEnd } = ymRange(ym);
    const overlapStart = monthStart > cm.start_date ? monthStart : cm.start_date;
    const overlapEnd = monthEnd < cm.end_date ? monthEnd : cm.end_date;
    if (overlapStart > overlapEnd) return { pub: 0, made: 0 };
    const totalDays = daysBetween(overlapStart, overlapEnd) + 1;
    const todayClamped = todayIso > overlapEnd ? overlapEnd : todayIso < overlapStart ? overlapStart : todayIso;
    const daysElapsed = daysBetween(overlapStart, todayClamped) + 1;
    const expPub = Math.round((target * daysElapsed) / totalDays);
    const expMade = Math.min(target, expPub + 3);
    return { pub: expPub, made: expMade };
  }

  function publishedInCalendarMonth(clientId: number, monthNumber: number, ym: string): number {
    const { start, end } = ymRange(ym);
    return allScripts.filter(
      (s) =>
        s.client_id === clientId &&
        s.month_number === monthNumber &&
        s.video_status === "published" &&
        typeof s.pub_date === "string" &&
        s.pub_date >= start &&
        s.pub_date <= end
    ).length;
  }

  function madeInCalendarMonth(clientId: number, monthNumber: number, ym: string): number {
    const { start, end } = ymRange(ym);
    return allScripts.filter(
      (s) => {
        if (s.client_id !== clientId || s.month_number !== monthNumber) return false;
        if (s.video_status === "ready" || s.video_status === "published") {
          const madeAt = typeof s.ready_at === "string" ? s.ready_at : s.pub_date;
          return typeof madeAt === "string" && madeAt >= start && madeAt <= end;
        }
        return false;
      }
    ).length;
  }

  async function saveCalendarTarget(cmId: number, ym: string, newTarget: number) {
    setSavingPlanId(cmId);
    const cm = clientMonths.find((m) => m.id === cmId);
    if (!cm) {
      setSavingPlanId(null);
      return;
    }
    const split = { ...(cm.calendar_split || {}), [ym]: newTarget };
    const { error } = await db.updateClientMonth(supabase, cmId, { calendar_split: split });
    if (error) {
      alert(`Не удалось сохранить target: ${error.message || error}`);
    } else {
      const cmResult = await db.getClientMonths(supabase);
      setClientMonths(cmResult?.data || []);
    }
    setSavingPlanId(null);
    setEditingPlanId(null);
  }

  const publishedForMonth = (clientId: number, monthNumber: number): number =>
    allScripts.filter((s) => s.client_id === clientId && s.month_number === monthNumber && s.video_status === "published").length;
  const readyForMonth = (clientId: number, monthNumber: number): number =>
    allScripts.filter((s) => s.client_id === clientId && s.month_number === monthNumber && s.video_status === "ready").length;
  const inMontageForMonth = (clientId: number, monthNumber: number): number =>
    allScripts.filter(
      (s) => s.client_id === clientId && s.month_number === monthNumber && s.video_status === "inProgress" && s.script_status === "approved"
    ).length;

  const rowsForMonth: { client: Client; month: ClientMonth }[] = [];
  if (!isAllTime) {
    const { start, end } = ymRange(selectedMonth);
    for (const c of clients) {
      const list = monthsForClient(c.id);
      const overlapping = list.filter(
        (m) =>
          shouldCountMonth(m) &&
          typeof m.start_date === "string" &&
          typeof m.end_date === "string" &&
          m.start_date <= end &&
          m.end_date >= start
      );
      if (overlapping.length > 0) {
        for (const m of overlapping) rowsForMonth.push({ client: c, month: m });
      } else if (selectedMonth >= currentYM) {
        // Overdue active fallback — show on current/future tabs if their last active month already passed
        const overdue = list
          .filter((m) => m.status === "active" && typeof m.end_date === "string" && m.end_date < start)
          .sort((a, b) => b.month_number - a.month_number)[0];
        if (overdue) rowsForMonth.push({ client: c, month: overdue });
      }
    }
    rowsForMonth.sort((a, b) => a.client.id - b.client.id || a.month.month_number - b.month.month_number);
  }

  let kpiClients: number;
  let kpiClientsTag: string;
  let kpiTotalPlan: number;
  let kpiTotalPub: number;
  let kpiInMontage: number;
  let kpiReady: number;
  const kpiScriptApproved = allScripts.filter((s) => s.script_status === "approved").length;
  if (isAllTime) {
    kpiClients = clients.length;
    kpiClientsTag = `${clients.filter((c) => c.stage === "Производство").length} в производстве`;
    kpiTotalPlan = allScripts.length;
    kpiTotalPub = allScripts.filter((s) => s.video_status === "published").length;
    kpiInMontage = allScripts.filter((s) => s.video_status === "inProgress" && s.script_status === "approved").length;
    kpiReady = allScripts.filter((s) => s.video_status === "ready").length;
  } else {
    kpiClients = rowsForMonth.length;
    kpiClientsTag = `в работе в ${ymLabel(selectedMonth)}`;
    kpiTotalPlan = rowsForMonth.reduce((s, r) => s + targetForCalendarMonth(r.month, selectedMonth), 0);
    kpiTotalPub = rowsForMonth.reduce((s, r) => s + publishedInCalendarMonth(r.client.id, r.month.month_number, selectedMonth), 0);
    kpiInMontage = rowsForMonth.reduce((s, r) => s + inMontageForMonth(r.client.id, r.month.month_number), 0);
    kpiReady = rowsForMonth.reduce((s, r) => s + readyForMonth(r.client.id, r.month.month_number), 0);
  }
  const kpiMadeMonth = isAllTime
    ? allScripts.filter((s) => s.video_status === "ready" || s.video_status === "published").length
    : rowsForMonth.reduce((s, r) => s + madeInCalendarMonth(r.client.id, r.month.month_number, selectedMonth), 0);
  const vidGap = Math.max(0, kpiTotalPlan - kpiTotalPub);

  const stats = [
    {
      icon: "👥",
      l: "КЛИЕНТОВ",
      val: kpiClients,
      tag: kpiClientsTag,
      tagColor: "var(--cy)",
      ck: () => router.push("/dashboard/clients"),
    },
    {
      icon: "🎯",
      l: isAllTime ? "ВСЕГО ВИДЕО" : `НА ${ymLabel(selectedMonth).split(" ")[0].toUpperCase()}`,
      val: kpiTotalPlan,
      tag: "Таргет",
      tagColor: "var(--cy)",
      ck: () => {},
    },
    {
      icon: "🎬",
      l: "СДЕЛАНО",
      val: kpiMadeMonth,
      valSub: `/ ${kpiTotalPlan}`,
      tag: kpiTotalPlan > 0 && kpiMadeMonth >= kpiTotalPlan ? "✓ Цель" : "В работе",
      tagColor: kpiTotalPlan > 0 && kpiMadeMonth >= kpiTotalPlan ? "var(--gr)" : "var(--or)",
      bar: true,
      barPct: kpiTotalPlan > 0 ? Math.min(100, (kpiMadeMonth / kpiTotalPlan) * 100) : 0,
      barColor: "var(--cy)",
      ck: () => {},
    },
    {
      icon: "🎞",
      l: "В МОНТАЖЕ",
      val: kpiInMontage,
      valSub: `+ ${kpiReady} готовых`,
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
      tag: vidGap > 0 ? `Отстаём ${vidGap}` : "✓ В норме",
      tagColor: vidGap > 0 ? "var(--rd)" : "var(--gr)",
      bar: true,
      barPct: kpiTotalPlan > 0 ? (kpiTotalPub / kpiTotalPlan) * 100 : 0,
      barColor: vidGap > 0 ? "var(--rd)" : "var(--gr)",
      ck: () => {},
    },
  ];

  const violations: { client: string; msg: string; days: number; cid: number; severity: string }[] = [];
  if (isAllTime) {
    for (const c of clients) {
      const cScripts = allScripts.filter((s) => s.client_id === c.id);
      const cPub = cScripts.filter((s) => s.video_status === "published").length;
      const cReady = cScripts.filter((s) => s.video_status === "ready").length;
      const cScrApp = cScripts.filter((s) => s.script_status === "approved").length;
      const scrBuffer = cScrApp - cPub;
      if (c.first_pub_date) {
        const daysSinceFirst = Math.round((today.getTime() - new Date(c.first_pub_date).getTime()) / 86400000);
        if (daysSinceFirst >= 0) {
          const expectedByNow = Math.min(daysSinceFirst + 1, c.package || 0);
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
      if (c.scripts_deadline && scrBuffer < 5 && cPub < (c.package || 0)) {
        violations.push({
          client: c.name,
          msg: `Запас сценариев: ${scrBuffer} (мин. 5)`,
          days: 5 - scrBuffer,
          cid: c.id,
          severity: scrBuffer < 0 ? "high" : "med",
        });
      }
      if (c.videos_deadline && cReady < 3 && cPub < (c.package || 0)) {
        violations.push({
          client: c.name,
          msg: `Запас роликов: ${cReady} готовых (мин. 3)`,
          days: 3 - cReady,
          cid: c.id,
          severity: cReady === 0 ? "high" : "med",
        });
      }
    }
    violations.sort((a, b) => b.days - a.days);
  }

  const tabs = [
    { value: "all", label: "Все время" },
    ...monthsList.map((ym) => ({ value: ym, label: ymLabel(ym) + (ym === currentYM ? " (сейчас)" : "") })),
  ];

  // Contracts ending within next 7 days (or already overdue but still active) — for the decision widget.
  // Hide a row if the same client already has a later contractual month (decision was made: renewed).
  const hasLaterMonth = (clientId: number, monthNumber: number) =>
    clientMonths.some((other) => other.client_id === clientId && other.month_number > monthNumber);
  const endingSoon = clientMonths
    .filter((m) => m.status === "active" && typeof m.end_date === "string")
    .filter((m) => !hasLaterMonth(m.client_id, m.month_number))
    .map((m) => ({ m, days: daysBetween(todayIso, m.end_date), client: clients.find((c) => c.id === m.client_id) }))
    .filter((x) => x.days <= 7 && !!x.client)
    .sort((a, b) => a.days - b.days);
  const plannedRenewals = clientMonths
    .filter((m) => m.status === "planned")
    .map((m) => ({ m, client: clients.find((c) => c.id === m.client_id), prev: clientMonths.find((p) => p.client_id === m.client_id && p.month_number === m.month_number - 1) }))
    .filter((x) => !!x.client)
    .sort((a, b) => a.m.end_date.localeCompare(b.m.end_date));

  return (
    <div>
      {migrationMissing && (
        <div
          className="card mb-3"
          style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.4)", color: "var(--t1)" }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Таблица client_months ещё не создана</div>
          <div style={{ fontSize: 12, color: "var(--t2)" }}>
            Запустите <code>MIGRATION_2026-05-12_monthly_plans.sql</code> в Supabase SQL Editor.
          </div>
        </div>
      )}

      <div className="card mb-3 flex justify-between items-start">
        <div>
          <h1 className="text-lg font-extrabold" style={{ color: "var(--t1)" }}>Главный дашборд</h1>
          <p className="text-xs mt-1" style={{ color: "var(--t2)" }}>
            {isAllTime ? "Все клиенты — общая картина" : `Состояние за ${ymLabel(selectedMonth)}`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-semibold tracking-wider" style={{ color: "var(--cy)" }}>СЕГОДНЯ</div>
          <div className="text-sm font-bold" style={{ color: "var(--t1)" }}>{todayStr}</div>
        </div>
      </div>

      <div className="card mb-3" style={{ overflowX: "auto", padding: "8px 12px" }}>
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

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-3">
        {stats.map((s, i) => (
          <div key={i} onClick={s.ck} className="card cursor-pointer">
            <div className="flex justify-between items-center mb-2">
              <span className="text-base">{s.icon}</span>
              <span className="text-[9px] font-semibold" style={{ color: s.tagColor }}>{s.tag}</span>
            </div>
            <div className="text-[9px] font-semibold tracking-wider" style={{ color: "var(--t2)" }}>{s.l}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold font-mono" style={{ color: "var(--t1)" }}>{s.val}</span>
              {(s as any).valSub && <span className="text-xs" style={{ color: "var(--t3)" }}>{(s as any).valSub}</span>}
            </div>
            {(s as any).bar && (
              <div className="h-1.5 rounded-full mt-2" style={{ background: "var(--brd)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${(s as any).barPct}%`, background: (s as any).barColor }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {endingSoon.length > 0 && (
        <div
          className="card mb-3"
          style={{
            background: "rgba(245,166,35,0.05)",
            border: "1px solid rgba(245,166,35,0.4)",
          }}
        >
          <div className="text-xs font-bold mb-3" style={{ color: "var(--or)" }}>
            ⏰ Заканчиваются в ближайшие 7 дней — решите по продлению ({endingSoon.length})
          </div>
          {endingSoon.map(({ m, days, client }) => {
            const cn = `${client!.name} ${client!.surname || ""}`.trim();
            const dayLabel =
              days < 0
                ? `🔴 просрочка ${-days}д`
                : days === 0
                ? "🔴 СЕГОДНЯ"
                : days <= 2
                ? `🔴 через ${days}д`
                : days <= 5
                ? `⏰ через ${days}д`
                : `через ${days}д`;
            const dayColor = days < 0 ? "var(--rd)" : days <= 2 ? "var(--rd)" : days <= 5 ? "var(--or)" : "var(--t2)";
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 4px",
                  borderTop: "1px solid var(--brd)",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "var(--t1)", fontWeight: 600, flex: 1, cursor: "pointer" }} onClick={() => router.push(`/dashboard/clients/${client!.id}`)}>
                  {cn}
                </span>
                <span style={{ color: "var(--cy)", fontWeight: 700, minWidth: 36 }}>М{m.month_number}</span>
                <span style={{ color: "var(--t2)", minWidth: 90 }}>{fmtDate(m.end_date)}</span>
                <span style={{ color: dayColor, fontWeight: 700, minWidth: 110, textAlign: "left" }}>{dayLabel}</span>
                <button
                  onClick={() => {
                    const defaultStart = m.end_date;
                    const d = new Date(defaultStart);
                    d.setDate(d.getDate() + 1);
                    setOpenNewFor({
                      clientId: client!.id,
                      nextN: m.month_number + 1,
                      defaultStart: d.toISOString().slice(0, 10),
                      defaultPkg: m.package,
                    });
                    const endDefault = new Date(d);
                    endDefault.setDate(endDefault.getDate() + 30);
                    setOpenNewForm({
                      start_date: d.toISOString().slice(0, 10),
                      end_date: endDefault.toISOString().slice(0, 10),
                      pkg: String(m.package),
                    });
                  }}
                  style={{
                    border: "1px solid var(--cy)",
                    background: "rgba(34,211,238,0.1)",
                    color: "var(--cy)",
                    padding: "4px 10px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + М{m.month_number + 1} продлить
                </button>
                <button
                  onClick={() => closeMonth(m.id)}
                  style={{
                    border: "1px solid var(--gr)",
                    background: "rgba(62,207,142,0.1)",
                    color: "var(--gr)",
                    padding: "4px 10px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ✓ Закрыть
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!isAllTime && onboardingRows.length > 0 && (
        <div
          className="card mb-3"
          style={{
            background: "rgba(91,141,239,0.06)",
            border: "1px solid rgba(91,141,239,0.35)",
          }}
        >
          <div className="text-xs font-bold mb-3" style={{ color: "var(--cy)" }}>
            🧩 Онбординг — подготовка до первой публикации ({onboardingRows.length})
          </div>
          {onboardingRows.map(({ m, client }) => {
            const c = client!;
            const ideal = addDaysIso(c.start_date || m.start_date, 10);
            const hard = addDaysIso(c.start_date || m.start_date, 15);
            const hardDays = daysBetween(todayIso, hard);
            const cScripts = allScripts.filter((s) => s.client_id === c.id && s.month_number === m.month_number);
            const approved = cScripts.filter((s) => s.script_status === "approved").length;
            const ready = cScripts.filter((s) => s.video_status === "ready").length;
            const published = cScripts.filter((s) => s.video_status === "published").length;
            const firstPub = firstPublishedDate(allScripts, c.id, m.month_number);
            const statusText =
              hardDays < 0
                ? `🔴 просрочка ${-hardDays}д`
                : hardDays === 0
                ? "🔴 крайний день"
                : hardDays <= 3
                ? `⏰ осталось ${hardDays}д`
                : `осталось ${hardDays}д`;
            const statusColor = hardDays <= 0 ? "var(--rd)" : hardDays <= 3 ? "var(--or)" : "var(--t2)";
            return (
              <div
                key={m.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px,1.2fr) minmax(210px,1.4fr) minmax(150px,1fr) auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "9px 4px",
                  borderTop: "1px solid var(--brd)",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "var(--t1)", fontWeight: 700, cursor: "pointer" }} onClick={() => router.push(`/dashboard/clients/${c.id}`)}>
                  {c.name} {c.surname || ""}
                </span>
                <span style={{ color: "var(--t2)" }}>
                  первая публикация: <b style={{ color: "var(--t1)" }}>{fmtDate(ideal)}</b> / край <b style={{ color: "var(--t1)" }}>{fmtDate(hard)}</b>
                  <span style={{ marginLeft: 8, color: statusColor, fontWeight: 700 }}>{statusText}</span>
                </span>
                <span style={{ color: "var(--t2)" }}>
                  сценарии {approved} · ready {ready} · published {published}
                </span>
                <button
                  onClick={() => startProduction(m, c)}
                  disabled={!firstPub && published === 0}
                  title={firstPub || published > 0 ? "Начать производственный месяц с даты первой публикации" : "Сначала отметьте первую публикацию и дату pub_date"}
                  style={{
                    border: "1px solid " + (firstPub || published > 0 ? "var(--cy)" : "var(--brd)"),
                    background: firstPub || published > 0 ? "rgba(34,211,238,0.1)" : "transparent",
                    color: firstPub || published > 0 ? "var(--cy)" : "var(--t3)",
                    padding: "4px 10px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: firstPub || published > 0 ? "pointer" : "not-allowed",
                  }}
                >
                  ▶ В производство
                </button>
              </div>
            );
          })}
          <div style={{ marginTop: 10, fontSize: 10, color: "var(--t3)" }}>
            Онбординг не попадает в план публикаций. План 1 публикация в день начнётся только после запуска производства.
          </div>
        </div>
      )}

      {plannedRenewals.length > 0 && (
        <div
          className="card mb-3"
          style={{
            background: "rgba(124,92,252,0.06)",
            border: "1px solid rgba(124,92,252,0.35)",
          }}
        >
          <div className="text-xs font-bold mb-3" style={{ color: "var(--pu, #a78bfa)" }}>
            🕓 Запланированные продления — начнутся после закрытия прошлого месяца ({plannedRenewals.length})
          </div>
          {plannedRenewals.map(({ m, client, prev }) => {
            const cn = `${client!.name} ${client!.surname || ""}`.trim();
            const prevPub = prev ? publishedForMonth(client!.id, prev.month_number) : 0;
            const prevLeft = prev ? Math.max(0, (prev.package || 0) - prevPub) : 0;
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 4px",
                  borderTop: "1px solid var(--brd)",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "var(--t1)", fontWeight: 600, flex: 1, cursor: "pointer" }} onClick={() => router.push(`/dashboard/clients/${client!.id}`)}>
                  {cn}
                </span>
                <span style={{ color: "var(--cy)", fontWeight: 700, minWidth: 36 }}>М{m.month_number}</span>
                <span style={{ color: "var(--t2)", flex: 1 }}>
                  ждёт закрытия М{m.month_number - 1}
                  {prev ? ` · осталось ${prevLeft} из ${prev.package}` : ""}
                </span>
                <span style={{ color: "var(--t3)" }}>пакет {m.package}</span>
              </div>
            );
          })}
        </div>
      )}

      {!isAllTime && (
        <div className="card mb-3">
          <div className="text-xs font-bold mb-3" style={{ color: "var(--t1)" }}>
            📅 Контрактные месяцы, активные в {ymLabel(selectedMonth)}
          </div>
          {rowsForMonth.length === 0 ? (
            <div style={{ padding: 12, color: "var(--t2)", fontSize: 12 }}>
              Нет активных контрактных месяцев в этом периоде.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "var(--t2)", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>Клиент</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>Тимлид</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Пакет</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>М-№</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>Период</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>
                      На {ymLabel(selectedMonth).split(" ")[0]}
                    </th>
                    <th
                      style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}
                      title="По темпу: сколько опубл/готов должно быть к сегодня"
                    >
                      К сегодня
                    </th>
                    <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>
                      Готово в {ymLabel(selectedMonth).split(" ")[0]}
                    </th>
                    <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>
                      Опубл. в {ymLabel(selectedMonth).split(" ")[0]}
                    </th>
                    <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Буфер</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Осталось</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Всего по M</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>Прогресс</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsForMonth.map(({ client: c, month: m }) => {
                    const pkg = m.package || 0;
                    const targetMonth = targetForCalendarMonth(m, selectedMonth);
                    const madeMonth = madeInCalendarMonth(c.id, m.month_number, selectedMonth);
                    const pubMonth = publishedInCalendarMonth(c.id, m.month_number, selectedMonth);
                    const buffer = madeMonth - pubMonth;
                    const remainingMonth = Math.max(0, targetMonth - madeMonth);
                    const totalPub = publishedForMonth(c.id, m.month_number);
                    const pct = targetMonth > 0 ? Math.min(100, Math.round((madeMonth / targetMonth) * 100)) : 0;
                    const daysLeft = m.end_date ? daysBetween(todayIso, m.end_date) : null;
                    const barColor =
                      pct >= 100 ? "var(--gr)" : pct >= 50 ? "var(--cy)" : pct > 0 ? "var(--or)" : "var(--rd)";
                    const isCustomTarget = !!(m.calendar_split && m.calendar_split[selectedMonth] !== undefined && m.calendar_split[selectedMonth] !== null);
                    let statusBadge: React.ReactNode = (
                      <span style={{ color: "var(--t2)" }}>{daysLeft !== null ? `${daysLeft}д` : ""}</span>
                    );
                    if (m.status === "closed") statusBadge = <span style={{ color: "var(--gr)", fontWeight: 700 }}>✅</span>;
                    else if (m.status === "onboarding") statusBadge = <span style={{ color: "var(--cy)", fontWeight: 700 }}>🧩 onboarding</span>;
                    else if (m.status === "planned") statusBadge = <span style={{ color: "var(--pu, #a78bfa)", fontWeight: 700 }}>🕓 planned</span>;
                    else if (m.status === "cancelled") statusBadge = <span style={{ color: "var(--t3)" }}>—</span>;
                    else if (daysLeft !== null && daysLeft < 0) statusBadge = <span style={{ color: "var(--rd)", fontWeight: 700 }}>🔴 просрочка {-daysLeft}д</span>;
                    else if (daysLeft !== null && daysLeft <= 5) statusBadge = <span style={{ color: "var(--or)", fontWeight: 700 }}>⏰ {daysLeft}д</span>;
                    return (
                      <tr key={m.id} style={{ borderTop: "1px solid var(--brd)" }}>
                        <td
                          style={{ padding: "8px", cursor: "pointer", color: "var(--t1)", fontWeight: 600 }}
                          onClick={() => router.push(`/dashboard/clients/${c.id}`)}
                        >
                          {c.name} {c.surname || ""}
                        </td>
                        <td style={{ padding: "8px", color: "var(--t2)" }}>{c.teamlead?.name || "—"}</td>
                        <td
                          style={{ padding: "8px", textAlign: "center" }}
                          title="Размер пакета этого контрактного месяца"
                        >
                          {editingPlanId === m.id && editingPlanValue.startsWith("pkg:") ? (
                            <input
                              type="number"
                              autoFocus
                              min={0}
                              max={999}
                              value={editingPlanValue.slice(4)}
                              onChange={(e) => setEditingPlanValue("pkg:" + e.target.value)}
                              onBlur={() => {
                                const n = parseInt(editingPlanValue.slice(4), 10);
                                if (!Number.isNaN(n) && n !== pkg) savePlan(m.id, n);
                                else setEditingPlanId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setEditingPlanId(null);
                              }}
                              style={{
                                width: 50,
                                padding: "2px 6px",
                                borderRadius: 4,
                                border: "1px solid var(--cy)",
                                background: "var(--bg2)",
                                color: "var(--t1)",
                                fontSize: 12,
                                textAlign: "center",
                              }}
                            />
                          ) : (
                            <span
                              onClick={() => {
                                setEditingPlanId(m.id);
                                setEditingPlanValue("pkg:" + String(pkg));
                              }}
                              style={{
                                cursor: "pointer",
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontWeight: 700,
                                color: "var(--t1)",
                                background: "var(--bg2)",
                              }}
                              title="Кликни — отредактируй пакет контрактного месяца"
                            >
                              {pkg}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center", color: "var(--cy)", fontWeight: 700 }}>М{m.month_number}</td>
                        <td style={{ padding: "8px", color: "var(--t2)" }}>
                          {fmtDate(m.start_date)} → {fmtDate(m.end_date)} <span style={{ marginLeft: 6 }}>{statusBadge}</span>
                        </td>
                        <td style={{ padding: "8px", textAlign: "center" }}>
                          {editingPlanId === m.id && editingPlanValue.startsWith("tgt:") ? (
                            <input
                              type="number"
                              autoFocus
                              min={0}
                              max={999}
                              value={editingPlanValue.slice(4)}
                              onChange={(e) => setEditingPlanValue("tgt:" + e.target.value)}
                              onBlur={() => {
                                const n = parseInt(editingPlanValue.slice(4), 10);
                                if (!Number.isNaN(n) && n !== targetMonth) saveCalendarTarget(m.id, selectedMonth, n);
                                else setEditingPlanId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setEditingPlanId(null);
                              }}
                              style={{
                                width: 50,
                                padding: "2px 6px",
                                borderRadius: 4,
                                border: "1px solid var(--cy)",
                                background: "var(--bg2)",
                                color: "var(--t1)",
                                fontSize: 12,
                                textAlign: "center",
                              }}
                            />
                          ) : savingPlanId === m.id ? (
                            <span style={{ color: "var(--t3)" }}>...</span>
                          ) : (
                            <span
                              onClick={() => {
                                setEditingPlanId(m.id);
                                setEditingPlanValue("tgt:" + String(targetMonth));
                              }}
                              style={{
                                cursor: "pointer",
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontWeight: 700,
                                color: "var(--t1)",
                                background: isCustomTarget ? "rgba(124,92,252,0.15)" : "var(--bg2)",
                                border: isCustomTarget ? "1px dashed var(--pu, #7c5cfc)" : "none",
                              }}
                              title={
                                isCustomTarget
                                  ? "Ручной override на этот календарный месяц. Кликни — измени."
                                  : "Авто: пропорционально дням контракта. Кликни — задай свой target."
                              }
                            >
                              {targetMonth}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center" }} title="По темпу: должно быть опубл / готов к сегодня">
                          {(() => {
                            const exp = expectedByToday(m, selectedMonth);
                            const pubLag = exp.pub - pubMonth;
                            const madeLag = exp.made - madeMonth;
                            const pubColor = pubLag <= 0 ? "var(--gr)" : pubLag <= 2 ? "var(--or)" : "var(--rd)";
                            const madeColor = madeLag <= 0 ? "var(--gr)" : madeLag <= 2 ? "var(--or)" : "var(--rd)";
                            return (
                              <span style={{ fontSize: 10, fontFamily: "monospace" }}>
                                <span style={{ color: pubColor, fontWeight: 700 }}>{exp.pub}</span>
                                <span style={{ color: "var(--t3)" }}>опубл / </span>
                                <span style={{ color: madeColor, fontWeight: 700 }}>{exp.made}</span>
                                <span style={{ color: "var(--t3)" }}>готов</span>
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center", color: "var(--cy)", fontWeight: 700 }}>{madeMonth}</td>
                        <td style={{ padding: "8px", textAlign: "center", color: "var(--gr)", fontWeight: 700 }}>{pubMonth}</td>
                        <td
                          style={{
                            padding: "8px",
                            textAlign: "center",
                            fontWeight: 700,
                            color: buffer >= 3 ? "var(--gr)" : buffer >= 1 ? "var(--or)" : "var(--rd)",
                          }}
                          title="Готово − Опубликовано. Минимум 3 — буфер тимлида"
                        >
                          {buffer >= 0 ? `+${buffer}` : buffer}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center", color: remainingMonth > 0 ? "var(--or)" : "var(--gr)" }}>{remainingMonth}</td>
                        <td style={{ padding: "8px", textAlign: "center", color: "var(--t2)", fontSize: 10 }}>{totalPub}/{pkg}</td>
                        <td style={{ padding: "8px", minWidth: 120 }}>
                          <div className="flex items-center gap-2">
                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--brd)", overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: barColor }} />
                            </div>
                            <span style={{ color: "var(--t2)", fontSize: 10, fontFamily: "monospace", minWidth: 36, textAlign: "right" }}>
                              {pct}%
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap" }}>
                          {m.status === "active" ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                closeMonth(m.id);
                              }}
                              style={{
                                border: "1px solid var(--gr)",
                                background: "rgba(62,207,142,0.1)",
                                color: "var(--gr)",
                                padding: "3px 8px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                              title="Закрыть месяц (status=closed)"
                            >
                              ✓ Закрыть
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                reopenMonth(m.id);
                              }}
                              style={{
                                border: "1px solid var(--t3)",
                                background: "transparent",
                                color: "var(--t2)",
                                padding: "3px 8px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                              title="Снова открыть (status=active)"
                            >
                              Открыть
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const defaultStart = m.end_date;
                              const d = new Date(defaultStart);
                              d.setDate(d.getDate() + 1);
                              setOpenNewFor({
                                clientId: c.id,
                                nextN: m.month_number + 1,
                                defaultStart: d.toISOString().slice(0, 10),
                                defaultPkg: pkg,
                              });
                              const endDefault = new Date(d);
                              endDefault.setDate(endDefault.getDate() + 30);
                              setOpenNewForm({
                                start_date: d.toISOString().slice(0, 10),
                                end_date: endDefault.toISOString().slice(0, 10),
                                pkg: String(pkg),
                              });
                            }}
                            style={{
                              marginLeft: 4,
                              border: "1px solid var(--brd)",
                              background: "transparent",
                              color: "var(--t2)",
                              padding: "3px 8px",
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                            title="Открыть следующий контрактный месяц для клиента"
                          >
                            + М{m.month_number + 1}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {rowsForMonth.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--brd)", color: "var(--t1)", fontWeight: 700 }}>
                      <td style={{ padding: "10px 8px" }} colSpan={5}>
                        ИТОГО за {ymLabel(selectedMonth)}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center", color: "var(--cy)" }}>
                        {rowsForMonth.reduce((s, r) => s + targetForCalendarMonth(r.month, selectedMonth), 0)}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center", fontSize: 10, fontFamily: "monospace", color: "var(--t2)" }}>
                        {(() => {
                          const sumPub = rowsForMonth.reduce((s, r) => s + expectedByToday(r.month, selectedMonth).pub, 0);
                          const sumMade = rowsForMonth.reduce((s, r) => s + expectedByToday(r.month, selectedMonth).made, 0);
                          return `${sumPub}/${sumMade}`;
                        })()}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center", color: "var(--cy)" }}>
                        {rowsForMonth.reduce((s, r) => s + madeInCalendarMonth(r.client.id, r.month.month_number, selectedMonth), 0)}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center", color: "var(--gr)" }}>
                        {rowsForMonth.reduce((s, r) => s + publishedInCalendarMonth(r.client.id, r.month.month_number, selectedMonth), 0)}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center", color: "var(--t2)" }}>
                        {(() => {
                          const totalMade = rowsForMonth.reduce((s, r) => s + madeInCalendarMonth(r.client.id, r.month.month_number, selectedMonth), 0);
                          const totalPubMonth = rowsForMonth.reduce((s, r) => s + publishedInCalendarMonth(r.client.id, r.month.month_number, selectedMonth), 0);
                          const buf = totalMade - totalPubMonth;
                          return buf >= 0 ? `+${buf}` : `${buf}`;
                        })()}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center", color: "var(--or)" }}>
                        {Math.max(
                          0,
                          rowsForMonth.reduce(
                            (s, r) =>
                              s +
                              Math.max(
                                0,
                                targetForCalendarMonth(r.month, selectedMonth) -
                                  madeInCalendarMonth(r.client.id, r.month.month_number, selectedMonth)
                              ),
                            0
                          )
                        )}
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 10, color: "var(--t3)" }}>
            «Пакет» — размер контрактного месяца. «На X» — таргет на этот календарный месяц (авто-пропорция, клик — override).
            <b>«Готово в X»</b> = ролики ready/published с ready_at в этом месяце, если ready_at пустой — fallback на pub_date.
            <b>«Опубл. в X»</b> = published с pub_date в этом месяце. <b>«Буфер»</b> = Готово − Опубл.; норма ≥ +3.
            «Осталось» = На X − Готово. «Всего по M» — итог published за весь контракт.
          </div>
        </div>
      )}

      {openNewFor && (
        <div
          onClick={() => setOpenNewFor(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ minWidth: 340, padding: 20 }}
          >
            <div style={{ fontWeight: 700, marginBottom: 14, color: "var(--t1)" }}>
              Открыть М{openNewFor.nextN} для клиента ID {openNewFor.clientId}
            </div>
            {(() => {
              const prev = clientMonths.find((m) => m.client_id === openNewFor.clientId && m.month_number === openNewFor.nextN - 1);
              if (!prev || prev.status === "closed") return null;
              return (
                <div
                  style={{
                    marginBottom: 12,
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "rgba(124,92,252,0.1)",
                    border: "1px solid rgba(124,92,252,0.35)",
                    color: "var(--t2)",
                    fontSize: 11,
                  }}
                >
                  М{openNewFor.nextN} будет создан как <b style={{ color: "var(--pu, #a78bfa)" }}>planned</b> и начнёт считаться только после закрытия М{openNewFor.nextN - 1}.
                </div>
              );
            })()}
            <label style={{ display: "block", marginBottom: 10, fontSize: 11, color: "var(--t2)" }}>
              Старт:
              <input
                type="date"
                value={openNewForm.start_date}
                onChange={(e) => setOpenNewForm({ ...openNewForm, start_date: e.target.value })}
                style={{
                  display: "block",
                  marginTop: 4,
                  width: "100%",
                  padding: "6px 10px",
                  background: "var(--bg2)",
                  color: "var(--t1)",
                  border: "1px solid var(--brd)",
                  borderRadius: 4,
                }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 10, fontSize: 11, color: "var(--t2)" }}>
              Дедлайн закрытия:
              <input
                type="date"
                value={openNewForm.end_date}
                onChange={(e) => setOpenNewForm({ ...openNewForm, end_date: e.target.value })}
                style={{
                  display: "block",
                  marginTop: 4,
                  width: "100%",
                  padding: "6px 10px",
                  background: "var(--bg2)",
                  color: "var(--t1)",
                  border: "1px solid var(--brd)",
                  borderRadius: 4,
                }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 14, fontSize: 11, color: "var(--t2)" }}>
              Пакет (роликов):
              <input
                type="number"
                min={1}
                value={openNewForm.pkg}
                onChange={(e) => setOpenNewForm({ ...openNewForm, pkg: e.target.value })}
                style={{
                  display: "block",
                  marginTop: 4,
                  width: "100%",
                  padding: "6px 10px",
                  background: "var(--bg2)",
                  color: "var(--t1)",
                  border: "1px solid var(--brd)",
                  borderRadius: 4,
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setOpenNewFor(null)}
                style={{
                  background: "transparent",
                  border: "1px solid var(--brd)",
                  color: "var(--t2)",
                  padding: "6px 14px",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Отмена
              </button>
              <button
                onClick={createNextMonth}
                style={{
                  background: "var(--cy)",
                  border: "none",
                  color: "#000",
                  padding: "6px 14px",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {(() => {
                  const prev = clientMonths.find((m) => m.client_id === openNewFor.clientId && m.month_number === openNewFor.nextN - 1);
                  return prev && prev.status !== "closed" ? "Запланировать месяц" : "Открыть месяц";
                })()}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAllTime && (
        <>
          <div className="card mb-3">
            <div className="text-xs font-bold mb-3" style={{ color: "var(--t1)" }}>📊 Прогресс по клиентам</div>
            {clients.map((c) => {
              const cScripts = allScripts.filter((s) => s.client_id === c.id);
              const cPub = cScripts.filter((s) => s.video_status === "published").length;
              const cReady = cScripts.filter((s) => s.video_status === "ready").length;
              const cEdit = cScripts.filter((s) => s.video_status === "inProgress" && s.script_status === "approved").length;
              const total = cScripts.length || 1;
              const months = monthsForClient(c.id);
              return (
                <div key={c.id} onClick={() => router.push(`/dashboard/clients/${c.id}`)} className="mb-2 cursor-pointer">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium" style={{ color: "var(--t1)" }}>
                      {c.name} {c.surname || ""}
                      {months.length > 0 && (
                        <span style={{ marginLeft: 8, fontSize: 9, color: "var(--t3)" }}>
                          {months.map((m) => (m.status === "closed" ? `М${m.month_number}✅` : m.status === "onboarding" ? `М${m.month_number}🧩` : m.status === "planned" ? `М${m.month_number}🕓` : `М${m.month_number}🟡`)).join(" ")}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: "var(--t2)" }}>{cPub}/{cScripts.length}</span>
                  </div>
                  <div className="flex h-2 rounded overflow-hidden" style={{ background: "var(--brd)" }}>
                    {cPub > 0 && <div style={{ width: `${(cPub / total) * 100}%`, background: "var(--gr)" }} />}
                    {cReady > 0 && <div style={{ width: `${(cReady / total) * 100}%`, background: "var(--cy)" }} />}
                    {cEdit > 0 && <div style={{ width: `${(cEdit / total) * 100}%`, background: "var(--or)" }} />}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-3">
            <div className="card" style={{ borderColor: violations.length > 0 ? "rgba(239,68,68,0.3)" : "var(--brd)" }}>
              <div className="flex items-center gap-1 mb-2">
                <span style={{ color: "var(--rd)" }}>⚠️</span>
                <span className="text-[11px] font-bold" style={{ color: violations.length > 0 ? "var(--rd)" : "var(--gr)" }}>
                  {violations.length > 0 ? `НАРУШЕНИЯ СРОКОВ (${violations.length})` : "Всё по плану ✓"}
                </span>
              </div>
              {violations.slice(0, showAllViolations ? violations.length : 6).map((v, i) => (
                <div
                  key={i}
                  onClick={() => router.push(`/dashboard/clients/${v.cid}`)}
                  className="flex items-center gap-1 py-1.5 px-2 rounded cursor-pointer text-xs"
                  style={{ borderLeft: `3px solid ${v.severity === "high" ? "var(--rd)" : "var(--or)"}`, marginBottom: 2 }}
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
                  style={{ marginTop: 6, border: "none", background: "transparent", color: "var(--cy)", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
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
                    {t.deadline ? `-${Math.round((today.getTime() - new Date(t.deadline).getTime()) / 86400000)}д` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ErrorBoundary>
      <DashboardInner />
    </ErrorBoundary>
  );
}
