"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, ClientMonth } from "@/lib/database";

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
function ymRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0); // last day of month
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
function fmtDate(s: string): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${parseInt(d, 10)} ${RU_MONTHS[parseInt(m, 10) - 1]}`;
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export default function DashboardPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [allScripts, setAllScripts] = useState<Script[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<any[]>([]);
  const [clientMonths, setClientMonths] = useState<ClientMonth[]>([]);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAllViolations, setShowAllViolations] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const todayStr = today.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const currentYM = ymOfDate(today);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYM);
  const [edits, setEdits] = useState<Record<number, Partial<ClientMonth> & { saving?: boolean }>>({});
  const [openNewFor, setOpenNewFor] = useState<number | null>(null);
  const [openNewForm, setOpenNewForm] = useState<{ start_date: string; end_date: string; package: number }>({
    start_date: todayIso,
    end_date: "",
    package: 30,
  });

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    const [cls, tasks, cmResult] = await Promise.all([
      db.getClients(supabase),
      db.getAllOverdueTasks(supabase),
      db.getClientMonths(supabase),
    ]);
    setClients(cls);
    setOverdueTasks(tasks);
    setClientMonths(cmResult.data);
    setMigrationMissing(cmResult.missing);
    const scripts: Script[] = [];
    for (const c of cls) {
      const s = await db.getScripts(supabase, c.id);
      scripts.push(...s);
    }
    setAllScripts(scripts);
    setLoading(false);
  }

  // Compute months list — calendar months that have any contractual month overlapping them,
  // plus the current month and next two.
  const monthsList = useMemo(() => {
    const months = new Set<string>();
    months.add(currentYM);
    months.add(ymShift(currentYM, 1));
    months.add(ymShift(currentYM, 2));
    clients.forEach((c) => {
      if (c.start_date) months.add(c.start_date.slice(0, 7));
    });
    clientMonths.forEach((cm) => {
      if (cm.start_date) months.add(cm.start_date.slice(0, 7));
      if (cm.end_date) months.add(cm.end_date.slice(0, 7));
    });
    return Array.from(months).sort();
  }, [clients, clientMonths, currentYM]);

  if (loading) return <div style={{ color: "var(--t2)", padding: 40, textAlign: "center" }}>Загрузка...</div>;

  const isAllTime = selectedMonth === "all";
  const { start: monthStart, end: monthEnd } = isAllTime
    ? { start: "1900-01-01", end: "2999-12-31" }
    : ymRange(selectedMonth);

  // ---- Helpers ----
  function monthsForClient(clientId: number): ClientMonth[] {
    return clientMonths.filter((cm) => cm.client_id === clientId).sort((a, b) => a.month_number - b.month_number);
  }

  function activeMonthOverlapping(clientId: number, ym: string): ClientMonth | null {
    const { start, end } = ymRange(ym);
    const list = monthsForClient(clientId);
    // Prefer 'active' month that overlaps; otherwise any month overlapping.
    const overlapping = list.filter((m) => m.start_date <= end && m.end_date >= start);
    const active = overlapping.find((m) => m.status === "active");
    return active || overlapping[overlapping.length - 1] || null;
  }

  function publishedForMonth(clientId: number, monthNumber: number): number {
    return allScripts.filter(
      (s) => s.client_id === clientId && s.month_number === monthNumber && s.video_status === "published"
    ).length;
  }
  function readyForMonth(clientId: number, monthNumber: number): number {
    return allScripts.filter(
      (s) => s.client_id === clientId && s.month_number === monthNumber && s.video_status === "ready"
    ).length;
  }
  function inMontageForMonth(clientId: number, monthNumber: number): number {
    return allScripts.filter(
      (s) =>
        s.client_id === clientId &&
        s.month_number === monthNumber &&
        s.video_status === "inProgress" &&
        s.script_status === "approved"
    ).length;
  }

  // ---- Save edits ----
  async function savePackage(cmId: number, newPkg: number) {
    setEdits((e) => ({ ...e, [cmId]: { ...e[cmId], saving: true } }));
    const { error } = await db.upsertClientMonth(supabase, {
      id: cmId,
      client_id: clientMonths.find((m) => m.id === cmId)!.client_id,
      month_number: clientMonths.find((m) => m.id === cmId)!.month_number,
      package: newPkg,
    } as any);
    if (error) {
      alert(`Не удалось сохранить: ${error.message || error}`);
    }
    await loadData();
    setEdits((e) => {
      const next = { ...e };
      delete next[cmId];
      return next;
    });
  }

  async function closeMonth(cmId: number) {
    if (!confirm("Закрыть этот контрактный месяц? Статус станет 'closed'.")) return;
    const { error } = await db.closeClientMonth(supabase, cmId);
    if (error) {
      alert(`Ошибка: ${error.message || error}`);
      return;
    }
    await loadData();
  }

  async function reopenMonth(cmId: number) {
    if (!confirm("Снова открыть этот месяц (status='active')?")) return;
    const { error } = await db.reopenClientMonth(supabase, cmId);
    if (error) {
      alert(`Ошибка: ${error.message || error}`);
      return;
    }
    await loadData();
  }

  async function openNextMonth(clientId: number) {
    const existing = monthsForClient(clientId);
    const nextN = existing.length > 0 ? Math.max(...existing.map((m) => m.month_number)) + 1 : 1;
    const start = openNewForm.start_date;
    const end =
      openNewForm.end_date ||
      (() => {
        const d = new Date(start);
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);
      })();
    const pkg = openNewForm.package || 30;
    const { error } = await db.upsertClientMonth(supabase, {
      client_id: clientId,
      month_number: nextN,
      start_date: start,
      end_date: end,
      package: pkg,
      status: "active",
    } as any);
    if (error) {
      alert(`Не удалось создать месяц: ${error.message || error}`);
      return;
    }
    setOpenNewFor(null);
    await loadData();
  }

  // ---- Per-month rows (for selected calendar month) ----
  const rowsForMonth = useMemo(() => {
    if (isAllTime) return [];
    return clients
      .map((c) => {
        const m = activeMonthOverlapping(c.id, selectedMonth);
        return { client: c, month: m };
      })
      .filter((r) => r.month !== null)
      .sort((a, b) => a.client.id - b.client.id) as { client: Client; month: ClientMonth }[];
  }, [clients, clientMonths, selectedMonth, isAllTime]);

  // ---- KPIs (for selected calendar month) ----
  let kpiClients: number;
  let kpiClientsTag: string;
  let kpiTotalPlan: number;
  let kpiTotalPub: number;
  let kpiInMontage: number;
  let kpiReady: number;
  let kpiScriptApproved: number;

  if (isAllTime) {
    kpiClients = clients.length;
    kpiClientsTag = `${clients.filter((c) => c.stage === "Производство").length} в производстве`;
    kpiTotalPlan = allScripts.length;
    kpiTotalPub = allScripts.filter((s) => s.video_status === "published").length;
    kpiInMontage = allScripts.filter((s) => s.video_status === "inProgress" && s.script_status === "approved").length;
    kpiReady = allScripts.filter((s) => s.video_status === "ready").length;
    kpiScriptApproved = allScripts.filter((s) => s.script_status === "approved").length;
  } else {
    kpiClients = rowsForMonth.length;
    kpiClientsTag = `активных в ${ymLabel(selectedMonth)}`;
    kpiTotalPlan = rowsForMonth.reduce((s, r) => s + r.month.package, 0);
    kpiTotalPub = rowsForMonth.reduce((s, r) => s + publishedForMonth(r.client.id, r.month.month_number), 0);
    kpiInMontage = rowsForMonth.reduce((s, r) => s + inMontageForMonth(r.client.id, r.month.month_number), 0);
    kpiReady = rowsForMonth.reduce((s, r) => s + readyForMonth(r.client.id, r.month.month_number), 0);
    kpiScriptApproved = allScripts.filter((s) => s.script_status === "approved").length;
  }
  const vidGap = Math.max(0, kpiTotalPlan - kpiTotalPub);

  // ---- Stats KPI cards ----
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

  // ---- Violations (all-time only) ----
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
      {/* Migration banner */}
      {migrationMissing && (
        <div
          className="card mb-3"
          style={{
            background: "rgba(245, 166, 35, 0.08)",
            border: "1px solid rgba(245, 166, 35, 0.4)",
            color: "var(--t1)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Таблица client_months ещё не создана</div>
          <div style={{ fontSize: 12, color: "var(--t2)" }}>
            Запустите <code>MIGRATION_2026-05-12_monthly_plans.sql</code> в Supabase SQL Editor. До этого
            календарные табы не показывают строк, потому что нет данных о контрактных месяцах.
          </div>
        </div>
      )}

      {/* Header */}
      <div className="card mb-3 flex justify-between items-start">
        <div>
          <h1 className="text-lg font-extrabold" style={{ color: "var(--t1)" }}>Главный дашборд</h1>
          <p className="text-xs mt-1" style={{ color: "var(--t2)" }}>
            {isAllTime ? "Все клиенты — общая картина" : `Контрактные месяцы, активные в ${ymLabel(selectedMonth)}`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-semibold tracking-wider" style={{ color: "var(--cy)" }}>СЕГОДНЯ</div>
          <div className="text-sm font-bold" style={{ color: "var(--t1)" }}>{todayStr}</div>
        </div>
      </div>

      {/* Tabs */}
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

      {/* Per-contractual-month table */}
      {!isAllTime && (
        <div className="card mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold" style={{ color: "var(--t1)" }}>
              📅 Контрактные месяцы, активные в {ymLabel(selectedMonth)} ({rowsForMonth.length})
            </div>
            <div className="text-[10px]" style={{ color: "var(--t3)" }}>
              Клик по плану → редактирование
            </div>
          </div>
          {rowsForMonth.length === 0 && (
            <div style={{ padding: "12px", color: "var(--t2)", fontSize: 12 }}>
              {migrationMissing
                ? "Запустите миграцию, потом я доеду к бэкфиллу контрактных месяцев."
                : "В этом календарном месяце нет активных контрактных месяцев. Откройте новый месяц у клиента или выберите другую вкладку."}
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--t2)", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Клиент</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Тимлид</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>М-№</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Период</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>План</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Сделано</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Готово</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Монтаж</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Прогресс</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {rowsForMonth.map(({ client: c, month: m }) => {
                  const pub = publishedForMonth(c.id, m.month_number);
                  const ready = readyForMonth(c.id, m.month_number);
                  const montage = inMontageForMonth(c.id, m.month_number);
                  const pct = m.package > 0 ? Math.min(100, Math.round((pub / m.package) * 100)) : 0;
                  const daysLeft = m.end_date ? daysBetween(todayIso, m.end_date) : null;
                  const editKey = m.id;
                  const editing = edits[editKey] && !edits[editKey].saving;
                  const saving = edits[editKey]?.saving;
                  const barColor =
                    pct >= 100 ? "var(--gr)" : pct >= 50 ? "var(--cy)" : pct > 0 ? "var(--or)" : "var(--rd)";
                  const statusBadge =
                    m.status === "closed" ? (
                      <span style={{ color: "var(--gr)", fontWeight: 700 }}>✅</span>
                    ) : m.status === "cancelled" ? (
                      <span style={{ color: "var(--t3)" }}>—</span>
                    ) : daysLeft !== null && daysLeft < 0 ? (
                      <span style={{ color: "var(--rd)", fontWeight: 700 }}>🔴 просрочка {-daysLeft}д</span>
                    ) : daysLeft !== null && daysLeft <= 5 ? (
                      <span style={{ color: "var(--or)", fontWeight: 700 }}>⏰ {daysLeft}д</span>
                    ) : (
                      <span style={{ color: "var(--t2)" }}>{daysLeft !== null ? `${daysLeft}д` : ""}</span>
                    );
                  return (
                    <tr key={m.id} style={{ borderTop: "1px solid var(--brd)" }}>
                      <td
                        style={{ padding: "8px", cursor: "pointer", color: "var(--t1)", fontWeight: 600 }}
                        onClick={() => router.push(`/dashboard/clients/${c.id}`)}
                      >
                        {c.name} {c.surname || ""}
                      </td>
                      <td style={{ padding: "8px", color: "var(--t2)" }}>{c.teamlead?.name || "—"}</td>
                      <td style={{ padding: "8px", textAlign: "center", color: "var(--cy)", fontWeight: 700 }}>
                        М{m.month_number}
                      </td>
                      <td style={{ padding: "8px", color: "var(--t2)" }}>
                        {fmtDate(m.start_date)} → {fmtDate(m.end_date)} <span style={{ marginLeft: 6 }}>{statusBadge}</span>
                      </td>
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        {editing ? (
                          <input
                            type="number"
                            autoFocus
                            min={0}
                            max={999}
                            value={edits[editKey]!.package as any}
                            onChange={(e) =>
                              setEdits((p) => ({ ...p, [editKey]: { ...p[editKey], package: parseInt(e.target.value || "0", 10) } }))
                            }
                            onBlur={() => {
                              const val = edits[editKey]!.package;
                              if (typeof val === "number" && val !== m.package) savePackage(m.id, val);
                              else setEdits((p) => { const n = { ...p }; delete n[editKey]; return n; });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape")
                                setEdits((p) => { const n = { ...p }; delete n[editKey]; return n; });
                            }}
                            style={{
                              width: 56,
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
                              setEdits((p) => ({ ...p, [editKey]: { package: m.package } }))
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
                            {m.package}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center", color: "var(--gr)", fontWeight: 700 }}>{pub}</td>
                      <td style={{ padding: "8px", textAlign: "center", color: "var(--cy)" }}>{ready}</td>
                      <td style={{ padding: "8px", textAlign: "center", color: "var(--or)" }}>{montage}</td>
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
                          >
                            Закрыть
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
                          >
                            Открыть снова
                          </button>
                        )}
                        {(m.status === "closed" || m.status === "active") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenNewFor(c.id);
                              setOpenNewForm({
                                start_date: m.end_date,
                                end_date: (() => {
                                  const d = new Date(m.end_date);
                                  d.setDate(d.getDate() + 30);
                                  return d.toISOString().slice(0, 10);
                                })(),
                                package: m.package,
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
                          >
                            + М{m.month_number + 1}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: "var(--t3)" }}>
            «План» = `package` контрактного месяца (редактируется кликом). «Сделано» = `published` со scripts.month_number = N.
            «Закрыть» переводит status='closed'. «+ М(N+1)» открывает следующий контрактный месяц с новыми датами и пакетом.
          </div>
        </div>
      )}

      {/* Open next month modal */}
      {openNewFor !== null && (
        <div
          onClick={() => setOpenNewFor(null)}
          style={{
            position: "fixed",
            inset: 0,
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
            style={{ minWidth: 320, padding: 20 }}
          >
            <div style={{ fontWeight: 700, marginBottom: 14, color: "var(--t1)" }}>
              Открыть новый контрактный месяц для:{" "}
              {clients.find((c) => c.id === openNewFor)?.name}{" "}
              {clients.find((c) => c.id === openNewFor)?.surname || ""}
            </div>
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
              Конец (дедлайн):
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
                value={openNewForm.package}
                onChange={(e) => setOpenNewForm({ ...openNewForm, package: parseInt(e.target.value || "30", 10) })}
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
                onClick={() => openNextMonth(openNewFor!)}
                style={{
                  background: "var(--cy)",
                  border: "none",
                  color: "var(--bg)",
                  padding: "6px 14px",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Открыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All-time view */}
      {isAllTime && (
        <>
          <div className="card mb-3">
            <div className="text-xs font-bold mb-3" style={{ color: "var(--t1)" }}>📊 Прогресс по клиентам (все скрипты)</div>
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
                      {c.name} {c.surname}
                      {months.length > 0 && (
                        <span style={{ marginLeft: 8, fontSize: 9, color: "var(--t3)" }}>
                          {months.map((m) => (m.status === "closed" ? `М${m.month_number}✅` : `М${m.month_number}🟡`)).join(" ")}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: "var(--t2)" }}>
                      {cPub}/{cScripts.length}
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
        </>
      )}
    </div>
  );
}
