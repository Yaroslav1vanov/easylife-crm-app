"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { sectionAllowed, isOwner, seesOverview } from "@/components/RoleContext";
import Avatar from "@/components/Avatar";
import AlertsBell from "@/components/AlertsBell";
import { openGlobalSearch } from "@/components/GlobalSearch";
import Sheet from "@/components/Sheet";
import { useIsMobile } from "@/lib/useMedia";
import { useCrmTheme } from "@/components/CrmTheme";
import {
  LayoutDashboard, Users, FileText, Scissors, Send, Calendar, Rocket, Flame,
  HandshakeIcon, BarChart3, Mic, Coins, ClipboardList, BookOpen, Settings, LogOut, Wallet, Moon, Sun,
  CalendarCheck, CalendarDays, MoreHorizontal, Search, Target, ListChecks, type LucideIcon,
  Trash2, Bot,
} from "lucide-react";

function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} viewBox="0 0 745 605" style={{ display: "block", flexShrink: 0 }} aria-hidden>
      <g fill="#c6ff1c">
        <path d="M316 0L745 0L691.6 94Q657 155 587 155L158 155L211.4 61Q246 0 316 0Z" />
        <path d="M235 225L545 225L491.6 319Q457 380 387 380L77 380L130.4 286Q165 225 235 225Z" />
        <path d="M158 450L642 450L588.6 544Q554 605 484 605L0 605L53.4 511Q88 450 158 450Z" />
      </g>
    </svg>
  );
}
function Logo({ size = 26 }: { size?: number }) {
  return <div className="app-logo"><BrandMark size={size} /><span>EASYLIFE <b>AI</b></span></div>;
}

type NavItem = { id: string; path: string; icon: LucideIcon; label: string; short?: string };
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { title: "Работа", items: [
    { id: "today", path: "/dashboard/today", icon: CalendarCheck, label: "Сегодня" },
    { id: "tasks", path: "/dashboard/tasks", icon: ListChecks, label: "Задачи" },
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
    { id: "strategy", path: "/dashboard/strategy", icon: Target, label: "Стратегия" },
    { id: "team", path: "/dashboard/team", icon: HandshakeIcon, label: "Команда" },
    { id: "analytics", path: "/dashboard/analytics", icon: BarChart3, label: "Аналитика" },
    { id: "reports", path: "/dashboard/reports", icon: ClipboardList, label: "Отчёты" },
    { id: "payroll", path: "/dashboard/payroll", icon: Wallet, label: "ЗП команды" },
    { id: "ai-usage", path: "/dashboard/ai-usage", icon: Bot, label: "ИИ-чат: аналитика", short: "ИИ" },
    { id: "motivation", path: "/dashboard/motivation", icon: Coins, label: "Моя ЗП" },
  ]},
  { title: "Ещё", items: [
    { id: "guide", path: "/dashboard/guide", icon: BookOpen, label: "Гайд" },
    { id: "trash", path: "/dashboard/trash", icon: Trash2, label: "Корзина" },
    { id: "settings", path: "/dashboard/settings", icon: Settings, label: "Настройки" },
  ]},
];
const ALL_ITEMS = GROUPS.flatMap(g => g.items);

/** Нижний таб-бар: 4 главных раздела по роли + «Ещё» */
function tabsForRole(role: string): string[] {
  if (role === "montager") return ["today", "montage", "plan", "references"];
  if (role === "teamlead" || role === "assistant" || role === "project") return ["today", "scripts", "plan", "clients"];
  if (role === "sales") return ["today", "clients", "analytics", "reports"];
  return ["today", "dashboard", "clients", "plan"];
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Владелец", admin: "Админ", teamlead: "Тимлид", montager: "Монтажёр", assistant: "Ассистент", project: "Проджект", sales: "Продажи",
};

export function Sidebar({ userRole }: { userRole: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const isMobile = useIsMobile();
  const { theme, toggle: toggleTheme } = useCrmTheme();
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

  const NavGroups = () => (
    <nav className="side-nav">
      {GROUPS.map(g => {
        const items = g.items.filter(it => allowed(it.id));
        if (!items.length) return null;
        return (
          <div key={g.title}>
            <div className="v2-grp">{g.title}</div>
            {items.map(item => {
              const Icon = item.icon;
              return (
                <a key={item.id} {...linkProps(item)} className={`nav-item ${isActive(item.path) ? "active" : ""}`} aria-current={isActive(item.path) ? "page" : undefined}>
                  <Icon size={17} strokeWidth={1.9} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>{item.label}</span>
                </a>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const UserBlock = () => {
    const name = me?.name || "…";
    const role = ROLE_LABEL[userRole] || userRole;
    return (
      <div className="side-me">
        {userMenuOpen && (
          <div className="side-me-menu">
            <button onClick={toggleTheme} className="nav-item">
              {theme === "dark" ? <Sun size={16} strokeWidth={1.9} /> : <Moon size={16} strokeWidth={1.9} />}
              <span style={{ flex: 1, textAlign: "left" }}>{theme === "dark" ? "Светлая тема" : "Тёмная тема"}</span>
            </button>
            <button onClick={handleLogout} className="nav-item" style={{ color: "#ff9488" }}>
              <LogOut size={16} strokeWidth={1.9} style={{ color: "#ff9488" }} /><span style={{ flex: 1, textAlign: "left" }}>Выйти</span>
            </button>
          </div>
        )}
        <button onClick={() => setUserMenuOpen(v => !v)} className={`side-me-btn ${userMenuOpen ? "open" : ""}`} aria-expanded={userMenuOpen}>
          <Avatar name={name} src={me?.avatar_url} size={34} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <b>{name}</b>
            <small>{role}</small>
          </span>
        </button>
      </div>
    );
  };

  if (isMobile) {
    const tabs = tabsForRole(userRole).map(id => ALL_ITEMS.find(i => i.id === id)!).filter(i => i && allowed(i.id));
    const inTabs = new Set(tabs.map(t => t.id));
    const moreActive = !tabs.some(t => isActive(t.path));
    return (
      <>
        <div className="v2-topbar">
          <Logo size={22} />
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
          <button className="v2-opt" onClick={() => { setMoreOpen(false); openGlobalSearch(); }} style={{ marginBottom: 10 }}><Search size={16} /> Поиск по сценариям и роликам</button>
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
            <button className="v2-opt" onClick={toggleTheme}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} {theme === "dark" ? "Светлая тема" : "Тёмная тема"}</button>
            <button className="v2-opt" onClick={handleLogout} style={{ color: "var(--rd)" }}><LogOut size={16} /> Выйти</button>
          </div>
        </Sheet>
      </>
    );
  }

  return (
    <aside className="app-sidebar">
      <div className="side-top">
        <Logo size={26} />
        <span style={{ flex: 1 }} />
        <AlertsBell role={userRole} align="left" />
      </div>
      <button onClick={openGlobalSearch} title="Поиск по сценариям и роликам (Cmd + K)" className="side-search">
        <Search size={15} /> Поиск <kbd>⌘K</kbd>
      </button>
      <NavGroups />
      <UserBlock />
    </aside>
  );
}

export { isOwner };
