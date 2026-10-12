"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";

/* Выбор клиента из списка с поиском — вместо длинной строки чипов, которая не влезает в экран.
   Кнопка с текущим клиентом → выпадающий список (поиск по имени, Enter — первый найденный, Esc — закрыть)
   и стрелки «предыдущий / следующий», чтобы листать клиентов по очереди. */
type C = { id: number; name: string; surname?: string | null; avatar_url?: string | null };

export default function ClientPicker({ clients, value, onChange }: { clients: C[]; value: number | null; onChange: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cur = clients.find(c => c.id === value) || null;
  const idx = cur ? clients.indexOf(cur) : -1;
  const full = (c: C) => `${c.name} ${c.surname || ""}`.trim();
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? clients.filter(c => full(c).toLowerCase().includes(t)) : clients;
  }, [clients, q]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => input.current?.focus(), 20);
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const pick = (id: number) => { onChange(id); setOpen(false); setQ(""); };
  const step = (d: number) => { if (!clients.length) return; const i = (idx + d + clients.length) % clients.length; onChange(clients[i].id); };
  const arrow: React.CSSProperties = { width: 38, height: 40, borderRadius: 10, border: "1px solid var(--brd)", background: "var(--card)", color: "var(--t2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

  return (
    <div ref={box} style={{ position: "relative", display: "flex", gap: 6, alignItems: "center", marginBottom: 14 }}>
      <button onClick={() => step(-1)} title="Предыдущий клиент" style={arrow}><ChevronLeft size={16} /></button>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 12px", minWidth: 260, maxWidth: "100%", borderRadius: 10,
          border: `1px solid ${open ? "var(--pu)" : "var(--brd)"}`, background: "var(--card)", color: "var(--t1)", cursor: "pointer", fontFamily: "inherit" }}>
        {cur ? <Avatar name={full(cur)} src={cur.avatar_url} size={24} /> : null}
        <b style={{ fontSize: 14, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur ? full(cur) : "Выберите клиента"}</b>
        <span style={{ fontSize: 11.5, color: "var(--t3)" }}>{idx >= 0 ? `${idx + 1} из ${clients.length}` : clients.length}</span>
        <ChevronDown size={16} style={{ color: "var(--t3)", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      <button onClick={() => step(1)} title="Следующий клиент" style={arrow}><ChevronRight size={16} /></button>

      {open && (
        <div style={{ position: "absolute", top: 46, left: 44, zIndex: 60, width: "min(380px, calc(100vw - 32px))", borderRadius: 12, border: "1px solid var(--brd)",
          background: "var(--side, var(--card))", boxShadow: "0 18px 50px rgba(0,0,0,.5)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--brd)" }}>
            <Search size={15} style={{ color: "var(--t3)" }} />
            <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Найти клиента…"
              onKeyDown={e => { if (e.key === "Enter" && list[0]) pick(list[0].id); if (e.key === "Escape") setOpen(false); }}
              style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "var(--t1)", fontSize: 14, fontFamily: "inherit" }} />
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto", padding: 6 }}>
            {!list.length && <div style={{ padding: 12, fontSize: 13, color: "var(--t3)" }}>Никого не нашли</div>}
            {list.map(c => (
              <button key={c.id} onClick={() => pick(c.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, border: 0, cursor: "pointer", fontFamily: "inherit",
                  background: c.id === value ? "rgba(157,107,255,.16)" : "transparent", color: "var(--t1)", textAlign: "left" }}
                onMouseEnter={e => { if (c.id !== value) e.currentTarget.style.background = "var(--v2-inset, rgba(255,255,255,.04))"; }}
                onMouseLeave={e => { if (c.id !== value) e.currentTarget.style.background = "transparent"; }}>
                <Avatar name={full(c)} src={c.avatar_url} size={24} />
                <span style={{ fontSize: 13.5, fontWeight: c.id === value ? 800 : 600 }}>{full(c)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
