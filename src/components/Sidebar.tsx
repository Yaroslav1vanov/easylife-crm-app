"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { useTheme } from "@/components/ThemeProvider";

const navItems = [
  { id: "dashboard", path: "/dashboard", icon: "🏠", label: "Дашборд" },
  { id: "clients", path: "/dashboard/clients", icon: "👥", label: "Клиенты" },
  { id: "scripts", path: "/dashboard/scripts", icon: "📝", label: "Сценарии" },
  { id: "montage", path: "/dashboard/montage", icon: "🎬", label: "Монтаж" },
  { id: "reports", path: "/dashboard/reports", icon: "📊", label: "Отчёты" },
  { id: "team", path: "/dashboard/team", icon: "🤝", label: "Команда" },
  { id: "settings", path: "/dashboard/settings", icon: "⚙️", label: "Настройки" },
];

export function Sidebar({ userRole }: { userRole: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login"); router.refresh();
  };

  const isActive = (path: string) => {
    if (path === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(path);
  };

  const navigate = (path: string) => { router.push(path); setMobileOpen(false); };

  if (isMobile) {
    return (
      <>
        <div style={{ position:"fixed",top:0,left:0,right:0,height:50,zIndex:50,background:"var(--side)",borderBottom:"1px solid var(--brd)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px" }}>
          <button onClick={() => setMobileOpen(true)} style={{ border:"none",background:"transparent",color:"var(--t1)",cursor:"pointer",fontSize:20,padding:4 }}>☰</button>
          <div style={{ fontSize:14,fontWeight:700 }}><span style={{ color:"var(--t1)" }}>Easy</span><span className="brand-gradient">Life</span><span style={{ color:"var(--t1)" }}> AI</span></div>
          <div style={{ width:28 }}/>
        </div>
        {mobileOpen && <div onClick={() => setMobileOpen(false)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:90 }}/>}
        <div style={{ position:"fixed",top:0,left:0,bottom:0,width:250,zIndex:100,background:"var(--side)",borderRight:"1px solid var(--brd)",transform:mobileOpen?"translateX(0)":"translateX(-100%)",transition:"transform .3s ease",display:"flex",flexDirection:"column" }}>
          <div style={{ padding:"14px 12px",borderBottom:"1px solid var(--brd)",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div style={{ fontSize:14,fontWeight:700 }}><span style={{ color:"var(--t1)" }}>Easy</span><span className="brand-gradient">Life</span><span style={{ color:"var(--t1)" }}> AI</span></div>
            <button onClick={() => setMobileOpen(false)} style={{ border:"none",background:"transparent",color:"var(--t2)",cursor:"pointer",fontSize:18 }}>✕</button>
          </div>
          <nav style={{ flex:1,padding:8,display:"flex",flexDirection:"column",gap:2 }}>
            {navItems.map(item => (
              <button key={item.id} onClick={() => navigate(item.path)} className={`nav-item ${isActive(item.path) ? "active" : ""}`} style={{ fontSize:14,padding:"12px" }}>
                <span style={{ fontSize:16 }}>{item.icon}</span>{item.label}
              </button>
            ))}
          </nav>
          <div style={{ padding:"8px 10px 14px",borderTop:"1px solid var(--brd)" }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 4px",marginBottom:6 }}>
              <span style={{ fontSize:12,color:"var(--t2)" }}>{theme==="dark"?"🌙 Тёмная":"☀️ Светлая"}</span>
              <button onClick={toggle} style={{ width:40,height:22,borderRadius:11,border:"none",cursor:"pointer",background:"var(--brd)",position:"relative" }}>
                <div style={{ width:16,height:16,borderRadius:"50%",position:"absolute",top:3,left:theme==="dark"?3:21,background:theme==="dark"?"var(--cy)":"var(--or)",transition:"all .3s" }}/>
              </button>
            </div>
            <button onClick={handleLogout} className="nav-item" style={{ fontSize:13,color:"var(--t3)" }}>🚪 Выйти</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <aside className="app-sidebar" style={{ position:"fixed",left:0,top:0,height:"100vh",width:190,display:"flex",flexDirection:"column",borderRight:"1px solid var(--brd)",background:"var(--side)",zIndex:50 }}>
      <div style={{ padding:"12px",borderBottom:"1px solid var(--brd)" }}>
        <div className="app-logo" style={{ fontSize:14,fontWeight:700 }}><span style={{ color:"var(--t1)" }}>Easy</span><span className="brand-gradient">Life</span><span style={{ color:"var(--t1)" }}> AI</span></div>
      </div>
      <nav style={{ flex:1,padding:"6px",display:"flex",flexDirection:"column",gap:1 }}>
        {navItems.map(item => (
          <button key={item.id} onClick={() => router.push(item.path)} className={`nav-item ${isActive(item.path) ? "active" : ""}`}>
            <span style={{ fontSize:14 }}>{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>
      <div style={{ padding:"8px 10px 12px",borderTop:"1px solid var(--brd)" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px",marginBottom:4 }}>
          <span style={{ fontSize:10,color:"var(--t2)" }}>{theme==="dark"?"🌙":"☀️"}</span>
          <button onClick={toggle} style={{ width:36,height:20,borderRadius:10,border:"none",cursor:"pointer",background:"var(--brd)",position:"relative" }}>
            <div style={{ width:14,height:14,borderRadius:"50%",position:"absolute",top:3,left:theme==="dark"?3:19,background:theme==="dark"?"var(--cy)":"var(--or)",transition:"all .3s" }}/>
          </button>
        </div>
        <button onClick={handleLogout} className="nav-item" style={{ fontSize:12,color:"var(--t3)" }}>🚪 Выйти</button>
      </div>
    </aside>
  );
}
