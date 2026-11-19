"use client";
import { useEffect, useState } from "react";
import { notify } from "@/components/NoticeHost";

/* Блок в «Настройках» клиента: личная ссылка на кабинет клиента (/p/<секрет>).
   Клиент видит только свой проект: работу (идеи, сценарии, монтаж), план публикаций и статистику. */
export default function ClientPortalLink({ clientId }: { clientId: number }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const url = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/${token}` : "";

  useEffect(() => {
    fetch(`/api/clients/${clientId}/portal`, { cache: "no-store" }).then(r => r.json())
      .then(j => { if (j.error) { setErr(j.error); setToken(null); } else setToken(j.token || null); })
      .catch(() => setToken(null));
  }, [clientId]);

  async function call(method: "POST" | "DELETE") {
    setBusy(true); setErr("");
    try {
      const j = await (await fetch(`/api/clients/${clientId}/portal`, { method })).json();
      if (j.error) { setErr(j.error); return; }
      setToken(method === "POST" ? j.token : null);
      notify(method === "POST" ? "Ссылка на кабинет готова — скопируй и отправь клиенту" : "Кабинет отключён: старая ссылка больше не открывается", "ok");
    } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); notify("Ссылка скопирована", "ok"); } catch { prompt("Скопируй ссылку:", url); }
  }

  return (
    <div className="v2-fg span2">
      <h4>Кабинет клиента</h4>
      <div className="v2-hint" style={{ marginBottom: 10 }}>
        Личная ссылка для клиента: он видит только свой проект — сценарии и монтаж, план публикаций по дням и статистику по каждому ролику.
        Стратегии, чата, настроек, команды и внутренних пометок там нет. Вход в CRM не нужен.
      </div>
      {token === undefined && <div className="v2-hint">Загрузка…</div>}
      {token === null && !err && (
        <button className="v2-act pri" disabled={busy} onClick={() => call("POST")}>Выдать ссылку на кабинет</button>
      )}
      {token && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()}
            style={{ flex: "1 1 320px", minWidth: 0, height: 36, borderRadius: 10, border: "1px solid var(--brd)", background: "var(--inset)", color: "var(--t1)", padding: "0 10px", fontSize: 13 }} />
          <button className="v2-act pri" onClick={copy}>Скопировать</button>
          <a className="v2-act" href={url} target="_blank" rel="noreferrer">Открыть</a>
          <button className="v2-act" disabled={busy} onClick={() => { if (confirm("Выпустить новую ссылку? Старая перестанет открываться.")) call("POST"); }}>Новая ссылка</button>
          <button className="v2-act" disabled={busy} style={{ color: "var(--rd)" }} onClick={() => { if (confirm("Отключить кабинет? Клиент больше не сможет его открыть.")) call("DELETE"); }}>Отключить</button>
        </div>
      )}
      {err && <div className="v2-hint" style={{ color: "var(--rd)" }}>{err}</div>}
    </div>
  );
}
