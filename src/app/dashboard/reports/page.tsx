"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script } from "@/lib/database";

type MonthData = {
  key: string; // "2026-03"
  label: string; // "Март 2026"
  clients: {
    id: number; name: string; surname: string; montager: string; teamlead: string; package: number;
    scriptsWritten: number; scriptsApproved: number;
    videosMontaged: number; videosPublished: number;
    pubDates: string[];
  }[];
};

const MONTH_NAMES = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

function getMonthKey(date: string) {
  if (!date) return "";
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

export default function ReportsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [allScripts, setAllScripts] = useState<(Script & { clientName: string; montager: string; teamlead: string; pkg: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [view, setView] = useState<"clients" | "teamleads" | "montagers">("clients");
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const cls = await db.getClients(supabase);
    setClients(cls);
    const scripts: typeof allScripts = [];
    for (const c of cls) {
      const s = await db.getScripts(supabase, c.id);
      scripts.push(...s.map(sc => ({
        ...sc,
        clientName: `${c.name} ${c.surname || ""}`.trim(),
        montager: c.montager?.name || "—",
        teamlead: c.teamlead?.name || "—",
        pkg: c.package,
      })));
    }
    setAllScripts(scripts);

    // Default to current month
    const now = new Date();
    setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    setLoading(false);
  }

  if (loading) return <div style={{ color: "var(--t2)", padding: 40, textAlign: "center" }}>Загрузка...</div>;

  // Collect all months that have any activity
  const monthKeys = new Set<string>();
  allScripts.forEach(s => {
    if (s.pub_date) monthKeys.add(getMonthKey(s.pub_date));
    // Also add current month always
  });
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  monthKeys.add(currentKey);
  // Add previous 3 months
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const months = Array.from(monthKeys).sort().reverse();

  // Filter scripts for selected month
  const monthScripts = allScripts.filter(s => {
    if (!s.pub_date) return false;
    return getMonthKey(s.pub_date) === selectedMonth;
  });

  // Stats per client
  const clientStats = new Map<number, {
    name: string; montager: string; teamlead: string; package: number;
    published: number; ready: number; editing: number; approved: number;
    pubDates: string[];
  }>();

  clients.forEach(c => {
    clientStats.set(c.id, {
      name: `${c.name} ${c.surname || ""}`.trim(),
      montager: c.montager?.name || "—",
      teamlead: c.teamlead?.name || "—",
      package: c.package,
      published: 0, ready: 0, editing: 0, approved: 0,
      pubDates: [],
    });
  });

  // Count published in selected month
  monthScripts.forEach(s => {
    const cs = clientStats.get(s.client_id);
    if (!cs) return;
    if (s.video_status === "published") { cs.published++; cs.pubDates.push(s.pub_date || ""); }
  });

  // Also count current status for all scripts per client (regardless of month)
  allScripts.forEach(s => {
    const cs = clientStats.get(s.client_id);
    if (!cs) return;
    if (s.video_status === "ready") cs.ready++;
    if (s.video_status === "inProgress" && s.script_status === "approved") cs.editing++;
    if (s.script_status === "approved") cs.approved++;
  });

  const clientList = Array.from(clientStats.values()).sort((a, b) => b.published - a.published);
  const totalPublished = clientList.reduce((a, c) => a + c.published, 0);

  // Group by teamlead
  const tlMap = new Map<string, { clients: typeof clientList; totalPub: number }>();
  clientList.forEach(c => {
    const tl = c.teamlead;
    if (!tlMap.has(tl)) tlMap.set(tl, { clients: [], totalPub: 0 });
    const entry = tlMap.get(tl)!;
    entry.clients.push(c);
    entry.totalPub += c.published;
  });

  // Group by montager
  const montMap = new Map<string, { clients: typeof clientList; totalPub: number }>();
  clientList.forEach(c => {
    const m = c.montager;
    if (!montMap.has(m)) montMap.set(m, { clients: [], totalPub: 0 });
    const entry = montMap.get(m)!;
    entry.clients.push(c);
    entry.totalPub += c.published;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h1 className="text-lg font-extrabold" style={{ color: "var(--t1)" }}>Отчёты</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--t2)" }}>Статистика по роликам за месяц</p>
        </div>
      </div>

      {/* Month selector */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: "touch" }}>
        {months.map(m => (
          <button key={m} onClick={() => setSelectedMonth(m)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0"
            style={{
              border: `1px solid ${selectedMonth === m ? "var(--cy)" : "var(--brd)"}`,
              background: selectedMonth === m ? "var(--cyd)" : "transparent",
              color: selectedMonth === m ? "var(--cy)" : "var(--t2)",
              cursor: "pointer",
            }}>
            {getMonthLabel(m)}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        <div className="card">
          <div className="text-[9px] font-semibold tracking-wider" style={{ color: "var(--gr)" }}>ОПУБЛИКОВАНО</div>
          <div className="text-3xl font-extrabold font-mono" style={{ color: "var(--gr)" }}>{totalPublished}</div>
          <div className="text-[10px]" style={{ color: "var(--t2)" }}>роликов за {getMonthLabel(selectedMonth).toLowerCase()}</div>
        </div>
        <div className="card">
          <div className="text-[9px] font-semibold tracking-wider" style={{ color: "var(--cy)" }}>КЛИЕНТОВ</div>
          <div className="text-3xl font-extrabold font-mono" style={{ color: "var(--cy)" }}>{clientList.filter(c => c.published > 0).length}</div>
          <div className="text-[10px]" style={{ color: "var(--t2)" }}>с публикациями</div>
        </div>
        <div className="card">
          <div className="text-[9px] font-semibold tracking-wider" style={{ color: "var(--pu)" }}>ТИМЛИДОВ</div>
          <div className="text-3xl font-extrabold font-mono" style={{ color: "var(--pu)" }}>{tlMap.size}</div>
          <div className="text-[10px]" style={{ color: "var(--t2)" }}>работают</div>
        </div>
        <div className="card">
          <div className="text-[9px] font-semibold tracking-wider" style={{ color: "var(--or)" }}>МОНТАЖЁРОВ</div>
          <div className="text-3xl font-extrabold font-mono" style={{ color: "var(--or)" }}>{montMap.size}</div>
          <div className="text-[10px]" style={{ color: "var(--t2)" }}>работают</div>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-0 mb-3" style={{ borderBottom: "1px solid var(--brd)" }}>
        {([
          { id: "clients" as const, label: "По клиентам" },
          { id: "teamleads" as const, label: "По тимлидам" },
          { id: "montagers" as const, label: "По монтажёрам" },
        ]).map(t => (
          <button key={t.id} onClick={() => setView(t.id)}
            className="px-4 py-2 text-xs font-semibold"
            style={{
              border: "none", cursor: "pointer", background: "transparent",
              color: view === t.id ? "var(--cy)" : "var(--t2)",
              borderBottom: view === t.id ? "2px solid var(--cy)" : "2px solid transparent",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* By Clients */}
      {view === "clients" && (
        <div>
          {/* Table header */}
          <div className="hidden lg:grid gap-2 px-3 py-2 rounded-lg mb-1 text-[9px] font-semibold tracking-wider"
            style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr", color: "var(--t3)" }}>
            <span>КЛИЕНТ</span><span>TL</span><span>МОНТАЖЁР</span><span>ПАКЕТ</span>
            <span>ОПУБЛ.</span><span>В МОНТ.</span><span>ГОТОВО</span>
          </div>

          {clientList.map(c => {
            const pct = c.package > 0 ? Math.round(c.published / c.package * 100) : 0;
            return (
              <div key={c.name} className="card mb-1.5 hover:scale-[1.005] transition-transform" style={{ padding: "10px 14px" }}>
                {/* Desktop */}
                <div className="hidden lg:grid gap-2 items-center" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: "var(--pud)", color: "var(--pu)" }}>{c.name[0]}</div>
                    <div>
                      <div className="text-xs font-semibold" style={{ color: "var(--t1)" }}>{c.name}</div>
                      <div className="h-1.5 w-20 rounded-full mt-1" style={{ background: "var(--brd)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? "var(--gr)" : pct >= 50 ? "var(--or)" : "var(--rd)" }} />
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--t2)" }}>{c.teamlead}</span>
                  <span className="text-[11px]" style={{ color: "var(--t2)" }}>{c.montager}</span>
                  <span className="text-xs font-mono" style={{ color: "var(--t1)" }}>{c.package}</span>
                  <div>
                    <span className="text-lg font-extrabold font-mono" style={{ color: c.published > 0 ? "var(--gr)" : "var(--t3)" }}>{c.published}</span>
                    <span className="text-[10px]" style={{ color: "var(--t3)" }}> / {c.package}</span>
                  </div>
                  <span className="text-sm font-bold font-mono" style={{ color: c.editing > 0 ? "var(--or)" : "var(--t3)" }}>{c.editing}</span>
                  <span className="text-sm font-bold font-mono" style={{ color: c.ready > 0 ? "var(--cy)" : "var(--t3)" }}>{c.ready}</span>
                </div>

                {/* Mobile */}
                <div className="lg:hidden">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: "var(--pud)", color: "var(--pu)" }}>{c.name[0]}</div>
                    <div className="flex-1">
                      <div className="text-xs font-semibold" style={{ color: "var(--t1)" }}>{c.name}</div>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>TL: {c.teamlead} · Монт: {c.montager}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-extrabold font-mono" style={{ color: c.published > 0 ? "var(--gr)" : "var(--t3)" }}>{c.published}</div>
                      <div className="text-[9px]" style={{ color: "var(--t3)" }}>из {c.package}</div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: "var(--brd)" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? "var(--gr)" : pct >= 50 ? "var(--or)" : "var(--rd)" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* By Teamleads */}
      {view === "teamleads" && (
        <div>
          {Array.from(tlMap.entries()).sort((a, b) => b[1].totalPub - a[1].totalPub).map(([tl, data]) => (
            <div key={tl} className="card mb-3">
              {/* TL header */}
              <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: "1px solid var(--brd)" }}>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold"
                    style={{ background: "var(--pud)", color: "var(--pu)" }}>{tl[0]}</div>
                  <div>
                    <div className="text-sm font-bold" style={{ color: "var(--t1)" }}>{tl}</div>
                    <div className="text-[10px]" style={{ color: "var(--t2)" }}>Team Lead · {data.clients.length} клиентов</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold font-mono" style={{ color: "var(--gr)" }}>{data.totalPub}</div>
                  <div className="text-[9px] font-semibold" style={{ color: "var(--gr)" }}>роликов</div>
                </div>
              </div>

              {/* Clients under TL */}
              {data.clients.map(c => (
                <div key={c.name} className="flex items-center gap-3 py-1.5 px-2 rounded-lg mb-0.5"
                  style={{ borderLeft: `3px solid ${c.published > 0 ? "var(--gr)" : "var(--brd)"}` }}>
                  <span className="text-xs font-medium flex-1" style={{ color: "var(--t1)" }}>{c.name}</span>
                  <span className="text-[10px]" style={{ color: "var(--t3)" }}>монт. {c.montager}</span>
                  <span className="text-sm font-extrabold font-mono" style={{ color: c.published > 0 ? "var(--gr)" : "var(--t3)" }}>{c.published}</span>
                  <span className="text-[10px]" style={{ color: "var(--t3)" }}>/ {c.package}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* By Montagers */}
      {view === "montagers" && (
        <div>
          {Array.from(montMap.entries()).sort((a, b) => b[1].totalPub - a[1].totalPub).map(([mont, data]) => (
            <div key={mont} className="card mb-3">
              {/* Montager header */}
              <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: "1px solid var(--brd)" }}>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold"
                    style={{ background: "var(--ord)", color: "var(--or)" }}>{mont[0]}</div>
                  <div>
                    <div className="text-sm font-bold" style={{ color: "var(--t1)" }}>{mont}</div>
                    <div className="text-[10px]" style={{ color: "var(--t2)" }}>Монтажёр · {data.clients.length} клиентов</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold font-mono" style={{ color: "var(--or)" }}>{data.totalPub}</div>
                  <div className="text-[9px] font-semibold" style={{ color: "var(--or)" }}>роликов</div>
                </div>
              </div>

              {/* Clients under montager */}
              {data.clients.map(c => (
                <div key={c.name} className="flex items-center gap-3 py-1.5 px-2 rounded-lg mb-0.5"
                  style={{ borderLeft: `3px solid ${c.published > 0 ? "var(--or)" : "var(--brd)"}` }}>
                  <span className="text-xs font-medium flex-1" style={{ color: "var(--t1)" }}>{c.name}</span>
                  <span className="text-[10px]" style={{ color: "var(--t3)" }}>TL {c.teamlead}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: "var(--ord)", color: "var(--or)" }}>{c.editing} в монт.</span>
                    <span className="text-sm font-extrabold font-mono" style={{ color: c.published > 0 ? "var(--gr)" : "var(--t3)" }}>{c.published}</span>
                    <span className="text-[10px]" style={{ color: "var(--t3)" }}>/ {c.package}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
