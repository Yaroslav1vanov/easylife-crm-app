"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";

/* 🎙 Надиктовать: запись с микрофона → текст в поле сообщения (дописывается к уже набранному).
   Нажали — пишем, нажали ещё раз — распознаём. До 10 минут за раз. */
const MAX_SEC = 600;

export default function VoiceInput({ onText, disabled }: { onText: (t: string) => void; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const [sec, setSec] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  async function start() {
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { alert("Нет доступа к микрофону. Разрешите микрофон для сайта CRM в настройках браузера (значок слева от адреса)."); return; }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) || "";
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (tick.current) { clearInterval(tick.current); tick.current = null; }
      const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
      setState("busy");
      try {
        const res = await fetch("/api/voice-to-text?lang=ru", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `ошибка ${res.status}`);
        if (j.text) onText(j.text); else alert("Речь не распознана — попробуйте ещё раз, ближе к микрофону.");
      } catch (e: any) { alert(`Не получилось распознать: ${e.message || e}`); }
      setState("idle");
    };
    rec.current = r;
    r.start(1000);
    setSec(0); setState("rec");
    tick.current = setInterval(() => setSec((s) => { if (s + 1 >= MAX_SEC) rec.current?.stop(); return s + 1; }), 1000);
  }

  const mm = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  if (state === "rec") return (
    <button className="v2-act" onClick={() => rec.current?.stop()} title="Остановить и превратить в текст"
      style={{ height: 34, background: "rgba(255,80,80,.15)", border: "1px solid var(--rd)", color: "var(--rd)" }}>
      <Square size={13} fill="currentColor" /> {mm} · стоп
    </button>
  );
  return (
    <button className="v2-act ghost" onClick={start} disabled={disabled || state === "busy"} style={{ height: 34 }}
      title="Надиктовать голосом — текст появится в поле, его можно поправить перед отправкой">
      {state === "busy" ? <><Loader2 size={14} className="spin" /> Распознаю…</> : <><Mic size={14} /> Голосом</>}
    </button>
  );
}
