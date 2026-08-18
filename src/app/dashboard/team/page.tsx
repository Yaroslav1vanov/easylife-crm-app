"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { TeamMember, Client, ClientMonth } from "@/lib/database";
import AvatarUploader from "@/components/AvatarUploader";
import Avatar from "@/components/Avatar";
import Tour, { TourButton, type TourStep } from "@/components/Tour";
import { useIsOwner } from "@/components/RoleContext";
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
  const [clientMonths, setClientMonths] = useState<ClientMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("Монтажёр");
  const [newType, setNewType] = useState("montager");
  const [tourOpen, setTourOpen] = useState(false);
  const isOwner = useIsOwner();
  const [accessFor, setAccessFor] = useState<TeamMember | null>(null);   // кому выдаём доступ
  const [accessBusy, setAccessBusy] = useState<number | null>(null);
  const [accEmail, setAccEmail] = useState("");
  const [accPass, setAccPass] = useState("");
  const [accRole, setAccRole] = useState("montager");
  const [accHint, setAccHint] = useState<string | null>(null);

  // Открыть окно выдачи доступа: роль подставляем по типу сотрудника
  function openAccess(m: TeamMember) {
    setAccessFor(m);
    setAccEmail(""); setAccPass(""); setAccHint(null);
    setAccRole(m.member_type === "montager" ? "montager" : "teamlead");
  }

  async function grantAccess() {
    if (!accessFor) return;
    setAccessBusy(accessFor.id); setAccHint(null);
    try {
      const r = await fetch(`/api/team/${accessFor.id}/access`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: accEmail.trim(), password: accPass, role: accRole }),
      });
      const j = await r.json();
      if (!r.ok) setAccHint(j?.error || "не получилось");
      else { setAccessFor(null); await load(); }
    } catch (e: any) { setAccHint(String(e)); }
    setAccessBusy(null);
  }

  async function revokeAccess(id: number, name: string) {
    if (!confirm(`Отозвать доступ у ${name}? Аккаунт останется, но входить в CRM он не сможет.`)) return;
    setAccessBusy(id);
    try {
      const r = await fetch(`/api/team/${id}/access`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) alert(j?.error || "не получилось");
      else await load();
    } catch (e: any) { alert(String(e)); }
    setAccessBusy(null);
  }

  useEffect(() => { load(); }, []);
  async function load() {
    const [tm, cls, cmRes] = await Promise.all([db.getTeam(supabase), db.getClients(supabase), db.getClientMonths(supabase)]);
    setTeam(tm); setClients(cls); setClientMonths(cmRes?.data || []); setLoading(false);
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
  // Сколько роликов в месяц на сотруднике = сумма пакетов ТЕКУЩИХ контрактных месяцев его клиентов.
  // Берём активный месяц клиента (или онбординг), иначе — последний открытый; фолбэк на c.package.
  const pkgOfClient = (cid: number, fallback: number) => {
    const ms = clientMonths.filter(m => m.client_id === cid && m.status !== "cancelled" && m.status !== "closed");
    const cur = ms.find(m => m.status === "active") || ms.find(m => m.status === "onboarding")
      || [...ms].sort((a, b) => b.month_number - a.month_number)[0];
    return (cur?.package ?? fallback) || 0;
  };
  const monthlyLoad = (m: TeamMember) =>
    clientsOf(m).reduce((sum, c) => sum + pkgOfClient(c.id, c.package || 0), 0);

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
            <span style={{ color: "var(--t3)" }}>· {pkgOfClient(c.id, c.package || 0)} рол.</span>
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
                        {m.member_type !== "admin" && list.length > 0 && (
                          <div title="Сумма пакетов текущих месяцев его клиентов" style={{ marginTop: 4, fontSize: 10, fontWeight: 800, color: "var(--t2)", whiteSpace: "nowrap" }}>
                            {monthlyLoad(m)} <span style={{ color: "var(--t3)", fontWeight: 600 }}>рол./мес</span>
                          </div>
                        )}
                      </div>
                      {m.member_type !== "admin" && (
                        <button onClick={() => removeMember(m.id)} title="Удалить" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, background: "transparent", border: "1px solid var(--brd)", color: "var(--t3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
                      )}
                    </div>
                    {/* Доступ в CRM — виден только владельцу */}
                    {isOwner && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--track)" }}>
                        {m.profile_id ? (
                          <>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--gr)" }}>🔑 доступ есть</span>
                            <button onClick={() => revokeAccess(m.id, m.name)} disabled={accessBusy === m.id}
                              style={{ marginLeft: "auto", padding: "4px 9px", borderRadius: 7, background: "transparent", border: "1px solid var(--brd)", color: "var(--t3)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                              отозвать
                            </button>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: 10, color: "var(--t3)" }}>нет доступа в CRM</span>
                            <button onClick={() => openAccess(m)} disabled={accessBusy === m.id}
                              style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 7, background: "rgba(66,212,244,0.12)", border: "1px solid var(--brd)", color: "var(--cy)", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>
                              🔑 Выдать доступ
                            </button>
                          </>
                        )}
                      </div>
                    )}
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
      {/* Выдать доступ в CRM */}
      {accessFor && (
        <div onClick={() => setAccessFor(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 18, width: "100%", maxWidth: 440, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <h3 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 17, fontWeight: 800, color: "var(--t1)" }}>🔑 Доступ в CRM</h3>
              <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>для <b style={{ color: "var(--t1)" }}>{accessFor.name}</b> · {accessFor.role_title}</div>
            </div>

            <div>
              <label style={{ fontSize: 9, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 5 }}>Почта сотрудника</label>
              <input value={accEmail} onChange={e => setAccEmail(e.target.value)} placeholder="name@gmail.com" autoFocus style={fld} />
            </div>

            <div>
              <label style={{ fontSize: 9, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 5 }}>Пароль <span style={{ fontWeight: 500, textTransform: "none" }}>(если аккаунта ещё нет)</span></label>
              <input value={accPass} onChange={e => setAccPass(e.target.value)} placeholder="минимум 6 символов" style={fld} />
            </div>

            <div>
              <label style={{ fontSize: 9, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 5 }}>Что видит</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { v: "montager", l: "Монтажёр", d: "Дашборд, Монтаж, Референсы, Гайд" },
                  { v: "teamlead", l: "Менеджер / ассистент", d: "всё, кроме ЗП" },
                ].map(o => (
                  <button key={o.v} onClick={() => setAccRole(o.v)} title={o.d}
                    style={{ padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: "pointer",
                      border: `1px solid ${accRole === o.v ? "var(--cy)" : "var(--brd)"}`,
                      background: accRole === o.v ? "rgba(66,212,244,0.12)" : "transparent",
                      color: accRole === o.v ? "var(--cy)" : "var(--t2)" }}>
                    {o.l}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 6 }}>
                {accRole === "montager" ? "Дашборд, Монтаж, Референсы, Гайд" : "Все разделы, кроме «ЗП команды» — зарплаты видит только владелец"}
              </div>
            </div>

            {accHint && (
              <div style={{ fontSize: 11, color: "var(--or)", background: "rgba(255,174,66,0.08)", border: "1px solid rgba(255,174,66,0.35)", borderRadius: 9, padding: "9px 11px", lineHeight: 1.5 }}>{accHint}</div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setAccessFor(null)} style={{ padding: "9px 14px", borderRadius: 9, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Отмена</button>
              <button onClick={grantAccess} disabled={!accEmail.trim() || accessBusy != null}
                style={{ padding: "9px 18px", borderRadius: 9, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: !accEmail.trim() || accessBusy != null ? 0.6 : 1 }}>
                {accessBusy != null ? "Выдаю…" : "Выдать доступ"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Tour steps={TEAM_TOUR} open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}
