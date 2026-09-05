"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, ClientMonth, Script, TeamMember, OnboardingProgress, Profile } from "@/lib/database";
import { getStore, setStore } from "@/lib/store";
import { useRole, seesOverview } from "@/components/RoleContext";
import TodayView from "@/components/TodayView";
import ViewAsSwitch from "@/components/ViewAsSwitch";

function todayIsoLocal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

export default function TodayPage() {
  const supabase = createClient();
  const role = useRole();
  const cached = getStore();
  const [clients, setClients] = useState<Client[]>(cached.clients || []);
  const [team, setTeam] = useState<TeamMember[]>(cached.team || []);
  const [scripts, setScripts] = useState<Script[]>(cached.scripts || []);
  const [clientMonths, setClientMonths] = useState<ClientMonth[]>(cached.clientMonths || []);
  const [onb, setOnb] = useState<OnboardingProgress[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!cached.scripts);
  const [viewAs, setViewAs] = useState<number | null>(null);

  async function load() {
    const [cls, tm, pr, cmRes, ob] = await Promise.all([
      db.getClients(supabase), db.getTeam(supabase), db.getProfile(supabase), db.getClientMonths(supabase), db.getAllOnboardingProgress(supabase),
    ]);
    setClients(cls); setTeam(tm); setProfile(pr); setClientMonths(cmRes?.data || []); setOnb(ob);
    const all = await db.getScriptsForClients(supabase, cls.filter(c => c.stage !== "churned").map(c => c.id));
    setScripts(all);
    setStore({ clients: cls, team: tm, scripts: all, clientMonths: cmRes?.data || [] });
    setLoading(false);
  }
  useEffect(() => { load(); const as_ = new URLSearchParams(window.location.search).get("as"); if (as_) setViewAs(Number(as_)); }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;

  const overview = seesOverview(role);
  const meMember = team.find(t => t.profile_id === profile?.id) || null;
  const member = overview ? (viewAs != null ? team.find(t => t.id === viewAs) || null : null) : meMember;
  const viewAll = !member;

  return (
    <TodayView
      role={role} member={member} viewAll={viewAll}
      clients={clients} clientMonths={clientMonths} scripts={scripts} team={team}
      onbProgresses={onb} todayIso={todayIsoLocal()} onReload={load}
      headerExtra={overview && team.length > 0 ? <ViewAsSwitch team={team} viewAs={viewAs} setViewAs={setViewAs} /> : undefined}
    />
  );
}
