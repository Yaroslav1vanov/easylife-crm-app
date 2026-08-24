"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { ClientMonth, Script } from "@/lib/database";
import { X, Wand2, Trash2, CalendarDays, Eraser, Plus } from "lucide-react";

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const RU_M = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const wdOf = (s: string) => (new Date(s + "T00:00:00").getDay() + 6) % 7;   // 0 = Пн

/** Равномерно раскидывает count публикаций по разрешённым дням диапазона. */
export function spreadDates(start: string, end: string, count: number, weekdays: boolean[]): string[] {
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (weekdays[wdOf(d)]) days.push(d);
  if (!days.length || count <= 0) return [];
  const out: string[] = [];
  if (count <= days.length) {
    // равномерный шаг, чтобы ролики не слипались в начале месяца
    const step = days.length / count;
    for (let i = 0; i < count; i++) out.push(days[Math.min(days.length - 1, Math.floor(i * step))]);
  } else {
    for (let i = 0; i < count; i++) out.push(days[i % days.length]);   // больше роликов, чем дней → по несколько в день
  }
  return out.sort();
}

type Props = {
  clientId: number;
  month: ClientMonth;
  scripts: Script[];          // сценарии ЭТОГО контрактного месяца
  onClose: () => void;
  onChange: () => Promise<void> | void;
};

export default function PublicationScheduler({ clientId, month, scripts, onClose, onChange }: Props) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(String(month.package || scripts.length || 20));
  const [weekdays, setWeekdays] = useState<boolean[]>([true, true, true, true, true, true, true]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const withDate = scripts.filter(s => s.pub_date);
  const noDate = scripts.filter(s => !s.pub_date);
  const isEmptySlot = (s: Script) =>
    !((s.hook_text || "").trim() || (s.body_text || "").trim() || (s.hook || "").trim().replace(/^Сценарий #\d+$/, ""));

  // Календарная сетка: недели, покрывающие контрактный месяц целиком
  const weeks = useMemo(() => {
    const first = addDays(month.start_date, -wdOf(month.start_date));
    const last = addDays(month.end_date, 6 - wdOf(month.end_date));
    const cells: string[] = [];
    for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
    const out: string[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [month.start_date, month.end_date]);

  const byDate = useMemo(() => {
    const m: Record<string, Script[]> = {};
    for (const s of scripts) if (s.pub_date) (m[s.pub_date] ||= []).push(s);
    return m;
  }, [scripts]);

  const inRange = (d: string) => d >= month.start_date && d <= month.end_date;

  async function distribute() {
    const n = parseInt(count, 10);
    if (!n || n < 1) { alert("Укажи, сколько роликов расставить"); return; }
    const dates = spreadDates(month.start_date, month.end_date, n, weekdays);
    if (!dates.length) { alert("В выбранные дни недели не попал ни один день месяца"); return; }
    if (withDate.length && !confirm(`Расставить ${dates.length} дат заново? Текущие даты у ${withDate.length} роликов будут перезаписаны.`)) return;
    setBusy(true);
    // Порядок: сначала уже существующие сценарии (по номеру), потом добираем слотами
    const ordered = [...scripts].sort((a, b) => (a.order_num || 999) - (b.order_num || 999) || a.id - b.id);
    for (let i = 0; i < dates.length; i++) {
      const s = ordered[i];
      if (s) {
        if (s.pub_date !== dates[i]) await db.updateScript(supabase, s.id, { pub_date: dates[i] });
      } else {
        const { data } = await db.createScript(supabase, clientId, month.month_number);
        if (data) await db.updateScript(supabase, (data as Script).id, { pub_date: dates[i] });
      }
    }
    // Лишним (сверх плана) даты снимаем, сами карточки не трогаем
    for (let i = dates.length; i < ordered.length; i++) {
      if (ordered[i].pub_date) await db.updateScript(supabase, ordered[i].id, { pub_date: null });
    }
    await onChange();
    setBusy(false);
  }

  async function moveTo(id: number, date: string) {
    setBusy(true);
    await db.updateScript(supabase, id, { pub_date: date });
    await onChange();
    setBusy(false);
  }
  async function clearDate(id: number) {
    setBusy(true);
    await db.updateScript(supabase, id, { pub_date: null });
    await onChange();
    setBusy(false);
  }
  async function addSlot(date: string) {
    setBusy(true);
    const { data } = await db.createScript(supabase, clientId, month.month_number);
    if (data) await db.updateScript(supabase, (data as Script).id, { pub_date: date });
    await onChange();
    setBusy(false);
  }
  async function removeSlot(id: number) {
    if (!confirm("Удалить пустой слот из плана?")) return;
    setBusy(true);
    await db.deleteScript(supabase, id);
    await onChange();
    setBusy(false);
  }
  async function clearAll() {
    if (!confirm(`Снять даты со всех ${withDate.length} роликов месяца? Сами сценарии останутся.`)) return;
    setBusy(true);
    for (const s of withDate) await db.updateScript(supabase, s.id, { pub_date: null });
    await onChange();
    setBusy(false);
  }
  async function purgeEmpty() {
    const junk = scripts.filter(s => isEmptySlot(s) && s.video_status === "notStarted" && s.script_status === "notStarted");
    if (!junk.length) { alert("Пустых слотов нет"); return; }
    if (!confirm(`Удалить ${junk.length} пустых слотов? Заполненные сценарии не тронем.`)) return;
    setBusy(true);
    for (const s of junk) await db.deleteScript(supabase, s.id);
    await onChange();
    setBusy(false);
  }

  const chipColor = (s: Script) =>
    s.video_status === "published" ? { bg: "rgba(52,168,83,0.18)", fg: "#4ade80", br: "rgba(52,168,83,0.5)" }
    : s.video_status === "ready" ? { bg: "rgba(168,224,99,0.16)", fg: "var(--gr)", br: "rgba(168,224,99,0.45)" }
    : s.video_status === "inProgress" ? { bg: "rgba(66,212,244,0.14)", fg: "var(--cy)", br: "rgba(66,212,244,0.4)" }
    : isEmptySlot(s) ? { bg: "var(--track)", fg: "var(--t3)", br: "var(--brd)" }
    : { bg: "rgba(157,107,255,0.14)", fg: "var(--pu)", br: "rgba(157,107,255,0.4)" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 18, width: "100%", maxWidth: 980, maxHeight: "92vh", overflowY: "auto", padding: 22, fontFamily: "'Manrope', sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
          <div>
            <h3 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--t1)", display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarDays size={17} style={{ color: "var(--pu)" }} /> График публикаций · M{month.month_number}
            </h3>
            <p style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 4 }}>
              {month.start_date.split("-").reverse().slice(0, 2).join(".")} → {month.end_date.split("-").reverse().slice(0, 2).join(".")} ·
              план {month.package} · с датой {withDate.length} · без даты {noDate.length}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer" }}><X size={18} /></button>
        </div>

        {/* Панель распределения */}
        <div style={{ padding: 14, borderRadius: 12, background: "rgba(123,63,228,0.05)", border: "1px solid var(--brd)", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Сколько роликов</label>
              <input type="number" min={1} max={200} value={count} onChange={e => setCount(e.target.value)}
                style={{ width: 78, padding: "8px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 14, fontWeight: 700, textAlign: "center" }} />
            </div>
            <div>
              <label style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>В какие дни публикуем</label>
              <div style={{ display: "flex", gap: 4 }}>
                {WD.map((w, i) => (
                  <button key={w} onClick={() => setWeekdays(a => a.map((v, j) => j === i ? !v : v))}
                    style={{ width: 34, height: 34, borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      background: weekdays[i] ? "rgba(157,107,255,0.18)" : "var(--bg)",
                      border: `1px solid ${weekdays[i] ? "var(--pu)" : "var(--brd)"}`, color: weekdays[i] ? "var(--pu)" : "var(--t3)" }}>{w}</button>
                ))}
              </div>
            </div>
            <button onClick={distribute} disabled={busy}
              style={{ height: 38, padding: "0 16px", borderRadius: 9, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 7, opacity: busy ? 0.6 : 1 }}>
              <Wand2 size={13} /> {busy ? "Расставляю…" : "Распределить по месяцу"}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={clearAll} disabled={busy || !withDate.length}
              style={{ height: 34, padding: "0 12px", borderRadius: 8, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Eraser size={12} /> Снять все даты
            </button>
            <button onClick={purgeEmpty} disabled={busy}
              style={{ height: 34, padding: "0 12px", borderRadius: 8, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Trash2 size={12} /> Удалить пустые слоты
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 9, lineHeight: 1.5 }}>
            Даты распределяются ровно по месяцу. Уже написанные сценарии получают даты первыми — по номеру; если роликов в плане больше, чем карточек, недостающие добавятся пустыми слотами. Дальше их можно перетаскивать мышкой по календарю.
          </div>
        </div>

        {/* Календарь */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {WD.map(w => <div key={w} style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.4, paddingBottom: 2 }}>{w}</div>)}
          {weeks.flat().map(d => {
            const active = inRange(d);
            const items = byDate[d] || [];
            const dd = Number(d.slice(8, 10));
            const isOver = dragOver === d;
            return (
              <div key={d}
                onDragOver={e => { if (active) { e.preventDefault(); setDragOver(d); } }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => { e.preventDefault(); setDragOver(null); if (active && dragId) moveTo(dragId, d); setDragId(null); }}
                style={{ minHeight: 78, borderRadius: 10, padding: 6, background: active ? (isOver ? "rgba(66,212,244,0.12)" : "var(--inset)") : "transparent",
                  border: `1px solid ${isOver ? "var(--cy)" : active ? "var(--brd)" : "transparent"}`, opacity: active ? 1 : 0.28, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: dd === 1 ? "var(--pu)" : "var(--t3)" }}>
                    {dd}{dd === 1 ? ` ${RU_M[Number(d.slice(5, 7)) - 1].slice(0, 3)}` : ""}
                  </span>
                  {active && (
                    <button onClick={() => addSlot(d)} title="Добавить ролик на этот день"
                      style={{ background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", padding: 0, lineHeight: 1 }}>
                      <Plus size={11} />
                    </button>
                  )}
                </div>
                {items.map(s => {
                  const c = chipColor(s);
                  const empty = isEmptySlot(s);
                  return (
                    <div key={s.id} draggable onDragStart={() => setDragId(s.id)} onDragEnd={() => setDragId(null)}
                      title={empty ? "Пустой слот — сценарий ещё не написан" : (s.hook_text || s.hook || "")}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 5px", borderRadius: 6, background: c.bg, border: `1px solid ${c.br}`, cursor: "grab" }}>
                      <span style={{ flex: 1, fontSize: 9.5, fontWeight: 700, color: c.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {empty ? "слот" : (s.hook_text || s.hook || `#${s.order_num}`)}
                      </span>
                      <button onClick={() => empty ? removeSlot(s.id) : clearDate(s.id)}
                        title={empty ? "Удалить слот" : "Снять дату"}
                        style={{ background: "transparent", border: "none", color: c.fg, cursor: "pointer", padding: 0, lineHeight: 1, opacity: 0.7 }}>
                        <X size={9} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {noDate.length > 0 && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(255,174,66,0.07)", border: "1px solid rgba(255,174,66,0.3)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--or)", marginBottom: 7 }}>Без даты публикации: {noDate.length}</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {noDate.map(s => (
                <div key={s.id} draggable onDragStart={() => setDragId(s.id)} onDragEnd={() => setDragId(null)}
                  title="Перетащи на день в календаре"
                  style={{ padding: "4px 8px", borderRadius: 7, background: "var(--inset)", border: "1px solid var(--brd)", fontSize: 10.5, fontWeight: 700, color: "var(--t2)", cursor: "grab", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {isEmptySlot(s) ? "слот" : (s.hook_text || s.hook || `#${s.order_num}`)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
