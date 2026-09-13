"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { useTheme } from "@/components/ThemeProvider";
import { sectionAllowed, isOwner, seesOverview } from "@/components/RoleContext";
import Avatar from "@/components/Avatar";
import AlertsBell from "@/components/AlertsBell";
import Sheet from "@/components/Sheet";
import { useIsMobile } from "@/lib/useMedia";
import {
  LayoutDashboard, Users, FileText, Scissors, Send, Calendar, Rocket, Flame,
  HandshakeIcon, BarChart3, Mic, Coins, ClipboardList, BookOpen, Settings, LogOut, Moon, Sun, Wallet,
  CalendarCheck, CalendarDays, MoreHorizontal, type LucideIcon,
} from "lucide-react";

function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ borderRadius: size * 0.28, display: "block", flexShrink: 0 }} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#7b3fe4" />
      <rect x="6" y="13" width="20" height="13" rx="2.5" fill="#fff" />
      <rect x="6" y="8" width="20" height="5" rx="1.5" fill="#fff" />
      <path d="M10 8 L8.4 13 M15 8 L13.4 13 M20 8 L18.4 13 M25 8 L23.4 13" stroke="#7b3fe4" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

type NavItem = { id: string; path: string; icon: LucideIcon; label: string; short?: string };
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { title: "Работа", items: [
    { id: "today", path: "/dashboard/today", icon: CalendarCheck, label: "Сегодня" },
    { id: "dashboard", path: "/dashboard", icon: LayoutDashboard, label: "Дашборд" },
    { id: "transcribe", path: "/dashboard/transcribe", icon: Mic, label: "Транскрибация" },
    { id: "references", path: "/dashboard/references", icon: Flame, label: "Референсы", short: "Рефы" },
    { id: "scripts", path: "/dashboard/scripts", icon: FileText, label: "Сценарии" },
    { id: "montage", path: "/dashboard/montage", icon: Scissors, label: "Монтаж" },
    { id: "plan", path: "/dashboard/plan", icon: CalendarDays, label: "Контент-план", short: "План" },
    { id: "publications", path: "/dashboard/publications", icon: Send, label: "Публикации" },
    { id: "calendar", path: "/dashboard/calendar", icon: Calendar, label: "Календарь" },
  ]},
  { title: "Клиенты", items: [
    { id: "clients", path: "/dashboard/clients", icon: Users, label: "Клиенты" },
    { id: "metricool", path: "/dashboard/metricool", icon: Rocket, label: "Metricool" },
  ]},
  { title: "Управление", items: [
    { id: "team", path: "/dashboard/team", icon: HandshakeIcon, label: "Команда" },
    { id: "analytics", path: "/dashboard/analytics", icon: BarChart3, label: "Аналитика" },
    { id: "reports", path: "/dashboard/reports", icon: ClipboardList, label: "Отчёты" },
    { id: "payroll", path: "/dashboard/payroll", icon: Wallet, label: "ЗП команды" },
    { id: "motivation", path: "/dashboard/motivation", icon: Coins, label: "Моя ЗП" },
  ]},
  { title: "Ещё", items: [
    { id: "guide", path: "/dashboard/guide", icon: BookOpen, label: "Гайд" },
    { id: "settings", path: "/dashboard/settings", icon: Settings, label: "Настройки" },
  ]},
];
const ALL_ITEMS = GROUPS.flatMap(g => g.items);

/** Нижний таб-бар: 4 главных раздела по роли + «Ещё» */
function tabsForRole(role: string): string[] {
  if (role === "montager") return ["today", "montage", "plan", "references"];
  if (role === "teamlead" || role === "scriptwriter") return ["today", "scripts", "plan", "clients"];
  return ["today", "dashboard", "clients", "plan"];
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Владелец", admin: "Админ", teamlead: "Тимлид", montager: "Монтажёр", scriptwriter: "Сценарист", assistant: "Ассистент",
};

export function Sidebar({ userRole }: { userRole: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { theme, toggle } = useTheme();
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);
  const [me, setMe] = useState<{ name: string; avatar_url: string | null } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => { setMoreOpen(false); setUserMenuOpen(false); }, [pathname]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("name, avatar_url").eq("id", user.id).single();
      setMe({ name: profile?.name || user.email?.split("@")[0] || "Я", avatar_url: profile?.avatar_url || null });
    })();
  }, []);

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); router.refresh(); };

  const isActive = (path: string) => path === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(path);
  const allowed = (id: string) => {
    if (id === "dashboard" && !seesOverview(userRole)) return false; // сотруднику вместо дашборда — «Сегодня»
    return sectionAllowed(userRole, id);
  };
  const go = (path: string) => { router.push(path); setMoreOpen(false); };

  const linkProps = (item: NavItem) => ({
    href: item.path,
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault(); go(item.path);
    },
  });

  const NavGroups = ({ compact = false }: { compact?: boolean }) => (
    <nav style={{ flex: 1, padding: compact ? 6 : 8, display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
      {GROUPS.map(g => {
        const items = g.items.filter(it => allowed(it.id));
        if (!items.length) return null;
        return (
          <div key={g.title}>
            <div className="v2-grp">{g.title}</div>
            {items.map(item => {
              const Icon = item.icon;
              return (
                <a key={item.id} {...linkProps(item)} className={`nav-item ${isActive(item.path) ? "active" : ""}`}
                  style={{ fontSize: 13, padding: "8px 10px", gap: 10, textDecoration: "none" }}>
                  <Icon size={16} strokeWidth={1.8} />
                  <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
                </a>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const UserBlock = ({ compact = false }: { compact?: boolean }) => {
    const name = me?.name || "…";
    const role = ROLE_LABEL[userRole] || userRole;
    return (
      <div style={{ position: "relative", padding: compact ? "10px 8px" : "12px 10px", borderTop: "1px solid var(--brd)" }}>
        {userMenuOpen && (
          <div style={{ position: "absolute", bottom: "calc(100% - 4px)", left: 8, right: 8, background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 12, padding: 6, boxShadow: "0 12px 40px var(--inset2)", zIndex: 60 }}>
            <button onClick={toggle} className="nav-item" style={{ fontSize: 12, padding: "9px 10px", gap: 10 }}>
              {theme === "dark" ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
              <span style={{ flex: 1, textAlign: "left" }}>{theme === "dark" ? "Светлая тема" : "Тёмная тема"}</span>
            </button>
            <button onClick={handleLogout} className="nav-item" style={{ fontSize: 12, padding: "9px 10px", gap: 10, color: "var(--rd)" }}>
              <LogOut size={15} strokeWidth={1.8} /><span style={{ flex: 1, textAlign: "left" }}>Выйти</span>
            </button>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setUserMenuOpen(v => !v)}
            style={{ flex: 1, minWidth: 0, border: "none", background: userMenuOpen ? "rgba(157,107,255,0.1)" : "transparent", cursor: "pointer", padding: 6, borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar name={name} src={me?.avatar_url} size={32} />
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
              <div style={{ fontSize: 10, color: "var(--t3)", letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 600 }}>{role}</div>
            </div>
          </button>
        </div>
      </div>
    );
  };

  if (isMobile) {
    const tabs = tabsForRole(userRole).map(id => ALL_ITEMS.find(i => i.id === id)!).filter(i => i && allowed(i.id));
    const inTabs = new Set(tabs.map(t => t.id));
    const moreActive = !tabs.some(t => isActive(t.path));
    return (
      <>
        <div className="v2-topbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div className="app-logo" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
            <BrandMark size={22} /><span style={{ color: "var(--t1)" }}>Easy</span><span className="brand-gradient">Life</span><span style={{ color: "var(--t1)" }}> AI</span>
          </div>
          <AlertsBell role={userRole} />
        </div>
        <nav className="v2-tabbar">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} className={`v2-tab ${isActive(t.path) ? "on" : ""}`} onClick={() => go(t.path)}>
                <Icon size={22} strokeWidth={1.8} />{t.short || t.label}
              </button>
            );
          })}
          <button className={`v2-tab ${moreActive ? "on" : ""}`} onClick={() => setMoreOpen(true)}>
            <MoreHorizontal size={22} strokeWidth={1.8} />Ещё
          </button>
        </nav>
        <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Разделы" sub={me ? `${me.name} · ${ROLE_LABEL[userRole] || userRole}` : undefined}>
          {GROUPS.map(g => {
            const items = g.items.filter(it => allowed(it.id) && !inTabs.has(it.id));
            if (!items.length) return null;
            return (
              <div key={g.title} style={{ marginBottom: 10 }}>
                <div className="v2-grp" style={{ padding: "6px 4px 6px" }}>{g.title}</div>
                <div className="v2-opts">
                  {items.map(it => { const Icon = it.icon; return (
                    <button key={it.id} className={`v2-opt ${isActive(it.path) ? "on" : ""}`} onClick={() => go(it.path)}>
                      <Icon size={16} strokeWidth={1.8} style={{ color: "var(--pu)" }} /> {it.label}
                    </button>
                  ); })}
                </div>
              </div>
            );
          })}
          <div className="v2-opts" style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid var(--brd)" }}>
            <button className="v2-opt" onClick={toggle}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} {theme === "dark" ? "Светлая тема" : "Тёмная тема"}</button>
            <button className="v2-opt" onClick={handleLogout} style={{ color: "var(--rd)" }}><LogOut size={16} /> Выйти</button>
          </div>
        </Sheet>
      </>
    );
  }

  return (
    <aside className="app-sidebar" style={{ position: "fixed", left: 0, top: 0, height: "100vh", width: 216, display: "flex", flexDirection: "column", borderRight: "1px solid var(--brd)", background: "var(--side)", zIndex: 50 }}>
      <div style={{ padding: "16px 14px 10px", borderBottom: "1px solid var(--brd)" }}>
        <div className="app-logo" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 16, fontWeight: 700 }}>
          <BrandMark size={26} />
          <span style={{ display: "inline-flex" }}><span style={{ color: "var(--t1)" }}>Easy</span><span className="brand-gradient">Life</span><span style={{ color: "var(--t1)" }}> AI</span></span>
          <span style={{ flex: 1 }} />
          <AlertsBell role={userRole} align="left" />
        </div>
      </div>
      <NavGroups compact />
      <UserBlock compact />
    </aside>
  );
}

export { isOwner };
