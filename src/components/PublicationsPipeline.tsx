"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, TeamMember, Publication, PubStatus } from "@/lib/database";
import { getStore, setStore } from "@/lib/store";
import Avatar from "@/components/Avatar";
import PublicationModal, { type PublishOpts, type StatusItem } from "@/components/PublicationModal";
import Tour, { TourButton, type TourStep } from "@/components/Tour";
import { DEFAULT_TZ, tzShort, nowInTz, utcToZonedInput, zonedInputToUtc, fmtInTz } from "@/lib/tz";
import {
  Camera, Play, Music2, AtSign, Wand2, X, ExternalLink, ChevronDown,
  RefreshCw, AlertTriangle, Database, CalendarDays, Rocket, Plus, Images, Film, Trash2, type LucideIcon,
} from "lucide-react";

type Channel = { id: string; label: string; Icon: LucideIcon };
const CHANNELS: Channel[] = [
  { id: "ig", label: "Instagram", Icon: Camera },
  { id: "tt", label: "TikTok", Icon: Music2 },
  { id: "yt", label: "YouTube Shorts", Icon: Play },
  { id: "threads", label: "Threads", Icon: AtSign },
];
// Утверждение сценария/ролика происходит раньше — в Монтаже. Сюда попадает уже готовый ролик,
// который нужно оформить (тексты под соцсети) и опубликовать. Поэтому: Готово к публикации → Запланировано → Опубликовано.
const COLUMNS: { id: string; label: string; color: string; statuses: PubStatus[] }[] = [
  { id: "ready", label: "Готово к публикации", color: "#9d6bff", statuses: ["adapting", "review", "queued"] },
  { id: "scheduled", label: "Запланировано", color: "#42d4f4", statuses: ["scheduled"] },
  { id: "published", label: "Опубликовано", color: "#a8e063", statuses: ["published"] },
  { id: "error", label: "Ошибка", color: "#ff5c7a", statuses: ["error"] },
];

// время публикации показывается/задаётся в поясе клиента — см. helpers из @/lib/tz

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
  const [brands, setBrands] = useState<{ blogId: number; label: string }[] | null>(null);
  const [brandsBusy, setBrandsBusy] = useState(false);
  const [carouselPicker, setCarouselPicker] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState<number | "all">("all");
  const [clientMenu, setClientMenu] = useState(false);

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
      const got = ["caption_ig", "caption_tt", "yt_description", "threads_post"].filter(k => (j.publication?.[k] || "").trim()).length;
      alert(got ? `Готово: тексты сгенерированы (${got} ${got === 1 ? "сеть" : got < 5 ? "сети" : "сетей"}). Проверь и поправь перед отправкой.` : "AI вернул пустые тексты — проверь исходный текст в шаге 3.");
    } catch (e: any) { await updatePub(id, { pub_status: "error", error_message: String(e) }); }
  }

  async function pullReady() {
    setPulling(true);
    const existing = new Set(pubs.map(p => p.script_id));
    const ready = scripts.filter(s => s.video_status === "ready" && !existing.has(s.id) && clientById[s.client_id]?.stage === "active");
    for (const s of ready) await db.ensurePublicationForScript(supabase, s, clientById[s.client_id]);
    const { data } = await supabase.from("publications").select("*").order("created_at", { ascending: false });
    setPubs((data || []) as Publication[]);
    setPulling(false);
  }

  async function createCarousel(clientId: number) {
    setCarouselPicker(false);
    const { data, error } = await db.createCarouselPublication(supabase, clientId, clientById[clientId]);
    if (error || !data) { alert("Не удалось создать карусель: " + (error?.message || "")); return; }
    setPubs(arr => [data, ...arr]);
    setOpenId(data.id);
  }

  async function loadBrands() {
    setBrandsBusy(true);
    try {
      const r = await fetch("/api/metricool/brands");
      const j = await r.json();
      if (!r.ok) { alert("Metricool: " + (j?.error || "ошибка")); setBrands([]); }
      else setBrands(j.brands || []);
    } catch (e: any) { alert("Metricool: " + String(e)); }
    setBrandsBusy(false);
  }

  async function publishToMetricool(id: number, opts?: PublishOpts): Promise<{ ok: boolean; code?: string; error?: string }> {
    const r = await fetch(`/api/publications/${id}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(opts || {}) });
    const j = await r.json().catch(() => ({}));
    // перечитываем карточку — сервер сам выставил статус/ids/ошибку
    const { data } = await supabase.from("publications").select("*").eq("id", id).maybeSingle();
    if (data) setPubs(arr => arr.map(p => p.id === id ? (data as Publication) : p));
    if (!r.ok) {
      if (j?.code !== "past") alert("Metricool: " + (j?.error || "ошибка"));
      return { ok: false, code: j?.code, error: j?.error };
    }
    return { ok: true };
  }
  async function checkStatus(id: number): Promise<{ items: StatusItem[]; allPublished: boolean } | null> {
    try {
      const r = await fetch(`/api/publications/${id}/status`);
      const j = await r.json();
      if (!r.ok) { alert("Metricool: " + (j?.error || "ошибка")); return null; }
      if (j.patch && Object.keys(j.patch).length) setPubs(arr => arr.map(p => p.id === id ? { ...p, ...j.patch } : p));
      return { items: j.items || [], allPublished: !!j.allPublished };
    } catch (e: any) { alert(String(e)); return null; }
  }

  async function moveToColumn(colId: string, id: number) {
    const col = COLUMNS.find(c => c.id === colId); if (!col) return;
    setDraggedId(null); setDragOverCol(null);
    if (colId === "scheduled") { setOpenId(id); return; } // «Запланировано» ставит только Metricool — открываем карточку
    if (colId === "published" && !confirm("Отметить как опубликованное вручную (без Metricool)?")) return;
    await updatePub(id, { pub_status: col.statuses[0] });
  }

  const byColumn = useMemo(() => {
    const m: Record<string, Publication[]> = {};
    for (const col of COLUMNS) m[col.id] = [];
    for (const p of pubs) {
      const c = clientById[p.client_id];
      if (!c || c.stage !== "active") continue; // прячем клиентов на паузе / ушедших
      if (clientFilter !== "all" && p.client_id !== clientFilter) continue; // фильтр по клиенту
      const col = COLUMNS.find(x => x.statuses.includes(p.pub_status));
      if (col) m[col.id].push(p);
    }
    // ближайшие по дате публикации — сверху (без даты — в конец)
    for (const col of COLUMNS) m[col.id].sort((a, b) => (a.publish_at || "9999").localeCompare(b.publish_at || "9999"));
    return m;
  }, [pubs, clientById, clientFilter]);

  const openPub = openId != null ? pubs.find(p => p.id === openId) || null : null;

  // Пример-публикация для тура: берём рилз (чтобы показать блок видео), иначе любую
  const tourSampleId = (pubs.find(p => p.content_type !== "carousel") || pubs[0])?.id ?? null;
  const ppCloseModal = () => setOpenId(null);
  const ppOpenSample = () => { if (tourSampleId != null) setOpenId(tourSampleId); };
  const PIPELINE_TOUR: TourStep[] = [
    { title: "Подготовка постов", text: "Тут готовое видео превращается в пост и уходит во все соцсети клиента. Через что именно — Metricool или Upload-Post — задано в карточке клиента. Проведу по всей цепочке.", action: ppCloseModal },
    { target: "pp-client", title: "Фильтр по клиенту", text: "Когда постов много — выбери здесь клиента, и на доске останутся только его карточки. «Все» — показать всех.", action: ppCloseModal },
    { target: "pp-pull", title: "Шаг 0 · Подтянуть готовые видео", text: "Жми — CRM возьмёт все ролики, которые монтажёр перевёл в «Готово к публикации», и создаст под них карточки постов в первой колонке (ролик уже загружен в Монтаже — тянется автоматически). Карусель добавляется отдельной кнопкой «+ Карусель».", action: ppCloseModal },
    { target: "pp-brands", title: "«Мои бренды» (настроить один раз)", text: "Показывает список аккаунтов, подключённых к Metricool, с их blogId. Этот blogId нужно один раз вписать в карточку клиента — иначе CRM не знает, в какой аккаунт публиковать.", action: ppCloseModal },
    { target: "pp-board", title: "Доска — 3 статуса", text: "Утверждение уже прошло в Монтаже, поэтому тут коротко: Готово к публикации → Запланировано (дату поставили / ушло в Metricool) → Опубликовано. Клиентов, которых публикуем вручную (не через Metricool), можно просто перетащить в «Опубликовано». Откроем карточку.", action: ppCloseModal },
    { target: "pm-media", title: "① Видео, обложка и время выхода", text: "Ролик обычно уже подтянут из Монтажа (виден в плеере). Ниже — «🖼 Обложка ролика»: если сделали статичный превью-креатив, загрузи его сюда — он уйдёт в соцсеть как кастомная обложка (иначе возьмётся первый кадр). Справа — дата и ВРЕМЯ по часовому поясу КЛИЕНТА: видно, сколько сейчас у клиента и когда выйдет пост.", action: ppOpenSample },
    { target: "pm-basetext", title: "② Исходный текст", text: "Впиши сюда основной текст ролика — это «сырьё». AI на его основе сделает отдельные версии подписи под каждую соцсеть. Чем толковее исходник, тем лучше адаптации.", action: ppOpenSample },
    { target: "pm-ai", title: "③ Сгенерить тексты под соцсети", text: "Одна кнопка — AI пишет РАЗНЫЕ тексты под Instagram, TikTok, YouTube и Threads (у каждой свои лимиты и стиль). Не нравится — жми ещё раз «Сгенерить заново».", action: ppOpenSample },
    { target: "pm-tabs", title: "④ Вкладки соцсетей — куда и какой текст", text: "Вот здесь и решается, «что куда». Переключай вкладки IG / TikTok / YouTube / Threads. В каждой: галочка «Публиковать в …» (СНЯТА — туда НЕ уйдёт) и своё поле текста. У YouTube — заголовок + описание + теги, у остальных — подпись. Проверь/поправь текст в каждой отмеченной сети.", action: ppOpenSample },
    { target: "pm-publish", title: "⑤ Опубликовать", text: "Кнопка публикации отправляет пост во ВСЕ отмеченные соцсети на заданное время, и карточка уходит в «Запланировано». Ошибка вылезет в колонке «Ошибка» с причиной. Для ручной публикации — просто перетащи карточку в «Опубликовано».", action: ppOpenSample },
  ];

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
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Публикации · подготовка постов</h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>Готовое видео → AI-адаптация текста под соцсети → утверждение тимлидом → Metricool</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {onShowPlan && Toggle}
          <div data-tour="pp-client" style={{ position: "relative" }}>
            <button onClick={() => setClientMenu(v => !v)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, background: "rgba(123,63,228,0.08)", border: `1px solid ${clientFilter !== "all" ? "var(--pu)" : "var(--brd)"}`, color: "var(--t1)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {clientFilter !== "all" && clientById[clientFilter] && <Avatar name={`${clientById[clientFilter].name} ${clientById[clientFilter].surname || ""}`} src={clientById[clientFilter].avatar_url} size={18} />}
              <span style={{ color: "var(--t3)", fontWeight: 500 }}>Клиент:</span>{clientFilter === "all" ? "Все" : `${clientById[clientFilter]?.name || ""} ${clientById[clientFilter]?.surname || ""}`}
              <ChevronDown size={13} />
            </button>
            {clientMenu && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, width: 240, maxHeight: 340, overflowY: "auto", background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 12, padding: 6, boxShadow: "0 16px 40px rgba(0,0,0,0.5)" }}>
                <button onClick={() => { setClientFilter("all"); setClientMenu(false); }} className="nav-item" style={{ fontSize: 12, padding: "7px 8px", width: "100%", textAlign: "left" }}>Все клиенты</button>
                {clients.filter(c => c.stage === "active").sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                  <button key={c.id} onClick={() => { setClientFilter(c.id); setClientMenu(false); }} className="nav-item"
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", fontSize: 12, padding: "7px 8px", textAlign: "left" }}>
                    <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={20} /> {c.name} {c.surname || ""}
                  </button>
                ))}
              </div>
            )}
          </div>
          <TourButton onClick={() => setTourOpen(true)} />
          <button data-tour="pp-brands" onClick={loadBrands} disabled={brandsBusy}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, background: "rgba(66,212,244,0.1)", border: "1px solid var(--brd)", color: "var(--cy)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <Rocket size={13} /> {brandsBusy ? "Гружу…" : "Мои бренды"}
          </button>
          <div data-tour="pp-carousel" style={{ position: "relative" }}>
            <button onClick={() => setCarouselPicker(v => !v)} disabled={tableMissing}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, background: "rgba(255,174,66,0.12)", border: "1px solid var(--brd)", color: "var(--or)", fontSize: 12, fontWeight: 700, cursor: tableMissing ? "not-allowed" : "pointer" }}>
              <Images size={13} /> + Карусель
            </button>
            {carouselPicker && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, width: 240, maxHeight: 320, overflowY: "auto", background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 12, padding: 6, boxShadow: "0 16px 40px rgba(0,0,0,0.5)" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 8px" }}>Карусель для клиента</div>
                {clients.filter(c => c.stage === "active").map(c => (
                  <button key={c.id} onClick={() => createCarousel(c.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 8px", borderRadius: 8, background: "transparent", border: "none", color: "var(--t1)", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--inset2)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={22} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name} {c.surname || ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button data-tour="pp-pull" onClick={pullReady} disabled={pulling || tableMissing}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, background: "rgba(157,107,255,0.12)", border: "1px solid var(--brd)", color: "var(--pu)", fontSize: 12, fontWeight: 700, cursor: tableMissing ? "not-allowed" : "pointer" }}>
            <RefreshCw size={13} className={pulling ? "spin" : ""} /> {pulling ? "Подтягиваю…" : "Подтянуть готовые видео"}
          </button>
        </div>
      </div>

      {brands && (
        <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--brd)", background: "var(--inset)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)" }}>Бренды в Metricool ({brands.length}) — впиши нужный blogId в карточку клиента</span>
            <button onClick={() => setBrands(null)} style={{ background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>
          {brands.length === 0 ? <div style={{ fontSize: 12, color: "var(--t3)" }}>Пусто или нет доступа</div> : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {brands.map(b => (
                <span key={b.blogId} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, background: "var(--inset2)", border: "1px solid var(--track)", fontSize: 12 }}>
                  <b style={{ color: "var(--cy)", fontFamily: "monospace" }}>{b.blogId}</b>
                  <span style={{ color: "var(--t2)" }}>{b.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

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
        <div data-tour="pp-board" className="pp-board" style={{ display: "grid", gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(210px, 1fr))`, gap: 10, overflowX: "auto", paddingBottom: 8 }}>
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
                    const c = clientById[p.client_id]; const sc = p.script_id != null ? scriptById[p.script_id] : undefined;
                    const isCar = p.content_type === "carousel";
                    const title = (isCar ? (p.base_text || p.caption_ig) : (sc?.hook_text || sc?.hook)) || (isCar ? "Карусель без текста" : "Без темы");
                    const allowCh = isCar ? ["ig", "threads"] : ["ig", "tt", "yt", "threads"];
                    const chans = (p.target_channels?.length ? p.target_channels : c?.platforms?.length ? c.platforms : allowCh).filter(x => allowCh.includes(x));
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
                            <div style={{ fontSize: 8, color: "var(--t3)", fontFamily: "monospace" }}>{isCar ? "карусель" : `#${sc?.order_num ?? "?"}`} · {fmtInTz(p.publish_at, c?.timezone || DEFAULT_TZ)}</div>
                          </div>
                          {isCar
                            ? <span title="Карусель" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 8, fontWeight: 800, color: "var(--or)", background: "rgba(255,174,66,0.14)", padding: "2px 5px", borderRadius: 5 }}><Images size={9} />{(p.media_urls?.length || 0)}</span>
                            : p.video_url
                              ? <Film size={11} style={{ color: "var(--gr)", flexShrink: 0 }} />
                              : <span title="Ролик не загружен" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 8, fontWeight: 800, color: "var(--or)", background: "rgba(255,174,66,0.14)", padding: "2px 5px", borderRadius: 5, flexShrink: 0 }}><AlertTriangle size={9} />нет файла</span>}
                        </div>
                        {/* Превью загруженного ролика — чтобы видно было, какое именно видео */}
                        {!isCar && p.video_url && (
                          <video src={`${p.video_url}#t=0.1`} muted playsInline preload="metadata"
                            onClick={e => { e.stopPropagation(); const v = e.currentTarget; v.paused ? v.play() : v.pause(); }}
                            style={{ width: "100%", height: 96, objectFit: "cover", borderRadius: 8, background: "#000", display: "block" }} />
                        )}
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
          script={openPub.script_id != null ? scriptById[openPub.script_id] : undefined}
          onClose={() => setOpenId(null)}
          onUpdate={updatePub}
          onRegenerate={regenerate}
          onPublish={publishToMetricool}
          onCheckStatus={checkStatus}
        />
      )}
      <Tour steps={PIPELINE_TOUR} open={tourOpen} onClose={() => { setTourOpen(false); setOpenId(null); }} />
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:767px){.pp-board{grid-template-columns:1fr !important}.pp-board>div{min-height:auto !important}}`}</style>
    </div>
  );
}
