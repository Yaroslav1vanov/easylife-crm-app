"use client";
import { useEffect, useRef, useState } from "react";

/* Приёмник закладки «В CRM: транскрибация». Закладка открывает эту страницу с открытого ролика Instagram
   (сотрудник вошёл в свой аккаунт — так скачиваются и ролики 18+ / «чувствительные», которые сервисы без входа
   не отдают), присылает сюда видео, а мы кладём его в хранилище и ставим на распознавание речи — как «Свой файл». */
type Msg = { type: "easylife-reel"; code: string; url: string; author?: string; caption?: string; duration?: number; blob: Blob };
const IG = "https://www.instagram.com";

export default function TranscribeReceive() {
  const [state, setState] = useState<{ step: string; error?: string; id?: number; title?: string }>({ step: "Жду ролик из Instagram…" });
  const got = useRef(false);
  const [hasOpener, setHasOpener] = useState(true);

  useEffect(() => {
    setHasOpener(!!window.opener);
    // сообщаем вкладке Instagram, что готовы принять (повторяем, пока ролик не придёт)
    const ping = setInterval(() => { if (!got.current) window.opener?.postMessage({ type: "easylife-ready" }, IG); }, 700);
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== IG || (e.data as Msg)?.type !== "easylife-reel" || got.current) return;
      got.current = true;
      const m = e.data as Msg;
      const title = [m.author ? `@${m.author}` : "", (m.caption || "").split("\n")[0].slice(0, 80)].filter(Boolean).join(" — ") || m.url;
      try {
        setState({ step: `Загружаю ролик (${Math.round(m.blob.size / 1048576)} МБ)…`, title });
        const sign = await fetch("/api/r2/sign", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "audio", filename: `${m.code}.mp4`, clientId: "x", scriptId: Date.now() }) });
        const sj = await sign.json();
        if (!sign.ok) throw new Error(sj?.error || "не удалось подписать загрузку");
        const put = await fetch(sj.uploadUrl, { method: "PUT", body: m.blob, headers: { "content-type": "video/mp4" } });
        if (!put.ok) throw new Error(`загрузка не удалась (${put.status})`);
        setState({ step: "Ставлю на транскрибацию…", title });
        const r = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "file", url: sj.publicUrl, fileName: `${m.code}.mp4`, title: `${title} · ${m.url}`, language: "auto" }) });
        const j = await r.json();
        if (!r.ok || j?.item?.status === "error") throw new Error(j?.error || j?.item?.error || "не удалось поставить в очередь");
        setState({ step: "Готово: ролик на транскрибации, текст появится через 1–2 минуты.", id: j.item?.id, title });
      } catch (err: any) {
        setState({ step: "Не получилось", error: String(err?.message || err), title });
      }
    };
    window.addEventListener("message", onMsg);
    return () => { clearInterval(ping); window.removeEventListener("message", onMsg); };
  }, []);

  return (
    <div style={{ maxWidth: 560, margin: "60px auto", padding: "0 16px" }}>
      <div className="v2-card" style={{ padding: 22 }}>
        <div style={{ fontSize: 12, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>Транскрибация из Instagram</div>
        {state.title && <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>{state.title}</div>}
        <div style={{ fontSize: 14, marginTop: 12, color: state.error ? "var(--rd)" : state.id ? "var(--gr)" : "var(--t2)" }}>{state.step}</div>
        {state.error && <div style={{ fontSize: 13, color: "var(--rd)", marginTop: 6 }}>{state.error}</div>}
        {!hasOpener && !state.title && (
          <div style={{ fontSize: 13, color: "var(--t3)", marginTop: 12 }}>Эта страница открывается сама из закладки «В CRM: транскрибация», когда вы нажимаете её на ролике в Instagram.</div>
        )}
        {state.id && <a href="/dashboard/transcribe" style={{ display: "inline-block", marginTop: 16, fontWeight: 800, color: "var(--pu)" }}>Открыть «Транскрибацию» →</a>}
      </div>
    </div>
  );
}
