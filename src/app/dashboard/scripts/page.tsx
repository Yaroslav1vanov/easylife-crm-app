"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script } from "@/lib/database";

export default function ScriptsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [allScripts, setAllScripts] = useState<(Script & { clientName: string })[]>([]);
  const [filter, setFilter] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => { load(); }, []);

  async function load() {
    const cls = await db.getClients(supabase);
    setClients(cls);
    const byClient = new Map(cls.map((c) => [c.id, `${c.name} ${c.surname || ""}`.trim()]));
    const all = (await db.getScriptsForClients(supabase, cls.map((c) => c.id)))
      .map((sc) => ({ ...sc, clientName: byClient.get(sc.client_id) || "—" }));
    setAllScripts(all); setLoading(false);
  }

  async function updateScript(id: number, updates: Partial<Script>) {
    await db.updateScript(supabase, id, updates); load();
  }

  if (loading) return <div style={{ color: "var(--t2)", padding: 40, textAlign: "center" }}>Загрузка...</div>;

  const filtered = filter === 0 ? allScripts : allScripts.filter(s => s.client_id === filter);
  const active = filtered.filter(s => s.script_status !== "notStarted" || s.hook_text || s.ref_url);
  const scStatuses = [{ value: "notStarted", label: "Не начато" }, { value: "inProgress", label: "В работе" }, { value: "review", label: "На утверждение" }, { value: "approved", label: "Утверждён" }];
  const scColor = (s: string) => s === "approved" ? "var(--gr)" : s === "review" ? "var(--yl)" : s === "inProgress" ? "var(--or)" : "var(--t3)";

  return (
    <div>
      <h1 className="text-lg font-bold mb-1" style={{ color: "var(--t1)" }}>Сценарии</h1>
      <p className="text-xs mb-3" style={{ color: "var(--t2)" }}>Все сценарии по всем клиентам</p>
      <div className="flex gap-1 mb-3 flex-wrap">
        <button onClick={() => setFilter(0)} className="px-3 py-1 rounded-lg text-[10px] font-semibold"
          style={{ border: `1px solid ${filter === 0 ? "var(--cy)" : "var(--brd)"}`, background: filter === 0 ? "var(--cyd)" : "transparent", color: filter === 0 ? "var(--cy)" : "var(--t2)", cursor: "pointer" }}>Все</button>
        {clients.map(c => (
          <button key={c.id} onClick={() => setFilter(c.id)} className="px-3 py-1 rounded-lg text-[10px] font-semibold"
            style={{ border: `1px solid ${filter === c.id ? "var(--cy)" : "var(--brd)"}`, background: filter === c.id ? "var(--cyd)" : "transparent", color: filter === c.id ? "var(--cy)" : "var(--t2)", cursor: "pointer" }}>{c.name}</button>
        ))}
      </div>
      {active.length === 0 && <div className="text-xs text-center py-8" style={{ color: "var(--t3)" }}>Нет активных сценариев</div>}
      {active.map(s => (
        <div key={s.id} className="card mb-1" style={{ padding: 0 }}>
          <div onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="flex items-center gap-2 px-3 py-2 cursor-pointer">
            <span className="text-[10px] font-semibold" style={{ color: "var(--pu)" }}>{s.clientName}</span>
            <span className="text-[10px] font-mono" style={{ color: "var(--cy)" }}>#{s.order_num}</span>
            <span className="text-xs flex-1" style={{ color: "var(--t1)" }}>{s.hook_text || s.hook}</span>
            <span className="badge" style={{ background: `${scColor(s.script_status)}18`, color: scColor(s.script_status) }}>{scStatuses.find(x => x.value === s.script_status)?.label}</span>
            <span style={{ color: "var(--t3)", transform: expanded === s.id ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
          </div>
          {expanded === s.id && (
            <div className="px-3 pb-3 border-t" style={{ borderColor: "var(--brd)" }}>
              <div className="flex gap-3 py-2">
                <div><div className="text-[8px] font-semibold mb-1" style={{ color: "var(--cy)" }}>СТАТУС</div>
                  <select value={s.script_status} onChange={e => updateScript(s.id, { script_status: e.target.value })}
                    className="text-[10px] px-2 py-1 rounded outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                    {scStatuses.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select></div>
              </div>
              <div className="mb-2"><div className="text-[8px] font-semibold mb-1" style={{ color: "var(--or)" }}>🎬 РЕФЕРЕНС</div>
                <input value={s.ref_url} onChange={e => updateScript(s.id, { ref_url: e.target.value })} placeholder="https://..."
                  className="w-full px-2 py-1.5 rounded text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-[8px] font-semibold mb-1" style={{ color: "var(--or)" }}>🎣 ХУК</div>
                  <textarea value={s.hook_text} onChange={e => updateScript(s.id, { hook_text: e.target.value })} rows={2}
                    className="w-full px-2 py-1.5 rounded text-xs outline-none resize-y" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontFamily: "inherit" }} /></div>
                <div><div className="text-[8px] font-semibold mb-1" style={{ color: "var(--pu)" }}>📄 ТЕКСТ</div>
                  <textarea value={s.body_text} onChange={e => updateScript(s.id, { body_text: e.target.value })} rows={2}
                    className="w-full px-2 py-1.5 rounded text-xs outline-none resize-y" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontFamily: "inherit" }} /></div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
