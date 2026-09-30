"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fileUrl, guessType, when } from "@/components/strategy/files";
import { Paperclip, Send, X, Sparkles, Loader2, AlertTriangle, CheckCircle2, Download, RotateCw, UploadCloud } from "lucide-react";

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
type Pending = { id: string; file: File; pct: number; status: "uploading" | "done" | "error"; key?: string; err?: string; preview?: string };

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
  const [ahead, setAhead] = useState(0); // задач других клиентов перед нашей в общей очереди ИИ
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
    // ИИ берёт задачи по одной на всех клиентов — показываем, сколько впереди
    const firstQ = rows.find((m) => m.ai_status === "queued");
    if (firstQ) {
      const { count } = await supabase.from("client_chat_messages").select("id", { count: "exact", head: true })
        .in("ai_status", ["queued", "working"]).lt("id", firstQ.id).neq("client_id", clientId);
      setAhead(count || 0);
    } else setAhead(0);
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

  const [drag, setDrag] = useState(false);
  const patchFile = (id: string, p: Partial<Pending>) => setFiles((f) => f.map((x) => (x.id === id ? { ...x, ...p } : x)));

  /* Файл начинает заливаться сразу после выбора — видно проценты, и к моменту
     «Отправить» он уже в хранилище. Исходники аватара бывают по сотне мегабайт. */
  async function startUpload(p: Pending) {
    patchFile(p.id, { status: "uploading", pct: 0, err: undefined });
    try {
      const r = await fetch("/api/client-files", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, category: "chat", filename: p.file.name }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "не удалось подготовить загрузку");
      await putWithProgress(j.uploadUrl, p.file, (pct) => patchFile(p.id, { pct }));
      patchFile(p.id, { key: j.key, pct: 100, status: "done" });
    } catch (e: any) {
      patchFile(p.id, { status: "error", err: e.message || String(e) });
    }
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const added: Pending[] = Array.from(list).map((file) => ({
      id: `${Date.now()}-${file.name}-${Math.random()}`, file, pct: 0, status: "uploading" as const,
      preview: file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : undefined,
    }));
    setFiles((f) => [...f, ...added]);
    added.forEach(startUpload);
  }

  const uploading = files.filter((f) => f.status === "uploading").length;
  const failed = files.filter((f) => f.status === "error").length;

  // не дать закрыть вкладку, пока файл заливается
  useEffect(() => {
    if (!uploading) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [uploading]);

  async function send() {
    const body = text.trim();
    if (!body && !files.length) return;
    if (uploading || failed) return;
    setSending(true);
    try {
      const atts: Att[] = files.filter((p) => p.key).map((p) => ({
        key: p.key!, name: p.file.name, type: p.file.type || guessType(p.file.name), size: p.file.size }));
      const { error } = await supabase.from("client_chat_messages").insert({
        client_id: clientId, author_type: "user", author_id: me.id, author_name: me.name,
        body, attachments: atts, ai_status: aiEnabled ? "queued" : null,
      });
      if (error) throw new Error(error.message);
      files.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      setText(""); setFiles([]);
      await load();
    } catch (e: any) {
      alert(`Не отправилось: ${e.message || e}. Файлы уже в хранилище — нажмите «Отправить» ещё раз.`);
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
            <Loader2 size={14} className="spin" /> {ahead > 0
              ? `Задача в очереди: перед ней ${ahead} ${ahead === 1 ? "задача" : ahead < 5 ? "задачи" : "задач"} по другим клиентам. Монтаж занимает 5–20 мин, правка — 2–5 мин.`
              : "ИИ работает над задачей…"}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="v2-card"
        onDragOver={(e) => { e.preventDefault(); if (!drag) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, outline: drag ? "2px dashed var(--cy)" : "none", outlineOffset: -4 }}>
        {drag && <div style={{ fontSize: 12.5, color: "var(--cy)", display: "flex", gap: 6, alignItems: "center" }}><UploadCloud size={15} /> Отпустите — файлы начнут загружаться</div>}
        {files.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {files.map((p) => (
              <div key={p.id} style={{ width: 172, border: `1px solid ${p.status === "error" ? "rgba(255,92,122,.5)" : "var(--brd)"}`, borderRadius: 12, overflow: "hidden", background: "var(--v2-inset)" }}>
                <div style={{ position: "relative", height: 96, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {p.preview && p.file.type.startsWith("video/") ? <video src={p.preview} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : p.preview ? <img src={p.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <Paperclip size={20} style={{ color: "var(--t3)" }} />}
                  <button onClick={() => { if (p.preview) URL.revokeObjectURL(p.preview); setFiles((f) => f.filter((x) => x.id !== p.id)); }}
                    title="Убрать" style={{ position: "absolute", top: 5, right: 5, width: 22, height: 22, borderRadius: 6, border: 0, background: "rgba(0,0,0,.6)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={12} /></button>
                </div>
                <div style={{ padding: "7px 9px", display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ fontSize: 11.5, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.file.name}>{p.file.name}</div>
                  <div style={{ height: 4, borderRadius: 3, background: "var(--track)", overflow: "hidden" }}>
                    <div style={{ width: `${p.pct}%`, height: "100%", background: p.status === "error" ? "var(--rd)" : p.status === "done" ? "var(--gr)" : "linear-gradient(90deg, var(--cy), var(--pu))", transition: "width .2s" }} />
                  </div>
                  <div style={{ fontSize: 10.5, display: "flex", alignItems: "center", gap: 5, color: p.status === "error" ? "var(--rd)" : p.status === "done" ? "var(--gr)" : "var(--t3)" }}>
                    {p.status === "uploading" && <><Loader2 size={10} className="spin" /> {p.pct}% · {mb(p.file.size)}</>}
                    {p.status === "done" && <><CheckCircle2 size={10} /> загружено · {mb(p.file.size)}</>}
                    {p.status === "error" && <><AlertTriangle size={10} /> {p.err}
                      <button onClick={() => startUpload(p)} style={{ marginLeft: "auto", background: "none", border: 0, color: "var(--cy)", cursor: "pointer", fontSize: 10.5, display: "inline-flex", gap: 3, alignItems: "center" }}><RotateCw size={10} /> ещё раз</button></>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(); }}
          placeholder={aiEnabled ? "Задача для ИИ: например, «смонтируй этот исходник в стиле клиента» (приложите видео аватара). Правка: «на 12-й секунде другой кадр», «обрежь начало до фразы …»" : "Сообщение команде"}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13.5, fontFamily: "inherit", resize: "vertical", outline: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label className="v2-act ghost" style={{ cursor: sending ? "default" : "pointer", height: 34 }}>
            <Paperclip size={14} /> Файлы
            <input type="file" multiple disabled={sending} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
          </label>
          <span style={{ fontSize: 11, color: uploading ? "var(--cy)" : failed ? "var(--rd)" : "var(--t3)" }}>
            {uploading ? `Загружаю файлы: ${files.length - uploading - failed} из ${files.length} готово — дождитесь, потом «Отправить»`
              : failed ? "Файл не загрузился — нажмите «ещё раз» или уберите его"
              : files.length ? `Файлов готово: ${files.length} · Cmd+Enter — отправить` : "Cmd+Enter — отправить · файлы можно перетащить сюда"}
          </span>
          <div style={{ flex: 1 }} />
          <button className="v2-act pri" onClick={send} disabled={sending || !!uploading || !!failed || (!text.trim() && !files.length)} style={{ height: 36 }}>
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
