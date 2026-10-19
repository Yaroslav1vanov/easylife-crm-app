"use client";
import { useEffect, useState } from "react";
import { useIsOwner } from "@/components/RoleContext";
import Avatar from "@/components/Avatar";
import { Bot, Film, AlertTriangle, Clock, Users, Server, HardDrive, Cpu, MemoryStick, CircleDollarSign } from "lucide-react";

/* ИИ-чат: аналитика (видит только владелец). Что сотрудники делают через ИИ-исполнителя:
   задачи по дням, кто сколько ставит, смонтированные ролики, ошибки, время, условная стоимость,
   по клиентам и чатам; и состояние сервера — диск, нагрузка, сколько задач идёт прямо сейчас. */

type G = { key: string; tasks: number; done: number; error: number; working: number; videos: number; images: number; avgMin: number | null; cost: number; clients: number; people: number; last: string; name?: string; avatar?: string | null };
type Row = { id: number; client: string; avatar: string | null; who: string; thread: string; status: string; error: string | null; at: string; minutes: number | null; cost: number | null; videos: number; images: number; files: number; text: string };
type Data = {
  days: number; total: G; today: { tasks: number; videos: number; error: number };
  timeline: { day: string; tasks: number; done: number; error: number; videos: number }[];
  people: G[]; clients: G[]; threads: G[]; errors: Row[]; recent: Row[];
  server: { last: any; online: boolean; hourly: { at: string; disk: number; load: number; run: number }[] };
  quick: { total: number; byKind: Record<string, number> };
};

const THREAD: Record<string, string> = { reels: "Рилсы", stories: "Сторис", strategy: "Стратегия" };
const STATUS: Record<string, { t: string; c: string }> = { done: { t: "готово", c: "var(--gr)" }, error: { t: "ошибка", c: "var(--rd)" }, working: { t: "в работе", c: "var(--cy)" }, queued: { t: "в очереди", c: "var(--t3)" } };
const fmtMin = (m: number | null) => (m == null ? "—" : m < 1 ? "<1 мин" : m < 60 ? `${Math.round(m)} мин` : `${Math.floor(m / 60)} ч ${Math.round(m % 60)} мин`);
const ago = (iso: string) => { const m = (Date.now() - Date.parse(iso)) / 60000; return m < 60 ? `${Math.round(m)} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн назад`; };
const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const tm = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const card: React.CSSProperties = { padding: 16, marginBottom: 14 };
const label: React.CSSProperties = { fontSize: 11, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 };

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

  useEffect(() => {
    if (!isOwner) return;
    setErr("");
    fetch(`/api/admin/ai-usage?days=${days}`).then(r => r.json()).then(j => (j.error ? setErr(j.error) : setD(j))).catch(e => setErr(String(e)));
  }, [days, isOwner]);

  if (!isOwner) return <div style={{ padding: 40, color: "var(--t3)" }}>Раздел доступен только владельцу.</div>;

  const t = d?.total;
  const maxDay = Math.max(1, ...(d?.timeline || []).map(x => x.tasks));
  const s = d?.server.last;
  const diskPct = s ? Math.round((Number(s.disk_used_gb) / Number(s.disk_total_gb)) * 100) : null;
  const loadPct = s && s.cpus ? Math.round((Number(s.load1) / Number(s.cpus)) * 100) : null;
  const memPct = s && s.mem_total_mb ? Math.round((s.mem_used_mb / s.mem_total_mb) * 100) : null;
  const tone = (p: number | null, warn = 80, bad = 92) => (p == null ? "var(--t3)" : p >= bad ? "var(--rd)" : p >= warn ? "var(--or)" : "var(--gr)");
  const hourly = d?.server.hourly || [];
  const diskMax = Math.max(1, ...hourly.map(h => h.disk), Number(s?.disk_total_gb) || 1);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", paddingBottom: 40 }}>
      <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 14 }}>
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

      {err && <div className="v2-card" style={{ ...card, color: "var(--rd)" }}>{err}</div>}
      {!d && !err && <div style={{ color: "var(--t3)" }}>Загружаю…</div>}

      {d && t && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
            <Kpi icon={Bot} title="Задач ИИ" value={String(t.tasks)} sub={`сегодня ${d.today.tasks}`} />
            <Kpi icon={Film} title="Роликов смонтировано" value={String(t.videos)} sub={`сегодня ${d.today.videos} · картинок ${t.images}`} color="var(--gr)" />
            <Kpi icon={AlertTriangle} title="Ошибок" value={String(t.error)} sub={t.tasks ? `${Math.round((t.error / t.tasks) * 100)}% задач` : "—"} color={t.error ? "var(--rd)" : undefined} />
            <Kpi icon={Clock} title="Время задачи" value={fmtMin(t.avgMin)} sub="в среднем на готовую" />
            <Kpi icon={Users} title="Работали с ИИ" value={String(t.people)} sub={`сотрудников · клиентов ${t.clients}`} />
            <Kpi icon={CircleDollarSign} title="Условный расход" value={`$${t.cost.toFixed(0)}`} sub="по ценам API; платим подпиской" />
          </div>

          <div className="v2-card" style={card}>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <b style={{ fontSize: 14 }}>Задачи по дням</b>
              <span style={{ fontSize: 12, color: "var(--t3)" }}>
                <span style={{ color: "var(--pu)" }}>■</span> готово · <span style={{ color: "var(--rd)" }}>■</span> ошибка · цифра сверху — ролики
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 150 }}>
              {d.timeline.map(x => (
                <div key={x.day} title={`${dm(x.day)}: задач ${x.tasks}, готово ${x.done}, ошибок ${x.error}, роликов ${x.videos}`}
                  style={{ flex: 1, minWidth: 4, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                  {x.videos > 0 && d.timeline.length <= 31 && <div style={{ fontSize: 9, color: "var(--gr)", textAlign: "center", fontWeight: 800 }}>{x.videos}</div>}
                  <div style={{ height: `${(x.error / maxDay) * 100}%`, background: "var(--rd)", borderRadius: "2px 2px 0 0" }} />
                  <div style={{ height: `${((x.tasks - x.error) / maxDay) * 100}%`, background: "var(--pu)", opacity: 0.85, borderRadius: x.error ? 0 : "2px 2px 0 0" }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between" style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 4 }}>
              <span>{dm(d.timeline[0]?.day || "")}</span><span>{dm(d.timeline.at(-1)?.day || "")}</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
            <div className="v2-card" style={card}>
              <b style={{ fontSize: 14 }}>Сотрудники</b>
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {d.people.map(p => (
                  <div key={p.key}>
                    <div className="flex items-center gap-2" style={{ fontSize: 13 }}>
                      <b style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.key}</b>
                      <span style={{ color: "var(--t2)" }}>{p.tasks} задач</span>
                      <span style={{ color: "var(--gr)" }}>{p.videos} 🎬</span>
                      {p.error > 0 && <span style={{ color: "var(--rd)" }}>{p.error} ош.</span>}
                    </div>
                    <Bar v={p.tasks} max={d.people[0]?.tasks || 1} color="var(--pu)" />
                    <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3 }}>клиентов {p.clients} · в среднем {fmtMin(p.avgMin)} · последняя {ago(p.last)}</div>
                  </div>
                ))}
                {!d.people.length && <div style={{ fontSize: 13, color: "var(--t3)" }}>За период задач не было.</div>}
              </div>
            </div>

            <div className="v2-card" style={card}>
              <b style={{ fontSize: 14 }}>Клиенты</b>
              <div style={{ marginTop: 10, display: "grid", gap: 9, maxHeight: 420, overflowY: "auto" }}>
                {d.clients.map(c => (
                  <div key={c.key} className="flex items-center gap-2" style={{ fontSize: 13 }}>
                    <Avatar name={c.name || ""} src={c.avatar || null} size={22} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>{c.name}</span>
                      <Bar v={c.tasks} max={d.clients[0]?.tasks || 1} color="var(--cy)" />
                    </span>
                    <span style={{ width: 70, textAlign: "right", color: "var(--t2)" }}>{c.tasks} задач</span>
                    <span style={{ width: 44, textAlign: "right", color: "var(--gr)" }}>{c.videos} 🎬</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
            <div className="v2-card" style={card}>
              <b style={{ fontSize: 14 }}>Чаты и кнопки ИИ</b>
              <div style={{ marginTop: 10, display: "grid", gap: 9 }}>
                {d.threads.sort((a, b) => b.tasks - a.tasks).map(th => (
                  <div key={th.key}>
                    <div className="flex justify-between" style={{ fontSize: 13 }}><b>{THREAD[th.key] || th.key}</b><span style={{ color: "var(--t2)" }}>{th.tasks} задач · {th.videos} роликов · {fmtMin(th.avgMin)}</span></div>
                    <Bar v={th.tasks} max={t.tasks} color="var(--pu)" />
                  </div>
                ))}
                <div style={{ fontSize: 12.5, color: "var(--t2)", marginTop: 4 }}>
                  Быстрые кнопки ИИ (адаптация текста, подписи, отчёты): <b>{d.quick.total}</b>
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

          {d.errors.length > 0 && (
            <div className="v2-card" style={card}>
              <b style={{ fontSize: 14, color: "var(--rd)" }}>Ошибки</b>
              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                {d.errors.map(r => (
                  <div key={r.id} style={{ fontSize: 12.5 }}>
                    <span style={{ color: "var(--t3)" }}>{tm(r.at)}</span> · <b>{r.client}</b> · {r.who} · {THREAD[r.thread] || r.thread}
                    <div style={{ color: "var(--rd)" }}>{r.error}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="v2-card" style={card}>
            <b style={{ fontSize: 14 }}>Последние задачи</b>
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
                <thead><tr style={{ color: "var(--t3)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {["Когда", "Кто", "Клиент", "Чат", "Задача", "Статус", "Время", "Файлы"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontWeight: 800 }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {d.recent.map(r => (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--brd)" }}>
                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap", color: "var(--t3)" }}>{tm(r.at)}</td>
                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>{r.who}</td>
                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap", fontWeight: 700 }}>{r.client}</td>
                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap", color: "var(--t2)" }}>{THREAD[r.thread] || r.thread}</td>
                      <td style={{ padding: "7px 8px", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.text}>{r.text || "—"}</td>
                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap", color: STATUS[r.status]?.c }}>{STATUS[r.status]?.t || r.status}</td>
                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>{fmtMin(r.minutes)}</td>
                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap", color: "var(--t2)" }}>{r.videos ? `${r.videos} 🎬 ` : ""}{r.images ? `${r.images} 🖼` : ""}{!r.videos && !r.images ? (r.files || "—") : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
