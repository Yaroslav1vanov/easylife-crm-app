"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, ClientMonth, TeamMember } from "@/lib/database";
import { myClients } from "@/lib/scope";
import { SCRIPT_LEAD, VIDEO_LEAD } from "@/components/ScriptModal";
import { Bell } from "lucide-react";

/* Уведомления внутри CRM: у каждого — только его просрочки.
   Считаем на лету из данных, ничего не храним: список всегда актуален,
   старые «висяки» не накапливаются мусором. Прочитанное помним в браузере. */

type Alert = {
  id: string;
  kind: "script" | "montage" | "publish" | "month" | "onboarding";
  title: string;
  sub: string;
  days: number;          // насколько просрочено (дней)
  href: string;
};

const KIND: Record<Alert["kind"], { label: string; color: string; icon: string }> = {
  script:     { label: "Сценарий",   color: "#9d6bff", icon: "✍️" },
  montage:    { label: "Монтаж",     color: "#42d4f4", icon: "✂️" },
  publish:    { label: "Публикация", color: "#a8e063", icon: "🚀" },
  month:      { label: "Месяц",      color: "#ffae42", icon: "📅" },
  onboarding: { label: "Онбординг",  color: "#ff6b8b", icon: "🧩" },
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
const READ_KEY = "crm-alerts-read";

export default function AlertsBell({ role }: { role: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [months, setMonths] = useState<ClientMonth[]>([]);
  const [read, setRead] = useState<Set<string>>(new Set());

  useEffect(() => {
    try { setRead(new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]"))); } catch {}
    syncPublished().then(load);
    const t = setInterval(load, 5 * 60 * 1000);   // тихо обновляем раз в 5 минут
    return () => clearInterval(t);
  }, []);

  /** Сверяем вышедшие посты с Metricool / Upload-Post не чаще раза в 20 минут на браузер.
   *  Бесплатный Vercel даёт расписание только раз в день — а так статусы обновляются,
   *  пока кто-то из команды работает в CRM. */
  async function syncPublished() {
    try {
      const last = Number(localStorage.getItem("crm-pubsync-at") || 0);
      if (Date.now() - last < 20 * 60 * 1000) return;
      localStorage.setItem("crm-pubsync-at", String(Date.now()));
      await fetch("/api/cron/publications-sync", { cache: "no-store" });
    } catch { /* не критично — расписание подхватит утром */ }
  }

  async function load() {
    const [cls, tm] = await Promise.all([db.getClients(supabase), db.getTeam(supabase)]);
    const { data: { session } } = await supabase.auth.getSession();
    const me = session?.user?.id ? tm.find((t: TeamMember) => t.profile_id === session.user.id) || null : null;
    const mine = myClients(role, me, cls).filter(c => c.stage === "active");
    setClients(mine);
    if (!mine.length) { setScripts([]); setMonths([]); return; }
    const [all, cmRes] = await Promise.all([
      db.getScriptsLite(supabase, mine.map(c => c.id)),   // колокольчику тексты не нужны — только статусы и даты
      db.getClientMonths(supabase),
    ]);
    setScripts(all);
    setMonths((cmRes?.data || []).filter((m: ClientMonth) => mine.some(c => c.id === m.client_id)));
  }

  const alerts = useMemo<Alert[]>(() => {
    const today = iso(new Date());
    const nameOf = (id: number) => { const c = clients.find(x => x.id === id); return c ? `${c.name} ${c.surname || ""}`.trim() : "?"; };
    const out: Alert[] = [];

    for (const s of scripts) {
      if (!s.pub_date) continue;
      const cname = nameOf(s.client_id);
      const title = (s.hook_text || s.hook || `Сценарий #${s.order_num || "—"}`).slice(0, 46);

      // сценарий не написан, а срок сдачи текста прошёл
      if (s.script_status !== "approved") {
        const due = addDays(s.pub_date, -SCRIPT_LEAD);
        const late = daysBetween(due, today);
        if (late > 0) out.push({ id: `sc-${s.id}`, kind: "script", title, sub: cname, days: late, href: `/dashboard/scripts?open=${s.id}` });
        continue;
      }
      // ролик не сдан, а срок монтажа прошёл
      if (s.video_status !== "ready" && s.video_status !== "published") {
        const due = addDays(s.pub_date, -VIDEO_LEAD);
        const late = daysBetween(due, today);
        if (late > 0) out.push({ id: `mg-${s.id}`, kind: "montage", title, sub: cname, days: late, href: `/dashboard/montage?open=${s.id}` });
        continue;
      }
      // ролик готов, но дата публикации прошла
      if (s.video_status === "ready") {
        const late = daysBetween(s.pub_date, today);
        if (late > 0) out.push({ id: `pb-${s.id}`, kind: "publish", title, sub: cname, days: late, href: `/dashboard/publications` });
      }
    }

    // месяц кончается, а пакет не выбран
    for (const m of months) {
      if (m.status !== "active" && m.status !== "onboarding") continue;
      const left = daysBetween(today, m.end_date);
      if (left > 5) continue;
      const pub = scripts.filter(s => s.client_id === m.client_id && s.month_number === m.month_number && s.video_status === "published").length;
      const pkg = m.package || 0;
      if (pkg && pub >= pkg) continue;
      out.push({
        id: `mo-${m.id}`, kind: "month",
        title: `M${m.month_number}: ${pub} из ${pkg}`,
        sub: `${nameOf(m.client_id)} · ${left < 0 ? `просрочен ${-left} дн` : left === 0 ? "последний день" : `осталось ${left} дн`}`,
        days: left < 0 ? -left : 0,
        href: `/dashboard/clients/${m.client_id}`,
      });
    }

    return out.sort((a, b) => b.days - a.days);
  }, [scripts, months, clients]);

  const unread = alerts.filter(a => !read.has(a.id));
  const markAllRead = () => {
    const next = new Set([...Array.from(read), ...alerts.map(a => a.id)]);
    setRead(next);
    try { localStorage.setItem(READ_KEY, JSON.stringify(Array.from(next))); } catch {}
  };
  const go = (a: Alert) => {
    const next = new Set([...Array.from(read), a.id]);
    setRead(next);
    try { localStorage.setItem(READ_KEY, JSON.stringify(Array.from(next))); } catch {}
    setOpen(false);
    router.push(a.href);
  };

  const byKind = useMemo(() => {
    const g: Record<string, Alert[]> = {};
    for (const a of alerts) (g[a.kind] ||= []).push(a);
    return g;
  }, [alerts]);

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)} title="Просрочки и дедлайны"
        style={{ position: "relative", width: 36, height: 36, borderRadius: 10, background: open ? "rgba(157,107,255,0.16)" : "transparent",
          border: "1px solid var(--brd)", color: unread.length ? "var(--or)" : "var(--t3)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Bell size={16} />
        {unread.length > 0 && (
          <span style={{ position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9,
            background: "#ff5c7a", color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
          <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 210, width: 360, maxWidth: "92vw", maxHeight: 460, overflowY: "auto",
            background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 14, boxShadow: "0 18px 50px rgba(0,0,0,0.55)", padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>
                {alerts.length ? `Требует внимания · ${alerts.length}` : "Всё чисто"}
              </span>
              {alerts.length > 0 && (
                <button onClick={markAllRead} style={{ background: "transparent", border: "none", color: "var(--t3)", fontSize: 11, cursor: "pointer" }}>отметить прочитанным</button>
              )}
            </div>

            {!alerts.length && (
              <div style={{ padding: "18px 6px", fontSize: 12.5, color: "var(--t3)", textAlign: "center", lineHeight: 1.6 }}>
                Просрочек нет.<br />Все сценарии, ролики и публикации в срок.
              </div>
            )}

            {(["month", "publish", "montage", "script", "onboarding"] as const).map(k => {
              const list = byKind[k]; if (!list?.length) return null;
              const meta = KIND[k];
              return (
                <div key={k} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: meta.color, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                    {meta.icon} {meta.label} · {list.length}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {list.slice(0, 8).map(a => {
                      const isNew = !read.has(a.id);
                      return (
                        <button key={a.id} onClick={() => go(a)}
                          style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                            background: isNew ? "rgba(255,92,122,0.07)" : "var(--inset)", border: `1px solid ${isNew ? "rgba(255,92,122,0.28)" : "var(--brd)"}` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</div>
                            <div style={{ fontSize: 10.5, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.sub}</div>
                          </div>
                          {a.days > 0 && (
                            <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: a.days > 3 ? "#ff5c7a" : "var(--or)" }}>
                              +{a.days} дн
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {list.length > 8 && <div style={{ fontSize: 10.5, color: "var(--t3)", paddingLeft: 4 }}>…и ещё {list.length - 8}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
