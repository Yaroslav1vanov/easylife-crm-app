"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, TeamMember } from "@/lib/database";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [scripts, setScripts] = useState<Record<number, { pub: number; scr: number; total: number }>>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", surname: "", niche: "", package: 30, montager_id: 0, teamlead_id: 0, start_date: new Date().toISOString().split("T")[0], pub_date: "" });
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { load(); }, []);

  async function load() {
    const [cls, tm] = await Promise.all([db.getClients(supabase), db.getTeam(supabase)]);
    setClients(cls); setTeam(tm);
    const allScripts = await db.getScriptsForClients(supabase, cls.map((c) => c.id));
    const sc: Record<number, { pub: number; scr: number; total: number }> = {};
    for (const c of cls) {
      const s = allScripts.filter((x) => x.client_id === c.id);
      sc[c.id] = { pub: s.filter(x => x.video_status === "published").length, scr: s.filter(x => x.script_status === "approved").length, total: s.length };
    }
    setScripts(sc); setLoading(false);
  }

  async function handleCreate() {
    if (!form.name) return;
    await db.createClient(supabase, {
      name: form.name, surname: form.surname, niche: form.niche,
      package: form.package, montager_id: form.montager_id || undefined,
      teamlead_id: form.teamlead_id || undefined,
      start_date: form.start_date, pub_date: form.pub_date || undefined,
    });
    setShowAdd(false);
    setForm({ name: "", surname: "", niche: "", package: 30, montager_id: 0, teamlead_id: 0, start_date: new Date().toISOString().split("T")[0], pub_date: "" });
    load();
  }

  if (loading) return <div style={{ color: "var(--t2)", padding: 40, textAlign: "center" }}>Загрузка...</div>;

  const montagers = team.filter(t => t.member_type === "montager");
  const leads = team.filter(t => t.member_type === "teamlead" || t.member_type === "admin");

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ color: "var(--t1)" }}>Клиенты ({clients.length})</h1>
          <p className="text-xs" style={{ color: "var(--t2)" }}>Все клиенты в работе</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-xs font-semibold text-white"
          style={{ background: "linear-gradient(135deg, var(--cy), var(--pu))" }}>+ Клиент</button>
      </div>

      {/* Add client modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="card w-full max-w-lg max-h-[90vh] overflow-auto" style={{ padding: 20 }}>
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-bold" style={{ color: "var(--t1)" }}>Новый клиент</span>
              <button onClick={() => setShowAdd(false)} className="text-sm" style={{ color: "var(--t2)" }}>✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[["Имя", "name"], ["Фамилия", "surname"], ["Ниша", "niche"]].map(([label, key]) => (
                <div key={key}>
                  <label className="block text-[9px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>{label.toUpperCase()}</label>
                  <input value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} />
                </div>
              ))}
              <div>
                <label className="block text-[9px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>ПАКЕТ (РИЛСОВ)</label>
                <div className="flex gap-1 flex-wrap">
                  {[10, 15, 30, 60, 90].map(p => (
                    <button key={p} onClick={() => setForm(prev => ({ ...prev, package: p }))}
                      className="px-3 py-1 rounded text-xs" style={{ border: `1px solid ${form.package === p ? "var(--cy)" : "var(--brd)"}`, background: form.package === p ? "var(--cyd)" : "transparent", color: form.package === p ? "var(--cy)" : "var(--t2)", cursor: "pointer" }}>{p}</button>
                  ))}
                  <input type="number" value={form.package} onChange={e => setForm(p => ({ ...p, package: parseInt(e.target.value) || 0 }))}
                    className="w-16 px-2 py-1 rounded text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} placeholder="Своё" />
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>МОНТАЖЁР</label>
                <select value={form.montager_id} onChange={e => setForm(p => ({ ...p, montager_id: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                  <option value={0}>—</option>
                  {montagers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>TEAM LEAD</label>
                <select value={form.teamlead_id} onChange={e => setForm(p => ({ ...p, teamlead_id: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                  <option value={0}>—</option>
                  {leads.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>СТАРТ</label>
                <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} />
              </div>
              <div>
                <label className="block text-[9px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>ПУБЛИКАЦИЯ</label>
                <input type="date" value={form.pub_date} onChange={e => setForm(p => ({ ...p, pub_date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} />
              </div>
            </div>
            <button onClick={handleCreate} className="w-full py-2.5 rounded-xl text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg, var(--cy), var(--pu))" }}>Создать клиента</button>
          </div>
        </div>
      )}

      {/* Client cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {clients.map(c => {
          const s = scripts[c.id] || { pub: 0, scr: 0, total: 0 };
          return (
            <div key={c.id} onClick={() => router.push(`/dashboard/clients/${c.id}`)}
              className="card cursor-pointer text-center" style={{ padding: "20px 16px", borderRadius: 20 }}>
              <div className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center text-2xl font-extrabold"
                style={{ background: c.avatar_url ? `url(${c.avatar_url}) center/cover` : "linear-gradient(135deg, var(--pud), var(--cyd))", color: "var(--pu)", border: "2px solid var(--brd)" }}>
                {!c.avatar_url && <>{c.name[0]}{(c.surname || "")[0] || ""}</>}
              </div>
              <div className="mb-1"><span className="badge" style={{ background: "var(--cyd)", color: "var(--cy)" }}>{c.niche || "—"}</span></div>
              <div className="mb-1"><span className="badge" style={{ background: "var(--pud)", color: "var(--pu)" }}>{c.stage}</span></div>
              <div className="text-lg font-extrabold mb-2" style={{ color: "var(--t1)" }}>{c.name} {c.surname}</div>
              {/* Socials */}
              <div className="flex gap-1.5 justify-center mb-3">
                {c.instagram && <a href={c.instagram.startsWith("http") ? c.instagram : `https://${c.instagram}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="px-3 py-1 rounded-lg text-[10px] font-medium" style={{ border: "1px solid var(--brd)", color: "var(--t1)", background: "var(--bg2)", textDecoration: "none" }}>📷 Instagram</a>}
                {c.tiktok && <a href={c.tiktok.startsWith("http") ? c.tiktok : `https://${c.tiktok}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="px-3 py-1 rounded-lg text-[10px] font-medium" style={{ border: "1px solid var(--brd)", color: "var(--t1)", background: "var(--bg2)", textDecoration: "none" }}>🎵 TikTok</a>}
              </div>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-1.5">
                {[{ v: `${s.pub}/${s.total}`, l: "РОЛИКИ", c: "var(--pu)" }, { v: `${s.scr}/${s.total}`, l: "СЦЕНАРИИ", c: "var(--gr)" }, { v: `${c.package}`, l: "ПАКЕТ", c: "var(--cy)" }].map((st, i) => (
                  <div key={i} className="py-2 rounded-xl" style={{ background: "var(--bg2)", border: "1px solid var(--brd)" }}>
                    <div className="text-sm font-bold font-mono" style={{ color: st.c }}>{st.v}</div>
                    <div className="text-[7px] font-semibold tracking-wider" style={{ color: "var(--t3)" }}>{st.l}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-center gap-3 mt-2 pt-2 text-[9px]" style={{ borderTop: "1px solid var(--brd)", color: "var(--t3)" }}>
                <span>📦 {c.package}</span>
                <span>🎬 {c.montager?.name || "—"}</span>
                <span>👤 {c.teamlead?.name || "—"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
