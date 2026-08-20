"use client";
import { useEffect, useRef, useState } from "react";
import { TeamMember } from "@/lib/database";
import Avatar from "@/components/Avatar";
import { Eye, ChevronDown, Check } from "lucide-react";

// «Смотреть как» — владелец/ассистент открывает дашборд глазами сотрудника.
// Два раскрывающихся списка (тимлиды / монтажёры), чтобы не тянуть строку из 12 чипов.
export default function ViewAsSwitch({ team, viewAs, setViewAs }: {
  team: TeamMember[];
  viewAs: number | null;
  setViewAs: (v: number | null) => void;
}) {
  const [open, setOpen] = useState<null | "tl" | "mg">(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const leads = team.filter(t => t.member_type === "teamlead").sort((a, b) => a.name.localeCompare(b.name));
  const eds = team.filter(t => t.member_type === "montager").sort((a, b) => a.name.localeCompare(b.name));
  const current = viewAs != null ? team.find(t => t.id === viewAs) || null : null;

  const Drop = ({ kind, label, list, color }: { kind: "tl" | "mg"; label: string; list: TeamMember[]; color: string }) => {
    const activeHere = !!current && current.member_type === (kind === "mg" ? "montager" : "teamlead");
    return (
      <div style={{ position: "relative" }}>
        <button onClick={() => setOpen(open === kind ? null : kind)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 9,
            border: `1px solid ${activeHere ? color : "var(--brd)"}`,
            background: activeHere ? `${color}1f` : "transparent",
            color: activeHere ? color : "var(--t2)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          {activeHere && current ? (
            <>
              <Avatar name={current.name} src={current.avatar_url} size={18} />
              {current.name}
            </>
          ) : (
            <>{label} <span style={{ opacity: .6 }}>{list.length}</span></>
          )}
          <ChevronDown size={12} />
        </button>
        {open === kind && (
          <div style={{ position: "absolute", top: "calc(100% + 5px)", left: 0, zIndex: 320, minWidth: 210,
            background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 11, padding: 5,
            boxShadow: "0 18px 46px rgba(0,0,0,.6)", maxHeight: 320, overflowY: "auto",
            backdropFilter: "none" }}>
            {list.length === 0 && <div style={{ padding: "8px 10px", fontSize: 11, color: "var(--t3)" }}>пусто</div>}
            {list.map(t => {
              const on = viewAs === t.id;
              return (
                <button key={t.id} onClick={() => { setViewAs(on ? null : t.id); setOpen(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 9px", borderRadius: 8,
                    background: on ? `${color}1f` : "transparent", border: "none", cursor: "pointer",
                    color: on ? color : "var(--t1)", fontSize: 12, fontWeight: on ? 800 : 600, textAlign: "left" }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = "var(--inset2)"; }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                  <Avatar name={t.name} src={t.avatar_url} size={22} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                  {on && <Check size={13} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={ref} className="card" style={{ padding: "10px 13px", borderRadius: 13, marginBottom: 14,
      display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap",
      position: "relative", zIndex: open ? 300 : 40 }}>
      <Eye size={14} style={{ color: "var(--pu)", flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--t2)" }}>Смотреть как:</span>
      <button onClick={() => { setViewAs(null); setOpen(null); }}
        style={{ padding: "6px 13px", borderRadius: 9, fontSize: 11, fontWeight: 800, cursor: "pointer",
          border: `1px solid ${viewAs === null ? "var(--pu)" : "var(--brd)"}`,
          background: viewAs === null ? "rgba(157,107,255,.15)" : "transparent",
          color: viewAs === null ? "var(--pu)" : "var(--t3)" }}>
        Я
      </button>
      <Drop kind="tl" label="Тимлиды" list={leads} color="#9d6bff" />
      <Drop kind="mg" label="Монтажёры" list={eds} color="#ffae42" />
      {current && (
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--t3)" }}>
          показан экран «{current.name}» · ты просто смотришь
        </span>
      )}
    </div>
  );
}
