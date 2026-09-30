"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fileUrl, guessType, when } from "@/components/strategy/files";
import { Paperclip, Send, X, Sparkles, Loader2, AlertTriangle, CheckCircle2, Download } from "lucide-react";

/* Чат по клиенту. Вся работа по проекту в одном месте: сотрудники пишут задачи
   и кидают исходники, у клиентов с включённым ИИ-чатом отвечает исполнитель на
   сервере — он видит бренд-кит, стратегию и всю эту переписку, а готовые ролики
   и кадры присылает сюда же. Правки — просто следующее сообщение. */

type Att = { key: string; name: string; type: string; size: number };
type Msg = {
  id: number; client_id: number; author_type: "user" | "ai" | "system"; author_name: string | null;
  body: string; attachments: Att[]; ai_status: "queued" | "working" | "done" | "error" | null;
  ai_error: string | null; reply_to: number | null; created_at: string;
};
type Pending = { id: string; file: File; pct: number; key?: string; err?: string };

const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(n > 104857600 ? 0 : 1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);
const isVideo = (a: Att) => a.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(a.name);
const isImage = (a: Att) => a.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(a.name);

/* Заливка в R2 с процентами: исходники аватара бывают по сотне мегабайт */
function putWithProgress(url: string, file: File, onPct: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", file.type || guessType(file.name));
    x.upload.onprogress = (e) => { if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`хранилище ответило ${x.status}`)));
    x.onerror = () => reject(new Error("сеть оборвалась"));
    x.send(file);
  });
}

export default function ClientChatTab({ clientId, aiEnabled }: { clientId: number; aiEnabled: boolean }) {
  const supabase = createClient();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [me, setMe] = useState<{ id: string | null; name: string }>({ id: null, name: "Сотрудник" });
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);

  async function load() {
    const { data, error } = await supabase.from("client_chat_messages").select("*")
      .eq("client_id", clientId).order("id", { ascending: true }).limit(500);
    if (error) { if (/does not exist|schema cache/i.test(error.message)) setMissing(true); setLoading(false); return; }
    const rows = (data || []) as Msg[];
    setMsgs(rows);
    setLoading(false);
    const newest = rows.length ? rows[rows.length - 1].id : 0;
    if (newest > lastId.current) { lastId.current = newest; setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50); }
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id || null;
      let name = session?.user?.email?.split("@")[0] || "Сотрудник";
      if (uid) {
        const { data: tm } = await supabase.from("team_members").select("name").eq("profile_id", uid).maybeSingle();
        const { data: pr } = await supabase.from("profiles").select("name").eq("id", uid).maybeSingle();
        name = tm?.name || pr?.name || name;
      }
      setMe({ id: uid, name });
    })();
    load();
    // пока вкладка открыта — подтягиваем новые сообщения; ИИ отвечает с сервера
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 4000);
    return () => clearInterval(t);
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const working = useMemo(() => msgs.some((m) => m.ai_status === "queued" || m.ai_status === "working"), [msgs]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list).map((file) => ({ id: `${Date.now()}-${file.name}-${Math.random()}`, file, pct: 0 }))]);
  }

  async function send() {
    const body = text.trim();
    if (!body && !files.length) return;
    setSending(true);
    const atts: Att[] = [];
    try {
      for (const p of files) {
        if (p.key) { atts.push({ key: p.key, name: p.file.name, type: p.file.type || guessType(p.file.name), size: p.file.size }); continue; }
        const r = await fetch("/api/client-files", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, category: "chat", filename: p.file.name }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "не удалось подготовить загрузку");
        await putWithProgress(j.uploadUrl, p.file, (pct) => setFiles((f) => f.map((x) => (x.id === p.id ? { ...x, pct } : x))));
        setFiles((f) => f.map((x) => (x.id === p.id ? { ...x, key: j.key, pct: 100 } : x)));
        atts.push({ key: j.key, name: p.file.name, type: p.file.type || guessType(p.file.name), size: p.file.size });
      }
      const { error } = await supabase.from("client_chat_messages").insert({
        client_id: clientId, author_type: "user", author_id: me.id, author_name: me.name,
        body, attachments: atts, ai_status: aiEnabled ? "queued" : null,
      });
      if (error) throw new Error(error.message);
      setText(""); setFiles([]);
      await load();
    } catch (e: any) {
      alert(`Не отправилось: ${e.message || e}. Уже загруженные файлы при повторе не заливаются заново.`);
    } finally { setSending(false); }
  }

  if (missing) return <div className="v2-card" style={{ padding: 18, color: "var(--t2)" }}>Нужно прогнать миграцию <code>MIGRATION_2026-09-30_client_chat.sql</code>.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {aiEnabled && (
        <div className="v2-card" style={{ padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", fontSize: 12.5, color: "var(--t2)" }}>
          <Sparkles size={15} style={{ color: "var(--pu)", flexShrink: 0 }} />
          <span>В этом чате отвечает ИИ. Он видит бренд-кит, контент-стратегию и всю переписку по клиенту. Кидайте исходник и пишите задачу: монтаж, сторис, правки. Ответ — за пару минут, монтаж — дольше.</span>
        </div>
      )}

      <div className="v2-card" style={{ padding: 14, minHeight: 360, maxHeight: "62vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {loading ? <div style={{ color: "var(--t3)", fontSize: 13 }}>Загружаю…</div>
          : !msgs.length ? <div style={{ color: "var(--t3)", fontSize: 13, margin: "auto", textAlign: "center" }}>Сообщений пока нет.<br />{aiEnabled ? "Напишите задачу и приложите исходник — ИИ возьмёт её в работу." : "Здесь команда ведёт работу по клиенту."}</div>
          : msgs.map((m) => <Bubble key={m.id} m={m} mine={m.author_type === "user" && m.author_name === me.name} />)}
        {working && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--pu)" }}>
            <Loader2 size={14} className="spin" /> ИИ работает над задачей…
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="v2-card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {files.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {files.map((p) => (
              <span key={p.id} className="v2-chip mut" style={{ gap: 6, padding: "4px 8px" }}>
                {p.file.name} · {mb(p.file.size)}{sending || p.pct ? ` · ${p.pct}%` : ""}
                {!sending && <button onClick={() => setFiles((f) => f.filter((x) => x.id !== p.id))} style={{ background: "none", border: 0, color: "var(--t3)", cursor: "pointer", padding: 0 }}><X size={12} /></button>}
              </span>
            ))}
          </div>
        )}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(); }}
          placeholder={aiEnabled ? "Задача для ИИ: например, «смонтируй этот исходник в нашем стиле, хук в первые 2 секунды, трек спокойный»" : "Сообщение команде"}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13.5, fontFamily: "inherit", resize: "vertical", outline: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label className="v2-act ghost" style={{ cursor: sending ? "default" : "pointer", height: 34 }}>
            <Paperclip size={14} /> Файлы
            <input type="file" multiple disabled={sending} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
          </label>
          <span style={{ fontSize: 11, color: "var(--t3)" }}>Cmd+Enter — отправить</span>
          <div style={{ flex: 1 }} />
          <button className="v2-act pri" onClick={send} disabled={sending || (!text.trim() && !files.length)} style={{ height: 36 }}>
            {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />} {sending ? "Отправляю…" : "Отправить"}
          </button>
        </div>
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Bubble({ m, mine }: { m: Msg; mine: boolean }) {
  const ai = m.author_type === "ai";
  const status = m.author_type === "user" ? m.ai_status : null;
  return (
    <div style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "min(620px, 92%)", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11, color: "var(--t3)", display: "flex", gap: 6, alignItems: "center", justifyContent: mine ? "flex-end" : "flex-start" }}>
        {ai && <Sparkles size={11} style={{ color: "var(--pu)" }} />}
        <b style={{ color: ai ? "var(--pu)" : "var(--t2)" }}>{ai ? "ИИ" : m.author_name || "Сотрудник"}</b>
        <span>{when(m.created_at)}</span>
        {status === "queued" && <span className="v2-chip mut" style={{ padding: "1px 6px" }}>в очереди</span>}
        {status === "working" && <span className="v2-chip pu" style={{ padding: "1px 6px" }}><Loader2 size={10} className="spin" /> ИИ работает</span>}
        {status === "done" && <CheckCircle2 size={12} style={{ color: "var(--gr)" }} />}
        {status === "error" && <span className="v2-chip rd" style={{ padding: "1px 6px" }}><AlertTriangle size={10} /> ошибка</span>}
      </div>
      <div style={{
        padding: "10px 13px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
        background: ai ? "rgba(157,107,255,.10)" : mine ? "rgba(66,212,244,.10)" : "var(--v2-inset)",
        border: `1px solid ${ai ? "rgba(157,107,255,.3)" : "var(--brd)"}`, color: "var(--t1)",
      }}>
        {m.body}
        {status === "error" && m.ai_error && <div style={{ marginTop: 6, fontSize: 12, color: "var(--rd)" }}>{m.ai_error}</div>}
        {m.attachments?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: m.body ? 10 : 0 }}>
            {m.attachments.map((a) => (
              <div key={a.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {isVideo(a) ? <video src={fileUrl(a.key)} controls preload="metadata" style={{ width: 220, maxHeight: 390, borderRadius: 10, background: "#000" }} />
                  : isImage(a) ? <a href={fileUrl(a.key)} target="_blank" rel="noreferrer"><img src={fileUrl(a.key)} alt={a.name} style={{ width: 160, borderRadius: 10, display: "block" }} /></a>
                  : null}
                <a href={fileUrl(a.key)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--t3)", display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <Download size={11} /> {a.name} · {mb(a.size)}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
