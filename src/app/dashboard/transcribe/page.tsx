"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client } from "@/lib/database";
import { getStore, setStore } from "@/lib/store";
import Avatar from "@/components/Avatar";
import Tour, { TourButton, type TourStep } from "@/components/Tour";
import {
  Mic, Upload, Link2, Loader2, Copy, Check, Download, Trash2, Database,
  ChevronDown, Filter, AlertTriangle, FileAudio,
} from "lucide-react";

type Item = {
  id: number; client_id: number | null; title: string | null;
  source_type: "file" | "link"; source_url: string | null; file_name: string | null;
  platform: string | null; language: string | null;
  status: "processing" | "done" | "error"; text: string | null;
  duration_sec: number | null; error: string | null; created_at: string;
};

const LANGS = [
  { v: "auto", l: "Определить автоматически" },
  { v: "ru", l: "Русский" },
  { v: "uk", l: "Українська" },
  { v: "en", l: "English" },
];
const fmtDur = (s: number | null) => {
  if (!s) return null;
  const m = Math.floor(s / 60), ss = Math.round(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
};
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function TranscribePage() {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>(getStore().clients || []);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [mode, setMode] = useState<"file" | "link">("file");
  const [lang, setLang] = useState("auto");
  const [langMenu, setLangMenu] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientMenu, setClientMenu] = useState(false);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    const s = getStore();
    let cls = s.clients;
    if (!cls) { cls = await db.getClients(supabase); setStore({ ...s, clients: cls }); }
    setClients(cls);
    const { data, error } = await supabase.from("transcriptions").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) setTableMissing(true); else setItems((data || []) as Item[]);
    setLoading(false);
  }

  // Пока есть задачи в работе — раз в 5 секунд спрашиваем провайдера, готов ли текст
  useEffect(() => {
    const pending = items.filter(i => i.status === "processing");
    if (!pending.length) return;
    const t = setTimeout(async () => {
      const upd = await Promise.all(pending.map(async i => {
        try {
          const r = await fetch(`/api/transcribe/${i.id}`);
          const j = await r.json();
          return j?.item as Item | undefined;
        } catch { return undefined; }
      }));
      const map = new Map(upd.filter(Boolean).map(u => [u!.id, u!]));
      if (map.size) setItems(arr => arr.map(x => map.get(x.id) || x));
    }, 5000);
    return () => clearTimeout(t);
  }, [items]);

  const activeClients = useMemo(() => clients.filter(c => c.stage === "active").sort((a, b) => a.name.localeCompare(b.name)), [clients]);
  const curClient = clients.find(c => c.id === clientId) || null;

  async function submit(payload: Record<string, any>) {
    const r = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok) { alert(j?.error || "не получилось поставить в очередь"); return; }
    setItems(a => [j.item as Item, ...a]);
    setTitle(""); setLink("");
  }

  async function uploadAndTranscribe(file: File) {
    setBusy("Загружаю файл…");
    try {
      const sign = await fetch("/api/r2/sign", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "audio", filename: file.name, clientId: clientId || "x", scriptId: Date.now() }),
      });
      const sj = await sign.json();
      if (!sign.ok) { alert("R2: " + (sj?.error || "ошибка подписи")); setBusy(null); return; }
      const put = await fetch(sj.uploadUrl, { method: "PUT", body: file, headers: file.type ? { "content-type": file.type } : {} });
      if (!put.ok) { alert(`Загрузка не удалась (${put.status}). Проверь CORS бакета.`); setBusy(null); return; }
      setBusy("Ставлю в очередь…");
      await submit({ mode: "file", url: sj.publicUrl, fileName: file.name, title: title || file.name, clientId, language: lang });
    } catch (e: any) { alert("Ошибка: " + String(e)); }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submitLink() {
    if (!link.trim()) return;
    setBusy("Тяну текст с ролика…");
    await submit({ mode: "link", url: link.trim(), title, clientId, language: lang });
    setBusy(null);
  }

  async function remove(id: number) {
    if (!confirm("Удалить транскрибацию?")) return;
    setItems(a => a.filter(x => x.id !== id));
    await fetch(`/api/transcribe/${id}`, { method: "DELETE" });
  }

  function copy(i: Item) {
    navigator.clipboard.writeText(i.text || "");
    setCopied(i.id); setTimeout(() => setCopied(null), 1600);
  }
  function download(i: Item) {
    const blob = new Blob([i.text || ""], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ((i.title || i.file_name || `transcript-${i.id}`).replace(/\.[^.]+$/, "")) + ".txt";
    a.click(); URL.revokeObjectURL(a.href);
  }

  const steps: TourStep[] = [
    { title: "Транскрибация", text: "Раздел превращает речь из ролика в текст. Два пути: загрузить свой файл или вставить ссылку на чужой ролик из TikTok / Instagram / YouTube." },
    { target: "tr-mode", title: "Шаг 1 — выбери источник", text: "«Свой файл» — если ролик у тебя на компьютере (mp4, mov, mp3, m4a, wav). «Ссылка на ролик» — если нужно снять текст с чужого видео в соцсети.", placement: "bottom" },
    { target: "tr-lang", title: "Шаг 2 — язык", text: "Оставь «Определить автоматически», если не уверен. Ставь язык вручную, когда в ролике смешаны языки и определилось неправильно.", placement: "bottom" },
    { target: "tr-client", title: "Шаг 3 — клиент (необязательно)", text: "Привяжи к клиенту, чтобы потом было понятно, к чьему контенту относится текст. Можно не выбирать.", placement: "bottom" },
    { target: "tr-input", title: "Шаг 4 — запусти", text: "Перетащи файл в поле или нажми «Выбрать файл». Файл заливается в наше хранилище, а текст появляется в списке ниже — обычно за минуту-две.", placement: "bottom" },
    { target: "tr-list", title: "Шаг 5 — забери текст", text: "Готовая транскрибация ложится карточкой. Кнопка «Копировать» — забрать текст себе, «Скачать .txt» — сохранить файлом. Пока идёт обработка, карточка крутит спиннер — страницу можно закрыть, текст не потеряется." },
  ];

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }}>
      <div style={{ marginBottom: 14, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Транскрибация</h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>Загрузи ролик — получи текст. Или вставь ссылку на чужое видео</p>
        </div>
        <TourButton onClick={() => setTourOpen(true)} />
      </div>
      <Tour steps={steps} open={tourOpen} onClose={() => setTourOpen(false)} />

      {tableMissing ? (
        <div style={{ padding: 24, borderRadius: 14, border: "1px solid rgba(255,174,66,0.4)", background: "rgba(255,174,66,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}><Database size={16} style={{ color: "var(--or)" }} /> Таблица транскрибаций не готова</div>
          <div style={{ fontSize: 13, color: "var(--t2)" }}>Прогони <code style={{ background: "var(--inset)", padding: "1px 6px", borderRadius: 5 }}>MIGRATION_2026-08-23_transcriptions.sql</code> в Supabase → SQL Editor.</div>
        </div>
      ) : (
        <>
          <div style={{ background: "rgba(123,63,228,0.04)", border: "1px solid var(--brd)", borderRadius: 14, padding: 14, marginBottom: 18 }}>
            <div data-tour="tr-mode" style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {([["file", "Свой файл", Upload], ["link", "Ссылка на ролик", Link2]] as const).map(([v, l, Ic]) => (
                <button key={v} onClick={() => setMode(v)}
                  style={{ flex: "0 0 auto", padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    background: mode === v ? "linear-gradient(135deg, var(--cy), var(--pu))" : "var(--inp)",
                    border: "1px solid var(--brd)", color: mode === v ? "#fff" : "var(--t2)", display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <Ic size={13} /> {l}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <div data-tour="tr-lang" style={{ position: "relative" }}>
                <button onClick={() => { setLangMenu(m => !m); setClientMenu(false); }}
                  style={{ height: 40, padding: "0 13px", borderRadius: 10, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ color: "var(--t3)", fontWeight: 500 }}>Язык:</span> {LANGS.find(x => x.v === lang)?.l} <ChevronDown size={13} />
                </button>
                {langMenu && <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40, minWidth: 230, background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 10, padding: 4, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
                  {LANGS.map(x => <button key={x.v} onClick={() => { setLang(x.v); setLangMenu(false); }} className="nav-item" style={{ fontSize: 12, padding: "7px 10px" }}>{x.l}</button>)}
                </div>}
              </div>

              <div data-tour="tr-client" style={{ position: "relative" }}>
                <button onClick={() => { setClientMenu(m => !m); setLangMenu(false); }}
                  style={{ height: 40, padding: "0 13px", borderRadius: 10, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
                  <Filter size={12} /><span style={{ color: "var(--t3)", fontWeight: 500 }}>Клиент:</span> {curClient ? `${curClient.name} ${curClient.surname || ""}` : "не важно"} <ChevronDown size={13} />
                </button>
                {clientMenu && <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40, minWidth: 240, background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 10, padding: 4, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", maxHeight: 320, overflowY: "auto" }}>
                  <button onClick={() => { setClientId(null); setClientMenu(false); }} className="nav-item" style={{ fontSize: 12, padding: "7px 10px" }}>Не важно</button>
                  {activeClients.map(c => <button key={c.id} onClick={() => { setClientId(c.id); setClientMenu(false); }} className="nav-item" style={{ fontSize: 12, padding: "7px 10px", gap: 8 }}><Avatar name={c.name} src={c.avatar_url} size={20} /> {c.name} {c.surname || ""}</button>)}
                </div>}
              </div>

              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Название (необязательно)"
                style={{ flex: 1, minWidth: 180, height: 40, padding: "0 13px", borderRadius: 10, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12.5, outline: "none" }} />
            </div>

            <div data-tour="tr-input">
              {mode === "file" ? (
                <label
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) uploadAndTranscribe(f); }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "26px 16px", borderRadius: 12, border: "1.5px dashed var(--brd)", background: "var(--inp)", cursor: busy ? "default" : "pointer", textAlign: "center" }}>
                  <input ref={fileRef} type="file" accept="video/*,audio/*" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadAndTranscribe(f); }} disabled={!!busy} />
                  {busy ? <Loader2 size={20} className="spin" style={{ color: "var(--cy)" }} /> : <FileAudio size={20} style={{ color: "var(--cy)" }} />}
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{busy || "Перетащи ролик сюда или нажми, чтобы выбрать"}</div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>mp4, mov, mp3, m4a, wav · до 2 часов</div>
                </label>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://www.instagram.com/reel/…"
                    onKeyDown={e => { if (e.key === "Enter") submitLink(); }}
                    style={{ flex: 1, height: 44, padding: "0 14px", borderRadius: 10, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none" }} />
                  <button onClick={submitLink} disabled={!!busy}
                    style={{ height: 44, padding: "0 18px", borderRadius: 10, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 7, opacity: busy ? 0.7 : 1 }}>
                    {busy ? <Loader2 size={14} className="spin" /> : <Mic size={14} />} {busy || "Снять текст"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div data-tour="tr-list" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {!items.length && <div style={{ padding: 30, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>Пока пусто — загрузи первый ролик</div>}
            {items.map(i => {
              const cl = clients.find(c => c.id === i.client_id);
              return (
                <div key={i.id} style={{ background: "rgba(123,63,228,0.04)", border: "1px solid var(--brd)", borderRadius: 14, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: i.text || i.error ? 10 : 0, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)", wordBreak: "break-word" }}>{i.title || i.file_name || "Без названия"}</div>
                      <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span>{fmtWhen(i.created_at)}</span>
                        {cl && <span>· {cl.name} {cl.surname || ""}</span>}
                        {i.language && i.language !== "auto" && <span>· {i.language.toUpperCase()}</span>}
                        {fmtDur(i.duration_sec) && <span>· {fmtDur(i.duration_sec)}</span>}
                        {i.source_type === "link" && i.platform && <span>· {i.platform}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {i.status === "processing" && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--cy)", display: "inline-flex", alignItems: "center", gap: 6 }}><Loader2 size={13} className="spin" /> обрабатывается…</span>}
                      {i.status === "done" && <>
                        <button onClick={() => copy(i)} title="Копировать текст" style={btn}>{copied === i.id ? <Check size={13} style={{ color: "var(--gr)" }} /> : <Copy size={13} />}</button>
                        <button onClick={() => download(i)} title="Скачать .txt" style={btn}><Download size={13} /></button>
                      </>}
                      <button onClick={() => remove(i.id)} title="Удалить" style={btn}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  {i.status === "error" && (
                    <div style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12, color: "var(--or)", background: "rgba(255,174,66,0.08)", border: "1px solid rgba(255,174,66,0.3)", borderRadius: 10, padding: "8px 10px" }}>
                      <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {i.error || "не получилось"}
                    </div>
                  )}
                  {i.status === "done" && i.text && (
                    <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--t2)", whiteSpace: "pre-wrap", background: "var(--inset)", borderRadius: 10, padding: "11px 13px", maxHeight: 320, overflowY: "auto" }}>{i.text}</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const btn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, background: "var(--inp)", border: "1px solid var(--brd)",
  color: "var(--t2)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
};
