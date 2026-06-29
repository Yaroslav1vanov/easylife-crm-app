"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, AnalyticsDaily, AnalyticsPost } from "@/lib/database";
import { getStore, setStore } from "@/lib/store";
import Avatar from "@/components/Avatar";
import {
  Camera, Music2, Play, AtSign, TrendingUp, Users, Eye, Heart, MessageCircle,
  ExternalLink, RefreshCw, Database, BarChart3, type LucideIcon,
} from "lucide-react";

const NETS: Record<string, { label: string; Icon: LucideIcon; color: string }> = {
  ig: { label: "Instagram", Icon: Camera, color: "#e1306c" },
  tt: { label: "TikTok", Icon: Music2, color: "#42d4f4" },
  yt: { label: "YouTube", Icon: Play, color: "#ff5c7a" },
  threads: { label: "Threads", Icon: AtSign, color: "#a8e063" },
};
const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n);
const RU_M = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const shortDate = (s: string | null) => { if (!s) return "—"; const d = new Date(s); return `${d.getDate()} ${RU_M[d.getMonth()]}`; };

// мини-спарклайн роста
function Spark({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return <div style={{ fontSize: 10, color: "var(--t3)", fontStyle: "italic" }}>копим историю…</div>;
  const w = 120, h = 32, min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const d = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - ((v - min) / span) * h}`).join(" ");
  return <svg width={w} height={h} style={{ display: "block" }}><polyline points={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

type Tab = "growth" | "posts" | "agency";

export default function AnalyticsPage() {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>(getStore().clients || []);
  const [daily, setDaily] = useState<AnalyticsDaily[]>([]);
  const [posts, setPosts] = useState<AnalyticsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("growth");
  const [clientFilter, setClientFilter] = useState<number | "all">("all");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    let cls = getStore().clients;
    if (!cls) { cls = await db.getClients(supabase); setStore({ clients: cls }); }
    setClients(cls);
    const r1 = await supabase.from("analytics_daily").select("*").order("snap_date", { ascending: true });
    const r2 = await supabase.from("analytics_posts").select("*").order("views", { ascending: false });
    if (r1.error && (r1.error.code === "42P01" || r1.error.code === "PGRST205" || /does not exist|schema cache/i.test(r1.error.message || ""))) setMissing(true);
    else { setDaily((r1.data || []) as AnalyticsDaily[]); setPosts((r2.data || []) as AnalyticsPost[]); setMissing(false); }
    setLoading(false);
  }
  async function refresh() {
    setRefreshing(true);
    try {
      const r = await fetch("/api/cron/metricool-snapshot");
      const j = await r.json();
      if (!r.ok) alert("Сбор: " + (j?.error || r.status));
      await load();
    } catch (e: any) { alert(String(e)); }
    setRefreshing(false);
  }

  const clientById = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])) as Record<number, Client>, [clients]);
  const activeWithBlog = useMemo(() => clients.filter(c => (c as any).metricool_blog_id != null), [clients]);
  const inScope = (cid: number) => clientFilter === "all" || cid === clientFilter;

  // серия followers по (клиент, сеть)
  const growth = useMemo(() => {
    const map: Record<string, { client_id: number; network: string; series: { date: string; v: number }[] }> = {};
    for (const d of daily) {
      if (d.followers == null) continue;
      const k = `${d.client_id}|${d.network}`;
      (map[k] ||= { client_id: d.client_id, network: d.network, series: [] }).series.push({ date: d.snap_date, v: d.followers });
    }
    return Object.values(map).filter(g => inScope(g.client_id));
  }, [daily, clientFilter]);

  const postsScoped = useMemo(() => posts.filter(p => inScope(p.client_id)).sort((a, b) => (b.views || 0) - (a.views || 0)), [posts, clientFilter]);

  const wrap: React.CSSProperties = { fontFamily: "'Manrope', sans-serif" };
  const card: React.CSSProperties = { background: "rgba(123,63,228,0.04)", border: "1px solid var(--brd)", borderRadius: 14, padding: 16 };

  return (
    <div style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Аналитика</h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>Данные из Metricool · обновляются автоматически раз в сутки</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            style={{ padding: "9px 12px", borderRadius: 10, background: "var(--inset2)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, fontWeight: 600 }}>
            <option value="all">Все клиенты</option>
            {activeWithBlog.map(c => <option key={c.id} value={c.id}>{c.name} {c.surname || ""}</option>)}
          </select>
          <button onClick={refresh} disabled={refreshing || missing}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, background: "rgba(66,212,244,0.1)", border: "1px solid var(--brd)", color: "var(--cy)", fontSize: 12, fontWeight: 700, cursor: missing ? "not-allowed" : "pointer" }}>
            <RefreshCw size={13} className={refreshing ? "spin" : ""} /> {refreshing ? "Собираю…" : "Собрать сейчас"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--brd)", marginBottom: 16 }}>
        {([["growth", "📈 Рост"], ["posts", "🎬 Перформанс постов"], ["agency", "🏆 Сводка по агентству"]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: "9px 14px", border: "none", borderBottom: tab === id ? "2px solid var(--pu)" : "2px solid transparent", background: "transparent", color: tab === id ? "var(--pu)" : "var(--t3)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      {loading ? <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>
      : missing ? (
        <div style={{ padding: 24, borderRadius: 14, border: "1px solid rgba(255,174,66,0.4)", background: "rgba(255,174,66,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, marginBottom: 8 }}><Database size={16} style={{ color: "var(--or)" }} /> Таблицы аналитики ещё не созданы</div>
          <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6 }}>Прогони миграцию <code style={{ background: "var(--inset)", padding: "1px 6px", borderRadius: 5 }}>MIGRATION_2026-06-29_analytics.sql</code> в Supabase → SQL Editor. Затем нажми «Собрать сейчас».</div>
        </div>
      ) : activeWithBlog.length === 0 ? (
        <div style={{ ...card, color: "var(--t2)", fontSize: 13 }}>Ни у одного клиента не указан <b>metricool_blog_id</b>. Открой раздел Metricool → «Мои бренды», скопируй blogId и впиши в карточку клиента — тогда здесь появятся данные.</div>
      ) : (
        <>
          {/* ── РОСТ ── */}
          {tab === "growth" && (
            growth.length === 0 ? <Empty /> :
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {growth.map(g => {
                const c = clientById[g.client_id]; const net = NETS[g.network] || NETS.ig;
                const last = g.series[g.series.length - 1].v, first = g.series[0].v, delta = last - first;
                return (
                  <div key={`${g.client_id}-${g.network}`} style={card}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      {c && <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={26} />}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c?.name} {c?.surname || ""}</div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: net.color }}><net.Icon size={11} /> {net.label}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 24, fontWeight: 800 }}>{fmt(last)}</div>
                        <div style={{ fontSize: 11, color: delta > 0 ? "var(--gr)" : delta < 0 ? "#ff5c7a" : "var(--t3)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <TrendingUp size={11} /> {delta >= 0 ? "+" : ""}{fmt(delta)} подписчиков
                        </div>
                      </div>
                      <Spark points={g.series.map(s => s.v)} color={net.color} />
                    </div>
                    <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 6 }}>{shortDate(g.series[0].date)} → {shortDate(g.series[g.series.length - 1].date)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── ПОСТЫ ── */}
          {tab === "posts" && (
            postsScoped.length === 0 ? <Empty /> :
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--inset)", color: "var(--t3)", textAlign: "left" }}>
                    <th style={th}>Пост</th>
                    <th style={th}>Сеть</th>
                    <th style={thN}><Eye size={12} /></th>
                    <th style={thN}><Heart size={12} /></th>
                    <th style={thN}><MessageCircle size={12} /></th>
                    <th style={thN}>ER</th>
                    <th style={thN}>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {postsScoped.slice(0, 100).map(p => {
                    const c = clientById[p.client_id]; const net = NETS[p.network] || NETS.ig;
                    const er = p.engagement != null ? (p.engagement < 1 ? (p.engagement * 100).toFixed(1) : p.engagement.toFixed(1)) + "%" : "—";
                    return (
                      <tr key={p.id} style={{ borderTop: "1px solid var(--brd)" }}>
                        <td style={{ padding: "8px 12px", maxWidth: 340 }}>
                          <a href={p.url || "#"} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--t1)", textDecoration: "none" }}>
                            {p.thumbnail_url ? <img src={p.thumbnail_url} alt="" style={{ width: 34, height: 44, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} /> : <div style={{ width: 34, height: 44, borderRadius: 6, background: "var(--inset2)", flexShrink: 0 }} />}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.3 }}>{p.content?.slice(0, 90) || <span style={{ color: "var(--t3)" }}>{clientFilter === "all" ? (c ? c.name : "пост") : "без подписи"}</span>}</span>
                            <ExternalLink size={11} style={{ color: "var(--t3)", flexShrink: 0 }} />
                          </a>
                        </td>
                        <td style={td}><net.Icon size={14} style={{ color: net.color }} /></td>
                        <td style={tdN}><b>{fmt(p.views)}</b></td>
                        <td style={tdN}>{fmt(p.likes)}</td>
                        <td style={tdN}>{fmt(p.comments)}</td>
                        <td style={tdN}>{er}</td>
                        <td style={{ ...tdN, color: "var(--t3)", fontSize: 11 }}>{shortDate(p.published_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── АГЕНТСТВО ── */}
          {tab === "agency" && <Agency clients={activeWithBlog} daily={daily} posts={posts} clientById={clientById} />}
        </>
      )}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 700 };
const thN: React.CSSProperties = { padding: "10px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 12px" };
const tdN: React.CSSProperties = { padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

function Empty() {
  return <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--t3)", fontSize: 13 }}>
    <BarChart3 size={28} style={{ opacity: 0.4, marginBottom: 8 }} /><br />Данных пока нет. Нажми «Собрать сейчас» — снапшот появится, а кривая роста наполнится за несколько дней.
  </div>;
}

function Agency({ clients, daily, posts, clientById }: { clients: Client[]; daily: AnalyticsDaily[]; posts: AnalyticsPost[]; clientById: Record<number, Client> }) {
  // последний снапшот по (клиент, сеть), followers суммируем по сетям
  const seen: Record<string, string> = {};
  for (const d of daily) {
    if (d.followers == null) continue;
    const k = `${d.client_id}|${d.network}`;
    if (!seen[k] || d.snap_date > seen[k]) seen[k] = d.snap_date;
  }
  const latestByClient: Record<number, number> = {};
  for (const d of daily) {
    const k = `${d.client_id}|${d.network}`;
    if (d.followers != null && d.snap_date === seen[k]) latestByClient[d.client_id] = (latestByClient[d.client_id] || 0) + d.followers;
  }
  const totalFollowers = Object.values(latestByClient).reduce((a, b) => a + b, 0);
  const totalReach = daily.reduce((a, d) => a + (d.reach || 0), 0);
  const bestPosts = [...posts].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 8);
  const stat: React.CSSProperties = { background: "rgba(123,63,228,0.04)", border: "1px solid var(--brd)", borderRadius: 14, padding: 16 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div style={stat}><div style={{ fontSize: 11, color: "var(--t3)", display: "flex", alignItems: "center", gap: 5 }}><Users size={13} /> Подписчиков всего</div><div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 26, fontWeight: 800, marginTop: 6 }}>{fmt(totalFollowers)}</div></div>
        <div style={stat}><div style={{ fontSize: 11, color: "var(--t3)", display: "flex", alignItems: "center", gap: 5 }}><Eye size={13} /> Охват (накоплено)</div><div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 26, fontWeight: 800, marginTop: 6 }}>{fmt(totalReach)}</div></div>
        <div style={stat}><div style={{ fontSize: 11, color: "var(--t3)", display: "flex", alignItems: "center", gap: 5 }}><BarChart3 size={13} /> Клиентов на трекинге</div><div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 26, fontWeight: 800, marginTop: 6 }}>{clients.length}</div></div>
        <div style={stat}><div style={{ fontSize: 11, color: "var(--t3)", display: "flex", alignItems: "center", gap: 5 }}><Play size={13} /> Постов в базе</div><div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 26, fontWeight: 800, marginTop: 6 }}>{fmt(posts.length)}</div></div>
      </div>

      <div style={stat}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>🏆 Лучшие посты</div>
        {bestPosts.length === 0 ? <div style={{ color: "var(--t3)", fontSize: 12 }}>Постов пока нет.</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {bestPosts.map(p => {
              const c = clientById[p.client_id]; const net = NETS[p.network] || NETS.ig;
              return (
                <a key={p.id} href={p.url || "#"} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "var(--t1)", background: "var(--inset2)", border: "1px solid var(--track)", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <div style={{ position: "relative", aspectRatio: "1/1", background: "var(--inset)" }}>
                    {p.thumbnail_url && <img src={p.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    <span style={{ position: "absolute", top: 6, left: 6, background: "rgba(0,0,0,0.6)", borderRadius: 5, padding: "2px 5px" }}><net.Icon size={11} style={{ color: net.color }} /></span>
                  </div>
                  <div style={{ padding: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 800 }}><Eye size={12} style={{ color: "var(--t3)" }} /> {fmt(p.views)}</div>
                    <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c?.name} · {fmt(p.likes)}❤ {fmt(p.comments)}💬</div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
