"use client";
import { useState } from "react";
import { Link2, Copy, RefreshCw } from "lucide-react";

/* Кнопка в «Настройках» карточки: ссылка, по которой клиент сам подключает свои соцсети к бренду Metricool.
   Тимлид копирует её (или сразу с текстом) и отправляет клиенту. */
export default function MetricoolConnectLink({ clientId }: { clientId: number }) {
  const [st, setSt] = useState<{ link: string | null; exp: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");

  async function get(fresh: boolean) {
    setBusy(true); setErr("");
    try {
      let r = await fetch(`/api/clients/${clientId}/metricool-link`, { method: fresh ? "POST" : "GET", cache: "no-store" });
      let j = await r.json();
      if (r.ok && !fresh && !j.link) { r = await fetch(`/api/clients/${clientId}/metricool-link`, { method: "POST" }); j = await r.json(); }
      if (!r.ok || !j.link) setErr(j.error || "Metricool не вернул ссылку");
      else setSt({ link: j.link, exp: j.expiresAt });
    } catch (e: any) { setErr(String(e?.message || e)); }
    setBusy(false);
  }
  const msg = (l: string) => `Здравствуйте! Чтобы мы могли публиковать ролики и собирать статистику, подключите, пожалуйста, ваши соцсети по ссылке: ${l}\nОткройте её, нажмите на нужную соцсеть (Instagram, TikTok, YouTube) и войдите в свой аккаунт. Регистрироваться нигде не нужно. Ссылка действует 3 дня.`;
  const copy = async (t: string, what: string) => { try { await navigator.clipboard.writeText(t); setCopied(what); setTimeout(() => setCopied(""), 1800); } catch {} };

  return (
    <div style={{ marginTop: 10 }}>
      {!st ? (
        <button className="v2-act" disabled={busy} onClick={() => get(false)}>
          <Link2 size={13} /> {busy ? "Получаю ссылку…" : "Ссылка клиенту: подключить соцсети"}
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input readOnly value={st.link || ""} onFocus={e => e.target.select()}
              style={{ flex: "1 1 220px", minWidth: 0, background: "var(--inset)", border: "1px solid var(--brd)", color: "var(--t1)", borderRadius: 9, padding: "7px 10px", fontSize: 13 }} />
            <button className="v2-act" onClick={() => copy(st.link!, "link")}><Copy size={13} /> {copied === "link" ? "Скопировано" : "Ссылку"}</button>
            <button className="v2-act" onClick={() => copy(msg(st.link!), "msg")}><Copy size={13} /> {copied === "msg" ? "Скопировано" : "С текстом для клиента"}</button>
            <button className="v2-act" disabled={busy} onClick={() => get(true)} title="Новая ссылка, старая сразу перестанет работать"><RefreshCw size={13} /> Новая</button>
          </div>
          <div className="v2-hint">Клиент открывает ссылку и сам входит в свои соцсети, аккаунт в Metricool ему не нужен.{st.exp ? ` Действует до ${st.exp.replace("T", " ").slice(0, 16)}.` : " Действует около 3 дней."} После подключения соцсети сами появятся в шапке карточки (при ежедневном обновлении или после повторной привязки бренда).</div>
        </div>
      )}
      {err && <div className="v2-hint" style={{ color: "var(--rd)", marginTop: 6 }}>{err}</div>}
    </div>
  );
}
