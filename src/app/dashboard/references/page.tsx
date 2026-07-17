"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Reference, RefStatus } from "@/lib/database";
import { getStore, setStore } from "@/lib/store";
import { useIsMontager } from "@/components/RoleContext";
import Avatar from "@/components/Avatar";
import Tour, { TourButton, type TourStep } from "@/components/Tour";
import {
  Camera, Music2, Play, Plus, ExternalLink, Trash2, Eye, MessageCircle, Heart,
  ChevronDown, Filter, FileText, Database, Loader2, Flame, X, CheckCircle2,
} from "lucide-react";

const PLAT: Record<string, { label: string; Icon: any; color: string }> = {
  tiktok: { label: "TikTok", Icon: Music2, color: "#42d4f4" },
  instagram: { label: "Instagram", Icon: Camera, color: "#e1306c" },
  youtube: { label: "YouTube", Icon: Play, color: "#ff5c7a" },
};
const COLUMNS: { id: RefStatus; label: string; color: string }[] = [
  { id: "new", label: "Все референсы", color: "#9d6bff" },
  { id: "selected", label: "Отобраны", color: "#42d4f4" },
  { id: "review", label: "На утверждении", color: "#ffae42" },
  { id: "approved", label: "Утверждены", color: "#a8e063" },
];
const fmtNum = (n: number | null) => n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);
// Битые транскрибации из объектов («[object Object]») показываем как пусто, чтобы можно было вписать заново
const cleanTranscript = (t: string | null | undefined) => {
  if (!t) return "";
  const s = String(t).replace(/\[object Object\]/g, "").trim();
  return s;
};

export default function ReferencesPage() {
  const supabase = createClient();
  const isMontager = useIsMontager(); // монтажёру — только чтение
  const [clients, setClients] = useState<Client[]>(getStore().clients || []);
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const s = getStore();
    let cls = s.clients;
    if (!cls) { cls = await db.getClients(supabase); setStore({ clients: cls, team: s.team, scripts: s.scripts }); }
    setClients(cls);
    const active = cls.filter(c => c.stage === "active").sort((a, b) => a.name.localeCompare(b.name));
    setClientId(active[0]?.id ?? cls[0]?.id ?? null);
    const { data, error } = await supabase.from("reference_videos").select("*").order("created_at", { ascending: false });
    if (error) setTableMissing(true); else setRefs((data || []) as Reference[]);
    setLoading(false);
  }

  const clientById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])) as Record<number, Client>, [clients]);
  const activeClients = useMemo(() => clients.filter(c => c.stage === "active").sort((a, b) => a.name.localeCompare(b.name)), [clients]);
  const curClient = clientId != null ? clientById[clientId] : null;
  const byColumn = useMemo(() => {
    const m: Record<string, Reference[]> = {}; for (const c of COLUMNS) m[c.id] = [];
    for (const r of refs) { if (r.client_id !== clientId) continue; (m[r.status || "new"] ||= m["new"]).push(r); }
    return m;
  }, [refs, clientId]);
  const openRef = openId != null ? refs.find(r => r.id === openId) || null : null;

  async function addRef() {
    const url = urlInput.trim(); if (!url || !clientId) return;
    setAdding(true);
    try {
      const r = await fetch("/api/references/fetch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, clientId }) });
      const j = await r.json();
      if (!r.ok) alert("Не удалось: " + (j?.error || "ошибка")); else { setRefs(a => [j.reference, ...a]); setUrlInput(""); }
    } catch (e: any) { alert(String(e)); }
    setAdding(false);
  }
  function patchRef(id: number, p: Partial<Reference>) { setRefs(a => a.map(r => r.id === id ? { ...r, ...p } : r)); }
  async function saveNote(id: number, note: string) { await db.updateReference(supabase, id, { note }); patchRef(id, { note }); }
  async function saveTranscript(id: number, transcript: string | null) { await db.updateReference(supabase, id, { transcript }); patchRef(id, { transcript }); }
  async function del(id: number) { if (!confirm("Удалить референс?")) return; await db.deleteReference(supabase, id); setRefs(a => a.filter(r => r.id !== id)); setOpenId(null); }

  async function moveTo(status: RefStatus, id: number) {
    if (isMontager) return; // монтажёр не меняет статусы
    setDraggedId(null); setDragOverCol(null);
    const ref = refs.find(r => r.id === id); if (!ref || ref.status === status) return;
    if (status === "approved" && !ref.script_id) { await createScript(ref); return; }
    await db.updateReference(supabase, id, { status }); patchRef(id, { status });
  }

  // Утверждён → создаём сценарий клиенту (активный месяц), с реф-ссылкой + транскрибацией + разбором
  async function createScript(ref: Reference) {
    const { data: months } = await supabase.from("client_months").select("month_number,status").eq("client_id", ref.client_id);
    const sorted = (months || []).sort((a: any, b: any) => b.month_number - a.month_number);
    const mn = (sorted.find((m: any) => m.status === "active") || sorted[0])?.month_number || 1;
    // order_num = 0 → «Идея» без номера; номер присвоится при «Взято в работу»
    const { data: sc, error } = await supabase.from("scripts").insert({
      client_id: ref.client_id, month_number: mn, order_num: 0,
      hook: "", ref_url: ref.url, ref_text: ref.transcript || "", transcription: ref.transcript || "",
      ref_views: ref.views, ref_likes: ref.likes, ref_comments: ref.comments,
      hook_text: ref.caption ? ref.caption.slice(0, 80) : "", body_text: "", cta: "",
      description: ref.analysis || "", script_status: "notStarted", video_status: "notStarted", pub_date: null, ready_at: null,
    }).select().single();
    if (error) { alert("Не удалось создать сценарий: " + error.message); return; }
    await db.updateReference(supabase, ref.id, { status: "approved", script_id: sc.id });
    patchRef(ref.id, { status: "approved", script_id: sc.id });
  }

  const refCloseModal = () => setOpenId(null);
  const refSampleId = (refs.find(r => r.client_id === clientId) || refs[0])?.id ?? null;
  const refOpenSample = () => { if (refSampleId != null) setOpenId(refSampleId); };
  const REF_TOUR: TourStep[] = [
    { title: "Референсы · залётные ролики", text: "Тут собираем чужие «залетевшие» ролики как образцы и превращаем их в сценарии для клиента. Проведу по всей цепочке.", action: refCloseModal },
    { target: "ref-add", title: "Добавить референс", text: "Сначала выбери клиента слева, потом вставь ссылку на TikTok / Instagram / YouTube-ролик и жми «Добавить». CRM сама подтянет просмотры, лайки, превью и (если есть) расшифровку. Ещё можно просто кидать ссылки в наш Telegram-канал — бот сам разложит их по клиентам.", action: refCloseModal },
    { target: "ref-board", title: "Колонки отбора", text: "Референс едет: Все → Отобраны → На утверждении → Утверждены. Тащи карточки мышкой. Как только перетащишь в «Утверждены» — CRM автоматически создаёт сценарий у этого клиента (со ссылкой и статами). Откроем карточку.", action: refCloseModal },
    { target: "rm-stats", title: "① Статы исходника", text: "Просмотры / комментарии / лайки оригинала. По ним видно, насколько ролик реально «залетел» — берём в работу только сильные образцы.", action: refOpenSample },
    { target: "rm-transcript", title: "② Транскрибация", text: "Текст ролика. Обычно подтягивается сам. Если озвучки нет (например, просто видеоряд) — впиши вручную, что говорится/показывается. По этому тексту потом пишется сценарий.", action: refOpenSample },
    { target: "rm-stage", title: "③ В работу → сценарий", text: "Кнопками стадии переведи референс в «Утверждены» — и у клиента сразу появится готовая карточка-сценарий в разделе «Сценарии», куда уже перенесены ссылка и статы. Дальше — обычная работа над сценарием.", action: refOpenSample },
  ];

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }}>
      <div style={{ marginBottom: 14, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Референсы · залётные ролики</h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>Сначала выбери клиента → потом вставь ссылку на ролик</p>
        </div>
        <TourButton onClick={() => setTourOpen(true)} />
      </div>

      {tableMissing ? (
        <div style={{ padding: 24, borderRadius: 14, border: "1px solid rgba(255,174,66,0.4)", background: "rgba(255,174,66,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}><Database size={16} style={{ color: "var(--or)" }} /> Таблица референсов не готова</div>
          <div style={{ fontSize: 13, color: "var(--t2)" }}>Прогони <code style={{ background: "var(--inset)", padding: "1px 6px", borderRadius: 5 }}>MIGRATION_2026-06-25_references_pipeline.sql</code> в Supabase → SQL Editor.</div>
        </div>
      ) : (
        <>
          {!isMontager && (
          <div data-tour="ref-add" style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-start" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button onClick={() => setMenu(m => !m)} style={{ height: 44, padding: "0 14px", borderRadius: 10, background: "rgba(123,63,228,0.1)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                <Filter size={13} /><span style={{ color: "var(--t3)", fontWeight: 500 }}>Клиент:</span>{curClient ? `${curClient.name} ${curClient.surname || ""}` : "выбери"}<ChevronDown size={13} />
              </button>
              {menu && <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, minWidth: 240, background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 10, padding: 4, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", maxHeight: 360, overflowY: "auto" }}>
                {activeClients.map(c => <button key={c.id} onClick={() => { setClientId(c.id); setMenu(false); }} className="nav-item" style={{ fontSize: 12, padding: "7px 10px", gap: 8 }}><Avatar name={c.name} src={c.avatar_url} size={20} /> {c.name} {c.surname || ""}</button>)}
              </div>}
            </div>
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addRef(); }}
              placeholder="Вставь ссылку на TikTok / Instagram-ролик…"
              style={{ flex: 1, height: 44, padding: "0 14px", borderRadius: 10, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none" }} />
            <button onClick={addRef} disabled={adding || !urlInput.trim()}
              style={{ height: 44, padding: "0 18px", borderRadius: 10, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, cursor: adding ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 7, opacity: adding ? 0.7 : 1 }}>
              {adding ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} {adding ? "Тяну…" : "Добавить"}
            </button>
          </div>
          )}

          <div data-tour="ref-board" style={{ display: "grid", gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(230px, 1fr))`, gap: 10, overflowX: "auto", paddingBottom: 8 }}>
            {COLUMNS.map(col => {
              const items = byColumn[col.id] || [];
              const isOver = dragOverCol === col.id;
              return (
                <div key={col.id}
                  onDragOver={e => { e.preventDefault(); if (dragOverCol !== col.id) setDragOverCol(col.id); }}
                  onDragLeave={() => { if (dragOverCol === col.id) setDragOverCol(null); }}
                  onDrop={e => { e.preventDefault(); const id = parseInt(e.dataTransfer.getData("text/plain"), 10); if (id) moveTo(col.id, id); }}
                  style={{ background: "rgba(123,63,228,0.04)", border: `1px solid ${isOver ? col.color : "var(--brd)"}`, borderRadius: 14, padding: 10, minHeight: 360, display: "flex", flexDirection: "column", transition: "border-color .15s" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingBottom: 8, borderBottom: `2px solid ${col.color}` }}>
                    <h3 style={{ fontSize: 11, fontWeight: 800, color: "var(--t1)", textTransform: "uppercase", letterSpacing: 0.4 }}>{col.label}</h3>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: `${col.color}22`, color: col.color }}>{items.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                    {items.length === 0 && <div style={{ padding: "24px 8px", textAlign: "center", color: "var(--t3)", fontSize: 10, fontStyle: "italic" }}>{isOver ? "Отпусти" : "Пусто"}</div>}
                    {items.map(r => {
                      const p = PLAT[r.platform || ""] || { label: r.platform || "?", Icon: FileText, color: "var(--t3)" };
                      return (
                        <div key={r.id} draggable={!isMontager}
                          onDragStart={e => { if (isMontager) return; setDraggedId(r.id); e.dataTransfer.setData("text/plain", String(r.id)); e.dataTransfer.effectAllowed = "move"; }}
                          onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                          onClick={() => setOpenId(r.id)}
                          style={{ background: "var(--inset2)", border: "1px solid var(--track)", borderRadius: 11, padding: 9, cursor: isMontager ? "pointer" : "grab", opacity: draggedId === r.id ? 0.4 : 1, display: "flex", flexDirection: "column", gap: 7 }}>
                          {r.thumbnail_url && <img src={r.thumbnail_url} alt="" style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 8 }} />}
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: p.color }}><p.Icon size={11} /> {p.label}</span>
                            <span style={{ fontSize: 10, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.author || ""}</span>
                            {r.analysis && <Flame size={12} style={{ color: "#ffae42", marginLeft: "auto" }} />}
                            {r.script_id && <FileText size={12} style={{ color: "var(--gr)", marginLeft: r.analysis ? 4 : "auto" }} />}
                          </div>
                          <div style={{ display: "flex", gap: 12 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700 }}><Eye size={12} style={{ color: "var(--cy)" }} /> {fmtNum(r.views)}</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700 }}><MessageCircle size={12} style={{ color: "var(--pu)" }} /> {fmtNum(r.comments)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {openRef && <RefModal ref0={openRef} client={clientById[openRef.client_id]} onClose={() => setOpenId(null)} onNote={saveNote} onTranscript={saveTranscript} onDelete={del} readOnly={isMontager}
        onMove={(status) => { const id = openRef.id; setOpenId(null); moveTo(status, id); }} />}
      <Tour steps={REF_TOUR} open={tourOpen} onClose={() => { setTourOpen(false); setOpenId(null); }} />
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function RefModal({ ref0, client, onClose, onNote, onTranscript, onDelete, onMove, readOnly = false }: {
  ref0: Reference; client?: Client; onClose: () => void; onNote: (id: number, n: string) => void; onTranscript: (id: number, t: string | null) => void; onDelete: (id: number) => void; onMove: (status: RefStatus) => void; readOnly?: boolean;
}) {
  const p = PLAT[ref0.platform || ""] || { label: ref0.platform || "?", Icon: FileText, color: "var(--t3)" };
  const ta: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 9, background: "var(--inset2)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 18, width: "100%", maxWidth: 700, padding: 22, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 24px 70px rgba(0,0,0,0.55)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 7, background: `${p.color}1f`, color: p.color, fontSize: 12, fontWeight: 700 }}><p.Icon size={13} /> {p.label}</span>
            <span style={{ fontSize: 13, color: "var(--t2)" }}>{ref0.author || ""}</span>
            {client && <span style={{ fontSize: 11, color: "var(--t3)" }}>· {client.name} {client.surname || ""}</span>}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: "var(--track)", border: "1px solid var(--brd)", color: "var(--t2)", cursor: "pointer" }}><X size={15} /></button>
        </div>

        <div data-tour="rm-stats" style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800 }}><Eye size={16} style={{ color: "var(--cy)" }} /> {fmtNum(ref0.views)}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800 }}><MessageCircle size={16} style={{ color: "var(--pu)" }} /> {fmtNum(ref0.comments)}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 800 }}><Heart size={16} style={{ color: "var(--rd)" }} /> {fmtNum(ref0.likes)}</span>
          <a href={ref0.url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, color: "var(--pu)", fontSize: 12, fontWeight: 700 }}>Открыть ролик <ExternalLink size={13} /></a>
        </div>

        {/* Стадия — кнопками (без перетаскивания) */}
        {!readOnly && (
        <div data-tour="rm-stage" style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5 }}>Стадия:</span>
          {COLUMNS.map(col => {
            const active = ref0.status === col.id;
            return (
              <button key={col.id} onClick={() => { if (!active) onMove(col.id); }} disabled={active}
                style={{ padding: "6px 11px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: active ? "default" : "pointer", border: `1px solid ${active ? col.color : "var(--brd)"}`, background: active ? `${col.color}22` : "transparent", color: active ? col.color : "var(--t2)" }}>
                {col.label}
              </button>
            );
          })}
        </div>
        )}

        {/* Разбор донора — показываем только если он уже сохранён (генерация отключена) */}
        {ref0.analysis && (
        <div data-tour="rm-analysis" style={{ padding: 14, borderRadius: 12, background: "rgba(255,174,66,0.06)", border: "1px solid rgba(255,174,66,0.3)" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--or)", marginBottom: 10 }}>🔥 Разбор донора</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--t1)", whiteSpace: "pre-wrap" }}>{ref0.analysis}</div>
        </div>
        )}

        <div data-tour="rm-transcript">
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, display: "flex", alignItems: "center", gap: 8 }}>
            📝 Транскрибация
            {!ref0.transcript && <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t3)", textTransform: "none", letterSpacing: 0 }}>— нет озвучки? впиши текст вручную</span>}
          </div>
          <textarea key={ref0.id} defaultValue={cleanTranscript(ref0.transcript)} readOnly={readOnly}
            onBlur={e => { const v = e.target.value; if (!readOnly && v !== (ref0.transcript || "")) onTranscript(ref0.id, v || null); }}
            rows={5} placeholder="Текст ролика / что говорится или показывается на экране…"
            style={{ ...ta, minHeight: 90 }} />
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Заметка</div>
          <textarea defaultValue={ref0.note || ""} readOnly={readOnly} onBlur={e => { if (!readOnly && e.target.value !== (ref0.note || "")) onNote(ref0.id, e.target.value); }} rows={2} placeholder="Почему залетел / что адаптируем…" style={ta} />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4, borderTop: "1px solid var(--brd)" }}>
          {ref0.script_id ? <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gr)", display: "inline-flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={14} /> Сценарий создан</span> : <span style={{ fontSize: 11, color: "var(--t3)" }}>{readOnly ? "" : "Перетащи в «Утверждены» → создастся сценарий"}</span>}
          {!readOnly && (
          <button onClick={() => onDelete(ref0.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,92,122,0.4)", color: "var(--rd)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Trash2 size={13} /> Удалить</button>
          )}
        </div>
      </div>
    </div>
  );
}
