"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { TeamMember, Client } from "@/lib/database";
import AvatarUploader from "@/components/AvatarUploader";
import Avatar from "@/components/Avatar";
import Tour, { TourButton, type TourStep } from "@/components/Tour";
import { Crown, Users2, Scissors, Plus, X, UserPlus, AlertTriangle, type LucideIcon } from "lucide-react";

type RoleDef = { type: string; title: string; color: string; Icon: LucideIcon; roleNoun: string };
const ROLES: RoleDef[] = [
  { type: "admin", title: "Админы", color: "#42d4f4", Icon: Crown, roleNoun: "клиентов" },
  { type: "teamlead", title: "Менеджеры", color: "#9d6bff", Icon: Users2, roleNoun: "клиентов" },
  { type: "montager", title: "Монтажёры", color: "#ffae42", Icon: Scissors, roleNoun: "в монтаже" },
];

export default function TeamPage() {
  const router = useRouter();
  const supabase = createClient();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("Монтажёр");
  const [newType, setNewType] = useState("montager");
  const [tourOpen, setTourOpen] = useState(false);

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
    if (!confirm("Удалить сотрудника? Его клиенты останутся, но без привязки.")) return;
    await db.deleteTeamMember(supabase, id); load();
  }
  async function updateAvatar(id: number, url: string | null) {
    await db.updateTeamMember(supabase, id, { avatar_url: url }); load();
  }

  const byId = useMemo(() => Object.fromEntries(team.map(t => [t.id, t])) as Record<number, TeamMember>, [team]);
  // только клиенты в работе (на паузе и в архиве — не показываем)
  const activeClients = useMemo(() => clients.filter(c => c.stage === "active"), [clients]);
  // клиенты сотрудника (как менеджер ИЛИ как монтажёр, для админа — оба)
  const clientsOf = (m: TeamMember) => activeClients.filter(c =>
    m.member_type === "montager" ? c.montager_id === m.id :
    m.member_type === "teamlead" ? c.teamlead_id === m.id :
    (c.teamlead_id === m.id || c.montager_id === m.id));
  const noMontager = useMemo(() => activeClients.filter(c => c.stage === "active" && !c.montager_id), [activeClients]);
  const counts = (t: string) => team.filter(m => m.member_type === t).length;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;

  const fld: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 9, background: "var(--inset2)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, outline: "none" };

  // чип клиента: аватар + имя + «пара» (counterpart role)
  function ClientChip({ c, role }: { c: Client; role: string }) {
    const counterId = role === "montager" ? c.teamlead_id : c.montager_id;
    const counter = counterId ? byId[counterId] : null;
    const counterLabel = role === "montager" ? "менеджер" : "монтаж";
    return (
      <button onClick={() => router.push(`/dashboard/clients/${c.id}`)}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 9px 5px 5px", borderRadius: 999, background: "var(--inset2)", border: "1px solid var(--track)", cursor: "pointer", maxWidth: "100%" }}>
        <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={22} />
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{c.name} {c.surname || ""}</span>
          <span style={{ fontSize: 8, color: counter ? "var(--t3)" : "#ff5c7a", display: "inline-flex", alignItems: "center", gap: 3 }}>
            {counter ? `${counterLabel}: ${counter.name}` : role === "teamlead" ? "нет монтажёра" : `${counterLabel}: —`}
          </span>
        </span>
      </button>
    );
  }

  const TEAM_TOUR: TourStep[] = [
    { title: "Раздел «Команда»", text: "Тут вся команда по ролям и видно, кто за каких клиентов отвечает. Коротко пройдёмся." },
    { target: "team-roles", title: "Карточки по ролям", text: "Сотрудники сгруппированы: Админы · Менеджеры (тимлиды) · Монтажёры. На карточке — аватар, число закреплённых клиентов и чипы с самими клиентами. У монтажёра это «в монтаже», у менеджера — «клиентов». Закрепление клиента задаётся в карточке клиента (монтажёр/тимлид)." },
    { target: "team-nomontager", title: "Клиенты без монтажёра", text: "Красная плашка — активные клиенты, которым НЕ назначен монтажёр (никто не делает им ролики). Клик по клиенту открывает его карточку, чтобы назначить. Если плашки нет — всё распределено.", action: () => {} },
    { target: "team-add", title: "Добавить сотрудника", text: "«Добавить» — заводим человека: имя, должность и роль. Роль важна: она задаёт ДОСТУПЫ — монтажёр видит только Дашборд, Монтаж, Референсы и Инструкцию; менеджер и админ видят всё.", action: () => setShowAdd(true) },
  ];

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif", maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Команда</h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>
            {counts("teamlead")} менеджеров · {counts("montager")} монтажёров · {counts("admin")} админ · кто за кого отвечает
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TourButton onClick={() => setTourOpen(true)} />
          <button data-tour="team-add" onClick={() => setShowAdd(v => !v)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 11, background: "linear-gradient(135deg, var(--cy), var(--pu))", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 800 }}>
            <UserPlus size={15} /> Добавить
          </button>
        </div>
      </div>

      {showAdd && (
        <div style={{ background: "rgba(123,63,228,0.05)", border: "1px solid var(--brd)", borderRadius: 14, padding: 16, marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div><label style={{ fontSize: 9, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 5 }}>Имя</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Имя" style={fld} /></div>
            <div><label style={{ fontSize: 9, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 5 }}>Должность</label>
              <input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="Должность" style={fld} /></div>
            <div><label style={{ fontSize: 9, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 5 }}>Роль</label>
              <select value={newType} onChange={e => setNewType(e.target.value)} style={fld}>
                <option value="montager">Монтажёр</option>
                <option value="teamlead">Менеджер</option>
                <option value="admin">Админ</option>
              </select></div>
            <button onClick={addMember} style={{ padding: "9px 16px", borderRadius: 9, background: "var(--gr)", color: "#0a0118", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={13} style={{ verticalAlign: "-2px" }} /> Создать
            </button>
          </div>
        </div>
      )}

      <div data-tour="team-roles">
      {ROLES.map(role => {
        const members = team.filter(m => m.member_type === role.type);
        if (members.length === 0) return null;
        return (
          <div key={role.type} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, background: `${role.color}1f` }}>
                <role.Icon size={15} style={{ color: role.color }} />
              </span>
              <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", textTransform: "uppercase", letterSpacing: 0.5 }}>{role.title}</h2>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 7, background: `${role.color}1f`, color: role.color }}>{members.length}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 12 }}>
              {members.map(m => {
                const list = clientsOf(m);
                return (
                  <div key={m.id} style={{ background: "rgba(123,63,228,0.04)", border: `1px solid var(--brd)`, borderRadius: 16, padding: 16, borderTop: `3px solid ${role.color}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: list.length ? 14 : 0 }}>
                      <AvatarUploader currentUrl={m.avatar_url} name={m.name} pathPrefix="team" entityId={m.id} size={52} onUploaded={(url) => updateAvatar(m.id, url)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--t1)" }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: "var(--t3)" }}>{m.role_title}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 800, color: role.color, lineHeight: 1 }}>{list.length}</div>
                        <div style={{ fontSize: 8, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.4 }}>{role.roleNoun}</div>
                      </div>
                      {m.member_type !== "admin" && (
                        <button onClick={() => removeMember(m.id)} title="Удалить" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, background: "transparent", border: "1px solid var(--brd)", color: "var(--t3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
                      )}
                    </div>
                    {list.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 12, borderTop: "1px solid var(--track)" }}>
                        {list.map(c => <ClientChip key={c.id} c={c} role={m.member_type} />)}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic", marginTop: 10 }}>пока без клиентов</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      </div>

      {noMontager.length > 0 && (
        <div data-tour="team-nomontager" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: "rgba(255,92,122,0.07)", border: "1px solid rgba(255,92,122,0.3)", flexWrap: "wrap" }}>
          <AlertTriangle size={15} style={{ color: "#ff5c7a", flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>Активные клиенты без монтажёра ({noMontager.length}):</span>
          {noMontager.map(c => (
            <button key={c.id} onClick={() => router.push(`/dashboard/clients/${c.id}`)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px 4px 4px", borderRadius: 999, background: "var(--inset2)", border: "1px solid var(--track)", cursor: "pointer" }}>
              <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={20} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)" }}>{c.name} {c.surname || ""}</span>
            </button>
          ))}
        </div>
      )}
      <Tour steps={TEAM_TOUR} open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}
