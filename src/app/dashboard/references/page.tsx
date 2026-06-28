"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Reference } from "@/lib/database";
import { getStore, setStore } from "@/lib/store";
import Avatar from "@/components/Avatar";
import {
  Camera, Music2, Play, Plus, ExternalLink, Trash2, Eye, Heart, MessageCircle,
  ChevronDown, Filter, FileText, Database, Loader2,
} from "lucide-react";

const PLAT: Record<string, { label: string; Icon: any; color: string }> = {
  tiktok: { label: "TikTok", Icon: Music2, color: "#42d4f4" },
  instagram: { label: "Instagram", Icon: Camera, color: "#e1306c" },
  youtube: { label: "YouTube", Icon: Play, color: "#ff5c7a" },
};
const fmtNum = (n: number | null) => n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);

export default function ReferencesPage() {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>(getStore().clients || []);
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [openTr, setOpenTr] = useState<number | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    const s = getStore();
    let cls = s.clients;
    if (!cls) { cls = await db.getClients(supabase); setStore({ clients: cls, team: s.team, scripts: s.scripts }); }
    setClients(cls);
    const active = cls.filter(c => c.stage === "active");
    setClientId(active[0]?.id ?? cls[0]?.id ?? null);
    const { data, error } = await supabase.from("reference_videos").select("*").order("created_at", { ascending: false });
    if (error) setTableMissing(true); else setRefs((data || []) as Reference[]);
    setLoading(false);
  }

  const clientById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])) as Record<number, Client>, [clients]);
  const activeClients = useMemo(() => clients.filter(c => c.stage === "active").sort((a, b) => a.name.localeCompare(b.name)), [clients]);
  const list = useMemo(() => refs.filter(r => r.client_id === clientId), [refs, clientId]);
  const curClient = clientId != null ? clientById[clientId] : null;

  async function addRef() {
    const url = urlInput.trim();
    if (!url || !clientId) return;
    setAdding(true);
    try {
      const r = await fetch("/api/references/fetch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, clientId }) });
      const j = await r.json();
      if (!r.ok) alert("Не удалось: " + (j?.error || "ошибка"));
      else { setRefs(a => [j.reference, ...a]); setUrlInput(""); }
    } catch (e: any) { alert(String(e)); }
    setAdding(false);
  }
  async function saveNote(id: number, note: string) { await db.updateReference(supabase, id, { note }); setRefs(a => a.map(r => r.id === id ? { ...r, note } : r)); }
  async function del(id: number) { if (!confirm("Удалить референс?")) return; await db.deleteReference(supabase, id); setRefs(a => a.filter(r => r.id !== id)); }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Референсы · залётные ролики</h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>Вставь ссылку — подтянутся просмотры, комментарии и транскрибация</p>
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setMenu(m => !m)} style={{ padding: "9px 14px", borderRadius: 10, background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <Filter size={12} /><span style={{ color: "var(--t3)" }}>Клиент:</span>{curClient ? `${curClient.name} ${curClient.surname || ""}` : "—"}<ChevronDown size={12} />
          </button>
          {menu && <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 30, minWidth: 220, background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 10, padding: 4, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", maxHeight: 360, overflowY: "auto" }}>
            {activeClients.map(c => <button key={c.id} onClick={() => { setClientId(c.id); setMenu(false); }} className="nav-item" style={{ fontSize: 12, padding: "7px 10px", gap: 8 }}><Avatar name={c.name} src={c.avatar_url} size={20} /> {c.name} {c.surname || ""}</button>)}
          </div>}
        </div>
      </div>

      {tableMissing ? (
        <div style={{ padding: 24, borderRadius: 14, border: "1px solid rgba(255,174,66,0.4)", background: "rgba(255,174,66,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}><Database size={16} style={{ color: "var(--or)" }} /> Таблица референсов ещё не создана</div>
          <div style={{ fontSize: 13, color: "var(--t2)" }}>Прогони <code style={{ background: "var(--inset)", padding: "1px 6px", borderRadius: 5 }}>MIGRATION_2026-06-25_references.sql</code> в Supabase → SQL Editor.</div>
        </div>
      ) : (
        <>
          {/* добавление ссылки */}
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addRef(); }}
              placeholder="Вставь ссылку на TikTok / Instagram-ролик…"
              style={{ flex: 1, padding: "11px 14px", borderRadius: 10, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none" }} />
            <button onClick={addRef} disabled={adding || !urlInput.trim()}
              style={{ padding: "0 18px", borderRadius: 10, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, cursor: adding ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 7, opacity: adding ? 0.7 : 1 }}>
              {adding ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} {adding ? "Тяну…" : "Добавить"}
            </button>
          </div>

          {list.length === 0 ? (
            <div style={{ padding: 50, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>По этому клиенту пока нет референсов. Вставь ссылку выше.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
              {list.map(r => {
                const p = PLAT[r.platform || ""] || { label: r.platform || "?", Icon: FileText, color: "var(--t3)" };
                return (
                  <div key={r.id} className="card" style={{ borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 7, background: `${p.color}1f`, color: p.color, fontSize: 11, fontWeight: 700 }}><p.Icon size={12} /> {p.label}</span>
                      <span style={{ fontSize: 12, color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.author || "—"}</span>
                      <div style={{ flex: 1 }} />
                      <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "var(--pu)", display: "inline-flex" }}><ExternalLink size={15} /></a>
                      <button onClick={() => del(r.id)} style={{ background: "transparent", border: "none", color: "var(--rd)", cursor: "pointer", display: "inline-flex" }}><Trash2 size={14} /></button>
                    </div>

                    <div style={{ display: "flex", gap: 16 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: "var(--t1)" }}><Eye size={14} style={{ color: "var(--cy)" }} /> {fmtNum(r.views)}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: "var(--t1)" }}><MessageCircle size={14} style={{ color: "var(--pu)" }} /> {fmtNum(r.comments)}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: "var(--t1)" }}><Heart size={14} style={{ color: "var(--rd)" }} /> {fmtNum(r.likes)}</span>
                    </div>

                    {r.transcript && (
                      <div>
                        <button onClick={() => setOpenTr(openTr === r.id ? null : r.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, background: "var(--inset)", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          <FileText size={12} /> Транскрибация {openTr === r.id ? "▲" : "▼"}
                        </button>
                        {openTr === r.id && <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 9, background: "var(--inset2)", border: "1px solid var(--brd)", fontSize: 12, lineHeight: 1.5, color: "var(--t1)", maxHeight: 220, overflowY: "auto", whiteSpace: "pre-wrap" }}>{r.transcript}</div>}
                      </div>
                    )}

                    <textarea defaultValue={r.note || ""} onBlur={e => { if (e.target.value !== (r.note || "")) saveNote(r.id, e.target.value); }} rows={2}
                      placeholder="Заметка: почему залетел / что адаптируем…"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
