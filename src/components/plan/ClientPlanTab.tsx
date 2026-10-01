"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, Publication } from "@/lib/database";
import ScriptModal from "@/components/ScriptModal";
import { DEFAULT_TZ, tzShort, utcToZonedInput, zonedInputToUtc, fmtInTz } from "@/lib/tz";
import { useIsMobile } from "@/lib/useMedia";
import { ChevronLeft, ChevronRight, Film, Smartphone, Images, Plus, Sparkles, Trash2, ExternalLink, CalendarDays } from "lucide-react";

/* План клиента по дням: когда какой рилс выходит и на каком он этапе, какие сторис стоят рядом.
   Рилсы берутся из сценариев (дата выхода), сторис и ролики без сценария — из «Публикаций».
   Серию сторис можно запланировать заранее, без кадров: потом кадры делает ИИ в чате или загружает команда. */

type Pub = Pick<Publication, "id" | "script_id" | "content_type" | "publish_at" | "pub_status" | "base_text" | "media_urls" | "video_url">;
type Stage = { l: string; c: string; bg: string };

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const GOALS = ["Запись на консультацию", "Запись на услугу", "Прогрев к рилсу", "Отзыв / результат", "Ответы на вопросы", "Другое"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function reelStage(s: Script): Stage {
  if (s.video_status === "published") return { l: "вышел", c: "var(--gr)", bg: "rgba(168,224,99,.13)" };
  if (s.video_status === "ready") return { l: "готов", c: "var(--cy)", bg: "var(--cyd)" };
  if (s.script_status === "approved") return { l: "монтаж", c: "var(--pu)", bg: "var(--pud)" };
  return { l: "сценарий", c: "var(--or)", bg: "rgba(255,174,66,.12)" };
}
const hasFrame = (p: Pub) => !!(p.media_urls && p.media_urls[0]);
function storyStage(items: Pub[]): Stage & { plan: boolean } {
  if (items.every((p) => p.pub_status === "published")) return { l: "вышли", c: "var(--gr)", bg: "rgba(168,224,99,.13)", plan: false };
  if (items.some((p) => !hasFrame(p))) return { l: "план", c: "var(--pk)", bg: "transparent", plan: true };
  if (items.every((p) => p.pub_status === "scheduled" || p.pub_status === "published")) return { l: "в графике", c: "var(--pk)", bg: "rgba(236,72,153,.16)", plan: false };
  return { l: "кадры готовы", c: "var(--pk)", bg: "rgba(236,72,153,.10)", plan: false };
}
const isVideoUrl = (u: string) => /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(u);
const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 9, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, fontFamily: "inherit", outline: "none" };

export default function ClientPlanTab({ client, scripts, monthOptions, canEdit, canEditReadyAt, onChanged, onAskAI }: {
  client: Client; scripts: Script[]; monthOptions: number[]; canEdit: boolean; canEditReadyAt: boolean;
  onChanged: () => void; onAskAI?: (draft: string) => void;
}) {
  const supabase = createClient();
  const isMobile = useIsMobile();
  const tz = client.timezone || DEFAULT_TZ;
  const today = utcToZonedInput(new Date().toISOString(), tz).slice(0, 10);
  const [ym, setYm] = useState(today.slice(0, 7));
  const [pubs, setPubs] = useState<Pub[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<Script | null>(null);
  const [drag, setDrag] = useState<{ kind: "reel"; id: number } | { kind: "story"; day: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [form, setForm] = useState<{ goal: string; note: string; count: number; time: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadPubs() {
    const { data } = await supabase.from("publications")
      .select("id, script_id, content_type, publish_at, pub_status, base_text, media_urls, video_url")
      .eq("client_id", client.id).not("publish_at", "is", null);
    setPubs((data || []) as Pub[]);
  }
  useEffect(() => { loadPubs(); }, [client.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dayOf = (p: Pub) => utcToZonedInput(p.publish_at, tz).slice(0, 10);
  const byDay = useMemo(() => {
    const m: Record<string, { reels: Script[]; stories: Pub[]; extra: Pub[] }> = {};
    const at = (d: string) => (m[d] ||= { reels: [], stories: [], extra: [] });
    for (const s of scripts) if (s.pub_date) at(s.pub_date.slice(0, 10)).reels.push(s);
    for (const p of pubs) {
      if (p.content_type === "story") at(dayOf(p)).stories.push(p);
      else if (p.script_id == null) at(dayOf(p)).extra.push(p);   // ролик без сценария, карусель
    }
    for (const d of Object.values(m)) d.stories.sort((a, b) => (a.publish_at || "").localeCompare(b.publish_at || ""));
    return m;
  }, [scripts, pubs, tz]); // eslint-disable-line react-hooks/exhaustive-deps

  const [y, mo] = ym.split("-").map(Number);
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(y, mo - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= n; d++) out.push(iso(y, mo - 1, d));
    while (out.length % 7) out.push(null);
    return out;
  }, [y, mo]);
  const shift = (k: number) => { const d = new Date(Date.UTC(y, mo - 1 + k, 1)); setYm(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`); setDay(null); };

  const monthDays = cells.filter(Boolean) as string[];
  const sum = useMemo(() => {
    let reels = 0, out = 0, storyDays = 0, empty = 0;
    for (const d of monthDays) {
      const x = byDay[d];
      reels += (x?.reels.length || 0) + (x?.extra.length || 0);
      out += x?.reels.filter((s) => s.video_status === "published").length || 0;
      if (x?.stories.length) storyDays++;
      if (d >= today && !(x && (x.reels.length || x.stories.length || x.extra.length))) empty++;
    }
    return { reels, out, storyDays, empty };
  }, [monthDays, byDay, today]);

  const undated = useMemo(() => scripts.filter((s) => !s.pub_date && s.video_status !== "published").slice(0, 40), [scripts]);
  const title = (s: Script) => (s.hook_text || s.hook || "без заголовка").replace(/\s+/g, " ");

  async function moveReel(id: number, to: string | null) {
    const r = await db.updateScript(supabase, id, { pub_date: to } as Partial<Script>);
    if (!r?.error) onChanged();
  }
  async function moveStories(from: string, to: string) {
    const items = byDay[from]?.stories || [];
    if (!items.length || items.some((p) => p.pub_status === "scheduled" || p.pub_status === "published")) return;
    const delta = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
    for (const p of items) await db.updatePublication(supabase, p.id, { publish_at: new Date(Date.parse(p.publish_at!) + delta).toISOString() } as Partial<Publication>);
    loadPubs();
  }
  function drop(to: string) {
    setOver(null);
    if (!drag || !canEdit) return;
    if (drag.kind === "reel") moveReel(drag.id, to);
    else if (drag.day !== to) moveStories(drag.day, to);
    setDrag(null);
  }
  async function planStories() {
    if (!day || !form) return;
    setBusy(true);
    const at = zonedInputToUtc(`${day}T${form.time || "18:00"}`, tz);
    const note = `${form.goal}${form.note.trim() ? `: ${form.note.trim()}` : ""} · план, ${form.count} ${form.count === 1 ? "кадр" : form.count < 5 ? "кадра" : "кадров"}`;
    const { error } = await supabase.from("publications").insert({
      script_id: null, client_id: client.id, content_type: "story", media_urls: [], publish_at: at,
      target_channels: ["ig"], base_text: note, pub_status: "adapting",
    });
    setBusy(false);
    if (error) { alert("Не сохранилось: " + error.message); return; }
    setForm(null); loadPubs();
  }
  async function removePlan(p: Pub) {
    if (hasFrame(p) || !confirm("Убрать эту серию из плана?")) return;
    await supabase.from("publications").delete().eq("id", p.id);
    loadPubs();
  }
  const askAI = (d: string, p?: Pub) => onAskAI?.(
    `Сделай серию сторис на ${d.slice(8, 10)}.${d.slice(5, 7)}${p?.base_text ? `. Задача: ${p.base_text.replace(/ · план.*$/, "")}` : ""}. ` +
    `Посмотри контент-план и статистику: какие рилсы выходят рядом и что лучше заходит, и привяжи серию к ним. `);

  const ReelChip = ({ s }: { s: Script }) => {
    const st = reelStage(s);
    const lock = s.video_status === "published";
    return (
      <div draggable={canEdit && !lock} onDragStart={(e) => { setDrag({ kind: "reel", id: s.id }); e.dataTransfer.setData("text/plain", String(s.id)); }} onDragEnd={() => setDrag(null)}
        onClick={(e) => { e.stopPropagation(); setEditing(s); }} title={`${st.l} · ${title(s)}`}
        style={{ display: "flex", gap: 5, alignItems: "center", padding: "3px 6px", borderRadius: 7, background: st.bg, borderLeft: `3px solid ${st.c}`, cursor: "pointer", minWidth: 0 }}>
        <Film size={10} style={{ color: st.c, flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{title(s)}</span>
        <span style={{ fontSize: 8.5, fontWeight: 800, color: st.c, flexShrink: 0 }}>{st.l}</span>
      </div>
    );
  };
  const StoryChip = ({ d, items }: { d: string; items: Pub[] }) => {
    const st = storyStage(items);
    const lock = items.some((p) => p.pub_status === "scheduled" || p.pub_status === "published");
    const planned = items.filter((p) => !hasFrame(p)).length;
    return (
      <div draggable={canEdit && !lock} onDragStart={(e) => { setDrag({ kind: "story", day: d }); e.dataTransfer.setData("text/plain", d); }} onDragEnd={() => setDrag(null)}
        title={items.map((p) => p.base_text).filter(Boolean).join(" · ") || "Сторис"}
        style={{ display: "flex", gap: 5, alignItems: "center", padding: "3px 6px", borderRadius: 7, background: st.bg, border: st.plan ? "1px dashed var(--pk)" : "1px solid transparent", cursor: "pointer", minWidth: 0 }}>
        <Smartphone size={10} style={{ color: st.c, flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          Сторис{items.length - planned > 0 ? ` ×${items.length - planned}` : ""}{planned ? ` · ${(items.find((p) => !hasFrame(p))?.base_text || "").split(" · ")[0].slice(0, 26)}` : ""}
        </span>
        <span style={{ fontSize: 8.5, fontWeight: 800, color: st.c, flexShrink: 0 }}>{st.l}</span>
      </div>
    );
  };
  const ExtraChip = ({ p }: { p: Pub }) => (
    <div title={p.base_text || ""} style={{ display: "flex", gap: 5, alignItems: "center", padding: "3px 6px", borderRadius: 7, background: "var(--v2-inset)", borderLeft: `3px solid ${p.pub_status === "published" ? "var(--gr)" : "var(--cy)"}`, minWidth: 0 }}>
      {p.content_type === "carousel" ? <Images size={10} style={{ color: "var(--or)", flexShrink: 0 }} /> : <Film size={10} style={{ color: "var(--cy)", flexShrink: 0 }} />}
      <span style={{ fontSize: 10.5, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.content_type === "carousel" ? "Карусель" : "Ролик без сценария"}{p.base_text ? ` · ${p.base_text.slice(0, 30)}` : ""}</span>
    </div>
  );

  const sel = day ? byDay[day] : null;
  const dayLabel = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS_GEN[Number(d.slice(5, 7)) - 1]}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="v2-card" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="v2-iconbtn" onClick={() => shift(-1)} aria-label="Предыдущий месяц"><ChevronLeft size={16} /></button>
        <b style={{ fontSize: 15, minWidth: 130, textAlign: "center" }}>{MONTHS[mo - 1]} {y}</b>
        <button className="v2-iconbtn" onClick={() => shift(1)} aria-label="Следующий месяц"><ChevronRight size={16} /></button>
        {ym !== today.slice(0, 7) && <button className="v2-act ghost" style={{ height: 30 }} onClick={() => { setYm(today.slice(0, 7)); setDay(today); }}>Сегодня</button>}
        <div style={{ flex: 1 }} />
        <span className="v2-chip pu"><Film size={11} /> рилсов {sum.reels} · вышло {sum.out}</span>
        <span className="v2-chip" style={{ background: "rgba(236,72,153,.12)", color: "var(--pk)" }}><Smartphone size={11} /> дней со сторис {sum.storyDays}</span>
        {sum.empty > 0 && <span className="v2-chip or">пустых дней впереди {sum.empty}</span>}
      </div>

      <div className="v2-card" style={{ padding: 10, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, color: "var(--t3)", alignItems: "center" }}>
        <span>Рилс:</span>
        {[["сценарий", "var(--or)"], ["монтаж", "var(--pu)"], ["готов", "var(--cy)"], ["вышел", "var(--gr)"]].map(([l, c]) => <span key={l} style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><i style={{ width: 9, height: 9, borderRadius: 2, background: c, display: "inline-block" }} />{l}</span>)}
        <span style={{ marginLeft: 8 }}>Сторис:</span>
        <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><i style={{ width: 9, height: 9, borderRadius: 2, border: "1px dashed var(--pk)", display: "inline-block" }} />план без кадров</span>
        <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><i style={{ width: 9, height: 9, borderRadius: 2, background: "var(--pk)", display: "inline-block" }} />кадры готовы</span>
        <div style={{ flex: 1 }} />
        <span>{canEdit ? "перетащите, чтобы перенести на другой день · " : ""}время клиента, {tzShort(tz)}</span>
      </div>

      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {monthDays.map((d) => {
            const x = byDay[d]; const has = x && (x.reels.length || x.stories.length || x.extra.length);
            return (
              <div key={d} onClick={() => setDay(d)} className="v2-card" style={{ padding: "8px 10px", display: "flex", gap: 10, border: d === day ? "1px solid var(--cy)" : undefined, opacity: d < today && !has ? 0.45 : 1 }}>
                <div style={{ width: 34, textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: d === today ? "var(--cy)" : "var(--t1)" }}>{Number(d.slice(8))}</div>
                  <div style={{ fontSize: 9.5, color: "var(--t3)" }}>{WD[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7]}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" }}>
                  {x?.reels.map((s) => <ReelChip key={s.id} s={s} />)}
                  {x?.extra.map((p) => <ExtraChip key={p.id} p={p} />)}
                  {x?.stories.length ? <StoryChip d={d} items={x.stories} /> : null}
                  {!has && <span style={{ fontSize: 11, color: "var(--t3)" }}>{d >= today ? "пусто" : "—"}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="v2-card" style={{ padding: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
            {WD.map((w) => <div key={w} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--t3)", textAlign: "center", padding: "2px 0" }}>{w}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const x = byDay[d]; const has = x && (x.reels.length || x.stories.length || x.extra.length);
              const past = d < today;
              return (
                <div key={d} onClick={() => { setDay(d); setForm(null); }}
                  onDragOver={(e) => { if (drag && canEdit) { e.preventDefault(); setOver(d); } }} onDragLeave={() => setOver((o) => (o === d ? null : o))} onDrop={(e) => { e.preventDefault(); drop(d); }}
                  style={{ minHeight: 104, borderRadius: 10, padding: 6, display: "flex", flexDirection: "column", gap: 4, cursor: "pointer", minWidth: 0,
                    background: over === d ? "var(--cyd)" : d === day ? "rgba(66,212,244,.06)" : "var(--v2-inset)",
                    border: `1px solid ${d === day || over === d ? "var(--cy)" : d === today ? "var(--pu)" : "var(--brd)"}`,
                    opacity: past && !has ? 0.4 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: d === today ? "var(--pu)" : "var(--t2)" }}>{Number(d.slice(8))}</span>
                    {d === today && <span style={{ fontSize: 9, color: "var(--pu)", marginLeft: 5 }}>сегодня</span>}
                    <div style={{ flex: 1 }} />
                    {!past && !has && <span style={{ fontSize: 9, color: "var(--or)" }}>пусто</span>}
                  </div>
                  {x?.reels.map((s) => <ReelChip key={s.id} s={s} />)}
                  {x?.extra.map((p) => <ExtraChip key={p.id} p={p} />)}
                  {x?.stories.length ? <StoryChip d={d} items={x.stories} /> : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {day && (
        <div className="v2-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <CalendarDays size={15} /><b style={{ fontSize: 14 }}>{dayLabel(day)}, {WD[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7].toLowerCase()}</b>
            <div style={{ flex: 1 }} />
            {canEdit && !form && <button className="v2-act ghost" style={{ height: 32 }} onClick={() => setForm({ goal: GOALS[0], note: "", count: 5, time: "18:00" })}><Plus size={13} /> Запланировать сторис</button>}
            {onAskAI && <button className="v2-act pri" style={{ height: 32 }} onClick={() => askAI(day)}><Sparkles size={13} /> Сторис на этот день — с ИИ</button>}
          </div>

          {form && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", padding: 10, borderRadius: 10, border: "1px dashed var(--pk)" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--t3)" }}>Цель серии
                <select value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} style={inp}>{GOALS.map((g) => <option key={g}>{g}</option>)}</select></label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--t3)", flex: 1, minWidth: 200 }}>О чём (необязательно)
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="например: под рилс про ВНЖ, с отзывом клиента" style={inp} /></label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--t3)" }}>Кадров
                <input type="number" min={1} max={10} value={form.count} onChange={(e) => setForm({ ...form, count: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} style={{ ...inp, width: 70 }} /></label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--t3)" }}>Время
                <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} style={{ ...inp, colorScheme: "dark" }} /></label>
              <button className="v2-act pri" disabled={busy} onClick={planStories} style={{ height: 36 }}>{busy ? "Сохраняю…" : "В план"}</button>
              <button className="v2-act ghost" onClick={() => setForm(null)} style={{ height: 36 }}>Отмена</button>
            </div>
          )}

          {!(sel && (sel.reels.length || sel.stories.length || sel.extra.length)) && !form && <div style={{ fontSize: 13, color: "var(--t3)" }}>На этот день ничего не стоит.</div>}

          {sel?.reels.map((s) => { const st = reelStage(s); return (
            <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 10, background: "var(--v2-inset)", borderLeft: `3px solid ${st.c}` }}>
              <Film size={14} style={{ color: st.c, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.order_num ? `#${s.order_num} · ` : ""}{title(s)}</div>
                <div style={{ fontSize: 11, color: "var(--t3)" }}>рилс · М{s.month_number} · {st.l}{s.video_url ? " · ролик загружен" : ""}</div>
              </div>
              {canEdit && s.video_status !== "published" && <button className="v2-act ghost" style={{ height: 30, fontSize: 12 }} onClick={() => moveReel(s.id, null)}>Снять с даты</button>}
              <button className="v2-act ghost" style={{ height: 30, fontSize: 12 }} onClick={() => setEditing(s)}>Открыть</button>
            </div>
          ); })}
          {sel?.extra.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 10, background: "var(--v2-inset)" }}>
              {p.content_type === "carousel" ? <Images size={14} style={{ color: "var(--or)" }} /> : <Film size={14} style={{ color: "var(--cy)" }} />}
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.content_type === "carousel" ? "Карусель" : "Ролик без сценария"} · {fmtInTz(p.publish_at, tz)}{p.base_text ? ` · ${p.base_text.slice(0, 80)}` : ""}</div>
            </div>
          ))}
          {sel && sel.stories.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: "var(--t3)", display: "flex", alignItems: "center", gap: 6 }}><Smartphone size={13} style={{ color: "var(--pk)" }} /> Сторис этого дня
                <a href="/dashboard/publications" className="v2-act ghost" style={{ height: 26, fontSize: 11, marginLeft: "auto", textDecoration: "none" }}><ExternalLink size={11} /> в «Публикациях»</a></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {sel.stories.map((p) => { const u = (p.media_urls || [])[0]; return (
                  <div key={p.id} style={{ width: u ? 92 : 240, display: "flex", flexDirection: "column", gap: 4 }}>
                    {u ? (isVideoUrl(u) ? <video src={`${u}#t=0.1`} muted playsInline preload="metadata" style={{ width: 92, height: 164, objectFit: "cover", borderRadius: 9, background: "#000" }} />
                      : <img src={u} alt="" style={{ width: 92, height: 164, objectFit: "cover", borderRadius: 9 }} />)
                      : <div style={{ padding: 10, borderRadius: 10, border: "1px dashed var(--pk)", fontSize: 12.5, lineHeight: 1.45 }}>
                          {p.base_text || "Сторис в плане"}
                          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                            {onAskAI && <button className="v2-act pri" style={{ height: 28, fontSize: 11.5 }} onClick={() => askAI(day, p)}><Sparkles size={11} /> Сделать с ИИ</button>}
                            {canEdit && <button className="v2-act ghost" style={{ height: 28, fontSize: 11.5 }} onClick={() => removePlan(p)}><Trash2 size={11} /> Убрать</button>}
                          </div>
                        </div>}
                    <span style={{ fontSize: 10, color: "var(--t3)" }}>{fmtInTz(p.publish_at, tz)}{u ? ` · ${p.pub_status === "published" ? "вышла" : p.pub_status === "scheduled" ? "в графике" : "в очереди"}` : ""}</span>
                  </div>
                ); })}
              </div>
            </div>
          )}
        </div>
      )}

      {undated.length > 0 && (
        <div className="v2-card" style={{ padding: 12 }}
          onDragOver={(e) => { if (drag?.kind === "reel" && canEdit) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (drag?.kind === "reel" && canEdit) moveReel(drag.id, null); setDrag(null); }}>
          <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 8 }}>Рилсы без даты выхода ({undated.length}){canEdit ? " — перетащите на день в календаре" : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 6 }}>
            {undated.map((s) => <ReelChip key={s.id} s={s} />)}
          </div>
        </div>
      )}

      {editing && (
        <ScriptModal script={editing} client={client}
          onClose={() => { setEditing(null); onChanged(); }}
          onUpdate={async (id, patch) => { const r = await db.updateScript(supabase, id, patch); if (!r?.error) setEditing((e) => (e && e.id === id ? { ...e, ...patch } : e)); }}
          canEdit={canEdit} canEditReadyAt={canEditReadyAt} monthOptions={monthOptions} />
      )}
    </div>
  );
}
