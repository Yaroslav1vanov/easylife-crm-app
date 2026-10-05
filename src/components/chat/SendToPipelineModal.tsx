"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script } from "@/lib/database";
import { DEFAULT_TZ, tzShort, nowInTz, utcToZonedInput, zonedInputToUtc } from "@/lib/tz";
import { fileUrl } from "@/components/strategy/files";
import { X, Film, Clapperboard, Smartphone, Loader2, CheckCircle2 } from "lucide-react";

/* Из чата ИИ — сразу в работу: ролик прикрепляется к сценарию или уходит в «Публикации»,
   кадры — серией в сторис. Файл перекладывается внутри хранилища, скачивать его не нужно. */

export type PipeAtt = { key: string; name: string };

async function promote(clientId: number, key: string, label: string): Promise<string> {
  const r = await fetch("/api/client-files/promote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId, key, label }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.publicUrl) throw new Error(j?.error || "не удалось переложить файл");
  return j.publicUrl as string;
}

const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 9, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, fontFamily: "inherit", outline: "none" };

export default function SendToPipelineModal({ clientId, video, images, onClose }: {
  clientId: number; video?: PipeAtt | null; images?: PipeAtt[]; onClose: () => void;
}) {
  const supabase = createClient();
  const isStory = !video && !!images?.length;
  const [client, setClient] = useState<Client | null>(null);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [mode, setMode] = useState<"script" | "ready">("script");
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [markReady, setMarkReady] = useState(true);
  const [when, setWhen] = useState("");
  const [caption, setCaption] = useState("");
  const [step, setStep] = useState(30);
  const [picked, setPicked] = useState<string[]>((images || []).map((i) => i.key));
  const [plans, setPlans] = useState<{ id: number; publish_at: string | null; base_text: string | null }[]>([]); // серии из «Плана» без кадров
  const [planId, setPlanId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  const tz = client?.timezone || DEFAULT_TZ;

  useEffect(() => {
    (async () => {
      const c = await db.getClient(supabase, clientId);
      setClient(c);
      const zone = c?.timezone || DEFAULT_TZ;
      setWhen(utcToZonedInput(new Date(Date.now() + 3600000).toISOString(), zone));
      if (isStory) {
        const { data } = await supabase.from("publications").select("id, publish_at, base_text, media_urls")
          .eq("client_id", clientId).eq("content_type", "story").neq("pub_status", "published").order("publish_at");
        setPlans(((data || []) as any[]).filter((p) => !(p.media_urls && p.media_urls[0])));
      }
      if (!isStory) {
        const { data } = await supabase.from("scripts").select("*").eq("client_id", clientId)
          .neq("video_status", "published").order("month_number", { ascending: false }).order("order_num");
        const rows = ((data || []) as Script[]).filter((s) => s.script_status === "approved" || s.video_status !== "notStarted");
        setScripts(rows);
        const first = rows.find((s) => !s.video_url) || rows[0];
        if (first) setScriptId(first.id); else setMode("ready");
      }
    })();
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = useMemo(() => scripts.find((s) => s.id === scriptId) || null, [scripts, scriptId]);
  const title = (s: Script) => (s.hook_text || s.hook || "без названия").replace(/\s+/g, " ").slice(0, 70);

  async function go() {
    setErr(""); setBusy(true);
    try {
      if (isStory) {
        const utc0 = when ? zonedInputToUtc(when, tz) : null;
        const keys = (images || []).filter((i) => picked.includes(i.key));
        if (!keys.length) throw new Error("выберите хотя бы один кадр");
        const frames = [];
        for (let i = 0; i < keys.length; i++) {
          const url = await promote(clientId, keys[i].key, `story${Date.now()}-${i}`);
          frames.push({ media_url: url, publish_at: utc0 ? new Date(Date.parse(utc0) + i * step * 60000).toISOString() : null, note: caption || null });
        }
        // серия была запланирована заранее — первый кадр встаёт в её карточку, остальные рядом
        const plan = plans.find((p) => p.id === planId);
        if (plan) {
          const f0 = frames.shift()!;
          const { error: e0 } = await db.updatePublication(supabase, plan.id, { media_urls: [f0.media_url], publish_at: f0.publish_at, pub_status: "queued", base_text: caption || (plan.base_text || "").replace(/ · план.*$/, "") || null } as any);
          if (e0) throw new Error(e0.message);
          for (const f of frames) f.note = f.note || (plan.base_text || "").replace(/ · план.*$/, "") || null;
        }
        const { error } = frames.length ? await db.createStoryPublications(supabase, clientId, frames) : { error: null as any };
        if (error) throw new Error(error.message);
        if (plan) frames.unshift({ media_url: "", publish_at: null, note: null });
        setDone(`Сторис в «Публикациях»: ${frames.length} ${frames.length === 1 ? "кадр" : "кадров"}, колонка «В очереди». Проверьте и отправьте в Metricool.`);
      } else if (video && mode === "script") {
        if (!sel) throw new Error("выберите сценарий");
        const url = await promote(clientId, video.key, String(sel.id));
        const patch: Partial<Script> = markReady ? { video_url: url, video_status: "ready" } : { video_url: url };
        const res = await db.updateScript(supabase, sel.id, patch);
        if (res?.error) throw new Error(res.error.message || "сценарий не сохранился");
        if (markReady) { try { await db.ensurePublicationForScript(supabase, { ...sel, ...patch } as Script, client || undefined); } catch {} }
        setDone(markReady ? "Ролик прикреплён к сценарию и переведён в «Готово к публикации». Он уже в «Публикациях»." : "Ролик прикреплён к сценарию — он в «Монтаже», в карточке сценария.");
      } else if (video) {
        const utc = when ? zonedInputToUtc(when, tz) : null;
        const url = await promote(clientId, video.key, `ready${Date.now()}`);
        const { error } = await db.createReadyPublications(supabase, clientId, [{ video_url: url, publish_at: utc, caption: caption || null }], client?.platforms || []);
        if (error) throw new Error(error.message);
        setDone("Ролик в «Публикациях», колонка «В очереди». Добавьте обложку и отправьте в Metricool.");
      }
    } catch (e: any) { setErr(e?.message || "ошибка"); }
    setBusy(false);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="v2-card" style={{ width: "min(560px, 100%)", maxHeight: "88vh", overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isStory ? <Smartphone size={17} /> : <Film size={17} />}
          <b style={{ fontSize: 15 }}>{isStory ? "Кадры — в сторис" : "Ролик — в работу"}</b>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "none", border: 0, color: "var(--t3)", cursor: "pointer" }}><X size={16} /></button>
        </div>

        {done ? (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "var(--gr)", fontSize: 13.5, lineHeight: 1.5 }}><CheckCircle2 size={16} style={{ marginTop: 2, flexShrink: 0 }} /> {done}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <a className="v2-act ghost" href="/dashboard/publications" style={{ height: 34, textDecoration: "none" }}>Открыть «Публикации»</a>
              <button className="v2-act pri" onClick={onClose} style={{ height: 34 }}>Готово</button>
            </div>
          </>
        ) : isStory ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(images || []).map((i, n) => {
                const on = picked.includes(i.key);
                return (
                  <button key={i.key} onClick={() => setPicked((p) => (on ? p.filter((k) => k !== i.key) : [...p, i.key]))}
                    style={{ padding: 0, border: `2px solid ${on ? "var(--cy)" : "var(--brd)"}`, borderRadius: 10, overflow: "hidden", background: "#000", cursor: "pointer", opacity: on ? 1 : 0.45, position: "relative" }}>
                    <img src={fileUrl(i.key)} alt={i.name} style={{ width: 84, height: 149, objectFit: "cover", display: "block" }} />
                    <span style={{ position: "absolute", top: 4, left: 4, fontSize: 10.5, background: "rgba(0,0,0,.65)", color: "#fff", borderRadius: 5, padding: "1px 5px" }}>{n + 1}</span>
                  </button>
                );
              })}
            </div>
            <div className="v2-hint">Кадры выйдут по порядку. Нажмите на кадр, чтобы убрать его из серии. Шаг — не меньше 5 минут, иначе Metricool может перемешать кадры.</div>
            {plans.length > 0 && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--t3)" }}>Серия из плана
                <select value={planId ?? ""} style={inp} onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null; setPlanId(id);
                  const p = plans.find((x) => x.id === id); if (p?.publish_at) setWhen(utcToZonedInput(p.publish_at, tz));
                }}>
                  <option value="">не привязывать — новая серия</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.publish_at ? utcToZonedInput(p.publish_at, tz).slice(5, 10).split("-").reverse().join(".") : "без даты"} · {(p.base_text || "Сторис").slice(0, 60)}</option>)}
                </select></label>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--t3)" }}>Первый кадр · {tzShort(tz)}
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ ...inp, colorScheme: "dark" }} /></label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--t3)" }}>Между кадрами, мин
                <input type="number" min={5} value={step} onChange={(e) => setStep(Math.max(5, Number(e.target.value) || 5))} style={{ ...inp, width: 110 }} /></label>
            </div>
            <div className="v2-hint">сейчас {tzShort(tz)}: {nowInTz(tz)}</div>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Заметка для команды: цель серии, какую наклейку добавить вручную" style={inp} />
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6 }}>
              <button className={`v2-act ${mode === "script" ? "pri" : "ghost"}`} onClick={() => setMode("script")} style={{ height: 34 }}><Clapperboard size={14} /> К сценарию</button>
              <button className={`v2-act ${mode === "ready" ? "pri" : "ghost"}`} onClick={() => setMode("ready")} style={{ height: 34 }}><Film size={14} /> В публикации без сценария</button>
            </div>
            {mode === "script" ? (
              scripts.length ? (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
                    {scripts.map((s) => (
                      <button key={s.id} onClick={() => setScriptId(s.id)}
                        style={{ textAlign: "left", padding: "9px 11px", borderRadius: 10, cursor: "pointer", background: s.id === scriptId ? "rgba(66,212,244,.10)" : "var(--v2-inset)", border: `1px solid ${s.id === scriptId ? "var(--cy)" : "var(--brd)"}`, color: "var(--t1)", fontFamily: "inherit" }}>
                        <div style={{ fontSize: 13 }}>{s.order_num ? `#${s.order_num} · ` : ""}{title(s)}</div>
                        <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>
                          М{s.month_number}{s.pub_date ? ` · выход ${s.pub_date.slice(8, 10)}.${s.pub_date.slice(5, 7)}` : " · даты нет"}
                          {s.video_url ? " · ролик уже есть — заменится" : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={markReady} onChange={(e) => setMarkReady(e.target.checked)} /> Сразу перевести в «Готово к публикации»
                  </label>
                  {markReady && <div className="v2-hint">Сегодня проставится как дата сдачи монтажа, ролик появится в «Публикациях».</div>}
                </>
              ) : <div style={{ fontSize: 13, color: "var(--t3)" }}>У клиента нет утверждённых сценариев без опубликованного ролика. Отправьте ролик в публикации без сценария.</div>
            ) : (
              <>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--t3)" }}>Когда публикуем · {tzShort(tz)}
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ ...inp, colorScheme: "dark", width: 230 }} /></label>
                <div className="v2-hint">сейчас {tzShort(tz)}: {nowInTz(tz)}</div>
                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} placeholder="Описание к ролику (можно добавить позже в «Публикациях»)" style={{ ...inp, resize: "vertical" }} />
              </>
            )}
          </>
        )}

        {err && <div style={{ fontSize: 12.5, color: "var(--rd)" }}>Не получилось: {err}</div>}
        {!done && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="v2-act ghost" onClick={onClose} style={{ height: 36 }}>Отмена</button>
            <button className="v2-act pri" onClick={go} disabled={busy || (!isStory && mode === "script" && !sel)} style={{ height: 36 }}>
              {busy ? <Loader2 size={14} className="spin" /> : null} {busy ? "Переношу…" : isStory ? "Поставить в сторис" : mode === "script" ? "Прикрепить" : "В публикации"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
