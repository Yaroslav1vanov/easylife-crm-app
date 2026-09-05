"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, ClientMonth, TeamMember, Profile, OnboardingProgress } from "@/lib/database";
import { getStore, setStore } from "@/lib/store";
import { useRole, seesOverview } from "@/components/RoleContext";
import OwnerDashboard from "@/components/OwnerDashboard";

function ymOfDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function todayIsoLocal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e: any) { return { error: e?.message || String(e) }; }
  render() {
    if (this.state.error) return <div style={{ padding: 24, color: "#f87171", fontFamily: "monospace", fontSize: 12 }}>Ошибка дашборда: {this.state.error}</div>;
    return this.props.children;
  }
}

function DashboardInner() {
  const router = useRouter();
  const role = useRole();
  // Сотруднику главный экран — «Сегодня»; общий дашборд только владельцу/ассистенту
  useEffect(() => { if (!seesOverview(role)) router.replace("/dashboard/today"); }, [role]);
  const supabase = createClient();
  const todayIso = todayIsoLocal();
  const currentYM = ymOfDate(new Date());

  const cached = getStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clients, setClients] = useState<Client[]>(cached.clients || []);
  const [scripts, setScripts] = useState<Script[]>(cached.scripts || []);
  const [clientMonths, setClientMonths] = useState<ClientMonth[]>(cached.clientMonths || []);
  const [team, setTeam] = useState<TeamMember[]>(cached.team || []);
  const [calTargets, setCalTargets] = useState<Record<string, number>>({});
  const [overdueTasks, setOverdueTasks] = useState<any[]>([]);
  const [onbProgresses, setOnbProgresses] = useState<OnboardingProgress[]>([]);
  const [loading, setLoading] = useState(!cached.scripts);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentYM);

  async function saveCalTarget(clientId: number, ym: string, n: number) {
    setCalTargets(t => ({ ...t, [`${clientId}:${ym}`]: n }));
    const { error } = await db.setCalendarTarget(supabase, clientId, ym, n);
    if (error) alert("План не сохранился: " + (error.message || error));
  }

  useEffect(() => {
    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const [p, cls, t, tasks, cmRes, onb, ct] = await Promise.all([
            db.getProfile(supabase), db.getClients(supabase), db.getTeam(supabase), db.getAllOverdueTasks(supabase),
            db.getClientMonths(supabase), db.getAllOnboardingProgress(supabase), db.getCalendarTargets(supabase),
          ]);
          setCalTargets(Object.fromEntries((ct.data || []).map(x => [`${x.client_id}:${x.ym}`, x.target])));
          setProfile(p); setClients(cls || []); setTeam(t || []); setOverdueTasks(tasks || []);
          setClientMonths(cmRes?.data || []); setOnbProgresses(onb || []);
          const scr = await db.getScriptsForClients(supabase, (cls || []).filter(c => c.stage !== "churned").map(c => c.id));
          setScripts(scr);
          setStore({ clients: cls || [], team: t || [], scripts: scr, clientMonths: cmRes?.data || [] });
          setLoadError(null);
          break;
        } catch (e: any) {
          const msg = e?.message || String(e);
          if (/lock/i.test(msg) && attempt < 2) { await new Promise(r => setTimeout(r, 250 * (attempt + 1))); continue; }
          setLoadError(msg); break;
        }
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;
  if (loadError) return <div style={{ padding: 24, color: "#f87171", fontFamily: "monospace", fontSize: 12 }}>Load error: {loadError}</div>;

  return (
    <OwnerDashboard
      clients={clients} clientMonths={clientMonths} scripts={scripts} team={team}
      onbProgresses={onbProgresses} overdueTasks={overdueTasks}
      calTargets={calTargets} onSetTarget={saveCalTarget}
      selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} currentYM={currentYM}
      todayIso={todayIso} role={role} meName={profile?.name || profile?.email?.split("@")[0] || "друг"}
    />
  );
}

export default function DashboardPage() {
  return <ErrorBoundary><DashboardInner /></ErrorBoundary>;
}
