"use client";
import { useEffect, useRef, useState } from "react";
import { Rocket, Check, X, ChevronDown, Link2, ExternalLink } from "lucide-react";

type Brand = { blogId: number; label: string };

// Привязка клиента к бренду Metricool: грузит список брендов и даёт выбрать,
// вместо ручного ввода blogId. value — текущий blogId, onPick сохраняет его.
export default function MetricoolBrandPicker({ blogId, onPick }: { blogId: number | null; onPick: (v: number | null) => void }) {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function loadBrands() {
    if (brands) { setOpen(o => !o); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/metricool/brands");
      const j = await r.json();
      if (!r.ok) { setErr(j?.error || "ошибка"); setBrands([]); }
      else { setBrands(j.brands || []); setOpen(true); }
    } catch (e: any) { setErr(String(e)); setBrands([]); }
    setBusy(false);
  }

  const current = brands?.find(b => b.blogId === blogId);

  return (
    <div ref={ref} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t2)" }}>🚀 Бренд в Metricool:</span>

      {/* статус привязки */}
      {blogId != null ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, background: "rgba(168,224,99,0.12)", border: "1px solid rgba(168,224,99,0.4)", fontSize: 12, color: "var(--t1)" }}>
          <Check size={13} style={{ color: "var(--gr)" }} />
          {current ? current.label : `blogId ${blogId}`}
          <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--t3)" }}>#{blogId}</span>
          <button onClick={() => onPick(null)} title="Отвязать" style={{ background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", display: "inline-flex", padding: 0 }}><X size={13} /></button>
        </span>
      ) : (
        <span style={{ fontSize: 12, color: "var(--t3)" }}>не привязан</span>
      )}

      {/* открыть аналитику бренда в Metricool */}
      {blogId != null && (
        <a href={`/api/metricool/open?blogId=${blogId}`} target="_blank" rel="noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "linear-gradient(135deg, var(--cy), var(--pu))", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
          Аналитика в Metricool <ExternalLink size={12} />
        </a>
      )}

      {/* кнопка выбора */}
      <div style={{ position: "relative" }}>
        <button onClick={loadBrands} disabled={busy}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "rgba(66,212,244,0.12)", border: "1px solid var(--brd)", color: "var(--cy)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          <Rocket size={13} /> {busy ? "Гружу…" : blogId != null ? "Сменить" : "Привязать бренд"} <ChevronDown size={12} />
        </button>

        {open && brands && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60, width: 280, maxHeight: 320, overflowY: "auto", background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 12, padding: 6, boxShadow: "0 16px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 8px" }}>Бренды Metricool ({brands.length})</div>
            {brands.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--t3)", padding: "8px" }}>{err ? `Ошибка: ${err}` : "Пусто или нет доступа"}</div>
            ) : brands.map(b => {
              const on = b.blogId === blogId;
              return (
                <button key={b.blogId} onClick={() => { onPick(b.blogId); setOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 8px", borderRadius: 8, background: on ? "rgba(157,107,255,0.12)" : "transparent", border: "none", color: "var(--t1)", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left" }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = "var(--inset2)"; }} onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                  {on ? <Check size={13} style={{ color: "var(--pu)", flexShrink: 0 }} /> : <Link2 size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{b.label}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--t3)" }}>#{b.blogId}</span>
                </button>
              );
            })}
            <button onClick={() => { setManual(m => !m); }} style={{ width: "100%", marginTop: 4, padding: "6px 8px", borderRadius: 8, background: "transparent", border: "1px dashed var(--brd)", color: "var(--t3)", fontSize: 11, cursor: "pointer" }}>
              ввести id вручную
            </button>
            {manual && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input type="number" placeholder="blogId" autoFocus
                  onKeyDown={e => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value; onPick(v ? Number(v) : null); setOpen(false); } }}
                  style={{ flex: 1, padding: "6px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, outline: "none" }} />
              </div>
            )}
          </div>
        )}
      </div>

      {err && !open && <span style={{ fontSize: 10, color: "#ff5c7a" }}>Metricool: {err}</span>}
    </div>
  );
}
