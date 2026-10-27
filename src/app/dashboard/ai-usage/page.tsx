"use client";
import { useEffect, useMemo, useState } from "react";
import { useIsOwner } from "@/components/RoleContext";
import Avatar from "@/components/Avatar";
import { Bot, Film, AlertTriangle, Clock, Users, Server, HardDrive, Cpu, MemoryStick, CircleDollarSign, X, Search } from "lucide-react";

/* ИИ-чат: аналитика (видит только владелец). Что сотрудники делают через ИИ-исполнителя:
   задачи по дням, кто сколько ставит, смонтированные ролики, ошибки, время, условная стоимость,
   по клиентам и чатам; фильтры по сотруднику / клиенту / дню и полный список задач по дням;
   и состояние сервера — диск, нагрузка, сколько задач идёт прямо сейчас. */

type Row = { id: number; client_id: number; client: string; avatar: string | null; who: string; thread: string; status: string; error: string | null; at: string; minutes: number | null; cost: number | null; videos: number; images: number; files: number; text: string };
type Data = {
  days: number; rows: Row[];
  server: { last: any; online: boolean; hourly: { at: string; disk: number; load: number; run: number }[] };
  quick: { total: number; byKind: Record<string, number> };
  claude?: { last: { at: string; h5: number | null; h5Reset: string | null; d7: number; d7Reset: string | null; status: string | null; overage: string | null } | null;
    weekForecast: number | null; hourly: { at: string; h5: number; d7: number }[]; cost: { day: number; week: number; perDay: number } };
  heygen?: { total: HG; remaining: number | null; remainingAt: string | null; clients: (HG & { key: string; name: string; avatar: string | null })[]; people: (HG & { key: string })[] };
};
type HG = { credits: number; voices: number; videos: number; redos: number; errors: number; seconds: number; last?: string };
type Agg = { key: string; tasks: number; done: number; error: number; videos: number; images: number; avgMin: number | null; cost: number; clients: number; people: number; last: string; first: string; name?: string; avatar?: string | null };

const THREAD: Record<string, string> = { reels: "Рилсы", stories: "Сторис", strategy: "Стратегия", avatar: "Аватар" };
const STATUS: Record<string, { t: string; c: string }> = { done: { t: "готово", c: "var(--gr)" }, error: { t: "ошибка", c: "var(--rd)" }, working: { t: "в работе", c: "var(--cy)" }, queued: { t: "в очереди", c: "var(--t3)" } };
const WD = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const fmtMin = (m: number | null) => (m == null ? "—" : m < 1 ? "<1 мин" : m < 60 ? `${Math.round(m)} мин` : `${Math.floor(m / 60)} ч ${Math.round(m % 60)} мин`);
const ago = (iso: string) => { const m = (Date.now() - Date.parse(iso)) / 60000; return m < 60 ? `${Math.round(m)} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн назад`; };
const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
const dayTitle = (day: string) => { const d = new Date(day + "T12:00:00"); return `${d.getDate()} ${MON[d.getMonth()]}, ${WD[d.getDay()]}`; };
const hm = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

const card: React.CSSProperties = { padding: 16, marginBottom: 14 };
const label: React.CSSProperties = { fontSize: 11, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 };
const sel: React.CSSProperties = { height: 32, borderRadius: 9, border: "1px solid var(--brd)", background: "var(--v2-inset, var(--card))", color: "var(--t1)", padding: "0 10px", fontSize: 13, fontFamily: "inherit" };

function group(rows: Row[], key: (r: Row) => string): Agg[] {
  const m = new Map<string, any>();
  for (const r of rows) {
    const k = key(r);
    const g = m.get(k) || { key: k, tasks: 0, done: 0, error: 0, videos: 0, images: 0, minutes: 0, minN: 0, cost: 0, last: r.at, first: r.at, cl: new Set<number>(), pp: new Set<string>(), name: r.client, avatar: r.avatar };
    g.tasks++; if (r.status === "done") g.done++; else if (r.status === "error") g.error++;
    g.videos += r.videos; g.images += r.images;
    if (r.minutes != null && r.status === "done") { g.minutes += r.minutes; g.minN++; }
    if (r.cost) g.cost += r.cost;
    if (r.at > g.last) g.last = r.at; if (r.at < g.first) g.first = r.at;
    g.cl.add(r.client_id); g.pp.add(r.who);
    m.set(k, g);
  }
  return Array.from(m.values()).map(g => ({ ...g, avgMin: g.minN ? Math.round((g.minutes / g.minN) * 10) / 10 : null, cost: Math.round(g.cost * 100) / 100, clients: g.cl.size, people: g.pp.size }));
}

function Kpi({ icon: I, title, value, sub, color }: { icon: any; title: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="v2-card" style={{ padding: 14 }}>
      <div className="flex items-center gap-2" style={label}><I size={14} /> {title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: color || "var(--t1)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function Bar({ v, max, color }: { v: number; max: number; color: string }) {
  return <div style={{ height: 6, borderRadius: 3, background: "var(--track)", overflow: "hidden" }}><div style={{ width: `${max ? (v / max) * 100 : 0}%`, height: "100%", background: color }} /></div>;
}

export default function AiUsagePage() {
  const isOwner = useIsOwner();
  const [days, setDays] = useState(30);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [who, setWho] = useState("");
  const [cid, setCid] = useState<number | null>(null);
  const [day, setDay] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [showDays, setShowDays] = useState(7);

  useEffect(() => {
    if (!isOwner) return;
    setErr("");
    fetch(`/api/admin/ai-usage?days=${days}`).then(r => r.json()).then(j => (j.error ? setErr(j.error) : setD(j))).catch(e => setErr(String(e)));
  }, [days, isOwner]);
  useEffect(() => { setShowDays(7); }, [who, cid, day, q, days]);

  const all = d?.rows || [];
  // фильтр без дня — для графика по дням (чтобы видеть, в какие дни работал выбранный сотрудник)
  const base = useMemo(() => all.filter(r => (!who || r.who === who) && (cid == null || r.client_id === cid) && (!q || r.text.toLowerCase().includes(q.toLowerCase()) || r.client.toLowerCase().includes(q.toLowerCase()))), [all, who, cid, q]);
  const rows = useMemo(() => (day ? base.filter(r => localDay(r.at) === day) : base), [base, day]);

  const t = useMemo(() => group(rows, () => "all")[0] || null, [rows]);
  const people = useMemo(() => group(day || cid != null || q ? rows : all.filter(r => true), r => r.who).sort((a, b) => b.tasks - a.tasks), [rows, all, day, cid, q]);
  const clients = useMemo(() => group(rows, r => String(r.client_id)).sort((a, b) => b.tasks - a.tasks), [rows]);
  const threads = useMemo(() => group(rows, r => r.thread).sort((a, b) => b.tasks - a.tasks), [rows]);
  const timeline = useMemo(() => {
    const byDay = new Map(group(base, r => localDay(r.at)).map(g => [g.key, g]));
    const out: { day: string; tasks: number; error: number; videos: number }[] = [];
    for (let i = days - 1; i >= 0; i--) { const k = localDay(new Date(Date.now() - i * 864e5).toISOString()); const g = byDay.get(k); out.push({ day: k, tasks: g?.tasks || 0, error: g?.error || 0, videos: g?.videos || 0 }); }
    return out;
  }, [base, days]);
  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) { const k = localDay(r.at); (m.get(k) || m.set(k, []).get(k)!).push(r); }
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);
  const peopleNames = useMemo(() => Array.from(new Set(all.map(r => r.who))).sort(), [all]);
  const clientOpts = useMemo(() => Array.from(new Map(all.map(r => [r.client_id, r.client])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const errors = rows.filter(r => r.status === "error").slice(0, 15);

  if (!isOwner) return <div style={{ padding: 40, color: "var(--t3)" }}>Раздел доступен только владельцу.</div>;

  const maxDay = Math.max(1, ...timeline.map(x => x.tasks));
  const s = d?.server.last;
  const diskPct = s ? Math.round((Number(s.disk_used_gb) / Number(s.disk_total_gb)) * 100) : null;
  const loadPct = s && s.cpus ? Math.round((Number(s.load1) / Number(s.cpus)) * 100) : null;
  const memPct = s && s.mem_total_mb ? Math.round((s.mem_used_mb / s.mem_total_mb) * 100) : null;
  const tone = (p: number | null, warn = 80, bad = 92) => (p == null ? "var(--t3)" : p >= bad ? "var(--rd)" : p >= warn ? "var(--or)" : "var(--gr)");
  const hourly = d?.server.hourly || [];
  const diskMax = Math.max(1, ...hourly.map(h => h.disk), Number(s?.disk_total_gb) || 1);
  const filtered = !!(who || cid != null || day || q);
  const todayRows = all.filter(r => localDay(r.at) === localDay(new Date().toISOString()) && (!who || r.who === who));

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", paddingBottom: 40 }}>
      <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 12 }}>
        <Bot size={22} style={{ color: "var(--pu)" }} />
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>ИИ-чат: аналитика</h1>
        <span style={{ fontSize: 12, color: "var(--t3)" }}>видите только вы</span>
        <div style={{ flex: 1 }} />
        {[1, 7, 30, 90].map(n => (
          <button key={n} onClick={() => setDays(n)} className={`v2-chip ${days === n ? "pu" : "mut"}`} style={{ cursor: "pointer", height: 30, padding: "0 12px" }}>
            {n === 1 ? "Сутки" : `${n} дн.`}
          </button>
        ))}
      </div>

      {/* фильтры */}
      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 14 }}>
        <select value={who} onChange={e => setWho(e.target.value)} style={sel}>
          <option value="">Все сотрудники</option>
          {peopleNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={cid ?? ""} onChange={e => setCid(e.target.value ? Number(e.target.value) : null)} style={sel}>
          <option value="">Все клиенты</option>
          {clientOpts.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <input type="date" value={day} onChange={e => setDay(e.target.value)} style={sel} />
        <div className="flex items-center gap-1" style={{ ...sel, padding: "0 8px", minWidth: 200 }}>
          <Search size={13} style={{ color: "var(--t3)" }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по задачам…" style={{ background: "transparent", border: 0, outline: "none", color: "var(--t1)", fontSize: 13, flex: 1, fontFamily: "inherit" }} />
        </div>
        {filtered && <button onClick={() => { setWho(""); setCid(null); setDay(""); setQ(""); }} className="v2-chip mut" style={{ cursor: "pointer", height: 30, padding: "0 10px", display: "inline-flex", alignItems: "center", gap: 4 }}><X size={12} /> Сбросить</button>}
      </div>

      {err && <div className="v2-card" style={{ ...card, color: "var(--rd)" }}>{err}</div>}
      {!d && !err && <div style={{ color: "var(--t3)" }}>Загружаю…</div>}

      {d && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
            <Kpi icon={Bot} title="Задач ИИ" value={String(t?.tasks || 0)} sub={day ? dayTitle(day) : `сегодня ${todayRows.length}`} />
            <Kpi icon={Film} title="Роликов смонтировано" value={String(t?.videos || 0)} sub={`картинок ${t?.images || 0}`} color="var(--gr)" />
            <Kpi icon={AlertTriangle} title="Ошибок" value={String(t?.error || 0)} sub={t?.tasks ? `${Math.round(((t?.error || 0) / t.tasks) * 100)}% задач` : "—"} color={t?.error ? "var(--rd)" : undefined} />
            <Kpi icon={Clock} title="Время задачи" value={fmtMin(t?.avgMin ?? null)} sub="в среднем на готовую" />
            <Kpi icon={Users} title={who ? "Клиентов" : "Работали с ИИ"} value={String(who ? t?.clients || 0 : t?.people || 0)} sub={who ? who : `сотрудников · клиентов ${t?.clients || 0}`} />
            <Kpi icon={CircleDollarSign} title="Условный расход" value={`$${(t?.cost || 0).toFixed(0)}`} sub="по ценам API; платим подпиской" />
          </div>

          {/* Расходы — наверху: подписка Claude и кредиты HeyGen (видит только владелец) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 12, marginBottom: 14 }}>
          {d.claude && (
            <div className="v2-card" style={{ ...card, marginBottom: 0 }}>
              <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                <Bot size={15} /><b style={{ fontSize: 14 }}>Подписка Claude (ИИ-исполнитель)</b>
                {d.claude.last && <span style={{ fontSize: 11, color: "var(--t3)" }}>обновлено {ago(d.claude.last.at)}</span>}
                <div style={{ flex: 1 }} />
                {d.claude.last?.status && d.claude.last.status !== "allowed" && <span className="v2-chip rd" style={{ height: 24, padding: "0 9px", fontSize: 12 }}>лимит исчерпан</span>}
              </div>
              {!d.claude.last ? <div style={{ fontSize: 13, color: "var(--t3)", marginTop: 10 }}>Сервер ещё не прислал лимиты — они приходят раз в час.</div> : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
                  <div><div style={label}>5-часовое окно</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: tone(d.claude.last.h5 ?? 0, 70, 90) }}>{d.claude.last.h5 ?? "—"}%</div>
                    <Bar v={d.claude.last.h5 ?? 0} max={100} color={tone(d.claude.last.h5 ?? 0, 70, 90)} />
                    <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3 }}>{d.claude.last.h5Reset ? `сброс в ${hm(d.claude.last.h5Reset)}` : ""}</div></div>
                  <div><div style={label}>Неделя</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: tone(d.claude.last.d7, 70, 90) }}>{d.claude.last.d7}%</div>
                    <Bar v={d.claude.last.d7} max={100} color={tone(d.claude.last.d7, 70, 90)} />
                    <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3 }}>
                      {d.claude.last.d7Reset ? `сброс ${dayTitle(localDay(d.claude.last.d7Reset))}, ${hm(d.claude.last.d7Reset)}` : ""}
                      {d.claude.weekForecast != null && <> · <span style={{ color: tone(d.claude.weekForecast, 80, 100) }}>к сбросу ≈ {d.claude.weekForecast}%</span></>}
                    </div></div>
                </div>
              )}
              <div style={{ fontSize: 12.5, color: "var(--t2)", marginTop: 10 }}>
                Расход по ценам API: сегодня <b>${d.claude.cost.day}</b> · за 7 дн <b>${d.claude.cost.week}</b> · в среднем <b>${d.claude.cost.perDay}</b>/день
                <span style={{ color: "var(--t3)" }}> — платим подпиской, это «сколько стоило бы»</span>
              </div>
              {d.claude.hourly.length > 2 && (
                <div style={{ marginTop: 10 }}>
                  <div style={label}>Загрузка по часам: <span style={{ color: "var(--cy)" }}>5 ч</span> · <span style={{ color: "var(--pu)" }}>неделя</span></div>
                  <svg viewBox={`0 0 ${d.claude.hourly.length} 40`} preserveAspectRatio="none" style={{ width: "100%", height: 46, display: "block", marginTop: 4 }}>
                    <polyline fill="none" stroke="var(--cy)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" points={d.claude.hourly.map((h, i) => `${i},${40 - (h.h5 / 100) * 38}`).join(" ")} />
                    <polyline fill="none" stroke="var(--pu)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" points={d.claude.hourly.map((h, i) => `${i},${40 - (h.d7 / 100) * 38}`).join(" ")} />
                  </svg>
                </div>
              )}
            </div>
          )}
          {d.heygen && (
            <div className="v2-card" style={{ ...card, marginBottom: 0 }}>
              <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                <CircleDollarSign size={15} /><b style={{ fontSize: 14 }}>HeyGen: кредиты по клиентам</b>
                <span style={{ fontSize: 11, color: "var(--t3)" }}>за {d.days} дн · видите только вы</span>
                <div style={{ flex: 1 }} />
                {d.heygen.remaining != null && (
                  <span className={`v2-chip ${d.heygen.remaining < 100 ? "rd" : "gr"}`} style={{ height: 24, padding: "0 9px", fontSize: 12 }}>
                    остаток {d.heygen.remaining} кр.{d.heygen.remainingAt ? ` · ${ago(d.heygen.remainingAt)}` : ""}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "var(--t2)", marginTop: 8 }}>
                Всего: <b>{d.heygen.total.credits}</b> кредитов · {d.heygen.total.voices} озвучек · {d.heygen.total.videos} видео · {d.heygen.total.redos} переделок
                {d.heygen.total.errors ? <span style={{ color: "var(--rd)" }}> · ошибок {d.heygen.total.errors}</span> : null}
                {d.heygen.total.seconds ? <span style={{ color: "var(--t3)" }}> · {Math.round(d.heygen.total.seconds / 60)} мин речи</span> : null}
              </div>
              {!d.heygen.clients.length ? <div style={{ fontSize: 13, color: "var(--t3)", marginTop: 10 }}>Генераций за период не было.</div> : (
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead><tr style={{ color: "var(--t3)", textAlign: "left" }}>
                      <th style={{ padding: "4px 6px" }}>Клиент</th><th style={{ padding: "4px 6px", textAlign: "right" }}>Кредиты</th>
                      <th style={{ padding: "4px 6px", textAlign: "right" }}>Озвучки</th><th style={{ padding: "4px 6px", textAlign: "right" }}>Видео</th>
                      <th style={{ padding: "4px 6px", textAlign: "right" }}>Переделки</th><th style={{ padding: "4px 6px", textAlign: "right" }}>Ошибки</th>
                      <th style={{ padding: "4px 6px", textAlign: "right" }}>Последняя</th></tr></thead>
                    <tbody>{d.heygen.clients.map(c => (
                      <tr key={c.key} style={{ borderTop: "1px solid var(--brd)" }}>
                        <td style={{ padding: "6px" }}><span className="flex items-center gap-2"><Avatar src={c.avatar} name={c.name} size={20} /> {c.name}</span></td>
                        <td style={{ padding: "6px", textAlign: "right", fontWeight: 800 }}>{c.credits}</td>
                        <td style={{ padding: "6px", textAlign: "right" }}>{c.voices}</td><td style={{ padding: "6px", textAlign: "right" }}>{c.videos}</td>
                        <td style={{ padding: "6px", textAlign: "right", color: c.redos ? "var(--or)" : undefined }}>{c.redos}</td>
                        <td style={{ padding: "6px", textAlign: "right", color: c.errors ? "var(--rd)" : undefined }}>{c.errors}</td>
                        <td style={{ padding: "6px", textAlign: "right", color: "var(--t3)" }}>{c.last ? ago(c.last) : "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {d.heygen.people.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 8 }}>По сотрудникам: {d.heygen.people.map(p => `${p.key} — ${p.credits} кр. (${p.voices} озв., ${p.videos} видео)`).join(" · ")}</div>
                  )}
                </div>
              )}
            </div>
          )}

          </div>

          <div className="v2-card" style={card}>
            <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
              <b style={{ fontSize: 14 }}>Задачи по дням{who ? ` · ${who}` : ""}</b>
              <span style={{ fontSize: 12, color: "var(--t3)" }}>
                <span style={{ color: "var(--pu)" }}>■</span> готово · <span style={{ color: "var(--rd)" }}>■</span> ошибка · цифра сверху — ролики · клик по дню — задачи этого дня
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 150 }}>
              {timeline.map(x => (
                <button key={x.day} onClick={() => setDay(day === x.day ? "" : x.day)} title={`${dayTitle(x.day)}: задач ${x.tasks}, ошибок ${x.error}, роликов ${x.videos}`}
                  style={{ flex: 1, minWidth: 4, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", background: "transparent", border: 0, padding: 0, cursor: "pointer", opacity: day && day !== x.day ? 0.35 : 1 }}>
                  {x.videos > 0 && timeline.length <= 31 && <div style={{ fontSize: 9, color: "var(--gr)", textAlign: "center", fontWeight: 800 }}>{x.videos}</div>}
                  <div style={{ height: `${(x.error / maxDay) * 100}%`, background: "var(--rd)", borderRadius: "2px 2px 0 0" }} />
                  <div style={{ height: `${((x.tasks - x.error) / maxDay) * 100}%`, background: "var(--pu)", opacity: 0.85, borderRadius: x.error ? 0 : "2px 2px 0 0" }} />
                </button>
              ))}
            </div>
            <div className="flex justify-between" style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 4 }}>
              <span>{dm(timeline[0]?.day || "")}</span><span>{dm(timeline.at(-1)?.day || "")}</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
            <div className="v2-card" style={card}>
              <b style={{ fontSize: 14 }}>Сотрудники</b> <span style={{ fontSize: 12, color: "var(--t3)" }}>клик — только его задачи</span>
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {people.map(p => (
                  <button key={p.key} onClick={() => setWho(who === p.key ? "" : p.key)} style={{ textAlign: "left", background: who === p.key ? "var(--pud)" : "transparent", border: 0, borderRadius: 8, padding: "4px 6px", margin: "0 -6px", cursor: "pointer", color: "inherit", fontFamily: "inherit" }}>
                    <div className="flex items-center gap-2" style={{ fontSize: 13 }}>
                      <b style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.key}</b>
                      <span style={{ color: "var(--t2)" }}>{p.tasks} задач</span>
                      <span style={{ color: "var(--gr)" }}>{p.videos} 🎬</span>
                      {p.error > 0 && <span style={{ color: "var(--rd)" }}>{p.error} ош.</span>}
                    </div>
                    <Bar v={p.tasks} max={people[0]?.tasks || 1} color="var(--pu)" />
                    <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3 }}>клиентов {p.clients} · в среднем {fmtMin(p.avgMin)} · последняя {ago(p.last)}</div>
                  </button>
                ))}
                {!people.length && <div style={{ fontSize: 13, color: "var(--t3)" }}>Задач нет.</div>}
              </div>
            </div>

            <div className="v2-card" style={card}>
              <b style={{ fontSize: 14 }}>Клиенты</b> <span style={{ fontSize: 12, color: "var(--t3)" }}>клик — только его задачи</span>
              <div style={{ marginTop: 10, display: "grid", gap: 6, maxHeight: 420, overflowY: "auto" }}>
                {clients.map(c => (
                  <button key={c.key} onClick={() => setCid(cid === Number(c.key) ? null : Number(c.key))} className="flex items-center gap-2"
                    style={{ fontSize: 13, background: cid === Number(c.key) ? "var(--cyd)" : "transparent", border: 0, borderRadius: 8, padding: "4px 6px", cursor: "pointer", color: "inherit", fontFamily: "inherit", textAlign: "left" }}>
                    <Avatar name={c.name || ""} src={c.avatar || null} size={22} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>{c.name}</span>
                      <Bar v={c.tasks} max={clients[0]?.tasks || 1} color="var(--cy)" />
                    </span>
                    <span style={{ width: 70, textAlign: "right", color: "var(--t2)" }}>{c.tasks} задач</span>
                    <span style={{ width: 44, textAlign: "right", color: "var(--gr)" }}>{c.videos} 🎬</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* все задачи по дням */}
          <div className="v2-card" style={card}>
            <div className="flex items-center gap-2 flex-wrap">
              <b style={{ fontSize: 14 }}>Задачи{who ? ` · ${who}` : ""}{cid != null ? ` · ${clientOpts.find(c => c[0] === cid)?.[1] || ""}` : ""}{day ? ` · ${dayTitle(day)}` : ""}</b>
              <span style={{ fontSize: 12, color: "var(--t3)" }}>{rows.length} задач · клик по строке — полный текст</span>
            </div>
            {!rows.length && <div style={{ fontSize: 13, color: "var(--t3)", marginTop: 10 }}>Задач нет.</div>}
            {byDay.slice(0, showDays).map(([k, list]) => {
              const g = group(list, () => "d")[0];
              return (
                <div key={k} style={{ marginTop: 14 }}>
                  <div className="flex items-center gap-2 flex-wrap" style={{ padding: "6px 0", borderBottom: "1px solid var(--brd)" }}>
                    <b style={{ fontSize: 13.5 }}>{dayTitle(k)}</b>
                    <span style={{ fontSize: 12, color: "var(--t3)" }}>
                      {g.tasks} задач · {g.videos} роликов{g.error ? ` · ${g.error} ош.` : ""} · работа с {hm(g.first)} до {hm(g.last)}{!who && g.people > 1 ? ` · сотрудников ${g.people}` : ""}
                    </span>
                  </div>
                  {list.map(r => (
                    <div key={r.id} onClick={() => setOpen(open === r.id ? null : r.id)} style={{ borderBottom: "1px solid var(--brd)", padding: "7px 2px", cursor: "pointer" }}>
                      <div className="flex items-center gap-2" style={{ fontSize: 12.5 }}>
                        <span style={{ width: 42, color: "var(--t3)", flexShrink: 0 }}>{hm(r.at)}</span>
                        {!who && <span style={{ width: 130, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.who}</span>}
                        <b style={{ width: 140, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.client}</b>
                        <span style={{ width: 70, flexShrink: 0, color: "var(--t2)" }}>{THREAD[r.thread] || r.thread}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: open === r.id ? "normal" : "nowrap" }}>{r.text || "—"}</span>
                        <span style={{ width: 70, flexShrink: 0, color: STATUS[r.status]?.c }}>{STATUS[r.status]?.t || r.status}</span>
                        <span style={{ width: 54, flexShrink: 0, textAlign: "right" }}>{fmtMin(r.minutes)}</span>
                        <span style={{ width: 54, flexShrink: 0, textAlign: "right", color: "var(--t2)" }}>{r.videos ? `${r.videos}🎬` : ""}{r.images ? ` ${r.images}🖼` : ""}{!r.videos && !r.images && r.files ? r.files : ""}</span>
                      </div>
                      {open === r.id && r.error && <div style={{ fontSize: 12, color: "var(--rd)", margin: "4px 0 0 50px" }}>{r.error}</div>}
                    </div>
                  ))}
                </div>
              );
            })}
            {byDay.length > showDays && (
              <button onClick={() => setShowDays(n => n + 7)} className="v2-chip mut" style={{ cursor: "pointer", height: 32, padding: "0 14px", marginTop: 12 }}>Показать ещё дни ({byDay.length - showDays})</button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
            <div className="v2-card" style={card}>
              <b style={{ fontSize: 14 }}>Чаты и кнопки ИИ</b>
              <div style={{ marginTop: 10, display: "grid", gap: 9 }}>
                {threads.map(th => (
                  <div key={th.key}>
                    <div className="flex justify-between" style={{ fontSize: 13 }}><b>{THREAD[th.key] || th.key}</b><span style={{ color: "var(--t2)" }}>{th.tasks} задач · {th.videos} роликов · {fmtMin(th.avgMin)}</span></div>
                    <Bar v={th.tasks} max={t?.tasks || 1} color="var(--pu)" />
                  </div>
                ))}
                <div style={{ fontSize: 12.5, color: "var(--t2)", marginTop: 4 }}>
                  Быстрые кнопки ИИ (адаптация текста, подписи, отчёты) за период: <b>{d.quick.total}</b>
                  {Object.keys(d.quick.byKind).length > 0 && <span style={{ color: "var(--t3)" }}> · {Object.entries(d.quick.byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}</span>}
                </div>
              </div>
            </div>

            <div className="v2-card" style={card}>
              <div className="flex items-center gap-2">
                <Server size={15} /><b style={{ fontSize: 14 }}>Сервер ИИ</b>
                <span className={`v2-chip ${d.server.online ? "gr" : "rd"}`} style={{ height: 22, padding: "0 8px", fontSize: 11 }}>{d.server.online ? "работает" : s ? "нет связи" : "нет данных"}</span>
                {s && <span style={{ fontSize: 11, color: "var(--t3)" }}>обновлено {ago(s.at)}</span>}
              </div>
              {!s ? <div style={{ fontSize: 13, color: "var(--t3)", marginTop: 10 }}>Сервер ещё не прислал данные, они приходят раз в 5 минут.</div> : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 12 }}>
                    <div><div className="flex items-center gap-1" style={label}><HardDrive size={12} /> Диск</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: tone(diskPct) }}>{diskPct}%</div>
                      <Bar v={Number(s.disk_used_gb)} max={Number(s.disk_total_gb)} color={tone(diskPct)} />
                      <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3 }}>{Math.round(s.disk_used_gb)} из {Math.round(s.disk_total_gb)} ГБ</div></div>
                    <div><div className="flex items-center gap-1" style={label}><Bot size={12} /> Задач идёт</div>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>{s.running}</div>
                      <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3 }}>одновременно до 3 разных клиентов</div></div>
                    <div><div className="flex items-center gap-1" style={label}><Cpu size={12} /> Процессор</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: tone(loadPct, 85, 120) }}>{loadPct}%</div>
                      <Bar v={Math.min(Number(s.load1), Number(s.cpus))} max={Number(s.cpus)} color={tone(loadPct, 85, 120)} /></div>
                    <div><div className="flex items-center gap-1" style={label}><MemoryStick size={12} /> Память</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: tone(memPct) }}>{memPct}%</div>
                      <Bar v={s.mem_used_mb} max={s.mem_total_mb} color={tone(memPct)} /></div>
                  </div>
                  {hourly.length > 2 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={label}>Диск по часам</div>
                      <svg viewBox={`0 0 ${hourly.length} 40`} preserveAspectRatio="none" style={{ width: "100%", height: 46, display: "block", marginTop: 4 }}>
                        <polyline fill="none" stroke="var(--cy)" strokeWidth={0.6} vectorEffect="non-scaling-stroke"
                          points={hourly.map((h, i) => `${i},${40 - (h.disk / diskMax) * 38}`).join(" ")} />
                      </svg>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {errors.length > 0 && (
            <div className="v2-card" style={card}>
              <b style={{ fontSize: 14, color: "var(--rd)" }}>Ошибки</b>
              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                {errors.map(r => (
                  <div key={r.id} style={{ fontSize: 12.5 }}>
                    <span style={{ color: "var(--t3)" }}>{dm(localDay(r.at))}, {hm(r.at)}</span> · <b>{r.client}</b> · {r.who} · {THREAD[r.thread] || r.thread}
                    <div style={{ color: "var(--rd)" }}>{r.error}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
