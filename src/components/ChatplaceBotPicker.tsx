"use client";
import { useEffect, useRef, useState } from "react";
import { Check, X, ChevronDown, RefreshCw, MessageCircle } from "lucide-react";

type Bot = { id: string; name: string; username: string };
type Last = { day: string; availability: string; followers: number | null; videos: number; reason?: string | null } | null;

/* Привязка карточки клиента к его Instagram в ChatPlace.
   Привязан бот — статистику Instagram (ролики, подписчики, время просмотра) берём из ChatPlace,
   пока там нет данных — как раньше, из Metricool. Публикации это не трогает: они всегда идут через Metricool. */
export default function ChatplaceBotPicker({ clientId, botId, instagram, onPick }: {
  clientId: number; botId: string | null; instagram?: string | null; onPick: (v: string | null) => Promise<void> | void;
}) {
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<Last>(null);
  const [syncing, setSyncing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (!botId) { setLast(null); return; }
    if (!bots) fetch("/api/chatplace/bots", { cache: "no-store" }).then(r => r.json()).then(j => { if (j?.bots) setBots(j.bots); }).catch(() => {});   // чтобы на плашке был ник, а не «привязан»
    fetch(`/api/clients/${clientId}/chatplace`, { cache: "no-store" }).then(r => r.json()).then(j => setLast(j?.last || null)).catch(() => {});
  }, [clientId, botId]);

  async function fetchBots() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/chatplace/bots", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setErr(j?.error || "ошибка"); setBots([]); } else setBots(j.bots || []);
    } catch (e: any) { setErr(String(e)); setBots([]); }
    setBusy(false);
  }
  async function toggle() {
    if (bots) { setOpen(o => !o); return; }
    await fetchBots(); setOpen(true);
  }
  async function sync() {
    setSyncing(true); setErr(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/chatplace`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) setErr(j?.error || "ошибка"); else setLast(j.last || null);
    } catch (e: any) { setErr(String(e)); }
    setSyncing(false);
  }
  async function pick(id: string | null) {
    setOpen(false);
    await onPick(id);
    if (id) {   // сразу пробуем забрать статистику, чтобы было видно, идёт ли она
      setSyncing(true);
      try { const r = await fetch(`/api/clients/${clientId}/chatplace`, { method: "POST" }); const j = await r.json(); setLast(r.ok ? j.last || null : null); if (!r.ok) setErr(j?.error || "ошибка"); } catch {}
      setSyncing(false);
    }
  }

  // подсказка: бот с тем же ником, что Instagram в карточке
  const handle = String(instagram || "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").split(/[/?]/)[0].toLowerCase();
  const sorted = bots ? [...bots].sort((a, b) => Number(b.username.replace(/^@/, "").toLowerCase() === handle) - Number(a.username.replace(/^@/, "").toLowerCase() === handle)) : null;
  const current = bots?.find(b => b.id === botId);

  const st = !botId ? null
    : syncing ? { c: "var(--t3)", t: "Проверяю ChatPlace…" }
    : !last ? { c: "var(--t3)", t: "Данных ещё не забирали. Нажмите «Проверить»" }
    : last.availability === "available" ? { c: "var(--gr)", t: `Статистика идёт · ${last.followers != null ? `${last.followers.toLocaleString("ru")} подписчиков · ` : ""}${last.videos} роликов · ${last.day}` }
    : last.availability === "pending" ? { c: "var(--am, #f5a524)", t: "ChatPlace ещё собирает данные (обычно несколько часов). Пока статистика Instagram из Metricool" }
    : last.availability === "no_permission" ? { c: "var(--rd)", t: "Нет прав на статистику. Клиенту нужно переподключить Instagram в ChatPlace и разрешить доступ к статистике. Пока статистика из Metricool" }
    : { c: "var(--rd)", t: `Статистика недоступна (${last.availability}${last.reason ? `, ${last.reason}` : ""}). Пока статистика из Metricool` };

  const chip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, fontSize: 12, color: "var(--t1)" };
  const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "rgba(var(--cy-rgb),0.12)", border: "1px solid var(--brd)", color: "var(--cy)", fontSize: 12, fontWeight: 700, cursor: "pointer" };

  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t2)" }}>Instagram в ChatPlace:</span>
        {botId ? (
          <span style={{ ...chip, background: "rgba(var(--gr-rgb),0.12)", border: "1px solid rgba(var(--gr-rgb),0.4)" }}>
            <Check size={13} style={{ color: "var(--gr)" }} />
            {current ? current.username || current.name : "привязан"}
            <button onClick={() => pick(null)} title="Отвязать" style={{ background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", display: "inline-flex", padding: 0 }}><X size={13} /></button>
          </span>
        ) : <span style={{ fontSize: 12, color: "var(--t3)" }}>не привязан</span>}

        <div style={{ position: "relative" }}>
          <button onClick={toggle} disabled={busy} style={btn}>
            <MessageCircle size={13} /> {busy ? "Гружу…" : botId ? "Сменить" : "Привязать"} <ChevronDown size={12} />
          </button>
          {open && sorted && (
            <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 200, width: 300, maxHeight: 320, overflowY: "auto", background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 12, padding: 6, boxShadow: "0 -16px 40px rgba(var(--sh-rgb),calc(0.5 * var(--sh-k)))" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px" }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5 }}>Аккаунты ChatPlace ({sorted.length})</span>
                <button onClick={fetchBots} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: "var(--cy)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                  <RefreshCw size={11} className={busy ? "spin" : ""} /> Обновить
                </button>
              </div>
              {!sorted.length && <div style={{ padding: 8, fontSize: 12, color: "var(--t3)" }}>В ChatPlace нет подключённых Instagram-аккаунтов</div>}
              {sorted.map(b => {
                const match = handle && b.username.replace(/^@/, "").toLowerCase() === handle;
                return (
                  <button key={b.id} onClick={() => pick(b.id)}
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, background: b.id === botId ? "rgba(var(--gr-rgb),0.10)" : "transparent", border: "none", cursor: "pointer", color: "var(--t1)" }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{b.username || b.name}{match ? <span style={{ color: "var(--gr)", fontWeight: 700 }}> · совпадает с карточкой</span> : null}</span>
                    <span style={{ fontSize: 11, color: "var(--t3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 270 }}>{b.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {botId && <button onClick={sync} disabled={syncing} style={{ ...btn, background: "transparent" }}><RefreshCw size={12} className={syncing ? "spin" : ""} /> Проверить</button>}
      </div>
      {st && <div style={{ fontSize: 11, color: st.c, lineHeight: 1.4 }}>{st.t}</div>}
      {err && <div style={{ fontSize: 11, color: "var(--rd)" }}>{err}</div>}
      <div className="v2-hint">Отсюда берём статистику Instagram (ролики, подписчики, время просмотра). Публикации всё равно идут через Metricool, там Instagram тоже должен быть подключён.</div>
    </div>
  );
}
