"use client";
import { useEffect, useMemo, useState } from "react";
import { Client } from "@/lib/database";
import Avatar from "@/components/Avatar";
import { DEFAULT_TZ, tzShort, nowInTz, utcToZonedInput, zonedInputToUtc, fmtInTz } from "@/lib/tz";
import { X, Film, Trash2, Rocket, Camera, Music2, Play, AtSign, type LucideIcon } from "lucide-react";

/* Готовый ролик без сценария: файл (или прямая ссылка) → клиент → дата и сети → Metricool.
   Каждый ролик становится обычной карточкой публикации, просто без привязки к сценарию. */

const CH: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: "ig", label: "Instagram", Icon: Camera },
  { id: "tt", label: "TikTok", Icon: Music2 },
  { id: "yt", label: "YouTube", Icon: Play },
  { id: "threads", label: "Threads", Icon: AtSign },
];

export type ReadyDraft = { file: File | null; url: string; publishAt: string | null; caption: string };
type Row = { key: string; file: File | null; url: string; preview: string; name: string; when: string; caption: string };

export default function ReadyVideoModal({ clients, defaultClientId, onClose, onCreate }: {
  clients: Client[];
  defaultClientId?: number | null;
  onClose: () => void;
  onCreate: (clientId: number, items: ReadyDraft[], channels: string[], scheduleNow: boolean) => Promise<void>;
}) {
  const active = useMemo(() => clients.filter(c => c.stage === "active").sort((a, b) => a.name.localeCompare(b.name)), [clients]);
  const [clientId, setClientId] = useState<number | null>(defaultClientId ?? active[0]?.id ?? null);
  const client = active.find(c => c.id === clientId);
  const tz = client?.timezone || DEFAULT_TZ;
  const [rows, setRows] = useState<Row[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [scheduleNow, setScheduleNow] = useState(true);
  const [busy, setBusy] = useState(false);

  // сети по умолчанию — те, что стоят у клиента
  useEffect(() => { setChannels((client?.platforms || []).filter(p => CH.some(c => c.id === p))); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => rows.forEach(r => r.preview && URL.revokeObjectURL(r.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [busy, onClose]);

  /* время по умолчанию: первый ролик — завтра в обычное время публикации клиента, дальше по дню на каждый */
  function defaultWhen(i: number) {
    const [hh, mm] = (client?.default_post_time || "12:00").slice(0, 5).split(":").map(Number);
    const d = new Date(); d.setDate(d.getDate() + 1 + i); d.setHours(hh || 12, mm || 0, 0, 0);
    return utcToZonedInput(d.toISOString(), tz);
  }
  const addFiles = (fs: File[]) => setRows(a => [...a, ...fs.map((file, k) => ({
    key: `${Date.now()}-${k}-${file.name}`, file, url: "", preview: URL.createObjectURL(file),
    name: file.name, when: defaultWhen(a.length + k), caption: "",
  }))]);
  const addLink = () => {
    const u = link.trim(); if (!/^https?:\/\//i.test(u)) return;
    setRows(a => [...a, { key: `${Date.now()}-link`, file: null, url: u, preview: "", name: u.split("/").pop() || u, when: defaultWhen(a.length), caption: "" }]);
    setLink("");
  };
  const patch = (i: number, p: Partial<Row>) => setRows(a => a.map((r, k) => (k === i ? { ...r, ...p } : r)));

  const utcOf = (w: string) => (w ? zonedInputToUtc(w, tz) : null);
  const past = rows.some(r => { const u = utcOf(r.when); return !!u && Date.parse(u) < Date.now() - 10 * 60000; });
  const noBrand = !!client && !client.metricool_blog_id && client.publisher !== "uploadpost";
  const canSend = !!clientId && rows.length > 0 && rows.every(r => r.when) && channels.length > 0 && !past;

  async function submit() {
    if (!clientId || !canSend) return;
    setBusy(true);
    try {
      await onCreate(clientId, rows.map(r => ({ file: r.file, url: r.url, publishAt: utcOf(r.when), caption: r.caption.trim() })), channels, scheduleNow);
    } finally { setBusy(false); }
  }

  const inp: React.CSSProperties = { width: "100%", padding: "9px 10px", borderRadius: 9, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none", colorScheme: "dark", fontFamily: "inherit" };
  const lbl = (t: string) => <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 6 }}>{t}</div>;

  return (
    <div onClick={() => !busy && onClose()} className="v2" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--v2-brd2)", borderRadius: 18, width: "100%", maxWidth: 820, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(168,224,99,.15)", color: "var(--gr)", display: "flex", alignItems: "center", justifyContent: "center" }}><Film size={18} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 15, fontWeight: 800, color: "var(--t1)" }}>Готовый ролик</div>
            <div style={{ fontSize: 12, color: "var(--t3)" }}>Без сценария и монтажа — просто загрузить видео и поставить в график</div>
          </div>
          <button className="v2-iconbtn" onClick={onClose} disabled={busy} aria-label="Закрыть"><X size={16} /></button>
        </div>

        <div>
          {lbl("Клиент")}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 120, overflowY: "auto" }}>
            {active.map(c => (
              <button key={c.id} onClick={() => setClientId(c.id)} className={`v2-chip ${clientId === c.id ? "pu" : "mut"}`} style={{ height: 32, padding: "0 10px", cursor: "pointer", gap: 6 }}>
                <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={18} /> {c.name} {c.surname || ""}
              </button>
            ))}
          </div>
          {noBrand && <div className="v2-chip rd" style={{ marginTop: 8, whiteSpace: "normal" }}>У клиента не задан бренд Metricool — карточки создадутся, но отправить не получится.</div>}
        </div>

        <div>
          {lbl("Сети")}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CH.map(c => {
              const on = channels.includes(c.id);
              return (
                <button key={c.id} onClick={() => setChannels(a => (on ? a.filter(x => x !== c.id) : [...a, c.id]))}
                  className={`v2-chip ${on ? "cy" : "mut"}`} style={{ height: 32, padding: "0 10px", cursor: "pointer", gap: 6 }}>
                  <c.Icon size={13} /> {c.label}
                </button>
              );
            })}
          </div>
          {!channels.length && <div className="v2-hint" style={{ marginTop: 5 }}>выбери хотя бы одну сеть</div>}
        </div>

        <div>
          {lbl(`Ролики · ${rows.length}`)}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((r, i) => (
              <div key={r.key} className="rv-row">
                <div style={{ width: 72, aspectRatio: "9 / 16", borderRadius: 9, overflow: "hidden", border: "1px solid var(--brd)", background: "#000", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {r.preview ? <video src={r.preview} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Film size={18} style={{ color: "var(--t3)" }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 11.5, color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <input type="datetime-local" value={r.when} onChange={e => patch(i, { when: e.target.value })} style={{ ...inp, width: 200, padding: "6px 8px", fontSize: 12 }} />
                    <span style={{ fontSize: 11, color: "var(--t3)" }}>{fmtInTz(utcOf(r.when), tz)} · {tzShort(tz)}</span>
                  </div>
                  <textarea value={r.caption} onChange={e => patch(i, { caption: e.target.value })} rows={2} placeholder="Подпись к посту (одна на все сети, потом можно поправить в карточке)"
                    style={{ ...inp, padding: "7px 9px", fontSize: 12, resize: "vertical" }} />
                </div>
                <button onClick={() => { if (r.preview) URL.revokeObjectURL(r.preview); setRows(a => a.filter((_, k) => k !== i)); }}
                  className="v2-iconbtn" style={{ alignSelf: "flex-start" }} aria-label="Убрать"><Trash2 size={14} /></button>
              </div>
            ))}
            <label style={{ padding: 14, borderRadius: 10, border: "1.5px dashed var(--brd)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: "var(--pu)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
              + Добавить видео
              <span style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 500 }}>mp4 9:16, можно несколько файлов сразу</span>
              <input type="file" accept="video/*" multiple onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={link} onChange={e => setLink(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addLink(); }}
                placeholder="…или прямая ссылка на mp4" style={{ ...inp, padding: "7px 9px", fontSize: 12 }} />
              <button className="v2-act ghost" onClick={addLink} disabled={!/^https?:\/\//i.test(link.trim())} style={{ height: 34 }}>Добавить</button>
            </div>
          </div>
          <div className="v2-hint" style={{ marginTop: 6 }}>сейчас у клиента {nowInTz(tz)}{past ? " · есть время в прошлом — поправь" : ""}</div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--t1)", cursor: "pointer" }}>
          <input type="checkbox" checked={scheduleNow} onChange={e => setScheduleNow(e.target.checked)} />
          Сразу запланировать в Metricool <span style={{ color: "var(--t3)", fontSize: 12 }}>— иначе карточки лягут в «Готово к публикации»</span>
        </label>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid var(--brd)", paddingTop: 12 }}>
          <button className="v2-act ghost" onClick={onClose} disabled={busy}>Отмена</button>
          <button className="v2-act pri" onClick={submit} disabled={busy || !canSend} style={{ height: 40 }}>
            <Rocket size={14} /> {busy ? "Загружаю…" : `Создать ${rows.length || ""} ${rows.length === 1 ? "публикацию" : "публикаций"}${scheduleNow ? " и запланировать" : ""}`}
          </button>
        </div>
      </div>
      <style>{`.rv-row{display:flex;gap:10px;align-items:stretch;padding:10px;border:1px solid var(--brd);border-radius:12px;background:var(--inset)}`}</style>
    </div>
  );
}
