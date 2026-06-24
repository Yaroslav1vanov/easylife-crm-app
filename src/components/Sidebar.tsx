"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { useTheme } from "@/components/ThemeProvider";
import Avatar from "@/components/Avatar";
import {
  LayoutDashboard, Users, Layers, FileText, Scissors, Send, Calendar, Rocket,
  HandshakeIcon, BarChart3, Settings, LogOut, Moon, Sun, ChevronUp, type LucideIcon,
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

type NavItem = { id: string; path: string; icon: LucideIcon; label: string; soon?: boolean };

const navItems: NavItem[] = [
  { id: "dashboard", path: "/dashboard", icon: LayoutDashboard, label: "Дашборд" },
  { id: "clients", path: "/dashboard/clients", icon: Users, label: "Клиенты" },
  { id: "production", path: "/dashboard/production", icon: Layers, label: "Производство", soon: true },
  { id: "scripts", path: "/dashboard/scripts", icon: FileText, label: "Сценарии" },
  { id: "montage", path: "/dashboard/montage", icon: Scissors, label: "Монтаж" },
  { id: "publications", path: "/dashboard/publications", icon: Send, label: "Публикации" },
  { id: "metricool", path: "/dashboard/metricool", icon: Rocket, label: "Metricool" },
  { id: "calendar", path: "/dashboard/calendar", icon: Calendar, label: "Календарь" },
  { id: "team", path: "/dashboard/team", icon: HandshakeIcon, label: "Команда" },
  { id: "analytics", path: "/dashboard/analytics", icon: BarChart3, label: "Аналитика", soon: true },
  { id: "settings", path: "/dashboard/settings", icon: Settings, label: "Настройки" },
];

const ROLE_LABEL: Record<string, string> = {
  owner: "Владелец",
  admin: "Админ",
  teamlead: "Тимлид",
  montager: "Монтажёр",
  scriptwriter: "Сценарист",
};

export function Sidebar({ userRole }: { userRole: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [me, setMe] = useState<{ name: string; avatar_url: string | null } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => { setMobileOpen(false); setUserMenuOpen(false); }, [pathname]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("name, avatar_url").eq("id", user.id).single();
      setMe({
        name: profile?.name || user.email?.split("@")[0] || "Я",
        avatar_url: profile?.avatar_url || null,
      });
    })();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login"); router.refresh();
  };

  const isActive = (path: string) => {
    if (path === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(path);
  };

  const navigate = (path: string, soon?: boolean) => {
    // Заглушки тоже открываем — там будет страница «скоро»
    router.push(path);
    setMobileOpen(false);
  };

  const NavList = ({ compact = false }: { compact?: boolean }) => (
    <nav style={{ flex: 1, padding: compact ? 6 : 8, display: "flex", flexDirection: "column", gap: 2 }}>
      {navItems.map(item => {
        const active = isActive(item.path);
        const Icon = item.icon;
        return (
          <a
            key={item.id}
            href={item.path}
            onClick={(e) => {
              // обычный левый клик — SPA-навигация; Cmd/Ctrl/средний/правый — даём браузеру (новая вкладка)
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              navigate(item.path, item.soon);
            }}
            className={`nav-item ${active ? "active" : ""}`}
            style={{
              fontSize: compact ? 12 : 13,
              padding: compact ? "9px 10px" : "10px 12px",
              gap: 10,
              opacity: item.soon ? 0.78 : 1,
              textDecoration: "none",
            }}
          >
            <Icon size={compact ? 15 : 16} strokeWidth={1.8} />
            <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
            {item.soon && (
              <span style={{
                fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 4,
                background: "var(--track)", color: "var(--t3)", letterSpacing: 0.4,
              }}>soon</span>
            )}
          </a>
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
          <div style={{
            position: "absolute", bottom: "calc(100% - 4px)", left: 8, right: 8,
            background: "var(--side)", border: "1px solid var(--brd)",
            borderRadius: 12, padding: 6,
            boxShadow: "0 12px 40px var(--inset2)",
            zIndex: 60,
          }}>
            <button onClick={toggle} className="nav-item" style={{ fontSize: 12, padding: "9px 10px", gap: 10 }}>
              {theme === "dark" ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
              <span style={{ flex: 1, textAlign: "left" }}>{theme === "dark" ? "Светлая тема" : "Тёмная тема"}</span>
            </button>
            <button onClick={handleLogout} className="nav-item" style={{ fontSize: 12, padding: "9px 10px", gap: 10, color: "var(--rd)" }}>
              <LogOut size={15} strokeWidth={1.8} />
              <span style={{ flex: 1, textAlign: "left" }}>Выйти</span>
            </button>
          </div>
        )}
        <button
          onClick={() => setUserMenuOpen(v => !v)}
          style={{
            width: "100%", border: "none", background: userMenuOpen ? "rgba(157,107,255,0.1)" : "transparent",
            cursor: "pointer", padding: 6, borderRadius: 10,
            display: "flex", alignItems: "center", gap: 10,
            transition: "background .15s",
          }}
        >
          <Avatar name={name} src={me?.avatar_url} size={compact ? 32 : 36} />
          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <div style={{ fontSize: compact ? 11 : 12, fontWeight: 700, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
            <div style={{ fontSize: 9, color: "var(--t3)", letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 600 }}>{role}</div>
          </div>
          <ChevronUp size={14} strokeWidth={1.8} style={{ color: "var(--t3)", transform: userMenuOpen ? "rotate(0)" : "rotate(180deg)", transition: "transform .2s" }} />
        </button>
      </div>
    );
  };

  if (isMobile) {
    return (
      <>
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 50, zIndex: 50, background: "var(--side)", borderBottom: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px" }}>
          <button onClick={() => setMobileOpen(true)} style={{ border: "none", background: "transparent", color: "var(--t1)", cursor: "pointer", fontSize: 20, padding: 4 }}>☰</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700 }}><BrandMark size={22} /><span style={{ color: "var(--t1)" }}>Easy</span><span className="brand-gradient">Life</span><span style={{ color: "var(--t1)" }}> AI</span></div>
          <div style={{ width: 28 }} />
        </div>
        {mobileOpen && <div onClick={() => setMobileOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 90 }} />}
        <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 260, zIndex: 100, background: "var(--side)", borderRight: "1px solid var(--brd)", transform: mobileOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform .3s ease", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px 14px", borderBottom: "1px solid var(--brd)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="app-logo" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 16, fontWeight: 700 }}><BrandMark size={26} /><span style={{ color: "var(--t1)" }}>Easy</span><span className="brand-gradient">Life</span><span style={{ color: "var(--t1)" }}> AI</span></div>
            <button onClick={() => setMobileOpen(false)} style={{ border: "none", background: "transparent", color: "var(--t2)", cursor: "pointer", fontSize: 18 }}>✕</button>
          </div>
          <NavList />
          <UserBlock />
        </div>
      </>
    );
  }

  return (
    <aside className="app-sidebar" style={{ position: "fixed", left: 0, top: 0, height: "100vh", width: 210, display: "flex", flexDirection: "column", borderRight: "1px solid var(--brd)", background: "var(--side)", zIndex: 50 }}>
      <div style={{ padding: "16px 14px", borderBottom: "1px solid var(--brd)" }}>
        <div className="app-logo" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 16, fontWeight: 700 }}>
          <BrandMark size={26} />
          <span style={{ display: "inline-flex" }}>
            <span style={{ color: "var(--t1)" }}>Easy</span>
            <span className="brand-gradient">Life</span>
            <span style={{ color: "var(--t1)" }}> AI</span>
          </span>
        </div>
      </div>
      <NavList compact />
      <UserBlock compact />
    </aside>
  );
}
