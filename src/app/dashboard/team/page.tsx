"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { TeamMember, Client } from "@/lib/database";
import AvatarUploader from "@/components/AvatarUploader";

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("Монтажёр");
  const [newType, setNewType] = useState("montager");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => { load(); }, []);

  async function load() {
    const [tm, cls] = await Promise.all([db.getTeam(supabase), db.getClients(supabase)]);
    setTeam(tm); setClients(cls); setLoading(false);
  }

  async function addMember() {
    if (!newName) return;
    await db.addTeamMember(supabase, { name: newName, role_title: newRole, member_type: newType });
    setNewName(""); setShowAdd(false); load();
  }

  async function removeMember(id: number) {
    await db.deleteTeamMember(supabase, id); load();
  }

  async function updateAvatar(id: number, url: string | null) {
    await db.updateTeamMember(supabase, id, { avatar_url: url });
    load();
  }

  if (loading) return <div style={{ color: "var(--t2)", padding: 40, textAlign: "center" }}>Загрузка...</div>;

  const typeLabel = (t: string) => t === "admin" ? "Админ" : t === "teamlead" ? "Менеджер" : "Монтажёр";
  const typeColor = (t: string) => t === "admin" ? "var(--cy)" : t === "teamlead" ? "var(--pu)" : "var(--or)";

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ color: "var(--t1)" }}>Команда</h1>
          <p className="text-xs" style={{ color: "var(--t2)" }}>{team.length} сотрудников</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="px-4 py-2 rounded-xl text-xs font-semibold text-white"
          style={{ background: "linear-gradient(135deg, var(--cy), var(--pu))" }}>+ Добавить</button>
      </div>

      {showAdd && (
        <div className="card mb-3">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div>
              <label className="block text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>ИМЯ</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Имя"
                className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} />
            </div>
            <div>
              <label className="block text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>ДОЛЖНОСТЬ</label>
              <input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="Должность"
                className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} />
            </div>
            <div>
              <label className="block text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>ТИП</label>
              <select value={newType} onChange={e => setNewType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                <option value="montager">Монтажёр</option>
                <option value="teamlead">Менеджер</option>
                <option value="admin">Админ</option>
              </select>
            </div>
          </div>
          <button onClick={addMember} className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
            style={{ background: "var(--gr)" }}>Добавить</button>
        </div>
      )}

      {team.map(m => {
        const assignedClients = clients.filter(c => c.montager_id === m.id || c.teamlead_id === m.id);
        return (
          <div key={m.id} className="card mb-1.5 flex items-center gap-3">
            <AvatarUploader
              currentUrl={m.avatar_url}
              name={m.name}
              pathPrefix="team"
              entityId={m.id}
              size={48}
              onUploaded={(url) => updateAvatar(m.id, url)}
            />
            <div className="flex-1">
              <div className="text-xs font-semibold" style={{ color: "var(--t1)" }}>{m.name}</div>
              <div className="text-[10px]" style={{ color: "var(--t2)" }}>{m.role_title}</div>
              {assignedClients.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {assignedClients.map(c => (
                    <span key={c.id} className="badge" style={{ background: "var(--bg2)", color: "var(--t2)" }}>{c.name}</span>
                  ))}
                </div>
              )}
            </div>
            <span className="badge" style={{ background: `${typeColor(m.member_type)}18`, color: typeColor(m.member_type) }}>{typeLabel(m.member_type)}</span>
            {m.member_type !== "admin" && (
              <button onClick={() => removeMember(m.id)} className="text-xs" style={{ color: "var(--rd)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
