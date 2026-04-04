"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script } from "@/lib/database";

export default function DashboardPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [allScripts, setAllScripts] = useState<Script[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();
  const today = new Date();
  const todayStr = today.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [cls, tasks] = await Promise.all([
      db.getClients(supabase),
      db.getAllOverdueTasks(supabase),
    ]);
    setClients(cls);
    setOverdueTasks(tasks);
    const scripts: Script[] = [];
    for (const c of cls) {
      const s = await db.getScripts(supabase, c.id);
      scripts.push(...s);
    }
    setAllScripts(scripts);
    setLoading(false);
  }

  if (loading) return <div style={{ color: "var(--t2)", padding: 40, textAlign: "center" }}>Загрузка...</div>;

  const totalPkg = allScripts.length;
  const totalPub = allScripts.filter(s => s.video_status === "published").length;
  const totalReady = allScripts.filter(s => s.video_status === "ready").length;
  const totalVidReview = allScripts.filter(s => s.video_status === "review").length;
  const totalEdit = allScripts.filter(s => s.video_status === "inProgress" && s.script_status === "approved").length;
  const totalScr = allScripts.filter(s => s.script_status === "approved").length;
  const totalScrReview = allScripts.filter(s => s.script_status === "review").length;
  const totalScrInProg = allScripts.filter(s => s.script_status === "inProgress").length;
  const totalScrNot = allScripts.filter(s => s.script_status === "notStarted").length;
  const expectedPct = Math.round(dayOfMonth / daysInMonth * 100);
  const expectedVids = Math.round(totalPkg * expectedPct / 100);
  const vidGap = expectedVids - totalPub;

  // Smart Violations
  const violations: { client: string; msg: string; days: number; cid: number; severity: string }[] = [];
  clients.forEach(c => {
    const cScripts = allScripts.filter(s => s.client_id === c.id);
    const cPub = cScripts.filter(s => s.video_status === "published").length;
    const cReady = cScripts.filter(s => s.video_status === "ready").length;
    const cScrApp = cScripts.filter(s => s.script_status === "approved").length;
    const scrBuffer = cScrApp - cPub;
    if (c.first_pub_date) {
      const daysSinceFirst = Math.round((today.getTime() - new Date(c.first_pub_date).getTime()) / 86400000);
      if (daysSinceFirst >= 0) {
        const expectedByNow = Math.min(daysSinceFirst + 1, c.package);
        if (cPub < expectedByNow) {
          violations.push({ client: c.name, msg: `Ролики: ${cPub} из ${expectedByNow} ожид.`, days: expectedByNow - cPub, cid: c.id, severity: "high" });
        }
      }
    }
    if (c.scripts_deadline && scrBuffer < 5 && cPub < c.package) {
      violations.push({ client: c.name, msg: `Запас сценариев: ${scrBuffer} (мин. 5)`, days: 5 - scrBuffer, cid: c.id, severity: scrBuffer < 0 ? "high" : "med" });
    }
    if (c.videos_deadline && cReady < 3 && cPub < c.package) {
      violations.push({ client: c.name, msg: `Запас роликов: ${cReady} готовых (мин. 3)`, days: 3 - cReady, cid: c.id, severity: cReady === 0 ? "high" : "med" });
    }
  });
  violations.sort((a, b) => b.days - a.days);

  // Ring component
  const Ring = ({ val, max, size = 56, color }: { val: number; max: number; size?: number; color: string }) => {
    const r = (size - 8) / 2; const circ = 2 * Math.PI * r; const pct = max > 0 ? val / max : 0;
    return (
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--brd)" strokeWidth="5" />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={circ} strokeDashoffset={circ - pct * circ} strokeLinecap="round" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: "var(--t1)" }}>{val}</span>
        </div>
      </div>
    );
  };

  const StatRow = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: "var(--t2)" }}>{label}</span>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color }}>{value}</span>
    </div>
  );

  const ProgBar = ({ val, max, color }: { val: number; max: number; color: string }) => {
    const pct = max > 0 ? Math.round(val / max * 100) : 0;
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ fontSize: 9, color: "var(--t3)" }}>{pct}% выполнено</span>
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "var(--t2)" }}>{val}/{max}</span>
        </div>
        <div style={{ height: 6, borderRadius: 4, background: "var(--brd)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: color, transition: "width .6s" }} />
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="card mb-3" style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--t1)", margin: 0 }}>Главный дашборд</h1>
          <p style={{ fontSize: 12, color: "var(--t2)", marginTop: 3 }}>Состояние производства и сроки по всем клиентам</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, color: "var(--cy)" }}>СЕГОДНЯ</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--t1)", marginTop: 2 }}>{todayStr}</div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5 mb-3">

        {/* Клиенты */}
        <div className="card cursor-pointer" onClick={() => router.push("/dashboard/clients")} style={{ padding: 16, borderRadius: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34,211,238,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👥</div>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--cy)" }}>{clients.filter(c => c.stage === "Производство").length} в производстве</span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "var(--t2)", marginBottom: 4 }}>ВСЕГО КЛИЕНТОВ</div>
          <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "monospace", color: "var(--t1)" }}>{clients.length}</div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--brd)" }}>
            {clients.map(c => {
              const cPub = allScripts.filter(s => s.client_id === c.id && s.video_status === "published").length;
              const cTotal = allScripts.filter(s => s.client_id === c.id).length;
              return (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ fontSize: 11, color: "var(--t2)" }}>{c.name}</span>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--cy)" }}>{cPub}/{cTotal}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Сценарии */}
        <div className="card cursor-pointer" onClick={() => router.push("/dashboard/scripts")} style={{ padding: 16, borderRadius: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📝</div>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--gr)" }}>{totalScr >= totalPkg ? "✓ Все готовы" : "В работе"}</span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "var(--t2)", marginBottom: 4 }}>СЦЕНАРИИ</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Ring val={totalScr} max={totalPkg} color="var(--gr)" />
            <div style={{ flex: 1 }}>
              <StatRow label="Утверждён" value={totalScr} color="var(--gr)" />
              <StatRow label="На утвержд." value={totalScrReview} color="var(--yl)" />
              <StatRow label="В работе" value={totalScrInProg} color="var(--or)" />
              <StatRow label="Не начато" value={totalScrNot} color="var(--t3)" />
            </div>
          </div>
          <ProgBar val={totalScr} max={totalPkg} color="var(--gr)" />
        </div>

        {/* Монтаж */}
        <div className="card cursor-pointer" onClick={() => router.push("/dashboard/montage")} style={{ padding: 16, borderRadius: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(249,115,22,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎬</div>
            <span style={{ fontSize: 10, fontWeight: 600, color: totalEdit > 0 ? "var(--or)" : "var(--t3)" }}>{totalEdit > 0 ? "В работе" : "—"}</span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "var(--t2)", marginBottom: 4 }}>МОНТАЖ</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Ring val={totalEdit + totalVidReview + totalReady} max={Math.max(1, totalPkg - totalPub)} color="var(--or)" />
            <div style={{ flex: 1 }}>
              <StatRow label="Готово" value={totalReady} color="var(--cy)" />
              <StatRow label="На утвержд." value={totalVidReview} color="var(--yl)" />
              <StatRow label="В работе" value={totalEdit} color="var(--or)" />
              <StatRow label="Осталось" value={Math.max(0, totalPkg - totalPub - totalReady - totalEdit - totalVidReview)} color="var(--t3)" />
            </div>
          </div>
          <ProgBar val={totalEdit + totalVidReview + totalReady} max={Math.max(1, totalPkg - totalPub)} color="var(--or)" />
        </div>

        {/* Опубликовано */}
        <div className="card cursor-pointer" onClick={() => router.push("/dashboard/montage")}
          style={{ padding: 16, borderRadius: 16, borderColor: vidGap > 0 ? "rgba(239,68,68,0.3)" : "var(--brd)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(168,85,247,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>✅</div>
            <span style={{ fontSize: 10, fontWeight: 600, color: vidGap > 0 ? "var(--rd)" : "var(--gr)" }}>{vidGap > 0 ? `Отстаём на ${vidGap}` : "✓ В норме"}</span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "var(--t2)", marginBottom: 4 }}>ОПУБЛИКОВАНО</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Ring val={totalPub} max={totalPkg} color="var(--pu)" />
            <div style={{ flex: 1 }}>
              <StatRow label="Опубликовано" value={totalPub} color="var(--gr)" />
              <StatRow label="Ожидается" value={expectedVids} color={vidGap > 0 ? "var(--rd)" : "var(--gr)"} />
              <StatRow label="Осталось" value={totalPkg - totalPub} color="var(--t3)" />
            </div>
          </div>
          <ProgBar val={totalPub} max={totalPkg} color="var(--pu)" />
        </div>
      </div>

      {/* Violations + Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mb-3">
        <div className="card" style={{ borderColor: violations.length > 0 ? "rgba(249,115,22,0.3)" : "var(--brd)", padding: 16, borderRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
            <span>⚠️</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: violations.length > 0 ? "var(--or)" : "var(--gr)" }}>
              {violations.length > 0 ? `НАРУШЕНИЯ СРОКОВ (${violations.length})` : "Всё по плану ✓"}
            </span>
          </div>
          {violations.length > 0 ? violations.map((v, i) => (
            <div key={i} onClick={() => router.push(`/dashboard/clients/${v.cid}`)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", marginBottom: 3, borderRadius: 8,
                borderLeft: `3px solid ${v.severity === "high" ? "var(--rd)" : "var(--or)"}`, cursor: "pointer" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)" }}>{v.client}</span>
              <span style={{ fontSize: 11, color: "var(--t2)", flex: 1 }}>— {v.msg}</span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                background: v.severity === "high" ? "rgba(239,68,68,0.15)" : "rgba(249,115,22,0.15)",
                color: v.severity === "high" ? "var(--rd)" : "var(--or)" }}>!</span>
            </div>
          )) : <div style={{ fontSize: 11, color: "var(--t3)", padding: 8 }}>Все сроки в норме</div>}
        </div>

        <div className="card" style={{ padding: 16, borderRadius: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", marginBottom: 10 }}>📋 ЗАДАЧИ ЧЕКЛИСТА ({overdueTasks.length})</div>
          {overdueTasks.length > 0 ? overdueTasks.slice(0, 5).map((t: any, i: number) => (
            <div key={i} onClick={() => router.push(`/dashboard/clients/${t.client_id}`)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", marginBottom: 3, borderRadius: 8,
                borderLeft: "3px solid var(--or)", cursor: "pointer" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)" }}>{t.client?.name}</div>
                <div style={{ fontSize: 10, color: "var(--t2)" }}>{t.task_name}</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                background: "rgba(239,68,68,0.15)", color: "var(--rd)" }}>
                {t.deadline ? `-${Math.round((today.getTime() - new Date(t.deadline).getTime()) / 86400000)}д` : ""}
              </span>
            </div>
          )) : <div style={{ fontSize: 11, color: "var(--t3)", padding: 8 }}>Все задачи в срок ✓</div>}
          {overdueTasks.length > 5 && <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 4 }}>...ещё {overdueTasks.length - 5}</div>}
        </div>
      </div>

      {/* Progress by client */}
      <div className="card mb-3" style={{ padding: 16, borderRadius: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 12 }}>📊 Прогресс по клиентам</div>
        {clients.map(c => {
          const cScripts = allScripts.filter(s => s.client_id === c.id);
          const cPub = cScripts.filter(s => s.video_status === "published").length;
          const cReady = cScripts.filter(s => s.video_status === "ready").length;
          const cEdit = cScripts.filter(s => s.video_status === "inProgress" && s.script_status === "approved").length;
          const total = cScripts.length || 1;
          return (
            <div key={c.id} onClick={() => router.push(`/dashboard/clients/${c.id}`)} style={{ marginBottom: 10, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{c.name} {c.surname}</span>
                <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--t2)" }}>{cPub}/{total}</span>
              </div>
              <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--brd)" }}>
                {cPub > 0 && <div style={{ width: `${cPub / total * 100}%`, background: "var(--gr)" }} />}
                {cReady > 0 && <div style={{ width: `${cReady / total * 100}%`, background: "var(--cy)" }} />}
                {cEdit > 0 && <div style={{ width: `${cEdit / total * 100}%`, background: "var(--or)" }} />}
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
          {[{ c: "var(--gr)", l: "Опубликовано" }, { c: "var(--cy)", l: "Готово" }, { c: "var(--or)", l: "Монтаж" }, { c: "var(--brd)", l: "Остаток" }].map((lg, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: lg.c }} />
              <span style={{ fontSize: 10, color: "var(--t3)" }}>{lg.l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Client cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {clients.map(c => {
          const cScripts = allScripts.filter(s => s.client_id === c.id);
          const pub = cScripts.filter(s => s.video_status === "published").length;
          const scr = cScripts.filter(s => s.script_status === "approved").length;
          return (
            <div key={c.id} onClick={() => router.push(`/dashboard/clients/${c.id}`)} className="card cursor-pointer" style={{ padding: 14, borderRadius: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--pud)", color: "var(--pu)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{c.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>{c.name} {c.surname}</div>
                  <div style={{ fontSize: 10, color: "var(--t2)" }}>{c.niche}</div>
                </div>
                <span className="badge" style={{ background: "var(--pud)", color: "var(--pu)" }}>{c.stage}</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[{ v: `${pub}/${cScripts.length}`, l: "Рол.", c: "var(--pu)" }, { v: `${scr}/${cScripts.length}`, l: "Сц.", c: "var(--gr)" }, { v: `${c.package}`, l: "Пакет", c: "var(--cy)" }].map((s, i) => (
                  <div key={i} style={{ flex: 1, padding: 4, borderRadius: 6, background: "var(--bg2)", textAlign: "center" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: s.c }}>{s.v}</div>
                    <div style={{ fontSize: 7, color: "var(--t3)" }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
