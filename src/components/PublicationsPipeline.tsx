"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, TeamMember, Publication, PubStatus } from "@/lib/database";
import { getStore, setStore } from "@/lib/store";
import Avatar from "@/components/Avatar";
import {
  Camera, Play, Music2, AtSign, Wand2, CheckCircle2, X, ExternalLink,
  RefreshCw, AlertTriangle, Database, CalendarDays, type LucideIcon,
} from "lucide-react";

type Channel = { id: string; label: string; Icon: LucideIcon };
const CHANNELS: Channel[] = [
  { id: "ig", label: "Instagram", Icon: Camera },
  { id: "tt", label: "TikTok", Icon: Music2 },
  { id: "yt", label: "YouTube Shorts", Icon: Play },
  { id: "threads", label: "Threads", Icon: AtSign },
];
const COLUMNS: { id: string; label: string; color: string; statuses: PubStatus[] }[] = [
  { id: "adapting", label: "На адаптации", color: "#9d6bff", statuses: ["adapting"] },
  { id: "review", label: "На утверждении", color: "#ffae42", statuses: ["review"] },
  { id: "scheduled", label: "Запланировано", color: "#42d4f4", statuses: ["queued", "scheduled"] },
  { id: "published", label: "Опубликовано", color: "#a8e063", statuses: ["published"] },
  { id: "error", label: "Ошибка", color: "#ff5c7a", statuses: ["error"] },
];

const RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function PublicationsPipeline({ onShowPlan }: { onShowPlan?: () => void }) {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>(getStore().clients || []);
  const [team, setTeam] = useState<TeamMember[]>(getStore().team || []);
  const [scripts, setScripts] = useState<Script[]>(getStore().scripts || []);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [pulling, setPulling] = useState(false);
  const [myTeamId, setMyTeamId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const s = getStore();
    let cls = s.clients, tm = s.team, scr = s.scripts;
    if (!cls || !tm || !scr) {
      cls = await db.getClients(supabase); tm = await db.getTeam(supabase);
      scr = await db.getScriptsForClients(supabase, cls.map(c => c.id));
      setStore({ clients: cls, team: tm, scripts: scr });
    }
    setClients(cls); setTeam(tm); setScripts(scr);

    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    setMyTeamId(tm.find(t => t.profile_id === uid)?.id ?? null);

    const { data, error } = await supabase.from("publications").select("*").order("created_at", { ascending: false });
    if (error) {
      // только реально отсутствующая таблица → баннер «прогони миграцию»; прочее → показать текст
      if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message || "")) setTableMissing(true);
      else setErrMsg(`${error.message}${error.code ? ` (${error.code})` : ""}`);
    } else { setPubs((data || []) as Publication[]); setTableMissing(false); setErrMsg(null); }
    setLoading(false);
  }

  const clientById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])) as Record<number, Client>, [clients]);
  const scriptById = useMemo(() => Object.fromEntries(scripts.map(s => [s.id, s])) as Record<number, Script>, [scripts]);

  async function updatePub(id: number, patch: Partial<Publication>) {
    await db.updatePublication(supabase, id, patch);
    setPubs(arr => arr.map(p => p.id === id ? { ...p, ...patch } : p));
  }
  async function approve(id: number) {
    if (myTeamId == null) { await updatePub(id, { pub_status: "queued", approved_at: new Date().toISOString() }); return; }
    await db.approvePublication(supabase, id, myTeamId);
    setPubs(arr => arr.map(p => p.id === id ? { ...p, pub_status: "queued", approved_by: myTeamId, approved_at: new Date().toISOString() } : p));
  }
  async function regenerate(id: number) {
    await updatePub(id, { pub_status: "adapting" });
    try {
      const r = await fetch(`/api/publications/${id}/adapt`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) { await updatePub(id, { pub_status: "error", error_message: j?.error || "AI error" }); alert("AI: " + (j?.error || "ошибка")); return; }
      if (j.publication) setPubs(arr => arr.map(p => p.id === id ? { ...p, ...j.publication } : p));
    } catch (e: any) { await updatePub(id, { pub_status: "error", error_message: String(e) }); }
  }

  async function pullReady() {
    setPulling(true);
    const existing = new Set(pubs.map(p => p.script_id));
    const ready = scripts.filter(s => s.video_status === "ready" && !existing.has(s.id));
    for (const s of ready) await db.ensurePublicationForScript(supabase, s, clientById[s.client_id]);
    const { data } = await supabase.from("publications").select("*").order("created_at", { ascending: false });
    setPubs((data || []) as Publication[]);
    setPulling(false);
  }

  async function moveToColumn(colId: string, id: number) {
    const col = COLUMNS.find(c => c.id === colId); if (!col) return;
    setDraggedId(null); setDragOverCol(null);
    await updatePub(id, { pub_status: col.statuses[0] });
  }

  const byColumn = useMemo(() => {
    const m: Record<string, Publication[]> = {};
    for (const col of COLUMNS) m[col.id] = [];
    for (const p of pubs) { const col = COLUMNS.find(c => c.statuses.includes(p.pub_status)); if (col) m[col.id].push(p); }
    return m;
  }, [pubs]);

  const openPub = openId != null ? pubs.find(p => p.id === openId) || null : null;

  const Toggle = (
    <div style={{ display: "flex", borderRadius: 10, border: "1px solid var(--brd)", overflow: "hidden" }}>
      <button onClick={onShowPlan} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "transparent", color: "var(--t2)", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}><CalendarDays size={13} /> Контент-план</button>
      <button style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "rgba(157,107,255,0.15)", color: "var(--pu)", border: "none", fontSize: 11, fontWeight: 700, cursor: "default" }}><Wand2 size={13} /> Подготовка</button>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Metricool · подготовка постов</h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>Готовое видео → AI-адаптация текста под соцсети → утверждение тимлидом → Metricool</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {onShowPlan && Toggle}
          <button onClick={pullReady} disabled={pulling || tableMissing}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, background: "rgba(157,107,255,0.12)", border: "1px solid var(--brd)", color: "var(--pu)", fontSize: 12, fontWeight: 700, cursor: tableMissing ? "not-allowed" : "pointer" }}>
            <RefreshCw size={13} className={pulling ? "spin" : ""} /> {pulling ? "Подтягиваю…" : "Подтянуть готовые видео"}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>
      ) : tableMissing ? (
        <div style={{ padding: 24, borderRadius: 14, border: "1px solid rgba(255,174,66,0.4)", background: "rgba(255,174,66,0.08)", color: "var(--t1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, marginBottom: 8 }}><Database size={16} style={{ color: "var(--or)" }} /> Таблица публикаций ещё не создана</div>
          <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6 }}>
            Прогони миграцию <code style={{ background: "var(--inset)", padding: "1px 6px", borderRadius: 5 }}>MIGRATION_2026-06-24_publications.sql</code> в Supabase → SQL Editor → Run. После этого появятся колонки, карточки и поля для текстов под каждую соцсеть.
          </div>
        </div>
      ) : errMsg ? (
        <div style={{ padding: 24, borderRadius: 14, border: "1px solid rgba(255,92,122,0.4)", background: "rgba(255,92,122,0.08)", color: "var(--t1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, marginBottom: 8 }}><AlertTriangle size={16} style={{ color: "#ff5c7a" }} /> Не удалось загрузить публикации</div>
          <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6 }}>{errMsg}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(210px, 1fr))`, gap: 10, overflowX: "auto", paddingBottom: 8 }}>
          {COLUMNS.map(col => {
            const items = byColumn[col.id] || [];
            const isOver = dragOverCol === col.id;
            return (
              <div key={col.id}
                onDragOver={e => { e.preventDefault(); if (dragOverCol !== col.id) setDragOverCol(col.id); }}
                onDragLeave={() => { if (dragOverCol === col.id) setDragOverCol(null); }}
                onDrop={e => { e.preventDefault(); const id = parseInt(e.dataTransfer.getData("text/plain"), 10); if (id) moveToColumn(col.id, id); }}
                style={{ background: "rgba(123,63,228,0.04)", border: `1px solid ${isOver ? col.color : "var(--brd)"}`, borderRadius: 14, padding: 12, minHeight: 360, display: "flex", flexDirection: "column", transition: "border-color .15s" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 10, borderBottom: `2px solid ${col.color}` }}>
                  <h3 style={{ fontSize: 11, fontWeight: 800, color: "var(--t1)", textTransform: "uppercase", letterSpacing: 0.5 }}>{col.label}</h3>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: `${col.color}22`, color: col.color }}>{items.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
                  {items.length === 0 && <div style={{ padding: "26px 8px", textAlign: "center", color: "var(--t3)", fontSize: 10, fontStyle: "italic" }}>Пусто</div>}
                  {items.map(p => {
                    const c = clientById[p.client_id]; const sc = scriptById[p.script_id];
                    const title = sc?.hook_text || sc?.hook || "Без темы";
                    const chans = (p.target_channels?.length ? p.target_channels : c?.platforms) || [];
                    return (
                      <div key={p.id} role="button" tabIndex={0} draggable
                        onClick={() => setOpenId(p.id)}
                        onDragStart={e => { setDraggedId(p.id); e.dataTransfer.setData("text/plain", String(p.id)); e.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                        style={{ textAlign: "left", background: "var(--inset2)", border: "1px solid var(--track)", borderRadius: 11, padding: 10, cursor: "grab", opacity: draggedId === p.id ? 0.4 : 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          {c && <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={22} />}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c?.name} {c?.surname || ""}</div>
                            <div style={{ fontSize: 8, color: "var(--t3)", fontFamily: "monospace" }}>#{sc?.order_num ?? "?"} · {fmtDateTime(p.publish_at)}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--t1)", lineHeight: 1.35 }}>{title.length > 64 ? title.slice(0, 61) + "…" : title}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                          {CHANNELS.filter(ch => chans.includes(ch.id)).map(ch => <ch.Icon key={ch.id} size={11} style={{ color: "var(--t3)" }} />)}
                          {p.ai_generated_at && <span style={{ fontSize: 8, color: "var(--pu)", marginLeft: "auto" }}>🤖 AI</span>}
                          {p.pub_status === "error" && <AlertTriangle size={11} style={{ color: "#ff5c7a", marginLeft: "auto" }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openPub && (
        <PublicationModal
          pub={openPub}
          client={clientById[openPub.client_id]}
          script={scriptById[openPub.script_id]}
          onClose={() => setOpenId(null)}
          onUpdate={updatePub}
          onApprove={approve}
          onRegenerate={regenerate}
        />
      )}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function PublicationModal({ pub, client, script, onClose, onUpdate, onApprove, onRegenerate }: {
  pub: Publication; client?: Client; script?: Script;
  onClose: () => void; onUpdate: (id: number, patch: Partial<Publication>) => void;
  onApprove: (id: number) => void; onRegenerate: (id: number) => void;
}) {
  const [tab, setTab] = useState("ig");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(pub);
  useEffect(() => { setF(pub); }, [pub.id, pub.ai_generated_at, pub.pub_status]);

  const channels = (f.target_channels?.length ? f.target_channels : client?.platforms) || ["ig", "tt", "yt", "threads"];
  const save = (patch: Partial<Publication>) => onUpdate(pub.id, patch);
  const toggleChan = (id: string) => {
    const set = new Set(channels); set.has(id) ? set.delete(id) : set.add(id);
    const arr = CHANNELS.map(c => c.id).filter(x => set.has(x));
    setF(p => ({ ...p, target_channels: arr })); save({ target_channels: arr });
  };

  const ta: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 9, background: "var(--inset2)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 };
  const lbl = (t: string) => <label style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 5 }}>{t}</label>;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 18, width: "100%", maxWidth: 820, padding: 24, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 24px 70px rgba(0,0,0,0.55)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {client && <Avatar name={`${client.name} ${client.surname || ""}`} src={client.avatar_url} size={40} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 16, fontWeight: 800 }}>{client?.name} {client?.surname || ""}</div>
              <div style={{ fontSize: 11, color: "var(--t3)" }}>#{script?.order_num ?? "?"} · {script?.hook_text || script?.hook || "Без темы"}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: "var(--track)", border: "1px solid var(--brd)", color: "var(--t2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 12, borderRadius: 12, background: "var(--inset)", border: "1px solid var(--brd)" }}>
          <div>
            {lbl("🎬 Видео")}
            <div style={{ display: "flex", gap: 6 }}>
              <input defaultValue={f.video_url || ""} onBlur={e => save({ video_url: e.target.value })} placeholder="ссылка на видео / Drive" style={{ ...ta, fontSize: 12 }} />
              {f.video_url && <a href={f.video_url} target="_blank" rel="noreferrer" style={{ flexShrink: 0, padding: "0 12px", borderRadius: 9, background: "rgba(157,107,255,0.12)", border: "1px solid var(--brd)", color: "var(--pu)", display: "inline-flex", alignItems: "center" }}><ExternalLink size={15} /></a>}
            </div>
          </div>
          <div>
            {lbl("📅 Публиковать")}
            <input type="datetime-local" defaultValue={toLocalInput(f.publish_at)} onBlur={e => save({ publish_at: e.target.value ? new Date(e.target.value).toISOString() : null })} style={{ ...ta, fontSize: 12 }} />
          </div>
        </div>

        <div>
          {lbl("📄 Исходный текст (из сценария)")}
          <textarea defaultValue={f.base_text || ""} onBlur={e => save({ base_text: e.target.value })} rows={9} placeholder="Текст ролика — основа для адаптаций" style={{ ...ta, fontSize: 13, minHeight: 180 }} />
        </div>

        <button onClick={async () => { setBusy(true); await onRegenerate(pub.id); setBusy(false); }} disabled={busy}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px", borderRadius: 10, background: "rgba(157,107,255,0.1)", border: "1px dashed var(--pu)", color: "var(--pu)", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
          <Wand2 size={14} /> {busy ? "Генерю адаптации…" : f.ai_generated_at ? "Сгенерить заново" : "Сгенерить тексты под соцсети (AI)"}
        </button>

        <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--brd)", paddingBottom: 2, flexWrap: "wrap" }}>
          {CHANNELS.map(ch => {
            const on = channels.includes(ch.id);
            return (
              <button key={ch.id} onClick={() => setTab(ch.id)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: "9px 9px 0 0", border: "none", borderBottom: tab === ch.id ? "2px solid var(--pu)" : "2px solid transparent", background: tab === ch.id ? "rgba(157,107,255,0.08)" : "transparent", color: tab === ch.id ? "var(--pu)" : on ? "var(--t2)" : "var(--t3)", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: on ? 1 : 0.5 }}>
                <ch.Icon size={13} /> {ch.label}
              </button>
            );
          })}
        </div>

        {(() => {
          const ch = CHANNELS.find(c => c.id === tab)!;
          const on = channels.includes(tab);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--t2)", cursor: "pointer" }}>
                <input type="checkbox" checked={on} onChange={() => toggleChan(tab)} /> Публиковать в {ch.label}
              </label>
              {tab === "yt" ? (
                <>
                  <div>{lbl("Заголовок (до 100)")}<input defaultValue={f.yt_title || ""} onBlur={e => save({ yt_title: e.target.value })} style={{ ...ta, fontSize: 13 }} /></div>
                  <div>{lbl("Описание")}<textarea defaultValue={f.yt_description || ""} onBlur={e => save({ yt_description: e.target.value })} rows={5} style={ta} /></div>
                  <div>{lbl("Теги (через запятую)")}<input defaultValue={(f.yt_tags || []).join(", ")} onBlur={e => save({ yt_tags: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} style={{ ...ta, fontSize: 12 }} /></div>
                </>
              ) : tab === "threads" ? (
                <div>{lbl("Пост (до 500)")}<textarea defaultValue={f.threads_post || ""} onBlur={e => save({ threads_post: e.target.value })} rows={5} style={ta} /></div>
              ) : (
                <div>{lbl(tab === "ig" ? "Caption Instagram (до 2200)" : "Caption TikTok")}<textarea defaultValue={(tab === "ig" ? f.caption_ig : f.caption_tt) || ""} onBlur={e => save(tab === "ig" ? { caption_ig: e.target.value } : { caption_tt: e.target.value })} rows={7} style={ta} /></div>
              )}
            </div>
          );
        })()}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 4, borderTop: "1px solid var(--brd)", marginTop: 4 }}>
          <span style={{ fontSize: 11, color: "var(--t3)" }}>{f.ai_model ? `модель: ${f.ai_model}` : ""}{f.error_message ? ` · ⚠ ${f.error_message}` : ""}</span>
          {f.pub_status === "queued" || f.pub_status === "scheduled" ? (
            <span style={{ fontSize: 12, fontWeight: 800, color: "var(--cy)" }}>✓ Утверждено · в очереди на Metricool</span>
          ) : (
            <button onClick={() => { onApprove(pub.id); onClose(); }}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 9, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <CheckCircle2 size={14} /> Утвердить и в очередь
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
