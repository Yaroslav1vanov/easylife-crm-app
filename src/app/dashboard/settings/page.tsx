"use client";
import { useTheme } from "@/components/ThemeProvider";

export default function SettingsPage() {
  const { theme, toggle } = useTheme();

  return (
    <div style={{ maxWidth: 400 }}>
      <h1 className="text-lg font-bold mb-4" style={{ color: "var(--t1)" }}>Настройки</h1>
      <div className="card">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-xs font-medium" style={{ color: "var(--t1)" }}>Тема интерфейса</div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--t2)" }}>{theme === "dark" ? "Тёмная — комфортно для глаз" : "Светлая — чистый интерфейс"}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs">{theme === "dark" ? "🌙" : "☀️"}</span>
            <button onClick={toggle} className="relative w-10 h-5 rounded-full" style={{ background: "var(--brd)", border: "none", cursor: "pointer" }}>
              <div className="absolute top-[3px] w-3.5 h-3.5 rounded-full transition-all"
                style={{ left: theme === "dark" ? 3 : 21, background: theme === "dark" ? "var(--cy)" : "var(--or)" }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
