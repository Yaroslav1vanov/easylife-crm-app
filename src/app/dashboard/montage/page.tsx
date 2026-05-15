"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script } from "@/lib/database";

export default function MontagePage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [scriptsByClient, setScriptsByClient] = useState<Record<number, Script[]>>({});
  const [filter, setFilter] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => { load(); }, []);

  async function load() {
    const cls = await db.getClients(supabase);
    setClients(cls);
    const allScripts = await db.getScriptsForClients(supabase, cls.map((c) => c.id));
    const sc: Record<number, Script[]> = {};
    for (const c of cls) { sc[c.id] = allScripts.filter((s) => s.client_id === c.id); }
    setScriptsByClient(sc); setLoading(false);
  }

  async function updateScript(id: number, updates: Partial<Script>) {
    await db.updateScript(supabase, id, updates); load();
  }

  if (loading) return <div style={{ color: "var(--t2)", padding: 40, textAlign: "center" }}>Загрузка...</div>;

  const viStatuses = [{ value: "notStarted", label: "—" }, { value: "inProgress", label: "В работе" }, { value: "review", label: "На утверждение" }, { value: "ready", label: "Готово" }, { value: "published", label: "Опубликовано" }];
  const viColor = (s: string) => s === "published" ? "var(--gr)" : s === "ready" ? "var(--cy)" : s === "review" ? "var(--yl)" : s === "inProgress" ? "var(--or)" : "var(--t3)";
  const filtered = filter === 0 ? clients : clients.filter(c => c.id === filter);

  return (
    <div>
      <h1 className="text-lg font-bold mb-1" style={{ color: "var(--t1)" }}>Монтаж</h1>
      <p className="text-xs mb-3" style={{ color: "var(--t2)" }}>Прогресс монтажа по клиентам</p>
      <div className="flex gap-1 mb-3 flex-wrap">
        <button onClick={() => setFilter(0)} className="px-3 py-1 rounded-lg text-[10px] font-semibold"
          style={{ border: `1px solid ${filter === 0 ? "var(--cy)" : "var(--brd)"}`, background: filter === 0 ? "var(--cyd)" : "transparent", color: filter === 0 ? "var(--cy)" : "var(--t2)", cursor: "pointer" }}>Все</button>
        {clients.map(c => (
          <button key={c.id} onClick={() => setFilter(c.id)} className="px-3 py-1 rounded-lg text-[10px] font-semibold"
            style={{ border: `1px solid ${filter === c.id ? "var(--cy)" : "var(--brd)"}`, background: filter === c.id ? "var(--cyd)" : "transparent", color: filter === c.id ? "var(--cy)" : "var(--t2)", cursor: "pointer" }}>{c.name}</button>
        ))}
      </div>
      {filtered.map(c => {
        const scripts = scriptsByClient[c.id] || [];
        const approved = scripts.filter(s => s.script_status === "approved");
        const pub = approved.filter(s => s.video_status === "published").length;
        const rdy = approved.filter(s => s.video_status === "ready").length;
        const inP = approved.filter(s => s.video_status === "inProgress").length;
        return (
          <div key={c.id} className="card mb-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: "var(--pud)", color: "var(--pu)" }}>{c.name[0]}</div>
              <div className="flex-1"><div className="text-sm font-semibold" style={{ color: "var(--t1)" }}>{c.name} {c.surname}</div><div className="text-[10px]" style={{ color: "var(--t2)" }}>{c.niche}</div></div>
            </div>
            <div className="flex gap-3 mb-3">
              {[{ l: "Опубликовано", v: pub, c: "var(--gr)" }, { l: "Готово", v: rdy, c: "var(--cy)" }, { l: "В работе", v: inP, c: "var(--or)" }, { l: "Осталось", v: scripts.length - pub - rdy - inP, c: "var(--t3)" }].map((s, i) => (
                <div key={i} className="text-center"><div className="text-lg font-bold font-mono" style={{ color: s.c }}>{s.v}</div><div className="text-[8px]" style={{ color: "var(--t3)" }}>{s.l}</div></div>
              ))}
            </div>
            <div className="h-1.5 rounded-full mb-3" style={{ background: "var(--brd)" }}>
              <div className="h-full rounded-full" style={{ width: `${scripts.length > 0 ? pub / scripts.length * 100 : 0}%`, background: "linear-gradient(90deg, var(--cy), var(--gr))" }} />
            </div>
            {/* Approved scripts with video status */}
            {approved.map(s => (
              <div key={s.id} className="flex items-center gap-2 py-1 px-1" style={{ borderBottom: "1px solid var(--brd)" }}
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                <span className="text-[10px] font-mono" style={{ color: "var(--cy)" }}>#{s.order_num}</span>
                <span className="text-xs flex-1" style={{ color: "var(--t1)" }}>{s.hook_text || s.hook}</span>
                <select value={s.video_status} onClick={e => e.stopPropagation()} onChange={e => updateScript(s.id, { video_status: e.target.value })}
                  className="text-[10px] px-2 py-0.5 rounded outline-none" style={{ background: `${viColor(s.video_status)}18`, border: "1px solid var(--brd)", color: viColor(s.video_status), cursor: "pointer" }}>
                  {viStatuses.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}
            {approved.length === 0 && <div className="text-xs text-center py-4" style={{ color: "var(--t3)" }}>Нет утверждённых сценариев</div>}
          </div>
        );
      })}
    </div>
  );
}
