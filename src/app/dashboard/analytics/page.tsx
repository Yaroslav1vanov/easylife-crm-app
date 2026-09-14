"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, TeamMember } from "@/lib/database";
import { myClients } from "@/lib/scope";
import { useRole } from "@/components/RoleContext";
import Avatar from "@/components/Avatar";
import ClientStatsTab from "@/components/ClientStatsTab";
import { TrendingUp, TrendingDown, ExternalLink, X, BarChart3 } from "lucide-react";

/* Аналитика агентства: итоги по всем подключённым клиентам из client_monthly_stats
   (та же база, что вкладка «Статистика» в карточке). Сравнение месяц к месяцу,
   рейтинг клиентов, лучшие ролики агентства. Клиент открывается окном — без Metricool. */

type Row = {
  client_id: number; ym: string; network: string; posts_count: number | null;
  views: number | null; reach: number | null; likes: number | null; comments: number | null;
  saves: number | null; shares: number | null; top_posts: any[] | null;
  carousels_count: number | null; carousel_views: number | null; our_videos: number | null;
};
type Totals = { posts: number; views: number; reach: number; likes: number; comments: number; saves: number; shares: number; our: number; carousels: number };

const NETS = [
  { id: "all", label: "Все сети", color: "var(--pu)" },
  { id: "instagram", label: "Instagram", color: "#e1306c" },
  { id: "tiktok", label: "TikTok", color: "#42d4f4" },
  { id: "youtube", label: "YouTube", color: "#ff5c7a" },
  { id: "facebook", label: "Facebook", color: "#5b8cff" },
];
const NET_COLOR: Record<string, string> = Object.fromEntries(NETS.map(n => [n.id, n.color]));
const NET_LABEL: Record<string, string> = Object.fromEntries(NETS.map(n => [n.id, n.label]));
const RU_M = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const ymLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${RU_M[m - 1]} ${y}`; };
const ymShort = (ym: string) => RU_M[Number(ym.slice(5, 7)) - 1].slice(0, 3);
const curYm = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const fmt = (v: number | null | undefined) => {
  if (v == null) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(".0", "") + " млн";
  if (v >= 10_000) return Math.round(v / 1000) + " тыс";
  return v.toLocaleString("ru-RU");
};
/** Роликов за месяц: одно и то же видео публикуется в Instagram и TikTok, поэтому берём сеть, где их больше. */
const maxPosts = (list: Row[]) => list.reduce((m, r) => Math.max(m, r.posts_count || 0), 0);
const pct = (cur: number, prev: number | undefined) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);
const zero = (): Totals => ({ posts: 0, views: 0, reach: 0, likes: 0, comments: 0, saves: 0, shares: 0, our: 0, carousels: 0 });
const addRow = (t: Totals, r: Row) => {
  // ролики сюда не суммируем: одно видео выходит в нескольких сетях — см. maxPosts
  t.carousels += r.carousels_count || 0; t.views += r.views || 0; t.reach += r.reach || 0; t.likes += r.likes || 0;
  t.comments += r.comments || 0; t.saves += r.saves || 0; t.shares += r.shares || 0;
};

export default function AnalyticsPage() {
  const supabase = createClient();
  const router = useRouter();
  const role = useRole();
  const [clients, setClients] = useState<Client[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [net, setNet] = useState("all");
  const [withPaused, setWithPaused] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [openBrand, setOpenBrand] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); load(); }, []);
  async function load() {
    const [cls, tm] = await Promise.all([db.getClients(supabase), db.getTeam(supabase)]);
    const { data: { session } } = await supabase.auth.getSession();
    const me = session?.user?.id ? (tm as TeamMember[]).find(t => t.profile_id === session.user.id) || null : null;
    const mine = myClients(role, me, cls).filter(c => (c as any).metricool_blog_id != null);
    setClients(mine);
    if (mine.length) {
      const { data } = await supabase.from("client_monthly_stats")
        .select("client_id, ym, network, posts_count, views, reach, likes, comments, saves, shares, top_posts, carousels_count, carousel_views, our_videos")
        .in("client_id", mine.map(c => c.id)).order("ym");
      setRows((data || []) as Row[]);
    }
    setLoading(false);
  }

  const visibleClients = useMemo(
    () => clients.filter(c => c.stage !== "churned" && (withPaused || c.stage !== "paused")),
    [clients, withPaused]
  );

  // Бренд = один аккаунт Metricool. Два клиента на одном бренде (Иван Панченко TikTok / Instagram)
  // показываем одной строкой и считаем один раз — иначе охват агентства удваивается.
  const brands = useMemo(() => {
    const by = new Map<number, Client[]>();
    for (const c of visibleClients) {
      const b = Number((c as any).metricool_blog_id);
      by.set(b, [...(by.get(b) || []), c]);
    }
    return Array.from(by.entries()).map(([blog, list]) => ({
      blog, clients: list, lead: list[0],
      name: list.length === 1
        ? `${list[0].name} ${list[0].surname || ""}`.trim()
        : `${list[0].name} ${list[0].surname || ""}`.trim().replace(/\s+(Тик-ток|Инстаграм|TikTok|Instagram)$/i, "") + ` · ${list.length} аккаунта`,
    }));
  }, [visibleClients]);

  // строки статистики по брендам, отфильтрованные по сети
  const brandRows = useMemo(() => {
    const m = new Map<number, Row[]>();
    for (const b of brands) {
      m.set(b.blog, rows.filter(r => r.client_id === b.lead.id && (net === "all" || r.network === net)));
    }
    return m;
  }, [brands, rows, net]);

  const months = useMemo(() => Array.from(new Set(rows.map(r => r.ym))).sort(), [rows]);

  // «Наших» роликов — по CRM, у каждого клиента бренда своя цифра (Панченко TikTok и Instagram — отдельно)
  const ourOf = (b: { clients: Client[] }, ym: string) =>
    b.clients.reduce((s, c) => s + rows.filter(r => r.client_id === c.id && r.ym === ym).reduce((m, r) => Math.max(m, r.our_videos || 0), 0), 0);

  // итоги агентства по месяцам; одинаковые данные разных брендов (общий канал) считаем один раз
  const monthly = useMemo(() => {
    return months.map(ym => {
      const t = zero(); const byNet: Record<string, number> = {};
      const seen = new Set<string>();
      let active = 0;
      for (const b of brands) {
        const list = (brandRows.get(b.blog) || []).filter(r => r.ym === ym);
        if (list.some(r => (r.posts_count || 0) > 0)) active++;
        for (const r of list) {
          const fp = `${r.network}|${r.posts_count}|${r.views}|${r.likes}`;
          if ((r.views || 0) > 0 && seen.has(fp)) continue;
          seen.add(fp);
          addRow(t, r);
          byNet[r.network] = (byNet[r.network] || 0) + (r.views || 0);
        }
        t.posts += maxPosts(list);
        t.our += ourOf(b, ym);
      }
      return { ym, t, byNet, active, partial: ym === curYm() };
    });
  }, [months, brands, brandRows]);

  // по умолчанию — последний полный месяц: сравнивать неполный сентябрь с полным августом бессмысленно
  useEffect(() => {
    if (!monthly.length || (sel && monthly.find(m => m.ym === sel))) return;
    const full = monthly.filter(m => !m.partial);
    setSel((full.length ? full[full.length - 1] : monthly[monthly.length - 1]).ym);
  }, [monthly]);

  const i = monthly.findIndex(m => m.ym === sel);
  const cur = monthly[i];
  const prev = i > 0 ? monthly[i - 1] : undefined;
  const maxViews = Math.max(1, ...monthly.map(m => m.t.views));

  // рейтинг брендов за выбранный месяц
  const board = useMemo(() => {
    if (!sel) return [];
    const pi = months.indexOf(sel) - 1;
    const prevYm = pi >= 0 ? months[pi] : null;
    return brands.map(b => {
      const list = brandRows.get(b.blog) || [];
      const inSel = list.filter(r => r.ym === sel);
      const t = zero(); inSel.forEach(r => addRow(t, r));
      t.posts = maxPosts(inSel); t.our = ourOf(b, sel);
      const p = zero(); list.filter(r => r.ym === prevYm).forEach(r => addRow(p, r));
      const spark = months.map(ym => list.filter(r => r.ym === ym).reduce((s, r) => s + (r.views || 0), 0));
      const nets = Array.from(new Set(list.filter(r => r.ym === sel && (r.posts_count || 0) > 0).map(r => r.network)));
      return { ...b, t, prevViews: p.views, spark, nets };
    }).sort((a, b) => b.t.views - a.t.views);
  }, [brands, brandRows, sel, months]);

  // лучшие ролики агентства за месяц
  const topReels = useMemo(() => {
    if (!sel) return [];
    const nameOf = new Map(brands.map(b => [b.lead.id, b.name]));
    const avatarOf = new Map(brands.map(b => [b.lead.id, b.lead]));
    const seen = new Set<string>();
    return rows.filter(r => r.ym === sel && nameOf.has(r.client_id) && (net === "all" || r.network === net))
      .flatMap(r => (r.top_posts || []).map(p => ({ ...p, network: r.network, client: nameOf.get(r.client_id)!, lead: avatarOf.get(r.client_id)! })))
      .filter(p => { const k = p.url || `${p.client}|${p.title}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10);
  }, [rows, sel, brands, net]);

  const openB = brands.find(b => b.blog === openBrand);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;

  const Tile = ({ label, v, p, big }: { label: string; v: number; p: number | null; big?: boolean }) => (
    <div style={{ padding: big ? "16px 18px" : "13px 14px", borderRadius: 14, background: big ? "linear-gradient(135deg, rgba(66,212,244,0.10), rgba(157,107,255,0.12))" : "var(--inset)", border: `1px solid ${big ? "rgba(157,107,255,0.35)" : "var(--brd)"}`, gridColumn: big ? "span 2" : undefined }}>
      <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: big ? 30 : 20, fontWeight: 800, color: "var(--t1)", marginTop: 6, lineHeight: 1.05 }}>{fmt(v)}</div>
      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 5, display: "flex", alignItems: "center", gap: 4, color: p == null ? "var(--t3)" : p >= 0 ? "var(--gr)" : "var(--rd)" }}>
        {p == null ? "нет сравнения" : <>{p >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{p >= 0 ? "+" : ""}{p}% к прошлому месяцу</>}
      </div>
    </div>
  );

  const Spark = ({ data }: { data: number[] }) => {
    const max = Math.max(1, ...data), w = 84, h = 26;
    const pts = data.map((v, k) => `${data.length === 1 ? w / 2 : (k / (data.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(" ");
    return <svg width={w} height={h} style={{ display: "block" }}><polyline points={pts} fill="none" stroke="var(--pu)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" /></svg>;
  };

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Аналитика агентства</h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>
            {brands.length} {brands.length === 1 ? "аккаунт" : brands.length < 5 ? "аккаунта" : "аккаунтов"} в Metricool · данные с {months[0] ? ymLabel(months[0]) : "—"} · клик по клиенту — его статистика
          </p>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--t2)", cursor: "pointer" }}>
          <input type="checkbox" checked={withPaused} onChange={e => setWithPaused(e.target.checked)} /> включая клиентов на паузе
        </label>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {NETS.map(n => (
          <button key={n.id} onClick={() => setNet(n.id)} className={`v2-chip ${net === n.id ? "pu" : "mut"}`} style={{ height: 32, padding: "0 13px", cursor: "pointer" }}>
            {n.id !== "all" && <span style={{ width: 7, height: 7, borderRadius: 4, background: n.color, display: "inline-block", marginRight: 6 }} />}{n.label}
          </button>
        ))}
      </div>

      {!monthly.length ? (
        <div className="card" style={{ padding: 24, borderRadius: 14, color: "var(--t2)", fontSize: 13, lineHeight: 1.6 }}>
          Статистики пока нет. Она собирается автоматически 1-го числа, а по клиенту её можно собрать кнопкой «Обновить» во вкладке «Статистика» его карточки.
        </div>
      ) : (<>
        {/* итоги месяца */}
        {cur && (<>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>
            {ymLabel(cur.ym)}{cur.partial ? " · на сегодня, месяц ещё идёт" : ""}
            {prev && <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600 }}> · сравнение с {ymLabel(prev.ym)}</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            <Tile big label="Просмотры по агентству" v={cur.t.views} p={pct(cur.t.views, prev?.t.views)} />
            <Tile label="Клиентов с публикациями" v={cur.active} p={pct(cur.active, prev?.active)} />
            <Tile label="Роликов вышло" v={cur.t.posts} p={pct(cur.t.posts, prev?.t.posts)} />
            <Tile label="Из них наших · по CRM" v={cur.t.our} p={pct(cur.t.our, prev?.t.our)} />
            {cur.t.carousels > 0 && <Tile label="Карусели и фото" v={cur.t.carousels} p={pct(cur.t.carousels, prev?.t.carousels)} />}
            <Tile label="Охват" v={cur.t.reach} p={pct(cur.t.reach, prev?.t.reach)} />
            <Tile label="Лайки" v={cur.t.likes} p={pct(cur.t.likes, prev?.t.likes)} />
            <Tile label="Комментарии" v={cur.t.comments} p={pct(cur.t.comments, prev?.t.comments)} />
            <Tile label="Сохранения" v={cur.t.saves} p={pct(cur.t.saves, prev?.t.saves)} />
            <Tile label="Репосты" v={cur.t.shares} p={pct(cur.t.shares, prev?.t.shares)} />
          </div>
        </>)}

        {/* динамика по месяцам, столбцы разбиты по сетям */}
        <div className="card" style={{ padding: 18, borderRadius: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--t1)" }}>Просмотры агентства по месяцам · клик по столбцу — выбрать месяц</div>
            {net === "all" && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {NETS.slice(1).filter(n => monthly.some(m => m.byNet[n.id])).map(n => (
                  <span key={n.id} style={{ fontSize: 10.5, color: "var(--t2)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: n.color }} />{n.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 200 }}>
            {monthly.map(m => {
              const h = Math.max(4, Math.round((m.t.views / maxViews) * 160));
              const on = m.ym === sel;
              const parts = NETS.slice(1).map(n => ({ c: n.color, v: m.byNet[n.id] || 0 })).filter(x => x.v > 0);
              return (
                <button key={m.ym} onClick={() => setSel(m.ym)} style={{ flex: 1, minWidth: 40, maxWidth: 110, background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: on ? "var(--t1)" : "var(--t3)" }}>{fmt(m.t.views)}</span>
                  <div style={{ width: "100%", height: h, borderRadius: "7px 7px 3px 3px", overflow: "hidden", display: "flex", flexDirection: "column-reverse",
                    outline: on ? "2px solid var(--pu)" : m.partial ? "1px dashed var(--pu)" : "none", outlineOffset: 2, opacity: on ? 1 : m.partial ? 0.5 : 0.78 }}>
                    {parts.length ? parts.map((x, k) => <div key={k} style={{ height: `${(x.v / Math.max(1, m.t.views)) * 100}%`, background: x.c }} />)
                      : <div style={{ height: "100%", background: "rgba(157,107,255,0.3)" }} />}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: on ? "var(--pu)" : "var(--t3)" }}>{ymShort(m.ym)}{m.partial ? "*" : ""}</span>
                </button>
              );
            })}
          </div>
          {monthly.some(m => m.partial) && <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 10 }}>* текущий месяц — на сегодня</div>}
        </div>

        <div className="an-split">
          {/* рейтинг клиентов */}
          <div className="card" style={{ padding: 0, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", fontSize: 12.5, fontWeight: 800, color: "var(--t1)", borderBottom: "1px solid var(--brd)" }}>
              Клиенты · {sel ? ymLabel(sel) : ""} <span style={{ color: "var(--t3)", fontWeight: 600 }}>· по просмотрам</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620, fontSize: 12.5 }}>
                <thead><tr style={{ color: "var(--t3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {["#", "Клиент", "Роликов", "Просмотры", "Охват", "Динамика", ""].map((h, k) => (
                    <th key={k} style={{ textAlign: k >= 2 && k <= 4 ? "right" : "left", padding: "10px 12px", fontWeight: 800 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {board.map((b, k) => {
                    const d = pct(b.t.views, b.prevViews);
                    const share = cur?.t.views ? Math.round((b.t.views / cur.t.views) * 100) : 0;
                    return (
                      <tr key={b.blog} onClick={() => setOpenBrand(b.blog)} className="an-row" style={{ borderTop: "1px solid var(--brd)", cursor: "pointer" }}>
                        <td style={{ padding: "10px 12px", fontFamily: "'Unbounded', sans-serif", fontWeight: 800, color: k < 3 && b.t.views ? "var(--yl)" : "var(--t3)", width: 34 }}>{k + 1}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <Avatar name={b.name} src={b.lead.avatar_url} size={30} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{b.name}</div>
                              <div style={{ fontSize: 10.5, color: "var(--t3)", display: "flex", gap: 5, alignItems: "center", marginTop: 2 }}>
                                {b.nets.map(n => <span key={n} style={{ width: 7, height: 7, borderRadius: 4, background: NET_COLOR[n] }} title={NET_LABEL[n]} />)}
                                {b.t.views ? <span>{share}% просмотров агентства</span> : <span>нет публикаций</span>}
                                {b.lead.stage === "paused" && <span style={{ color: "var(--or)" }}>· на паузе</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {b.t.posts || "—"}
                          {b.t.our > 0 && <div style={{ fontSize: 10.5, color: "var(--t3)" }}>наших {b.t.our}</div>}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: "var(--t1)", whiteSpace: "nowrap" }}>
                          {fmt(b.t.views)}
                          {d != null && <div style={{ fontSize: 10.5, fontWeight: 700, color: d >= 0 ? "var(--gr)" : "var(--rd)" }}>{d >= 0 ? "+" : ""}{d}%</div>}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(b.t.reach || null)}</td>
                        <td style={{ padding: "10px 12px" }}><Spark data={b.spark} /></td>
                        <td style={{ padding: "10px 12px", color: "var(--t3)" }}><BarChart3 size={14} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* лучшие ролики агентства */}
          <div className="card" style={{ padding: 16, borderRadius: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--t1)", marginBottom: 12 }}>Лучшие ролики агентства</div>
            {!topReels.length && <div style={{ fontSize: 12, color: "var(--t3)" }}>За этот месяц роликов нет</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {topReels.map((p: any, k: number) => (
                <a key={k} href={p.url || "#"} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 10, background: "var(--inset)", border: "1px solid var(--brd)", textDecoration: "none" }}>
                  <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 13, fontWeight: 800, color: k < 3 ? "var(--yl)" : "var(--t3)", width: 18, textAlign: "center" }}>{k + 1}</span>
                  {p.image
                    ? <img src={p.image} alt="" style={{ width: 34, height: 46, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "var(--track)" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                    : <div style={{ width: 34, height: 46, borderRadius: 6, background: "var(--track)", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.client}</div>
                    <div style={{ fontSize: 10.5, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: NET_COLOR[p.network], marginRight: 5 }} />{p.title || "без подписи"}
                    </div>
                  </div>
                  <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 12.5, fontWeight: 800, color: "var(--t1)", whiteSpace: "nowrap" }}>{fmt(p.views)}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 10.5, color: "var(--t3)", lineHeight: 1.6 }}>
          Данные — из Metricool, с момента подключения бренда; собираются автоматически 1-го числа за прошлый месяц. «Роликов» — только видео: рилсы, TikTok, Shorts; одно видео в нескольких сетях считается один раз. Карусели и фото — отдельно. «Наших» — опубликованные нами по CRM, остальное клиент выкладывает сам. Клиенты на одном аккаунте Metricool показаны одной строкой и посчитаны один раз. Подписчики копятся с сентября 2026.
        </div>
      </>)}

      {mounted && openB && createPortal(
        <div onClick={() => setOpenBrand(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 980, height: "100%", overflowY: "auto", background: "var(--bg, #0b0614)", borderLeft: "1px solid var(--brd)", padding: "20px 22px 40px", fontFamily: "'Manrope', sans-serif" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <Avatar name={openB.name} src={openB.lead.avatar_url} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--t1)" }}>{openB.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--t3)" }}>{openB.lead.niche || "статистика по месяцам"}</div>
              </div>
              <button className="v2-act" onClick={() => router.push(`/dashboard/clients/${openB.lead.id}`)} style={{ height: 34 }}>
                Карточка клиента <ExternalLink size={12} />
              </button>
              <button onClick={() => setOpenBrand(null)} className="v2-iconbtn" aria-label="Закрыть"><X size={16} /></button>
            </div>
            <ClientStatsTab clientId={openB.lead.id} hasMetricool />
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .an-split{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:14px;align-items:start}
        @media(max-width:1100px){.an-split{grid-template-columns:1fr}}
        .an-row:hover{background:rgba(157,107,255,0.06)}
      `}</style>
    </div>
  );
}
