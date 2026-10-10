"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Client, Script, StopCheck, StopIssue, stopHash } from "@/lib/database";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ExternalLink, X, Trash2, Eye, Heart, MessageCircle, RefreshCw, Swords, ShieldCheck, ShieldAlert, Loader2, Sparkles } from "lucide-react";

const fmtNum = (n: number | null | undefined) => n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);

export const SCRIPT_LEAD = 5, VIDEO_LEAD = 2; // дней до публикации

const RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export function fmtDateShort(s: string | null | undefined) {
  if (!s) return "—";
  const [, mm, dd] = String(s).slice(0, 10).split("-");
  const m = parseInt(mm, 10), d = parseInt(dd, 10);
  if (!m || !d) return String(s);
  return `${d} ${RU_MONTHS_GEN[m - 1]}`;
}
export function addDaysIso(iso: string, n: number) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
/** Дата, к которой нужен сценарий (= публикация − SCRIPT_LEAD) */
export function scriptDueDate(s: Script) { return s.pub_date ? addDaysIso(s.pub_date, -SCRIPT_LEAD) : null; }
/** Дата, к которой нужно видео/монтаж (= публикация − VIDEO_LEAD) */
export function videoDueDate(s: Script) { return s.pub_date ? addDaysIso(s.pub_date, -VIDEO_LEAD) : null; }

type Props = {
  script: Script;
  client?: Client;
  onClose: () => void;
  onUpdate: (id: number, patch: Partial<Script>) => Promise<void> | void;
  onDelete?: (id: number) => Promise<void> | void;
  /** false → даты и тексты только для чтения (роль монтажёра). Видео прикрепить можно. */
  canEdit?: boolean;
  /** Дату сдачи монтажа (ready_at) правит только владелец/админ. Остальные её видят, но не меняют. */
  canEditReadyAt?: boolean;
  /** Список контрактных месяцев клиента (напр. [1,2,3,4]). Если задан — в шапке появляется перенос сценария в другой месяц. */
  monthOptions?: number[];
};

export default function ScriptModal({ script: s, client: c, onClose, onUpdate, onDelete, canEdit = true, canEditReadyAt = false, monthOptions }: Props) {
  const ro = !canEdit; // read-only для монтажёра
  const roReady = !canEditReadyAt; // дату сдачи меняет только владелец/админ
  const [hookText, setHookText] = useState(s.hook_text || "");
  const [refUrl, setRefUrl] = useState(s.ref_url || "");
  const [refText, setRefText] = useState(s.ref_text || "");
  const [hook, setHook] = useState(s.hook || "");
  const [bodyText, setBodyText] = useState(s.body_text || "");
  const [cta, setCta] = useState(s.cta || "");
  const [postCaption, setPostCaption] = useState(s.post_caption || "");
  const [videoUrl, setVideoUrl] = useState(s.video_url || "");
  const [pubUrl, setPubUrl] = useState(s.published_url || "");
  const [pubDate, setPubDate] = useState(s.pub_date || "");
  const [readyAt, setReadyAt] = useState(s.ready_at || "");
  const [confirmDel, setConfirmDel] = useState(false);

  /* Поля сохраняются, когда теряют фокус. Но при закрытии по Escape фокус не «теряется»,
     а в Контент-плане список перечитывался раньше, чем запись доходила до базы, —
     и описание к рилсу «исчезало». Поэтому все записи идут через save(), а закрытие
     сначала досохраняет изменённые поля и дожидается ответа базы. */
  const pending = useRef<Promise<unknown>[]>([]);
  const save = (patch: Partial<Script>) => {
    const p = Promise.resolve(onUpdate(s.id, patch));
    pending.current.push(p);
    return p;
  };
  const [duelBusy, setDuelBusy] = useState(false);
  const [upBusy, setUpBusy] = useState(false);

  // Загрузка готового ролика в CRM (R2). Разрешена и монтажёру — по файлу считается сдача.
  async function uploadVideo(file: File) {
    setUpBusy(true);
    try {
      const r = await fetch("/api/r2/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name, clientId: s.client_id, scriptId: s.id }) });
      const j = await r.json();
      if (!r.ok) { alert("R2: " + (j?.error || "ошибка подписи")); setUpBusy(false); return; }
      const put = await fetch(j.uploadUrl, { method: "PUT", body: file, headers: file.type ? { "content-type": file.type } : {} });
      if (!put.ok) { alert(`Загрузка не удалась (${put.status}). Проверь CORS бакета.`); setUpBusy(false); return; }
      setVideoUrl(j.publicUrl); save({ video_url: j.publicUrl });
    } catch (e: any) { alert("Ошибка загрузки: " + String(e)); }
    setUpBusy(false);
  }

  async function refreshDuel() {
    setDuelBusy(true);
    try {
      const r = await fetch(`/api/scripts/${s.id}/stats-duel`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) { alert("Статистика: " + (j?.error || "ошибка")); }
      else {
        const { ok, ourFound, ourHint, ...patch } = j;
        if (patch.published_url) setPubUrl(patch.published_url);
        save(patch);
        if (ourHint) alert(ourHint);
      }
    } catch (e: any) { alert(String(e)); }
    setDuelBusy(false);
  }

  useEffect(() => {
    setHookText(s.hook_text || ""); setRefUrl(s.ref_url || ""); setRefText(s.ref_text || "");
    setHook(s.hook || ""); setBodyText(s.body_text || ""); setCta(s.cta || ""); setPostCaption(s.post_caption || "");
    setVideoUrl(s.video_url || ""); setPubDate(s.pub_date || ""); setReadyAt(s.ready_at || "");
  }, [s.id]);

  /* ---- Проверка на стоп-слова Instagram: только предупреждения, переписывает тимлид сам ---- */
  const [stop, setStop] = useState<StopCheck | null>(s.stopcheck || null);
  const [stopBusy, setStopBusy] = useState(false);
  const [stopErr, setStopErr] = useState("");
  useEffect(() => { setStop(s.stopcheck || null); setStopErr(""); }, [s.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const refs = { hook_text: useRef<HTMLInputElement>(null), hook: useRef<HTMLTextAreaElement>(null), body_text: useRef<HTMLTextAreaElement>(null),
    cta: useRef<HTMLTextAreaElement>(null), post_caption: useRef<HTMLTextAreaElement>(null) };
  const stopStale = !!stop && stop.hash !== stopHash({ hook_text: hookText, hook, body_text: bodyText, cta, post_caption: postCaption });
  async function runStopCheck() {
    setStopBusy(true); setStopErr("");
    // сначала сохраняем то, что набрано, — проверяем актуальный текст
    const diff: Partial<Script> = {};
    if (!ro) {
      if (hookText !== (s.hook_text || "")) diff.hook_text = hookText;
      if (hook !== (s.hook || "")) diff.hook = hook;
      if (bodyText !== (s.body_text || "")) diff.body_text = bodyText;
      if (cta !== (s.cta || "")) diff.cta = cta;
      if (postCaption !== (s.post_caption || "")) diff.post_caption = postCaption;
    }
    if (Object.keys(diff).length) save(diff);
    await Promise.allSettled(pending.current);
    const r = await fetch(`/api/scripts/${s.id}/stopcheck`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setStopBusy(false);
    if (!r.ok || !j.stopcheck) { setStopErr(j.error || `ошибка ${r.status}`); return; }
    setStop(j.stopcheck);
    onUpdate(s.id, { stopcheck: j.stopcheck, stopcheck_at: j.stopcheck_at });
  }
  /** Показать фразу в тексте: фокус на поле и выделение цитаты. */
  function showIssue(i: StopIssue) {
    const el = refs[i.field]?.current; if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const at = el.value.toLowerCase().indexOf(i.quote.toLowerCase());
    setTimeout(() => { el.focus(); if (at >= 0) el.setSelectionRange(at, at + i.quote.length); }, 250);
  }
  const FIELD_RU: Record<string, string> = { hook_text: "тема", hook: "хук", body_text: "текст", cta: "призыв", post_caption: "описание" };

  /* «Уникализировать в чате ИИ»: задача в чат «Рилсы» клиента, привязанная к этому сценарию.
     Сначала сохраняем набранное — ИИ должен видеть актуальные ссылку, расшифровку и текст. */
  const router = useRouter();
  const [chatBusy, setChatBusy] = useState(false);
  const [chatErr, setChatErr] = useState("");
  async function sendToChat() {
    setChatBusy(true); setChatErr("");
    const diff: Partial<Script> = {};
    if (!ro) {
      if (hookText !== (s.hook_text || "")) diff.hook_text = hookText;
      if (refUrl !== (s.ref_url || "")) diff.ref_url = refUrl;
      if (refText !== (s.ref_text || "")) diff.ref_text = refText;
      if (hook !== (s.hook || "")) diff.hook = hook;
      if (bodyText !== (s.body_text || "")) diff.body_text = bodyText;
      if (cta !== (s.cta || "")) diff.cta = cta;
      if (postCaption !== (s.post_caption || "")) diff.post_caption = postCaption;
    }
    if (Object.keys(diff).length) save(diff);
    await Promise.allSettled(pending.current);
    const r = await fetch(`/api/scripts/${s.id}/to-chat`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setChatBusy(false);
    if (!r.ok) { setChatErr(j.error || `ошибка ${r.status}`); return; }
    onClose();
    router.push(`/dashboard/clients/${j.client_id}?ctab=chat&thread=reels`);
  }

  const closing = useRef(false);
  async function requestClose() {
    if (closing.current) return;
    closing.current = true;
    const diff: Partial<Script> = {};
    if (!ro) {
      if (hookText !== (s.hook_text || "")) diff.hook_text = hookText;
      if (refUrl !== (s.ref_url || "")) diff.ref_url = refUrl;
      if (refText !== (s.ref_text || "")) diff.ref_text = refText;
      if (hook !== (s.hook || "")) diff.hook = hook;
      if (bodyText !== (s.body_text || "")) diff.body_text = bodyText;
      if (cta !== (s.cta || "")) diff.cta = cta;
      if (postCaption !== (s.post_caption || "")) diff.post_caption = postCaption;
    }
    if (videoUrl !== (s.video_url || "")) diff.video_url = videoUrl;
    if (pubUrl !== (s.published_url || "")) diff.published_url = pubUrl;
    if (Object.keys(diff).length) save(diff);
    await Promise.allSettled(pending.current);
    onClose();
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const isPublished = s.video_status === "published";
  const scrDue = pubDate ? addDaysIso(pubDate, -SCRIPT_LEAD) : null;
  const vidDue = pubDate ? addDaysIso(pubDate, -VIDEO_LEAD) : null;

  const label = (txt: string, color = "var(--t3)") => (
    <label style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 5 }}>{txt}</label>
  );
  const ta: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 9,
    background: "var(--inset2)", border: "1px solid var(--brd)", color: "var(--t1)",
    fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5,
  };

  return (
    <div onClick={requestClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 18,
        width: "100%", maxWidth: 680, padding: 24, display: "flex", flexDirection: "column", gap: 16,
        boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: "var(--t3)", fontFamily: "monospace", marginBottom: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span>{c ? `${c.name} ${c.surname || ""} · ` : ""}сценарий #{s.order_num}</span>
              {!ro && monthOptions && monthOptions.length > 1 ? (
                <span title="Перенести сценарий в другой контрактный месяц" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  · месяц:
                  <select value={s.month_number}
                    onChange={(e) => { const n = Number(e.target.value); if (n !== s.month_number) save({ month_number: n }); }}
                    style={{ background: "var(--inset2)", border: "1px solid var(--brd)", color: "var(--cy)", borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 800, fontFamily: "monospace", cursor: "pointer", outline: "none" }}>
                    {monthOptions.map(m => <option key={m} value={m}>M{m}</option>)}
                  </select>
                </span>
              ) : (
                <span>· M{s.month_number}</span>
              )}
            </div>
            <input ref={refs.hook_text}
              value={hookText} onChange={(e) => setHookText(e.target.value)} readOnly={ro}
              onBlur={() => { if (!ro && hookText !== (s.hook_text || "")) save({ hook_text: hookText }); }}
              placeholder="Тема / хук сценария…"
              style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "var(--t1)", fontSize: 19, fontWeight: 800, fontFamily: "'Unbounded', sans-serif", letterSpacing: -0.3 }}
            />
          </div>
          <button onClick={requestClose} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: "var(--track)", border: "1px solid var(--brd)", color: "var(--t2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>

        {/* Сроки */}
        <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr 1fr", gap: 12, alignItems: "end", padding: 14, borderRadius: 12, background: "var(--inset)", border: "1px solid var(--brd)" }}>
          <div data-tour="sm-date">
            {label(ro ? "📅 Публикация (только чтение)" : "📅 Публикация")}
            <input type="date" value={pubDate} onChange={(e) => setPubDate(e.target.value)} readOnly={ro} disabled={ro}
              onBlur={() => { if (!ro && pubDate !== (s.pub_date || "")) save({ pub_date: pubDate || null }); }}
              style={{ ...ta, fontSize: 12, width: 150, opacity: ro ? 0.6 : 1 }} />
          </div>
          <div data-tour="sm-ready">
            {label(roReady ? "✂️ Смонтировано (фиксируется авто)" : "✂️ Смонтировано (дата сдачи)")}
            <input type="date" value={readyAt} onChange={(e) => setReadyAt(e.target.value)} readOnly={roReady} disabled={roReady}
              onBlur={() => { if (!roReady && readyAt !== (s.ready_at || "")) save({ ready_at: readyAt || null }); }}
              title={roReady
                ? "День сдачи монтажа. Проставляется автоматически при переносе ролика в «Готово к публикации» и не редактируется. Менять может только владелец."
                : "День сдачи монтажа — по нему начисляется ЗП монтажёру. Ставится авто при переносе в «Готово к публикации», при необходимости поправь вручную."}
              style={{ ...ta, fontSize: 12, width: 150, opacity: roReady ? 0.6 : 1, cursor: roReady ? "not-allowed" : "auto" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Сценарий к</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: scrDue ? "var(--cy)" : "var(--t3)", marginTop: 3 }}>{scrDue ? fmtDateShort(scrDue) : "—"}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Видео к</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: vidDue ? "var(--or)" : "var(--t3)", marginTop: 3 }}>{vidDue ? fmtDateShort(vidDue) : "—"}</div>
          </div>
        </div>

        {/* Референс — ссылка */}
        <div data-tour="sm-ref">
          {label("🎬 Референс — ссылка на исходник")}
          <div style={{ display: "flex", gap: 6 }}>
            <input value={refUrl} onChange={(e) => setRefUrl(e.target.value)} readOnly={ro}
              onBlur={() => { if (!ro && refUrl !== (s.ref_url || "")) save({ ref_url: refUrl }); }}
              placeholder="https://…" style={{ ...ta, fontSize: 12 }} />
            {s.ref_url && (
              <a href={s.ref_url.startsWith("http") ? s.ref_url : `https://${s.ref_url}`} target="_blank" rel="noopener noreferrer"
                style={{ flexShrink: 0, padding: "0 14px", borderRadius: 9, background: "rgba(157,107,255,0.12)", border: "1px solid var(--brd)", color: "var(--pu)", display: "inline-flex", alignItems: "center" }}>
                <ExternalLink size={15} />
              </a>
            )}
          </div>
        </div>

        {/* Транскрибация */}
        <div>
          {label("📝 Транскрибация референса")}
          <textarea value={refText} onChange={(e) => setRefText(e.target.value)} readOnly={ro}
            onBlur={() => { if (!ro && refText !== (s.ref_text || "")) save({ ref_text: refText }); }}
            rows={5} placeholder="Расшифровка текста исходного видео…" style={ta} />
        </div>

        {/* Разбор донора — что именно тащило ролик (сохранить при адаптации) */}
        {s.description && (
          <div style={{ padding: 12, borderRadius: 11, background: "rgba(255,174,66,0.06)", border: "1px solid rgba(255,174,66,0.3)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--or)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>🔥 Разбор донора — рычаг, который надо сохранить</div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--t1)", whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto" }}>{s.description}</div>
          </div>
        )}

        {/* Наш сценарий — 3 части, пишем вручную */}
        <div data-tour="sm-parts" style={{ padding: 14, borderRadius: 12, background: "rgba(157,107,255,0.05)", border: "1px solid var(--brd)", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--pu)", textTransform: "uppercase", letterSpacing: 0.5 }}>✨ Наш сценарий</span>
            <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
            {!ro && (
              <button onClick={sendToChat} disabled={chatBusy} title="Задача уйдёт в «Чат · ИИ» → «Рилсы» клиента: ИИ посмотрит референс и расшифровку и предложит версию под клиента. В сценарий запишет, когда скажете «записывай»."
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8, border: "1px solid rgba(157,107,255,.45)", background: "rgba(157,107,255,.12)", color: "var(--t1)", fontSize: 11.5, fontWeight: 700, cursor: chatBusy ? "default" : "pointer" }}>
                {chatBusy ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} {chatBusy ? "Отправляю…" : "Уникализировать в чате ИИ"}
              </button>
            )}
            <button onClick={runStopCheck} disabled={stopBusy} title="ИИ подсветит фразы, из-за которых Instagram может занизить показы. Ничего не меняет — решаете вы."
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8, border: "1px solid var(--brd)", background: "var(--card)", color: "var(--t1)", fontSize: 11.5, fontWeight: 700, cursor: stopBusy ? "default" : "pointer" }}>
              {stopBusy ? <Loader2 size={13} className="spin" /> : <ShieldCheck size={13} />} {stopBusy ? "Проверяю…" : stop ? "Проверить снова" : "Проверить на стоп-слова"}
            </button>
            </span>
          </div>
          {chatErr && <div style={{ fontSize: 12, color: "var(--rd)" }}>Не отправилось в чат: {chatErr}</div>}
          {stopErr && <div style={{ fontSize: 12, color: "var(--rd)" }}>Проверка не прошла: {stopErr}</div>}
          {stop && !stopBusy && (
            <div style={{ padding: 11, borderRadius: 10, border: `1px solid ${stop.issues.length ? (stop.issues.some(i => i.severity === "high") ? "rgba(220,38,38,.4)" : "rgba(234,88,12,.4)") : "rgba(22,163,74,.35)"}`, background: "var(--card)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: stop.issues.length ? "var(--t1)" : "var(--gr)" }}>
                {stop.issues.length ? <ShieldAlert size={15} style={{ color: stop.issues.some(i => i.severity === "high") ? "var(--rd)" : "var(--or)" }} /> : <ShieldCheck size={15} />}
                {stop.issues.length ? `Стоп-слова: ${stop.issues.length} ${stop.issues.length === 1 ? "предупреждение" : stop.issues.length < 5 ? "предупреждения" : "предупреждений"}` : "Рисков для показов не найдено"}
                {stopStale && <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: "var(--or)" }}>текст изменён после проверки</span>}
              </div>
              {stop.summary && <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.45 }}>{stop.summary}</div>}
              {stop.issues.map((i, n) => (
                <button key={n} onClick={() => showIssue(i)} title="Показать в тексте"
                  style={{ textAlign: "left", padding: "8px 10px", borderRadius: 8, border: 0, cursor: "pointer", background: i.severity === "high" ? "rgba(220,38,38,.07)" : "rgba(234,88,12,.07)", borderLeft: `3px solid ${i.severity === "high" ? "var(--rd)" : "var(--or)"}`, fontFamily: "inherit" }}>
                  <div style={{ fontSize: 12.5, color: "var(--t1)" }}>
                    <span style={{ fontWeight: 800, color: i.severity === "high" ? "var(--rd)" : "var(--or)" }}>{i.severity === "high" ? "Высокий риск" : "Спорно"}</span>
                    <span style={{ color: "var(--t3)" }}> · {FIELD_RU[i.field] || i.field}{i.category ? ` · ${i.category}` : ""}</span>
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 3, color: "var(--t1)" }}>«<mark style={{ background: i.severity === "high" ? "rgba(220,38,38,.18)" : "rgba(234,88,12,.18)", color: "inherit", padding: "0 2px", borderRadius: 3 }}>{i.quote}</mark>»</div>
                  <div style={{ fontSize: 11.5, color: "var(--t2)", marginTop: 3 }}>{i.why}</div>
                </button>
              ))}
              {!!stop.checklist?.length && <div style={{ fontSize: 11.5, color: "var(--t3)" }}>Проверить в ролике: {stop.checklist.join(" · ")}</div>}
              {stop.issues.length > 0 && <div style={{ fontSize: 10.5, color: "var(--t3)" }}>Это предупреждения — переписать фразу или оставить, решаете вы. Клик по пункту выделит фразу в тексте.</div>}
            </div>
          )}
          <div>
            {label("1. Хук (первые секунды)", "var(--cy)")}
            <textarea ref={refs.hook} value={hook} onChange={(e) => setHook(e.target.value)} readOnly={ro}
              onBlur={() => { if (!ro && hook !== (s.hook || "")) save({ hook }); }}
              rows={2} placeholder="Цепляющее начало — ради чего досмотрят…" style={{ ...ta, background: "var(--inset2)" }} />
          </div>
          <div>
            {label("2. Основной текст", "var(--pu)")}
            <textarea ref={refs.body_text} value={bodyText} onChange={(e) => setBodyText(e.target.value)} readOnly={ro}
              onBlur={() => { if (!ro && bodyText !== (s.body_text || "")) save({ body_text: bodyText }); }}
              rows={7} placeholder="Тело сценария — мясо/смысл…" style={{ ...ta, background: "var(--inset2)" }} />
          </div>
          <div>
            {label("3. Призыв (CTA)", "var(--gr)")}
            <textarea ref={refs.cta} value={cta} onChange={(e) => setCta(e.target.value)} readOnly={ro}
              onBlur={() => { if (!ro && cta !== (s.cta || "")) save({ cta }); }}
              rows={2} placeholder="Призыв к действию в конце…" style={{ ...ta, background: "var(--inset2)" }} />
          </div>
          <div>
            {label("4. Описание к рилсу", "var(--or)")}
            <textarea ref={refs.post_caption} value={postCaption} onChange={(e) => setPostCaption(e.target.value)} readOnly={ro}
              onBlur={() => { if (!ro && postCaption !== (s.post_caption || "")) save({ post_caption: postCaption }); }}
              rows={4} placeholder="Текст под роликом — то, что пойдёт в подпись поста…" style={{ ...ta, background: "var(--inset2)" }} />
            <div style={{ fontSize: 9.5, color: "var(--t3)", marginTop: 4 }}>Уедет в «Публикации» как основа текста — там его адаптируют под каждую соцсеть.</div>
          </div>
        </div>

        {/* Готовый ролик — грузим прямо в CRM на фазе монтажа. По загруженному файлу считается сдача. */}
        {s.script_status === "approved" && (
          <div data-tour="sm-video" style={{ padding: 12, borderRadius: 12, background: s.video_url ? "rgba(168,224,99,0.06)" : "rgba(255,174,66,0.06)", border: `1px solid ${s.video_url ? "rgba(168,224,99,0.3)" : "rgba(255,174,66,0.35)"}` }}>
            {label("🎬 Смонтированный ролик — файл от монтажёра", s.video_url ? "var(--gr)" : "var(--or)")}
            <div style={{ display: "flex", gap: 6 }}>
              <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
                onBlur={() => { if (videoUrl !== (s.video_url || "")) save({ video_url: videoUrl }); }}
                placeholder="Загрузи файл справа → или вставь ссылку" style={{ ...ta, fontSize: 12 }} />
              {s.video_url && (
                <a href={s.video_url.startsWith("http") ? s.video_url : `https://${s.video_url}`} target="_blank" rel="noopener noreferrer"
                  style={{ flexShrink: 0, padding: "0 14px", borderRadius: 9, background: "rgba(168,224,99,0.14)", border: "1px solid rgba(168,224,99,0.3)", color: "var(--gr)", display: "inline-flex", alignItems: "center" }}>
                  <ExternalLink size={15} />
                </a>
              )}
              <label style={{ flexShrink: 0, padding: "0 14px", borderRadius: 9, background: "rgba(66,212,244,0.12)", border: "1px solid var(--brd)", color: "var(--cy)", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, cursor: upBusy ? "default" : "pointer", whiteSpace: "nowrap" }}>
                {upBusy ? "Загружаю…" : "⬆ Файл"}
                <input type="file" accept="video/*" disabled={upBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo(f); e.target.value = ""; }} style={{ display: "none" }} />
              </label>
            </div>
            {s.video_url
              ? <video src={s.video_url.startsWith("http") ? s.video_url : `https://${s.video_url}`} controls playsInline preload="metadata" style={{ width: "100%", maxHeight: 240, marginTop: 8, borderRadius: 10, background: "#000", display: "block" }} />
              : <div style={{ fontSize: 10, color: "var(--or)", marginTop: 6, fontWeight: 600 }}>⚠ Пока ролик не загружен — карточку нельзя перевести в «Готово к публикации».</div>}
          </div>
        )}

        {/* Ссылка на вышедший пост — её вставляют уже после публикации, по ней тянется статистика */}
        {isPublished && (
          <div style={{ padding: 12, borderRadius: 12, background: s.published_url ? "rgba(66,212,244,0.06)" : "rgba(157,107,255,0.05)", border: `1px solid ${s.published_url ? "rgba(66,212,244,0.3)" : "var(--brd)"}` }}>
            {label("🔗 Ссылка на публикацию в соцсети", s.published_url ? "var(--cy)" : "var(--t3)")}
            <div style={{ display: "flex", gap: 6 }}>
              <input value={pubUrl} onChange={(e) => setPubUrl(e.target.value)}
                onBlur={() => { if (pubUrl !== (s.published_url || "")) save({ published_url: pubUrl }); }}
                placeholder="https://www.instagram.com/reel/… — берётся из соцсети после выхода" style={{ ...ta, fontSize: 12 }} />
              {s.published_url && (
                <a href={s.published_url.startsWith("http") ? s.published_url : `https://${s.published_url}`} target="_blank" rel="noopener noreferrer"
                  style={{ flexShrink: 0, padding: "0 14px", borderRadius: 9, background: "rgba(66,212,244,0.14)", border: "1px solid rgba(66,212,244,0.3)", color: "var(--cy)", display: "inline-flex", alignItems: "center" }}>
                  <ExternalLink size={15} />
                </a>
              )}
            </div>
            <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 6 }}>
              По этой ссылке считается статистика ролика. Файл выше — это исходник от монтажёра, статистику по нему не собрать.
            </div>
          </div>
        )}

        {/* ⚔ Дуэль: исходник vs наше видео */}
        {(s.ref_url || s.ref_views != null || isPublished) && (() => {
          const rV = s.ref_views ?? null, oV = s.our_views ?? null;
          const ratio = rV && oV != null ? oV / rV : null;
          const verdict = ratio == null ? null
            : ratio >= 1 ? { t: "🔥 залетело лучше исходника", c: "#a8e063" }
            : ratio >= 0.5 ? { t: "🟢 хорошо, близко к исходнику", c: "#a8e063" }
            : ratio >= 0.2 ? { t: "🟡 средне", c: "#ffae42" }
            : { t: "🔴 слабо зашло", c: "#ff5c7a" };
          const Col = ({ title, url, v, l, cm, accent }: { title: string; url?: string | null; v: number | null; l: number | null; cm: number | null; accent: string }) => (
            <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, color: "var(--t1)", display: "inline-flex", alignItems: "center", gap: 6 }}><Eye size={16} style={{ color: accent }} /> {fmtNum(v)}</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 6, fontSize: 11, color: "var(--t2)", fontWeight: 700 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><MessageCircle size={12} style={{ color: "var(--pu)" }} /> {fmtNum(cm)}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Heart size={12} style={{ color: "var(--rd)" }} /> {fmtNum(l)}</span>
              </div>
              {url ? <a href={url.startsWith("http") ? url : `https://${url}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 10, fontWeight: 700, color: accent, textDecoration: "none" }}>открыть <ExternalLink size={11} /></a> : <div style={{ marginTop: 8, fontSize: 10, color: "var(--t3)" }}>нет ссылки</div>}
            </div>
          );
          return (
            <div style={{ padding: 14, borderRadius: 12, background: "rgba(66,212,244,0.05)", border: "1px solid var(--brd)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800, color: "var(--t1)" }}><Swords size={14} style={{ color: "var(--cy)" }} /> Результат · исходник vs наше</span>
                <button onClick={refreshDuel} disabled={duelBusy}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8, background: "rgba(66,212,244,0.12)", border: "1px solid var(--brd)", color: "var(--cy)", fontSize: 10, fontWeight: 800, cursor: duelBusy ? "default" : "pointer" }}>
                  <RefreshCw size={12} className={duelBusy ? "spin" : ""} /> {duelBusy ? "Тяну…" : "обновить"}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <Col title="Исходник (реф)" url={s.ref_url} v={rV} l={s.ref_likes ?? null} cm={s.ref_comments ?? null} accent="#9d6bff" />
                <div style={{ alignSelf: "center", fontSize: 18, color: "var(--t3)", fontWeight: 800 }}>→</div>
                <Col title="Наше видео" url={s.video_url} v={oV} l={s.our_likes ?? null} cm={s.our_comments ?? null} accent="#42d4f4" />
              </div>
              {verdict && (
                <div style={{ marginTop: 12, textAlign: "center", padding: "7px", borderRadius: 8, background: `${verdict.c}18`, color: verdict.c, fontSize: 12, fontWeight: 800 }}>
                  {verdict.t} · наше = {Math.round((ratio as number) * 100)}% от исходника
                </div>
              )}
              {s.our_stats_at && <div style={{ marginTop: 8, textAlign: "center", fontSize: 9, color: "var(--t3)" }}>обновлено {fmtDateShort(s.our_stats_at)}</div>}
            </div>
          );
        })()}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 4 }}>
          {onDelete && !ro ? (
            <button onClick={() => setConfirmDel(true)}
              style={{ padding: "8px 12px", borderRadius: 9, background: "transparent", border: "1px solid rgba(255,92,122,0.4)", color: "var(--rd)", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Trash2 size={13} /> Удалить
            </button>
          ) : <span />}
          <button onClick={requestClose}
            style={{ padding: "8px 18px", borderRadius: 9, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            Готово
          </button>
        </div>
      </div>

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <ConfirmDialog
        open={confirmDel}
        title="Удалить сценарий?"
        text={`«${hookText || `Сценарий #${s.order_num || "—"}`}» будет удалён безвозвратно.`}
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => { setConfirmDel(false); onDelete?.(s.id); }}
      />
    </div>
  );
}
