"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, ChecklistTask } from "@/lib/database";

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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [cls, tasks] = await Promise.all([
      db.getClients(supabase),
      db.getAllOverdueTasks(supabase),
    ]);
    setClients(cls);
    setOverdueTasks(tasks);
    // Load all scripts
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
  const totalEdit = allScripts.filter(s => s.video_status === "inProgress" && s.script_status === "approved").length;
  const totalScr = allScripts.filter(s => s.script_status === "approved").length;
  const expectedPct = Math.round(dayOfMonth / daysInMonth * 100);
  const expectedVids = Math.round(totalPkg * expectedPct / 100);
  const vidGap = expectedVids - totalPub;

  // Violations
  const violations: { client: string; msg: string; days: number; cid: number }[] = [];
  clients.forEach(c => {
    if (c.scripts_deadline) {
      const d = Math.round((today.getTime() - new Date(c.scripts_deadline).getTime()) / 86400000);
      if (d > 0) violations.push({ client: c.name, msg: `Сценарии! +${d}д`, days: d, cid: c.id });
    }
    if (c.videos_deadline) {
      const d = Math.round((today.getTime() - new Date(c.videos_deadline).getTime()) / 86400000);
      if (d > 0) violations.push({ client: c.name, msg: `Ролики! +${d}д`, days: d, cid: c.id });
    }
  });

  const stats = [
    { icon: "👥", l: "ВСЕГО КЛИЕНТОВ", val: clients.length, tag: `${clients.filter(c => c.stage === "Производство").length} в производстве`, tagColor: "var(--cy)", ck: () => router.push("/dashboard/clients") },
    { icon: "🎬", l: "ВИДЕО ГОТОВО", val: totalPub, valSub: `/ ${totalPkg}`, tag: vidGap > 0 ? `Отстаём на ${vidGap}` : "✓ В норме", tagColor: vidGap > 0 ? "var(--rd)" : "var(--gr)", bar: true, barPct: totalPkg > 0 ? totalPub / totalPkg * 100 : 0, barColor: vidGap > 0 ? "var(--rd)" : "var(--gr)", ck: () => router.push("/dashboard/montage") },
    { icon: "📝", l: "СЦЕНАРИЕВ", val: totalScr, valSub: `/ ${totalPkg}`, tag: "✓ В работе", tagColor: "var(--gr)", bar: true, barPct: totalPkg > 0 ? totalScr / totalPkg * 100 : 0, barColor: "var(--gr)", ck: () => router.push("/dashboard/scripts") },
    { icon: "🔄", l: "ОСТАЛОСЬ", val: totalPkg - totalPub, valSub: "роликов", tag: totalPkg - totalPub > totalPkg * 0.7 ? "Критическая фаза" : "В работе", tagColor: totalPkg - totalPub > totalPkg * 0.7 ? "var(--rd)" : "var(--or)", ck: () => router.push("/dashboard/montage") },
  ];

  return (
    <div>
      {/* Header */}
      <div className="card mb-3 flex justify-between items-start">
        <div>
          <h1 className="text-lg font-extrabold" style={{ color: "var(--t1)" }}>Главный дашборд</h1>
          <p className="text-xs mt-1" style={{ color: "var(--t2)" }}>Состояние производства</p>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-semibold tracking-wider" style={{ color: "var(--cy)" }}>СЕГОДНЯ</div>
          <div className="text-sm font-bold" style={{ color: "var(--t1)" }}>{todayStr}</div>
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

      {/* Progress chart */}
      <div className="card mb-3">
        <div className="text-xs font-bold mb-3" style={{ color: "var(--t1)" }}>📊 Прогресс по клиентам</div>
        {clients.map(c => {
          const cScripts = allScripts.filter(s => s.client_id === c.id);
          const cPub = cScripts.filter(s => s.video_status === "published").length;
          const cReady = cScripts.filter(s => s.video_status === "ready").length;
          const cEdit = cScripts.filter(s => s.video_status === "inProgress" && s.script_status === "approved").length;
          const total = cScripts.length || 1;
          return (
            <div key={c.id} onClick={() => router.push(`/dashboard/clients/${c.id}`)} className="mb-2 cursor-pointer">
              <div className="flex justify-between mb-1">
                <span className="text-xs font-medium" style={{ color: "var(--t1)" }}>{c.name} {c.surname}</span>
                <span className="text-[10px] font-mono" style={{ color: "var(--t2)" }}>{cPub}/{total}</span>
              </div>
              <div className="flex h-2 rounded overflow-hidden" style={{ background: "var(--brd)" }}>
                {cPub > 0 && <div style={{ width: `${cPub / total * 100}%`, background: "var(--gr)" }} />}
                {cReady > 0 && <div style={{ width: `${cReady / total * 100}%`, background: "var(--cy)" }} />}
                {cEdit > 0 && <div style={{ width: `${cEdit / total * 100}%`, background: "var(--or)" }} />}
              </div>
            </div>
          );
        })}
        <div className="flex gap-3 mt-2">
          {[{ c: "var(--gr)", l: "Опубликовано" }, { c: "var(--cy)", l: "Готово" }, { c: "var(--or)", l: "Монтаж" }].map((lg, i) => (
            <div key={i} className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ background: lg.c }} /><span className="text-[9px]" style={{ color: "var(--t3)" }}>{lg.l}</span></div>
          ))}
        </div>
      </div>

      {/* Violations + Tasks side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-3">
        <div className="card" style={{ borderColor: violations.length > 0 ? "rgba(239,68,68,0.3)" : "var(--brd)" }}>
          <div className="flex items-center gap-1 mb-2">
            <span style={{ color: "var(--rd)" }}>⚠️</span>
            <span className="text-[11px] font-bold" style={{ color: violations.length > 0 ? "var(--rd)" : "var(--gr)" }}>
              {violations.length > 0 ? `НАРУШЕНИЯ (${violations.length})` : "Нарушений нет ✓"}
            </span>
          </div>
          {violations.map((v, i) => (
            <div key={i} onClick={() => router.push(`/dashboard/clients/${v.cid}`)}
              className="flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer text-xs" style={{ borderLeft: "3px solid var(--rd)" }}>
              <span className="font-semibold" style={{ color: "var(--t1)" }}>{v.client}</span>
              <span style={{ color: "var(--t2)", flex: 1 }}>— {v.msg}</span>
              <span className="badge" style={{ background: "rgba(239,68,68,0.15)", color: "var(--rd)" }}>+{v.days}д</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="text-[11px] font-bold mb-2" style={{ color: "var(--t1)" }}>📋 ЗАДАЧИ ({overdueTasks.length})</div>
          {overdueTasks.slice(0, 5).map((t: any, i: number) => (
            <div key={i} onClick={() => router.push(`/dashboard/clients/${t.client_id}`)}
              className="flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer text-xs" style={{ borderLeft: "3px solid var(--or)" }}>
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

      {/* Client cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {clients.map(c => {
          const cScripts = allScripts.filter(s => s.client_id === c.id);
          const pub = cScripts.filter(s => s.video_status === "published").length;
          const scr = cScripts.filter(s => s.script_status === "approved").length;
          return (
            <div key={c.id} onClick={() => router.push(`/dashboard/clients/${c.id}`)} className="card cursor-pointer">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: "var(--pud)", color: "var(--pu)" }}>{c.name[0]}</div>
                <div className="flex-1"><div className="text-xs font-semibold" style={{ color: "var(--t1)" }}>{c.name} {c.surname}</div><div className="text-[9px]" style={{ color: "var(--t2)" }}>{c.niche}</div></div>
                <span className="badge" style={{ background: "var(--pud)", color: "var(--pu)" }}>{c.stage}</span>
              </div>
              <div className="flex gap-1">
                {[{ v: `${pub}/${cScripts.length}`, l: "Рол." }, { v: `${scr}/${cScripts.length}`, l: "Сц." }].map((s, i) => (
                  <div key={i} className="flex-1 py-1 rounded text-center" style={{ background: "var(--bg2)" }}>
                    <div className="text-xs font-bold font-mono" style={{ color: "var(--cy)" }}>{s.v}</div>
                    <div className="text-[7px]" style={{ color: "var(--t3)" }}>{s.l}</div>
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
