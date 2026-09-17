"use client";
import { useEffect, useMemo, useState } from "react";
import { Client } from "@/lib/database";
import Avatar from "@/components/Avatar";
import { DEFAULT_TZ, tzShort, nowInTz, utcToZonedInput, zonedInputToUtc, fmtInTz } from "@/lib/tz";
import { X, Smartphone, Trash2, ArrowUp, ArrowDown, Rocket } from "lucide-react";

/* Серия сторис: клиент → кадры (картинки/видео) → время первого кадра и интервал.
   Каждый кадр = отдельная карточка публикации «Сторис» со своим временем.
   Галочка «сразу запланировать» отправляет все кадры в Metricool после создания. */

export type StoryFrameDraft = { file: File; preview: string; note: string };

export default function StoryBatchModal({ clients, defaultClientId, onClose, onCreate }: {
  clients: Client[];
  defaultClientId?: number | null;
  onClose: () => void;
  onCreate: (clientId: number, frames: { file: File; publishAt: string | null; note: string }[], scheduleNow: boolean) => Promise<void>;
}) {
  const active = useMemo(() => clients.filter(c => c.stage === "active").sort((a, b) => a.name.localeCompare(b.name)), [clients]);
  const [clientId, setClientId] = useState<number | null>(defaultClientId ?? active[0]?.id ?? null);
  const client = active.find(c => c.id === clientId);
  const tz = client?.timezone || DEFAULT_TZ;
  const [frames, setFrames] = useState<StoryFrameDraft[]>([]);
  const [start, setStart] = useState("");
  const [interval, setInterval] = useState(60);
  const [scheduleNow, setScheduleNow] = useState(true);
  const [busy, setBusy] = useState(false);

  // старт по умолчанию — ближайший час у клиента
  useEffect(() => {
    const nextHour = new Date(Date.now() + 60 * 60 * 1000); nextHour.setMinutes(0, 0, 0);
    setStart(utcToZonedInput(nextHour.toISOString(), tz));
  }, [tz]);
  useEffect(() => () => frames.forEach(f => URL.revokeObjectURL(f.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [busy, onClose]);

  const startUtc = start ? zonedInputToUtc(start, tz) : null;
  const timeOf = (i: number) => (startUtc ? new Date(Date.parse(startUtc) + i * interval * 60000).toISOString() : null);
  const past = !!startUtc && Date.parse(startUtc) < Date.now() - 10 * 60000;
  const move = (i: number, d: -1 | 1) => setFrames(a => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b; });

  async function submit() {
    if (!clientId || !frames.length || !startUtc) return;
    setBusy(true);
    try { await onCreate(clientId, frames.map((f, i) => ({ file: f.file, publishAt: timeOf(i), note: f.note })), scheduleNow); }
    finally { setBusy(false); }
  }

  const inp: React.CSSProperties = { width: "100%", padding: "9px 10px", borderRadius: 9, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none", colorScheme: "dark", fontFamily: "inherit" };
  const lbl = (t: string) => <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 6 }}>{t}</div>;

  return (
    <div onClick={() => !busy && onClose()} className="v2" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--v2-brd2)", borderRadius: 18, width: "100%", maxWidth: 760, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(236,72,153,.15)", color: "var(--pk)", display: "flex", alignItems: "center", justifyContent: "center" }}><Smartphone size={18} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 15, fontWeight: 800, color: "var(--t1)" }}>Сторис</div>
            <div style={{ fontSize: 12, color: "var(--t3)" }}>Один кадр или серия — каждый уйдёт в Instagram Stories в своё время</div>
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
          {client?.publisher === "uploadpost" && <div className="v2-chip rd" style={{ marginTop: 8, whiteSpace: "normal" }}>Этот клиент публикуется через Upload-Post — сторис через него пока не отправляются. Карточки создадутся, выкладывать вручную.</div>}
          {client && !client.metricool_blog_id && client.publisher !== "uploadpost" && <div className="v2-chip rd" style={{ marginTop: 8, whiteSpace: "normal" }}>У клиента не задан бренд Metricool — отправить не получится.</div>}
        </div>

        <div>
          {lbl(`Кадры · ${frames.length}`)}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {frames.map((f, i) => {
              const video = f.file.type.startsWith("video/");
              const t = timeOf(i);
              return (
                <div key={f.preview} style={{ width: 128, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ position: "relative", width: "100%", aspectRatio: "9 / 16", borderRadius: 10, overflow: "hidden", border: "1px solid var(--brd)", background: "#000" }}>
                    {video ? <video src={f.preview} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <img src={f.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    <span className="v2-chip mut" style={{ position: "absolute", top: 5, left: 5, padding: "1px 6px" }}>{i + 1}{video ? " · видео" : ""}</span>
                    <button onClick={() => { URL.revokeObjectURL(f.preview); setFrames(a => a.filter((_, k) => k !== i)); }} style={{ position: "absolute", top: 5, right: 5, width: 22, height: 22, borderRadius: 6, background: "rgba(255,92,122,.85)", border: 0, color: "#fff", cursor: "pointer" }}><Trash2 size={12} /></button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="v2-iconbtn" style={{ width: 24, height: 24 }}><ArrowUp size={12} style={{ transform: "rotate(-90deg)" }} /></button>
                    <span style={{ flex: 1, textAlign: "center", fontSize: 10.5, color: "var(--t2)", fontWeight: 700 }}>{t ? fmtInTz(t, tz) : "—"}</span>
                    <button onClick={() => move(i, 1)} disabled={i === frames.length - 1} className="v2-iconbtn" style={{ width: 24, height: 24 }}><ArrowDown size={12} style={{ transform: "rotate(-90deg)" }} /></button>
                  </div>
                  <input value={f.note} onChange={e => setFrames(a => a.map((x, k) => (k === i ? { ...x, note: e.target.value } : x)))} placeholder="заметка" style={{ ...inp, padding: "5px 7px", fontSize: 11 }} />
                </div>
              );
            })}
            <label style={{ width: 128, aspectRatio: "9 / 16", borderRadius: 10, border: "1.5px dashed var(--brd)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--pu)", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "center", padding: 8 }}>
              + Добавить кадры
              <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 500 }}>фото или видео 9:16, можно несколько</span>
              <input type="file" accept="image/*,video/*" multiple onChange={e => { const fs = Array.from(e.target.files || []); setFrames(a => [...a, ...fs.map(file => ({ file, preview: URL.createObjectURL(file), note: "" }))]); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
          </div>
        </div>

        <div className="sb-when">
          <div>
            {lbl(`Первый кадр · ${tzShort(tz)}`)}
            <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} style={inp} />
            <div className="v2-hint" style={{ marginTop: 5 }}>сейчас у клиента {nowInTz(tz)}</div>
            {past && <div className="v2-chip rd" style={{ marginTop: 6 }}>время уже прошло — выберите будущее</div>}
          </div>
          <div>
            {lbl("Интервал между кадрами")}
            <select value={interval} onChange={e => setInterval(Number(e.target.value))} style={inp}>
              {[[1, "1 минута — сразу подряд"], [5, "5 минут"], [15, "15 минут"], [30, "30 минут"], [60, "1 час"], [120, "2 часа"], [180, "3 часа"], [360, "6 часов"], [720, "12 часов"], [1440, "раз в день"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div className="v2-hint" style={{ marginTop: 5 }}>{frames.length > 1 && startUtc ? `последний кадр: ${fmtInTz(timeOf(frames.length - 1), tz)}` : "время каждого кадра потом можно поменять в его карточке"}</div>
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--t1)", cursor: "pointer" }}>
          <input type="checkbox" checked={scheduleNow} onChange={e => setScheduleNow(e.target.checked)} />
          Сразу запланировать в Metricool <span style={{ color: "var(--t3)", fontSize: 12 }}>— иначе карточки лягут в «Готово к публикации»</span>
        </label>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid var(--brd)", paddingTop: 12 }}>
          <button className="v2-act ghost" onClick={onClose} disabled={busy}>Отмена</button>
          <button className="v2-act pri" onClick={submit} disabled={busy || !clientId || !frames.length || !startUtc || past} style={{ height: 40 }}>
            <Rocket size={14} /> {busy ? "Загружаю кадры…" : `Создать ${frames.length || ""} ${frames.length === 1 ? "сторис" : "сторис"}${scheduleNow ? " и запланировать" : ""}`}
          </button>
        </div>
      </div>
      <style>{`.sb-when{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:640px){.sb-when{grid-template-columns:1fr}}`}</style>
    </div>
  );
}
