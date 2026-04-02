"use client";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { useTheme } from "@/components/ThemeProvider";

const navItems = [
  { id: "dashboard", path: "/dashboard", icon: "📊", label: "Дашборд" },
  { id: "clients", path: "/dashboard/clients", icon: "👥", label: "Клиенты" },
  { id: "scripts", path: "/dashboard/scripts", icon: "📝", label: "Сценарии" },
  { id: "montage", path: "/dashboard/montage", icon: "🎬", label: "Монтаж" },
  { id: "team", path: "/dashboard/team", icon: "🤝", label: "Команда" },
  { id: "settings", path: "/dashboard/settings", icon: "⚙️", label: "Настройки" },
];

export function Sidebar({ userRole }: { userRole: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { theme, toggle } = useTheme();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login"); router.refresh();
  };

  const isActive = (path: string) => {
    if (path === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(path);
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-[190px] flex flex-col border-r z-50"
      style={{ background: "var(--side)", borderColor: "var(--brd)", transition: "all .3s" }}>
      <div className="px-3 py-3 border-b" style={{ borderColor: "var(--brd)" }}>
        <div className="text-sm font-bold">
          <span style={{ color: "var(--t1)" }}>Easy</span>
          <span className="brand-gradient">Life</span>
          <span style={{ color: "var(--t1)" }}> AI</span>
        </div>
      </div>
      <nav className="flex-1 p-1.5 space-y-0.5">
        {navItems.map(item => (
          <button key={item.id} onClick={() => router.push(item.path)}
            className={`nav-item ${isActive(item.path) ? "active" : ""}`}>
            <span className="text-sm">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="p-2 border-t" style={{ borderColor: "var(--brd)" }}>
        <div className="flex items-center justify-between px-2 py-1 mb-2">
          <span className="text-[10px]" style={{ color: "var(--t2)" }}>{theme === "dark" ? "🌙" : "☀️"}</span>
          <button onClick={toggle} className="relative w-9 h-5 rounded-full" style={{ background: "var(--brd)" }}>
            <div className="absolute top-[3px] w-3.5 h-3.5 rounded-full transition-all"
              style={{ left: theme === "dark" ? 3 : 19, background: theme === "dark" ? "var(--cy)" : "var(--or)" }} />
          </button>
        </div>
        <button onClick={handleLogout} className="nav-item text-xs" style={{ color: "var(--t3)" }}>
          🚪 Выйти
        </button>
      </div>
    </aside>
  );
}
