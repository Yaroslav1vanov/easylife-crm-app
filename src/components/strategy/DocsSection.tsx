"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { notify } from "@/components/NoticeHost";
import { uploadClientFile, fileUrl, when } from "./files";

type Doc = {
  id: number; kind: string; title: string; body: string | null; file_key: string | null;
  version: number; is_current: boolean; note: string | null; author_name: string | null; created_at: string;
};

const TITLE: Record<string, string> = { audit: "Аудит", strategy: "Контент-стратегия", content_plan: "Контент-план", brief: "Бриф" };

/*
 * Документы клиента. mode="file" — готовый файл (аудит), mode="text" — текст, который правят в CRM (стратегия).
 * Любое сохранение не перезаписывает, а добавляет версию: предыдущая уходит в историю.
 */
export default function DocsSection({ clientId, kind, mode, hint }: {
  clientId: number; kind: string; mode: "file" | "text"; hint: string;
}) {
  const supabase = createClient();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase.from("client_documents").select("*")
      .eq("client_id", clientId).eq("kind", kind).order("version", { ascending: false });
    setDocs((data ?? []) as Doc[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [clientId, kind]);

  const current = docs.find((d) => d.is_current) ?? docs[0];
  const shown = viewId ? docs.find((d) => d.id === viewId) ?? current : current;

  async function author() {
    const { data: { user } } = await supabase.auth.getUser();
    return { id: user?.id ?? null, name: user?.email?.split("@")[0] ?? "команда" };
  }

  /** Новая версия: прежняя текущая уходит в историю. */
  async function saveVersion(fields: Partial<Doc>) {
    setBusy(true);
    try {
      const me = await author();
      const nextVersion = (docs[0]?.version ?? 0) + 1;
      if (current) await supabase.from("client_documents").update({ is_current: false }).eq("client_id", clientId).eq("kind", kind);
      const { error } = await supabase.from("client_documents").insert({
        client_id: clientId, kind, version: nextVersion, is_current: true,
        title: fields.title || `${TITLE[kind] ?? "Документ"} · версия ${nextVersion}`,
        body: fields.body ?? null, file_key: fields.file_key ?? null,
        note: note.trim() || null, created_by: me.id, author_name: me.name,
      });
      if (error) throw error;
      setNote(""); setEditing(false); setViewId(null);
      notify(`Сохранено — версия ${nextVersion}`);
      await load();
    } catch (e: any) {
      notify(`Не сохранилось: ${e.message ?? e}`);
    } finally { setBusy(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const key = await uploadClientFile(clientId, kind, file);
      await saveVersion({ title: file.name, file_key: key });
    } catch (err: any) {
      notify(`Файл не загрузился: ${err.message ?? err}`);
      setBusy(false);
    }
  }

  if (loading) return <p style={{ color: "var(--t3)", fontSize: 13 }}>Загружаю…</p>;

  return (
    <div>
      <p style={{ color: "var(--t3)", fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>{hint}</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {mode === "text" && !editing && (
          <button className="v2-act" style={btn(true)} disabled={busy}
            onClick={() => { setDraft(current?.body ?? ""); setEditing(true); }}>
            {current?.body ? "Редактировать" : "Написать стратегию"}
          </button>
        )}
        <button className="v2-act" style={btn(mode === "file")} disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? "Загружаю…" : mode === "file" ? (current ? "Загрузить новую версию" : "Загрузить файл") : "Загрузить файлом"}
        </button>
        <input ref={fileInput} type="file" hidden accept=".html,.htm,.pdf,.md,.txt" onChange={onFile} />
      </div>

      {/* редактор стратегии */}
      {editing && (
        <div className="v2-card" style={{ padding: 14 }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={20}
            placeholder={"Кто клиент и кому продаём\nКакие боли закрываем\nО чём говорим в роликах и в каком порядке\nКодовые слова и воронка\nЧего не делаем"}
            style={{ width: "100%", background: "var(--v2-inset)", color: "var(--t1)", border: "1px solid var(--brd)",
              borderRadius: 10, padding: 12, fontSize: 13.5, lineHeight: 1.55, fontFamily: "inherit", resize: "vertical" }} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Что поменял — коротко, для истории (необязательно)"
            style={{ width: "100%", marginTop: 8, background: "var(--v2-inset)", color: "var(--t1)", border: "1px solid var(--brd)",
              borderRadius: 10, padding: "9px 12px", fontSize: 13 }} />
          <div className="flex gap-2 mt-3">
            <button className="v2-act" style={btn(true)} disabled={busy || !draft.trim()} onClick={() => saveVersion({ body: draft })}>
              {busy ? "Сохраняю…" : "Сохранить версию"}
            </button>
            <button className="v2-act" style={btn(false)} onClick={() => setEditing(false)}>Отмена</button>
          </div>
        </div>
      )}

      {/* текущий документ */}
      {!editing && shown && (
        <div className="v2-card" style={{ padding: 14 }}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <div>
              <div className="tt" style={{ marginBottom: 2 }}>{shown.title}</div>
              <small style={{ color: "var(--t3)", fontSize: 11.5 }}>
                версия {shown.version}{shown.is_current ? " · актуальная" : " · из истории"} · {shown.author_name ?? "—"} · {when(shown.created_at)}
              </small>
            </div>
            {shown.file_key && (
              <a href={fileUrl(shown.file_key)} target="_blank" rel="noreferrer" className="v2-act"
                style={{ ...btn(true), textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Открыть</a>
            )}
          </div>
          {shown.note && <p style={{ fontSize: 12.5, color: "var(--t2)", marginBottom: 8 }}>Что поменялось: {shown.note}</p>}
          {shown.body && (
            <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.6, color: "var(--t1)",
              background: "var(--v2-inset)", borderRadius: 10, padding: 14, maxHeight: 560, overflow: "auto" }}>
              {shown.body}
            </div>
          )}
          {shown.file_key && /\.html?$/i.test(shown.title) && (
            <iframe src={fileUrl(shown.file_key)} title={shown.title} sandbox="allow-same-origin allow-popups"
              style={{ width: "100%", height: 640, border: "1px solid var(--brd)", borderRadius: 10, marginTop: 6, background: "#fff" }} />
          )}
          {shown.file_key && /\.html?$/i.test(shown.title) && (
            <p style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 6 }}>
              Это безопасное превью: анимации и графики в нём не работают. Чтобы увидеть аудит целиком, нажмите «Открыть».
            </p>
          )}
        </div>
      )}

      {!editing && !current && (
        <div className="v2-card" style={{ padding: 22, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>
          {mode === "file" ? "Аудита пока нет. Загрузи готовый файл — HTML или PDF." : "Стратегии пока нет."}
        </div>
      )}

      {/* история версий */}
      {docs.length > 1 && !editing && (
        <div className="v2-sec" style={{ marginTop: 16 }}>
          <div className="v2-sec-h">История <span className="cnt">{docs.length}</span></div>
          {docs.map((d) => (
            <button key={d.id} onClick={() => setViewId(d.id)} className="v2-card"
              style={{ cursor: "pointer", borderColor: shown?.id === d.id ? "var(--cy)" : undefined }}>
              <div className="meta">
                <small style={{ color: d.is_current ? "var(--gr)" : "var(--t3)" }}>в.{d.version}{d.is_current ? " · актуальная" : ""}</small>
                <small>{d.author_name ?? "—"}</small>
                <small>{when(d.created_at)}</small>
                {d.note && <small style={{ color: "var(--t2)" }}>· {d.note}</small>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function btn(primary: boolean): React.CSSProperties {
  return {
    height: 36, padding: "0 16px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    border: primary ? "1px solid var(--cy)" : "1px solid var(--brd)",
    background: primary ? "color-mix(in srgb, var(--cy) 14%, transparent)" : "transparent",
    color: primary ? "var(--cy)" : "var(--t2)",
  };
}
