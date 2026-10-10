"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { notify } from "@/components/NoticeHost";

/*
 * «План / факт» по клиенту за контрактный месяц.
 * Тимлид ставит план на месяц (или берёт из согласованного прогноза), неделя и день считаются сами.
 * Факт: ролики, просмотры, подписчики — автоматически; кодовые слова, заявки, консультации, продажи —
 * тимлид вносит раз в неделю. Видно отставание, темп к концу месяца и самое слабое звено воронки.
 */
type Metric = "reels" | "views" | "followers" | "codewords" | "leads" | "calls" | "sales";
const METRICS: { k: Metric; label: string; auto: boolean; hint: string }[] = [
  { k: "reels", label: "Роликов", auto: true, hint: "вышло роликов" },
  { k: "views", label: "Просмотры", auto: true, hint: "все сети, по дням" },
  { k: "followers", label: "Новые подписчики", auto: true, hint: "прирост за месяц" },
  { k: "codewords", label: "Кодовые слова", auto: false, hint: "входы в директ" },
  { k: "leads", label: "Заявки / переписки", auto: false, hint: "дошли до диалога" },
  { k: "calls", label: "Консультации", auto: false, hint: "созвон / визит" },
  { k: "sales", label: "Продажи", auto: false, hint: "оплатили" },
];
const MANUAL: Metric[] = ["codewords", "leads", "calls", "sales"];
type Plan = Partial<Record<Metric, number>>;
type Week = { week_start: string; codewords: number | null; leads: number | null; calls: number | null; sales: number | null };
type Data = {
  months: { month_number: number; start_date: string; end_date: string }[]; month: { month_number: number; start_date: string; end_date: string };
  today: string; plan: { metrics: Plan; source: string; updated_by: string | null; updated_at: string } | null; weeks: Week[];
  daily: Record<string, number>; viewsNote: string; followers: Record<string, number>; reels: Record<string, number>;
  forecast: { version: number; status: string | null; months: any[] } | null;
};

const DAY = 864e5;
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY) + 1;
const fmt = (n: number | null | undefined) => n == null || isNaN(n) ? "—" : Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(n >= 1e6 ? 0 : 1).replace(".0", "")} тыс.` : Math.round(n).toLocaleString("ru-RU");
const ddmm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const tone = (p: number | null) => p == null ? "var(--t3)" : p >= 1 ? "var(--gr)" : p >= 0.7 ? "var(--or)" : "var(--rd)";

const FIX: Record<string, string> = {
  views: "Мало просмотров → меняем темы и первые 2 секунды, смотрим, какие ролики зашли, и делаем больше похожих.",
  codewords: "Мало кодовых слов → переписываем призыв и даём причину написать (лид-магнит, разбор, подборка).",
  leads: "Слова пишут, но диалога нет → проверить автоответ и скорость ответа в директе, усилить оффер.",
  calls: "Переписки не доходят до консультации → скрипт ответа, конкретное предложение и время записи.",
  sales: "Консультации не закрываются → контент приводит не тех людей: сдвигаем темы к продукту и чеку.",
};

export default function PlanFactTab({ clientId }: { clientId: number }) {
  const supabase = createClient();
  const [month, setMonth] = useState<number | null>(null);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Plan | null>(null);
  const [wk, setWk] = useState<Record<string, Partial<Week>>>({});
  const [busy, setBusy] = useState(false);
  const [fromFc, setFromFc] = useState(false);   // план подставлен из прогноза (метка источника)

  async function load(m = month) {
    setLoading(true); setErr("");
    const r = await fetch(`/api/clients/${clientId}/planfact${m ? `?month=${m}` : ""}`);
    const j = await r.json().catch(() => ({}));
    setLoading(false);
    if (!r.ok) { setErr(j.error || `ошибка ${r.status}`); return; }
    setD(j); setMonth(j.month.month_number); setWk({});
  }
  useEffect(() => { load(null); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const calc = useMemo(() => {
    if (!d) return null;
    const { start_date: start, end_date: end } = d.month;
    const total = daysBetween(start, end);
    const last = d.today < end ? d.today : end;
    const elapsed = d.today < start ? 0 : Math.min(total, daysBetween(start, last));
    const days = Array.from({ length: total }, (_, i) => addDays(start, i));
    const views = days.map(x => (x <= last ? d.daily[x] || 0 : null));
    const fDates = Object.keys(d.followers).sort();
    const fStart = fDates.find(x => x >= addDays(start, -3)), fEnd = fDates.filter(x => x <= last).pop();
    const fact: Record<Metric, number | null> = {
      reels: days.filter(x => x <= last).reduce((s, x) => s + (d.reels[x] || 0), 0),
      views: views.reduce((s: number, v) => s + (v || 0), 0),
      followers: fStart && fEnd ? d.followers[fEnd] - d.followers[fStart] : null,
      codewords: null, leads: null, calls: null, sales: null,
    };
    for (const k of MANUAL) {
      const vals = d.weeks.map(w => w[k as keyof Week] as number | null).filter(v => v != null) as number[];
      fact[k] = vals.length ? vals.reduce((s, v) => s + v, 0) : null;
    }
    const plan = d.plan?.metrics || {};
    const weeks = [] as { start: string; end: string; days: number }[];
    for (let s = start; s <= end; s = addDays(s, 7)) { const e = addDays(s, 6) > end ? end : addDays(s, 6); weeks.push({ start: s, end: e, days: daysBetween(s, e) }); }
    // самое слабое звено: конверсии факта против плана
    const steps: { k: Metric; ratio: number }[] = [];
    const rate = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? a / b : null);
    const pace = (k: Metric) => (plan[k] && elapsed ? (fact[k] ?? 0) / ((plan[k] as number) * elapsed / total) : null);
    const pv = pace("views"); if (pv != null) steps.push({ k: "views", ratio: pv });
    const pairs: [Metric, Metric][] = [["views", "codewords"], ["codewords", "leads"], ["leads", "calls"], ["calls", "sales"]];
    for (const [a, b] of pairs) {
      const pr = rate(plan[b], plan[a]), fr = rate(fact[b], fact[a]);
      if (pr && fr != null && (fact[a] || 0) > 0) steps.push({ k: b, ratio: fr / pr });
    }
    const weakest = steps.filter(s => s.ratio < 0.7).sort((a, b) => a.ratio - b.ratio)[0] || null;
    return { start, end, total, elapsed, days, views, fact, plan, weeks, weakest, last };
  }, [d]);

  async function me() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: tm } = user ? await supabase.from("team_members").select("name").eq("profile_id", user.id).maybeSingle() : { data: null };
    return tm?.name || user?.email?.split("@")[0] || "команда";
  }
  async function savePlan(p: Plan, source: "manual" | "forecast") {
    if (!d) return;
    setBusy(true);
    const clean: Plan = Object.fromEntries(Object.entries(p).filter(([, v]) => v != null && !isNaN(Number(v))).map(([k, v]) => [k, Math.round(Number(v) * 10) / 10]));
    const { error } = await supabase.from("client_plans").upsert({ client_id: clientId, month_number: d.month.month_number, metrics: clean, source, updated_by: await me(), updated_at: new Date().toISOString() }, { onConflict: "client_id,month_number" });
    setBusy(false);
    if (error) return notify(`Не сохранилось: ${error.message}`);
    setEdit(null); setFromFc(false); notify("План сохранён"); load(d.month.month_number);
  }
  function fromForecast() {
    if (!d?.forecast) return;
    const n = d.month.month_number, m = d.forecast.months.find((x: any) => Number(x.n) === n);
    if (!m) return notify(`В прогнозе нет месяца ${n}`);
    const prev = d.forecast.months.find((x: any) => Number(x.n) === n - 1);
    const fNow = Object.keys(d.followers).sort().map(k => d.followers[k])[0];
    const base = prev?.followers_total ?? fNow;
    setFromFc(true);
    setEdit({ reels: m.reels, views: m.views, followers: base != null && m.followers_total != null ? Math.max(0, m.followers_total - base) : undefined,
      codewords: m.codewords, leads: m.leads, calls: m.calls, sales: m.sales });
  }
  async function saveWeek(ws: string) {
    const v = wk[ws]; if (!v) return;
    setBusy(true);
    const cur = d?.weeks.find(w => w.week_start === ws);
    const row: any = { client_id: clientId, week_start: ws, entered_by: await me(), updated_at: new Date().toISOString() };
    for (const k of MANUAL) { const x = (v as any)[k] ?? (cur as any)?.[k]; row[k] = x === "" || x == null ? null : Math.round(Number(x)); }
    const { error } = await supabase.from("client_fact_weeks").upsert(row, { onConflict: "client_id,week_start" });
    setBusy(false);
    if (error) return notify(`Не сохранилось: ${error.message}`);
    notify("Цифры недели сохранены"); load(d?.month.month_number ?? null);
  }
  async function askAI() {
    if (!d || !calc) return;
    const lines = METRICS.map(m => `${m.label}: план ${fmt(calc.plan[m.k])}, факт ${fmt(calc.fact[m.k])}${calc.plan[m.k] && calc.elapsed ? `, темп к концу месяца ${fmt((calc.fact[m.k] ?? 0) / calc.elapsed * calc.total)}` : ""}`);
    const body = `📊 План / факт, месяц M${d.month.month_number} (${ddmm(calc.start)}–${ddmm(calc.end)}, прошло ${calc.elapsed} из ${calc.total} дней):\n${lines.join("\n")}\n`
      + `${calc.weakest ? `Слабее всего: ${METRICS.find(m => m.k === calc.weakest!.k)?.label}.\n` : ""}`
      + "Сравни план и факт, найди звено, которое проседает сильнее всего, и предложи 1–2 конкретных изменения по этому клиенту (темы, первые секунды, призыв, ответ в директе). Опирайся на STATS.md и PLAN.md.";
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("client_chat_messages").insert({ client_id: clientId, thread: "strategy", author_type: "user", author_id: user?.id ?? null, author_name: await me(), ai_status: "queued", attachments: [], body });
    if (error) return notify(`Не отправилось: ${error.message}`);
    notify("Отправлено ИИ — ответ в «Чат · ИИ» → «Стратегия»");
  }

  if (loading && !d) return <p style={{ color: "var(--t3)", fontSize: 13 }}>Считаю план и факт…</p>;
  if (err) return <div className="v2-card" style={{ padding: 18, color: "var(--t2)", fontSize: 13 }}>{err}</div>;
  if (!d || !calc) return null;
  const hasPlan = !!d.plan && Object.keys(d.plan.metrics || {}).length > 0;
  const inp: React.CSSProperties = { width: "100%", padding: "7px 9px", borderRadius: 8, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* месяц и действия */}
      <div className="flex items-center gap-2 flex-wrap">
        {d.months.map(m => (
          <button key={m.month_number} onClick={() => load(m.month_number)} className={`v2-chip ${m.month_number === d.month.month_number ? "pu" : "mut"}`}
            style={{ cursor: "pointer", height: 30, padding: "0 12px" }}>M{m.month_number} · {ddmm(m.start_date)}–{ddmm(m.end_date)}</button>
        ))}
        <span style={{ fontSize: 12, color: "var(--t3)" }}>прошло {calc.elapsed} из {calc.total} дней</span>
        <div style={{ flex: 1 }} />
        {!edit && <button className="v2-act ghost" style={{ height: 32 }} onClick={() => setEdit({ ...(d.plan?.metrics || {}) })}>{hasPlan ? "Изменить план" : "Поставить план"}</button>}
        {hasPlan && <button className="v2-act ghost" style={{ height: 32 }} onClick={askAI}>Спросить ИИ, что поменять</button>}
      </div>

      {/* редактор плана */}
      {edit && (
        <div className="v2-card" style={{ padding: 14 }}>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
            <b style={{ fontSize: 13.5 }}>План на месяц M{d.month.month_number}</b>
            <span style={{ fontSize: 12, color: "var(--t3)" }}>— только месячные цифры, неделя и день посчитаются сами</span>
            <div style={{ flex: 1 }} />
            {d.forecast && <button className="v2-act ghost" style={{ height: 30, fontSize: 12 }} onClick={fromForecast}>Взять из прогноза (в.{d.forecast.version})</button>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {METRICS.map(m => (
              <label key={m.k} style={{ fontSize: 11.5, color: "var(--t3)", display: "flex", flexDirection: "column", gap: 4 }}>{m.label}
                <input type="number" min={0} value={edit[m.k] ?? ""} onChange={e => setEdit(p => ({ ...p, [m.k]: e.target.value === "" ? undefined : Number(e.target.value) }))} style={inp} />
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button className="v2-act pri" style={{ height: 34 }} disabled={busy} onClick={() => savePlan(edit, fromFc ? "forecast" : "manual")}>{busy ? "Сохраняю…" : "Сохранить план"}</button>
            <button className="v2-act ghost" style={{ height: 34 }} onClick={() => { setEdit(null); setFromFc(false); }}>Отмена</button>
          </div>
        </div>
      )}

      {!hasPlan && !edit && (
        <div className="v2-card" style={{ padding: 18, color: "var(--t2)", fontSize: 13, lineHeight: 1.5 }}>
          Плана на этот месяц ещё нет. Нажмите «Поставить план» и впишите цифры на месяц{d.forecast ? " или возьмите их из прогноза" : ""} — дальше CRM сама разложит их по неделям и дням и покажет, идём ли в план.
        </div>
      )}

      {/* карточки показателей */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
        {METRICS.map(m => {
          const plan = calc.plan[m.k], fact = calc.fact[m.k];
          const due = plan && calc.total ? plan * calc.elapsed / calc.total : null;   // сколько должно быть к сегодняшнему дню
          const p = due && fact != null ? fact / due : null;
          const pace = fact != null && calc.elapsed ? fact / calc.elapsed * calc.total : null;
          return (
            <div key={m.k} className="v2-card" style={{ padding: 12, borderColor: calc.weakest?.k === m.k ? "var(--rd)" : undefined }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5 }}>{m.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "var(--t1)" }}>{fmt(fact)}</span>
                <span style={{ fontSize: 12, color: "var(--t3)" }}>/ {fmt(plan)}</span>
              </div>
              <div style={{ fontSize: 11.5, marginTop: 4, color: tone(p) }}>
                {plan ? (p != null ? `${Math.round(p * 100)}% от плана на сегодня` : m.auto ? "нет данных" : "не внесено") : "плана нет"}
              </div>
              {plan && pace != null && <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>темп к концу месяца: {fmt(pace)}</div>}
              <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 4 }}>{m.auto ? "авто · " : "вносит тимлид · "}{m.hint}</div>
            </div>
          );
        })}
      </div>

      {/* слабое звено */}
      {calc.weakest && (
        <div className="v2-card" style={{ padding: 14, border: "1px solid rgba(255,92,122,.4)" }}>
          <b style={{ color: "var(--rd)", fontSize: 13 }}>Проседает: {METRICS.find(m => m.k === calc.weakest!.k)?.label} — {Math.round(calc.weakest.ratio * 100)}% от плана</b>
          <div style={{ fontSize: 13, color: "var(--t2)", marginTop: 6, lineHeight: 1.5 }}>{FIX[calc.weakest.k]}</div>
        </div>
      )}

      {/* просмотры по дням */}
      <ViewsChart days={calc.days} views={calc.views} planDay={calc.plan.views ? calc.plan.views / calc.total : null} reels={d.reels} note={d.viewsNote} />

      {/* по неделям */}
      <div className="v2-card" style={{ padding: 14, overflowX: "auto" }}>
        <b style={{ fontSize: 13.5 }}>По неделям</b>
        <span style={{ fontSize: 12, color: "var(--t3)", marginLeft: 8 }}>план недели = план месяца × дни недели. Кодовые слова, заявки, консультации и продажи вносите раз в неделю.</span>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 12.5, minWidth: 820 }}>
          <thead><tr style={{ color: "var(--t3)", textAlign: "left" }}>
            <th style={{ padding: "6px 8px" }}>Неделя</th>
            {METRICS.map(m => <th key={m.k} style={{ padding: "6px 8px" }}>{m.label}</th>)}
            <th />
          </tr></thead>
          <tbody>
            {calc.weeks.map(w => {
              const share = w.days / calc.total;
              const inDays = (x: string) => x >= w.start && x <= w.end && x <= calc.last;
              const auto: Partial<Record<Metric, number | null>> = {
                reels: Object.entries(d.reels).filter(([x]) => inDays(x)).reduce((s, [, v]) => s + v, 0),
                views: calc.days.reduce((s, x, i) => s + (inDays(x) ? calc.views[i] || 0 : 0), 0),
                followers: (() => { const ks = Object.keys(d.followers).sort(); const a = ks.filter(x => x < w.start).pop() ?? ks.find(x => x >= w.start); const b = ks.filter(x => x <= w.end && x <= calc.last).pop(); return a && b && b >= w.start ? d.followers[b] - d.followers[a] : null; })(),
              };
              const row = d.weeks.find(x => x.week_start === w.start);
              const future = w.start > d.today;
              return (
                <tr key={w.start} style={{ borderTop: "1px solid var(--brd)", opacity: future ? 0.55 : 1 }}>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{ddmm(w.start)}–{ddmm(w.end)}</td>
                  {METRICS.map(m => {
                    const plan = calc.plan[m.k] ? (calc.plan[m.k] as number) * share : null;
                    if (m.auto) {
                      const f = future ? null : auto[m.k] ?? null;
                      return <td key={m.k} style={{ padding: "6px 8px" }}><span style={{ color: plan && f != null ? tone(f / plan) : "var(--t1)", fontWeight: 700 }}>{fmt(f)}</span><span style={{ color: "var(--t3)" }}> / {fmt(plan)}</span></td>;
                    }
                    const cur = (wk[w.start] as any)?.[m.k] ?? (row as any)?.[m.k] ?? "";
                    return <td key={m.k} style={{ padding: "6px 8px" }}>
                      <input type="number" min={0} disabled={future} value={cur} placeholder="—"
                        onChange={e => setWk(p => ({ ...p, [w.start]: { ...p[w.start], [m.k]: e.target.value } }))}
                        style={{ ...inp, width: 64, padding: "4px 6px" }} />
                      <span style={{ color: "var(--t3)", marginLeft: 4 }}>/ {fmt(plan)}</span>
                    </td>;
                  })}
                  <td style={{ padding: "6px 8px" }}>{wk[w.start] && <button className="v2-act pri" style={{ height: 28, fontSize: 12 }} disabled={busy} onClick={() => saveWeek(w.start)}>Сохранить</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {d.plan && <div style={{ fontSize: 11.5, color: "var(--t3)" }}>План: {d.plan.updated_by || "—"}, {new Date(d.plan.updated_at).toLocaleDateString("ru-RU")}</div>}
    </div>
  );
}

/** Просмотры по дням: столбики факта, пунктир — план на день, точки — дни выхода роликов. */
function ViewsChart({ days, views, planDay, reels, note }: { days: string[]; views: (number | null)[]; planDay: number | null; reels: Record<string, number>; note: string }) {
  const W = 900, H = 200, P = 26;
  const max = Math.max(1, ...views.map(v => v || 0), (planDay || 0) * 1.4);
  const bw = (W - P * 2) / days.length;
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  let cumF = 0, cumP = 0;
  const cum = days.map((_, i) => { cumF += views[i] || 0; cumP += planDay || 0; return { f: views[i] == null ? null : cumF, p: cumP }; });
  const cmax = Math.max(1, ...cum.map(c => Math.max(c.f || 0, c.p)));
  const cy = (v: number) => H - P - (v / cmax) * (H - P * 2);
  const lastF = [...cum].reverse().find(c => c.f != null);
  return (
    <div className="v2-card" style={{ padding: 14 }}>
      <div className="flex items-center gap-3 flex-wrap">
        <b style={{ fontSize: 13.5 }}>Просмотры по дням</b>
        <span style={{ fontSize: 12, color: "var(--t3)" }}>столбики — факт, пунктир — план на день, точка — вышел ролик{note ? ` · ${note}` : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", marginTop: 8 }}>
        {days.map((dd, i) => {
          const v = views[i];
          return <g key={dd}>
            {v != null && <rect x={P + i * bw + 1} y={y(v)} width={Math.max(1, bw - 2)} height={H - P - y(v)} rx={2} fill={planDay && v >= planDay ? "var(--gr)" : "var(--pu)"} opacity={0.85} />}
            {reels[dd] ? <circle cx={P + i * bw + bw / 2} cy={H - P + 8} r={3} fill="var(--cy)" /> : null}
            {(i === 0 || i === days.length - 1 || i % 7 === 0) && <text x={P + i * bw + bw / 2} y={H - 4} fontSize={10} fill="var(--t3)" textAnchor="middle">{dd.slice(8, 10)}.{dd.slice(5, 7)}</text>}
          </g>;
        })}
        {planDay ? <line x1={P} x2={W - P} y1={y(planDay)} y2={y(planDay)} stroke="var(--or)" strokeDasharray="5 4" strokeWidth={1.5} /> : null}
      </svg>
      {planDay ? (
        <>
          <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 6 }}>
            <b style={{ fontSize: 13 }}>Накопительно</b>
            <span style={{ fontSize: 12, color: "var(--t3)" }}>сплошная — факт, пунктир — план{lastF ? ` · сейчас ${fmt(lastF.f)} из ${fmt(lastF.p)} по плану на эту дату` : ""}</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
            <polyline fill="none" stroke="var(--or)" strokeDasharray="5 4" strokeWidth={2} points={cum.map((c, i) => `${P + i * bw + bw / 2},${cy(c.p)}`).join(" ")} />
            <polyline fill="none" stroke="var(--cy)" strokeWidth={2.5} points={cum.filter(c => c.f != null).map((c, i) => `${P + i * bw + bw / 2},${cy(c.f as number)}`).join(" ")} />
          </svg>
        </>
      ) : null}
    </div>
  );
}
