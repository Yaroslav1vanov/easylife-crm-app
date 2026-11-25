"use client";
import { useEffect, useMemo, useState } from "react";
import { isPortal } from "@/lib/portalMode";
import { createClient } from "@/lib/supabase-browser";
import { RefreshCw, TrendingUp, TrendingDown, ExternalLink } from "lucide-react";
import WeeklyStatsTable from "@/components/WeeklyStatsTable";
import ChatplaceInsights from "@/components/ChatplaceInsights";

/* Вкладка «Статистика» в карточке клиента: помесячные итоги из client_monthly_stats,
   сравнение с прошлым месяцем, график просмотров, лучшие ролики месяца. */

type Row = {
  ym: string; network: string; posts_count: number | null; reels_count: number | null;
  views: number | null; reach: number | null; likes: number | null; comments: number | null;
  saves: number | null; shares: number | null; avg_watch_sec: number | null;
  followers_start: number | null; followers_end: number | null; top_posts: any[] | null; collected_at: string;
  carousels_count?: number | null; carousel_views?: number | null; our_videos?: number | null; source?: string | null;
};

const NET_LABEL: Record<string, string> = { all: "Все сети", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook" };
const RU_M = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const ymLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${RU_M[m - 1]} ${y}`; };
const ymShort = (ym: string) => RU_M[Number(ym.slice(5, 7)) - 1].slice(0, 3);
const fmt = (v: number | null | undefined) => {
  if (v == null) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace(".0", "") + " млн";
  if (v >= 10_000) return Math.round(v / 1000) + " тыс";
  return v.toLocaleString("ru-RU");
};
const pct = (cur: number | null, prev: number | null) => (cur == null || !prev ? null : Math.round(((cur - prev) / prev) * 100));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shiftDay = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); return iso(new Date(y, m - 1, d + n)); };
const dayDiff = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);
const RU_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const rangeLabel = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7)
  ? `${+a.slice(8, 10)}–${+b.slice(8, 10)} ${RU_GEN[+b.slice(5, 7) - 1]}`
  : `${+a.slice(8, 10)} ${RU_GEN[+a.slice(5, 7) - 1]} – ${+b.slice(8, 10)} ${RU_GEN[+b.slice(5, 7) - 1]}`;
const NET_SNAP: Record<string, string> = { instagram: "ig", tiktok: "tt", youtube: "yt" };
type Per = "month" | "7" | "14" | "30" | "custom";
const PER_LABEL: [Per, string][] = [["month", "Месяц"], ["7", "7 дней"], ["14", "14 дней"], ["30", "30 дней"], ["custom", "Даты"]];
const curYm = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

type Reel = {
  date: string; net: string; title: string; ourTitle: string | null; url: string | null; image: string | null;
  views: number; reach: number | null; likes: number | null; comments: number | null; saves: number | null;
  shares: number | null; er: number | null; retention: number | null; retLoop?: boolean; retRaw?: number | null; duration: number | null; skip?: number | null; x: number; isOurs: boolean;
  watch?: number | null; paidViews?: number | null; paidReach?: number | null; spend?: number | null; follows?: number | null;
};

/* layout="crm" — раскладка карточки клиента в CRM (строка периода, ряд плиток, две колонки).
   Без него — прежняя раскладка: её показывает кабинет клиента, и меняться она не должна.
   side — блок для правой колонки (в CRM это «Кто смотрит»). */
export default function ClientStatsTab({ clientId, hasMetricool, layout, side, onAsk }: { clientId: number; hasMetricool: boolean; layout?: "crm"; side?: React.ReactNode;
  onAsk?: (question: string) => void }) {   // «Обсудить с ИИ» у ролика → чат «Аналитика» с готовым вопросом
  const crm = layout === "crm";
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [net, setNet] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openYm, setOpenYm] = useState<string | null>(null);              // раскрытый месяц в таблице
  const [reels, setReels] = useState<Record<string, Reel[] | "loading">>({});

  async function toggleMonth(ym: string) {
    if (openYm === ym) { setOpenYm(null); return; }
    setOpenYm(ym);
    if (reels[ym]) return;
    setReels(r => ({ ...r, [ym]: "loading" }));
    try {
      const res = await fetch(`/api/clients/${clientId}/reels?ym=${ym}`, { cache: "no-store" });
      const j = await res.json();
      setReels(r => ({ ...r, [ym]: (j.reels || []) as Reel[] }));
    } catch { setReels(r => ({ ...r, [ym]: [] })); }
  }

  async function load() {
    const { data } = await supabase.from("client_monthly_stats").select("*").eq("client_id", clientId).order("ym");
    setRows((data || []) as Row[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [clientId]);

  const [cpVer, setCpVer] = useState(0);   // снимок ChatPlace перечитываем после «Обновить»
  async function refresh() {
    setBusy(true);
    // текущий месяц «на сегодня» и прошлый — их цифры ещё меняются
    const d = new Date(); const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const pYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    const yms = [pYm, curYm()];
    for (let i = 0; i < yms.length; i++) {
      try { await fetch(`/api/stats/collect?ym=${yms[i]}&clientId=${clientId}${i ? "&cp=0" : ""}`, { cache: "no-store" }); } catch {}
    }
    await load(); setBusy(false); setCpVer(v => v + 1);
  }

  /* Период «7 / 14 / 30 дней» и свои даты: считаем по роликам, вышедшим в эти дни (как и месяц),
     сравниваем с таким же отрезком перед ним. Подписчики — из ежедневных снимков на начало и конец. */
  const [per, setPer] = useState<Per>("month");
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [pdata, setPdata] = useState<{ reels: Reel[]; snaps: any[]; cpFrom: string | null; cpSum: any } | "loading" | null>(null);
  const pr = useMemo(() => {
    if (per === "month") return null;
    let from: string, to: string;
    if (per === "custom") { if (!custom.from || !custom.to || custom.from > custom.to) return null; from = custom.from; to = custom.to; }
    else { to = iso(new Date()); from = shiftDay(to, -(Number(per) - 1)); }
    const len = dayDiff(from, to) + 1;
    return { from, to, pFrom: shiftDay(from, -len), pTo: shiftDay(from, -1), len };
  }, [per, custom]);
  useEffect(() => {
    if (!pr) { setPdata(null); return; }
    let off = false;
    setPdata("loading");
    (async () => {
      try {
        const [r, s, cp, cpDays] = await Promise.all([
          fetch(`/api/clients/${clientId}/reels?from=${pr.pFrom}&to=${pr.to}`, { cache: "no-store" }).then(x => x.json()),
          supabase.from("social_snapshots").select("platform, snapshot_date, followers").eq("client_id", clientId)
            .gte("snapshot_date", shiftDay(pr.pFrom, -7)).lte("snapshot_date", pr.to).order("snapshot_date"),
          supabase.from("client_chatplace_insights").select("day, availability, videos, summary").eq("client_id", clientId)
            .order("day", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("client_chatplace_insights").select("day").eq("client_id", clientId).eq("availability", "available"),
        ]);
        // Instagram у клиента с ChatPlace: снимки подписчиков верим только за дни, когда их записал ChatPlace
        // (Metricool без Instagram продолжает писать старую цифру)
        const okDays = new Set(((cpDays.data || []) as any[]).map(x => x.day));
        const snaps = ((s.data || []) as any[]).filter(x => x.platform !== "ig" || !okDays.size || okDays.has(x.snapshot_date));
        // ChatPlace отдаёт ролики примерно за 30 дней: раньше этой даты Instagram-роликов из него нет
        const cpv = cp.data?.availability === "available" && Array.isArray(cp.data.videos) ? (cp.data.videos as any[]).map(v => v.date).filter(Boolean).sort() : [];
        const sm = cp.data?.availability === "available" ? cp.data.summary?.metrics : null;
        if (!off) setPdata({ reels: (r.reels || []) as Reel[], snaps, cpFrom: cpv[0] || null,
          cpSum: sm && sm.followers != null && sm.followersDelta != null ? { day: cp.data!.day, followers: sm.followers, delta: sm.followersDelta } : null });
      } catch { if (!off) setPdata({ reels: [], snaps: [], cpFrom: null, cpSum: null }); }
    })();
    return () => { off = true; };
  }, [pr?.from, pr?.to, clientId, cpVer]);

  function aggPeriod(list: Reel[], snaps: any[], from: string, to: string, cpSum?: any) {
    const L = list.filter(r => r.date >= from && r.date <= to && (net === "all" || r.net === net));
    const byNet: Record<string, Reel[]> = {};
    for (const r of L) (byNet[r.net] ||= []).push(r);
    const sum = (k: keyof Reel) => (L.some(r => r[k] != null) ? L.reduce((a, r) => a + (Number(r[k]) || 0), 0) : null);
    let fEnd: number | null = null, gStart: number | null = null, gEnd: number | null = null;
    const fNets: string[] = [];
    for (const [n, plat] of Object.entries(NET_SNAP)) {
      if (net !== "all" && net !== n) continue;
      const sn = snaps.filter(x => x.platform === plat && x.followers != null);
      const end = [...sn].reverse().find(x => x.snapshot_date <= to);
      let start = [...sn].reverse().find(x => x.snapshot_date < from);
      // ровно «последние 30 дней» по Instagram — прирост берём из ChatPlace (он сам считает 30 дней)
      if (!start && plat === "ig" && cpSum && end && end.snapshot_date === cpSum.day && dayDiff(from, to) === 29 && to >= cpSum.day)
        start = { followers: cpSum.followers - cpSum.delta, snapshot_date: from };
      if (!end) continue;
      fEnd = (fEnd || 0) + end.followers;
      fNets.push(`${NET_LABEL[n]} ${Number(end.followers).toLocaleString("ru-RU")}`);
      if (start) { gStart = (gStart || 0) + start.followers; gEnd = (gEnd || 0) + end.followers; }
    }
    return {
      posts: Math.max(0, ...Object.values(byNet).map(a => a.length)), pubs: L.length,
      our: Math.max(0, ...Object.values(byNet).map(a => a.filter(r => r.isOurs).length)) || null, carousels: null,
      views: sum("views"), reach: sum("reach"), likes: sum("likes"), comments: sum("comments"), saves: sum("saves"), shares: sum("shares"),
      fEnd, gStart, gEnd, fNets, list: L,
    };
  }

  const nets = useMemo(() => ["all", ...Array.from(new Set(rows.map(r => r.network)))], [rows]);

  // по месяцам: одна сеть или сумма всех
  const months = useMemo(() => {
    const by: Record<string, Row[]> = {};
    for (const r of rows) if (net === "all" || r.network === net) (by[r.ym] ||= []).push(r);
    const add = (a: number | null, b: number | null) => (a == null && b == null ? null : (a || 0) + (b || 0));
    return Object.keys(by).sort().map(ym => {
      const list = by[ym];
      const agg = list.reduce((acc, r) => ({
        // одно видео выходит в нескольких сетях — роликов берём по сети, где их больше, а не сумму
        posts: acc.posts == null && r.posts_count == null ? null : Math.max(acc.posts || 0, r.posts_count || 0),
        pubs: add(acc.pubs, r.posts_count),   // публикаций по всем сетям (как в Metricool)
        our: Math.max(acc.our || 0, r.our_videos || 0) || null,
        carousels: add(acc.carousels, r.carousels_count ?? null),
        views: add(acc.views, r.views), reach: add(acc.reach, r.reach),
        likes: add(acc.likes, r.likes), comments: add(acc.comments, r.comments), saves: add(acc.saves, r.saves), shares: add(acc.shares, r.shares),
        fStart: add(acc.fStart, r.followers_start), fEnd: add(acc.fEnd, r.followers_end),
        // прирост — только по сетям, где есть и начало, и конец месяца (иначе сумма концов минус одно начало)
        gStart: r.followers_start != null && r.followers_end != null ? add(acc.gStart, r.followers_start) : acc.gStart,
        gEnd: r.followers_start != null && r.followers_end != null ? add(acc.gEnd, r.followers_end) : acc.gEnd,
        fNets: r.followers_end != null ? [...acc.fNets, `${NET_LABEL[r.network] || r.network} ${r.followers_end.toLocaleString("ru-RU")}`] : acc.fNets,
      }), { posts: null, pubs: null, our: null, carousels: null, views: null, reach: null, likes: null, comments: null, saves: null, shares: null, fStart: null, fEnd: null, gStart: null, gEnd: null, fNets: [] } as any);
      const top = list.flatMap(r => (r.top_posts || []).map(p => ({ ...p, network: r.network })))
        .sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
      return { ym, ...agg, top, partial: ym === curYm() };
    });
  }, [rows, net]);

  useEffect(() => { if (months.length && (!sel || !months.find(m => m.ym === sel))) setSel(months[months.length - 1].ym); }, [months]);

  if (loading) return <div style={{ padding: 30, color: "var(--t3)", textAlign: "center" }}>Загрузка…</div>;
  if (!hasMetricool) return (
    <div className="card" style={{ padding: 22, borderRadius: 14, color: "var(--t2)", fontSize: 13 }}>
      {isPortal() ? "Статистика по аккаунту ещё не подключена." : "Клиент не привязан к Metricool — статистику собирать не из чего. Привяжи бренд во вкладке «Настройки»."}
    </div>
  );

  const i = months.findIndex(m => m.ym === sel);
  const cur = months[i], prev = i > 0 ? months[i - 1] : null;
  const srcSet = new Set(rows.filter(r => cur && r.ym === cur.ym && (net === "all" || r.network === net)).map(r => r.source === "chatplace" ? "Instagram (ChatPlace)" : "Metricool"));
  const srcLabel = srcSet.size ? Array.from(srcSet).join(" + ") : "Metricool";
  const maxViews = Math.max(1, ...months.map(m => m.views || 0));

  const Tile = ({ label, v, p, hint }: { label: string; v: number | null; p: number | null; hint?: string }) => crm ? (
    <div className="kpi">
      <div className="l">{label}</div>
      <div className="n">{fmt(v)}</div>
      <div className={`d ${p == null ? "" : p >= 0 ? "up" : "down"}`} title={p != null && hint ? hint : undefined}>
        {p == null ? (hint || "нет сравнения") : <>{p >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {p >= 0 ? "+" : ""}{p}% к прошлому</>}
      </div>
    </div>
  ) : (
    <div style={{ padding: "13px 14px", borderRadius: 12, background: "var(--inset)", border: "1px solid var(--brd)" }}>
      <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 800, color: "var(--t1)", marginTop: 5, lineHeight: 1.1 }}>{fmt(v)}</div>
      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, display: "flex", alignItems: "center", gap: 4,
        color: p == null ? "var(--t3)" : p >= 0 ? "var(--gr)" : "var(--rd)" }}>
        {p == null ? (hint || "нет сравнения") : <>{p >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{p >= 0 ? "+" : ""}{p}% к прошлому</>}
      </div>
    </div>
  );

  // Куски вкладки: одни и те же в обычной раскладке (кабинет клиента) и в раскладке CRM
  const bars = (<>
            {months.map(m => {
              const h = Math.max(4, Math.round(((m.views || 0) / maxViews) * 120));
              const on = m.ym === sel;
              return (
                <button key={m.ym} onClick={() => { setSel(m.ym); setPer("month"); }} style={{ flex: 1, minWidth: 34, maxWidth: 90, background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: on ? "var(--t1)" : "var(--t3)" }}>{fmt(m.views)}</span>
                  <div style={{ width: "100%", height: h, borderRadius: "6px 6px 2px 2px",
                    background: on ? "linear-gradient(180deg, var(--cy), var(--pu))" : "rgba(var(--pu-rgb),0.28)",
                    opacity: m.partial ? 0.55 : 1, outline: m.partial ? "1px dashed var(--pu)" : "none" }} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: on ? "var(--pu)" : "var(--t3)" }}>{ymShort(m.ym)}{m.partial ? "*" : ""}</span>
                </button>
              );
            })}
  </>);
  const tilesFor = (cur: any, prev: any, period?: boolean) => (<>
            <Tile label="Роликов" v={cur.posts} p={pct(cur.posts, prev?.posts)} hint={[cur.pubs && cur.pubs !== cur.posts ? `публикаций во всех сетях: ${cur.pubs}` : "", cur.our ? `из контент-плана: ${cur.our}` : ""].filter(Boolean).join(" · ") || undefined} />
            {cur.carousels ? <Tile label="Карусели и фото" v={cur.carousels} p={pct(cur.carousels, prev?.carousels)} /> : null}
            <Tile label="Просмотры" v={cur.views} p={pct(cur.views, prev?.views)} />
            <Tile label="Охват" v={cur.reach} p={pct(cur.reach, prev?.reach)} />
            <Tile label="Лайки" v={cur.likes} p={pct(cur.likes, prev?.likes)} />
            <Tile label="Комментарии" v={cur.comments} p={pct(cur.comments, prev?.comments)} />
            <Tile label="Сохранения" v={cur.saves} p={pct(cur.saves, prev?.saves)} />
            <Tile label="Репосты" v={cur.shares} p={pct(cur.shares, prev?.shares)} />
            <Tile label={cur.fNets.length > 1 ? "Подписчики · все сети" : "Подписчики"} v={cur.fEnd} p={period ? null : cur.gStart && cur.gEnd ? Math.round(((cur.gEnd - cur.gStart) / cur.gStart) * 1000) / 10 : null}
              hint={period ? (cur.fEnd == null ? "нет снимков" : cur.gStart != null ? `${cur.gEnd - cur.gStart >= 0 ? "+" : ""}${(cur.gEnd - cur.gStart).toLocaleString("ru-RU")} за период` : "нет снимка на начало периода") : cur.fEnd == null ? "история с сентября" : cur.fNets.length > 1 ? cur.fNets.join(" · ") : "за месяц"} />
  </>);
  const tiles = cur ? tilesFor(cur, prev) : null;
  const topList = cur ? (<>
                {(cur.top || []).map((p: any, k: number) => (
                  <a key={k} href={p.url || "#"} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 11, padding: 9, borderRadius: 10, background: "var(--inset)", border: "1px solid var(--brd)", textDecoration: "none" }}>
                    <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 15, fontWeight: 800, color: k === 0 ? "var(--yl)" : "var(--t3)", width: 18, textAlign: "center" }}>{k + 1}</span>
                    {p.image ? <img src={p.image} alt="" style={{ width: 40, height: 52, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "var(--track)" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} /> : null}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title || "без подписи"}</div>
                      <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 2 }}>
                        {NET_LABEL[p.network] || p.network} · ❤ {fmt(p.likes)} · 💬 {fmt(p.comments)}{p.saves != null ? ` · 🔖 ${fmt(p.saves)}` : ""}{p.shares != null ? ` · ↗ ${fmt(p.shares)}` : ""}
                      </div>
                    </div>
                    <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 14, fontWeight: 800, color: "var(--t1)", whiteSpace: "nowrap" }}>{fmt(p.views)}</span>
                    <ExternalLink size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
                  </a>
                ))}
  </>) : null;
  const reelTable = (list: Reel[]) => {
    // колонки «Реклама» и «Подписки» — только если в списке есть такие данные
    const hasPaid = list.some(r => (r.paidViews || 0) > 0 || (r.spend || 0) > 0);
    const hasFollows = list.some(r => r.follows != null);
    return (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead><tr style={{ color: "var(--t3)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: .4 }}>
                              {["Дата", "Ролик", "Просмотры", ...(hasPaid ? ["Органика / реклама"] : []), "Охват", "Лайки", "Комм.", "Сохр.", "Репосты", ...(hasFollows ? ["Подписки"] : []), "ER", "Досмотр", "Пролистали"].map(h => (
                                <th key={h} style={{ textAlign: h === "Дата" || h === "Ролик" ? "left" : "right", padding: "8px 12px", fontWeight: 800 }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {list.map((r, idx) => (
                                <tr key={idx} style={{ borderTop: "1px solid var(--brd)" }}>
                                  <td style={{ padding: "8px 12px", color: "var(--t2)", whiteSpace: "nowrap" }}>{r.date.slice(8, 10)}.{r.date.slice(5, 7)}</td>
                                  <td style={{ padding: "8px 12px", maxWidth: 220 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      {r.image ? <img src={r.image} alt="" style={{ width: 26, height: 34, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} /> : null}
                                      <div style={{ minWidth: 0 }}>
                                        <a href={r.url || "#"} target="_blank" rel="noreferrer" style={{ color: "var(--t1)", textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</a>
                                        <div style={{ fontSize: 9.5, color: "var(--t3)" }}>
                                          {NET_LABEL[r.net] || r.net}{r.duration ? ` · ${r.duration} сек` : ""}{r.isOurs ? " · из плана" : ""}{!r.isOurs ? <span style={{ color: "var(--or)" }}> · не из плана</span> : null}{r.x >= 1.5 ? ` · ×${String(Math.round(r.x * 10) / 10).replace(".", ",")} к норме` : ""}
                                          {onAsk ? <button onClick={() => onAsk(`Разбери ролик «${r.title.slice(0, 80)}» (${NET_LABEL[r.net] || r.net}, ${r.date}${r.url ? `, ${r.url}` : ""}): ${fmt(r.views)} просмотров${r.skip != null ? `, пролистали ${r.skip}%` : ""}${r.watch != null ? `, в среднем смотрят ${r.watch} с` : ""}. Почему так, на какой фразе уходят и что поменять в следующем ролике?`)}
                                            title="Обсудить этот ролик с ИИ" style={{ marginLeft: 6, padding: 0, border: 0, background: "transparent", color: "var(--cy)", cursor: "pointer", fontSize: 9.5, fontWeight: 800, fontFamily: "inherit" }}>· 💬 обсудить</button> : null}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "var(--t1)" }}>{fmt(r.views)}</td>
                                  {hasPaid && <td style={{ padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" }} title="Органические просмотры / просмотры с продвижения (реклама) и потраченная сумма">
                                    {(r.paidViews || 0) > 0 || (r.spend || 0) > 0
                                      ? <>{fmt(Math.max(0, r.views - (r.paidViews || 0)))} / <span style={{ color: "var(--or)" }}>{fmt(r.paidViews || 0)}</span>{r.spend ? <div style={{ fontSize: 9.5, color: "var(--t3)" }}>реклама ${Math.round(r.spend)}</div> : null}</>
                                      : <span style={{ color: "var(--t3)" }}>вся органика</span>}
                                  </td>}
                                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmt(r.reach)}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmt(r.likes)}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmt(r.comments)}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmt(r.saves)}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmt(r.shares)}</td>
                                  {hasFollows && <td style={{ padding: "8px 12px", textAlign: "right" }} title="Подписались прямо с этого ролика (как отдаёт Instagram)">{fmt(r.follows ?? null)}</td>}
                                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{r.er != null ? `${String(r.er).replace(".", ",")}%` : "—"}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right" }} title={r.retLoop ? "Средний просмотр длиннее самого ролика: часть зрителей смотрела его по кругу. В средних по отчётам такой ролик считается как 100%" : "Средняя доля ролика, которую смотрят"}>{r.retention != null ? (r.retLoop ? `${r.retRaw ?? 100}% ↻` : `${r.retention}%`) : r.watch != null ? `${String(Math.round(r.watch)).replace(".", ",")} сек` : "—"}{r.retention != null && r.watch != null && <div style={{ fontSize: 9.5, color: "var(--t3)" }}>{String(r.watch).replace(".", ",")} сек</div>}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: r.skip != null && r.skip > 35 ? "var(--rd)" : undefined, fontWeight: r.skip != null && r.skip > 35 ? 700 : undefined }} title="Сколько зрителей пролистали ролик в первые 3 секунды (Instagram). Больше 35% — слабый хук">{r.skip != null ? `${String(Math.round(r.skip)).replace(".", ",")}%` : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
    );
  };
  const monthsTable = (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720, fontSize: 12.5 }}>
            <thead><tr style={{ color: "var(--t3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>
              {["Месяц", "Роликов", "Просмотры", "Охват", "Лайки", "Комм.", "Сохр.", "Репосты", "Подписчики"].map(h => <th key={h} style={{ textAlign: h === "Месяц" ? "left" : "right", padding: "11px 12px", fontWeight: 800 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {[...months].reverse().map((m, k, arr) => {
                const p = arr[k + 1];
                const d = pct(m.views, p?.views);
                return (
                  <><tr key={m.ym} onClick={() => { setSel(m.ym); toggleMonth(m.ym); }} style={{ borderTop: "1px solid var(--brd)", cursor: "pointer", background: m.ym === sel ? "rgba(var(--pu-rgb),0.08)" : "transparent" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--t1)" }}>
                      <span style={{ color: "var(--pu)", marginRight: 6, display: "inline-block", transform: openYm === m.ym ? "rotate(90deg)" : "none", transition: ".15s" }}>›</span>
                      {ymLabel(m.ym)}{m.partial ? " *" : ""}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{fmt(m.posts)}{m.pubs && m.pubs !== m.posts ? <span style={{ fontSize: 10.5, color: "var(--t3)" }} title="Один ролик в Instagram, TikTok и YouTube — это 1 ролик и 3 публикации"> · публикаций {m.pubs}</span> : null}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "var(--t1)" }}>
                      {fmt(m.views)}{d != null && <span style={{ marginLeft: 6, fontSize: 10.5, color: d >= 0 ? "var(--gr)" : "var(--rd)" }}>{d >= 0 ? "+" : ""}{d}%</span>}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(m.reach)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(m.likes)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(m.comments)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(m.saves)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(m.shares)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{m.fEnd != null ? <span title={m.fNets.join(" · ")}>{fmt(m.fEnd)}{m.gStart != null && m.gEnd != null ? ` (${m.gEnd - m.gStart >= 0 ? "+" : ""}${fmt(m.gEnd - m.gStart)})` : ""}</span> : "—"}</td>
                  </tr>
                  {openYm === m.ym && (
                    <tr key={`${m.ym}-reels`}>
                      <td colSpan={9} style={{ padding: 0, background: "var(--row-open, rgba(10,1,24,.45))" }}>
                        {reels[m.ym] === "loading" ? (
                          <div style={{ padding: "14px 16px", fontSize: 12, color: "var(--t3)" }}>Загружаю ролики месяца…</div>
                        ) : !reels[m.ym] || (reels[m.ym] as Reel[]).length === 0 ? (
                          <div style={{ padding: "14px 16px", fontSize: 12, color: "var(--t3)" }}>{isPortal() ? "Роликов за этот месяц нет." : "Роликов за этот месяц нет: ни Metricool, ни ChatPlace их не отдали."}</div>
                        ) : (
                          reelTable(reels[m.ym] as Reel[])
                        )}
                      </td>
                    </tr>
                  )}
                  </>
                );
              })}
            </tbody>
          </table>
  );

  if (crm) return (
    <div className="stats-crm">
      <div className="st-bar">
        <h2>{per !== "month" ? (pr ? <>{per === "custom" ? "Период" : `${per} дней`} · {rangeLabel(pr.from, pr.to)}</> : "Свой период")
          : cur ? <>{ymLabel(cur.ym)}{cur.partial ? " · на сегодня" : ""}</> : "Аналитика"}</h2>
        <span className="st-src">{per !== "month" ? (pr ? <>сравнение с {rangeLabel(pr.pFrom, pr.pTo)} · </> : null) : prev ? <>сравнение с {ymLabel(prev.ym)} · </> : null}источник: <b>{srcLabel}</b></span>
        <div className="st-bar-r">
          <div className="v2-seg">
            {PER_LABEL.map(([k, l]) => <button key={k} onClick={() => {
              if (k === "custom" && !custom.from) { const t = iso(new Date()); setCustom({ from: shiftDay(t, -6), to: t }); }
              setPer(k);
            }} className={per === k ? "on" : ""}>{l}</button>)}
          </div>
          {per === "custom" && (
            <div className="st-dates">
              <input type="date" value={custom.from} max={custom.to || undefined} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
              <span>—</span>
              <input type="date" value={custom.to} min={custom.from || undefined} max={iso(new Date())} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
            </div>
          )}
          <div className="v2-seg">
            {nets.map(n => <button key={n} onClick={() => setNet(n)} className={net === n ? "on" : ""}>{NET_LABEL[n] || n}</button>)}
          </div>
          <button onClick={refresh} disabled={busy} className="v2-act">
            <RefreshCw size={13} className={busy ? "spin" : ""} /> {busy ? "Собираю…" : "Обновить"}
          </button>
        </div>
      </div>

      {!months.length ? (
        <div className="panel" style={{ color: "var(--t2)", fontSize: 14, lineHeight: 1.6 }}>
          Статистики пока нет. Нажми «Обновить» — CRM соберёт текущий и прошлый месяц из Metricool.
        </div>
      ) : (<>
        {per !== "month" ? (
          !pr ? <div className="panel" style={{ color: "var(--t2)", fontSize: 14 }}>Выбери дату начала и конца периода.</div>
          : pdata === "loading" || !pdata ? <div className="panel" style={{ color: "var(--t3)", fontSize: 14 }}>Считаю статистику за {rangeLabel(pr.from, pr.to)}…</div>
          : (() => {
            const c = aggPeriod(pdata.reels, pdata.snaps, pr.from, pr.to, pdata.cpSum);
            // сравнение нечестное, если прошлый отрезок раньше, чем ChatPlace хранит ролики Instagram
            const cpShort = !!pdata.cpFrom && pr.pFrom < pdata.cpFrom && (net === "all" || net === "instagram");
            const p = cpShort ? null : aggPeriod(pdata.reels, pdata.snaps, pr.pFrom, pr.pTo);
            return (<>
              <div className="kpis" style={{ ["--kcols" as any]: 4 }}>{tilesFor(c, p, true)}</div>
              <div className="st-note">Ролики, вышедшие {rangeLabel(pr.from, pr.to)} (включая пробные и перемонтажи), и их просмотры на сегодня.
                {cpShort ? " Сравнения нет: Instagram берём из ChatPlace, а он хранит ролики только за последние ~30 дней." : ` Сравнение — с ${rangeLabel(pr.pFrom, pr.pTo)}.`}
                {" "}Блок ниже «От просмотров до заявок» — всегда за 30 дней: Instagram отдаёт статистику аккаунта только так.</div>
              <div className="panel">
                <h3>Ролики за период <span className="st-h3sub">{rangeLabel(pr.from, pr.to)} · {c.list.length}</span></h3>
                {c.list.length ? <div className="tw" style={{ marginTop: 12 }}>{reelTable(c.list)}</div>
                  : <div className="sub" style={{ marginTop: 10 }}>За эти дни роликов нет.</div>}
              </div>
            </>);
          })()
        ) : cur && (<>
          <div className="kpis" style={{ ["--kcols" as any]: Math.ceil((8 + (cur.carousels ? 1 : 0)) / 2) }}>{tiles}</div>
          <div className="st-note">Ролики, вышедшие в этом месяце (включая пробные и перемонтажи), и их просмотры. Просмотры всего аккаунта за 30 дней — в блоке «Кто смотрит».</div>
        </>)}
        <ChatplaceInsights clientId={clientId} version={cpVer} />

        <div className={side ? "st-two" : undefined}>
          <div className="panel">
            <h3>Просмотры по месяцам</h3>
            <div className="sub">Нажми на столбец, чтобы увидеть цифры месяца{months.some(m => m.partial) ? " · * текущий месяц ещё идёт" : ""}</div>
            <div className="st-bars">{bars}</div>
          </div>
          {side}
        </div>

        {per === "month" && cur && cur.top?.length > 0 && (
          <div className="panel">
            <h3>Лучшие ролики <span className="st-h3sub">{ymLabel(cur.ym)}</span></h3>
            <div className="st-top">{topList}</div>
          </div>
        )}

        <div className="panel">
          <h3>По месяцам</h3>
          <div className="sub">Нажми на месяц, чтобы раскрыть его ролики</div>
          <div className="tw st-months">{monthsTable}</div>
        </div>

        <WeeklyStatsTable clientId={clientId} />

        <div className="st-foot">Данные — из Metricool, с момента подключения бренда; у клиентов с ботом ChatPlace Instagram за текущий месяц — из ChatPlace (статистика Instagram аккаунта). Подписчики — из ежедневных снимков CRM, история по ним с сентября 2026. Прошлый месяц собирается автоматически 1-го числа.</div>
      </>)}
      <style dangerouslySetInnerHTML={{ __html: `.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.st-dates{display:flex;align-items:center;gap:6px;color:var(--t3);font-size:13px}
.st-dates input{background:var(--inset);border:1px solid var(--brd);color:var(--t1);border-radius:9px;padding:6px 9px;font-size:13px;font-family:inherit}` }} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {nets.map(n => (
          <button key={n} onClick={() => setNet(n)} className={`v2-chip ${net === n ? "pu" : "mut"}`} style={{ height: 32, padding: "0 12px", cursor: "pointer" }}>{NET_LABEL[n] || n}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={refresh} disabled={busy} className="v2-act" style={{ height: 32 }}>
          <RefreshCw size={13} className={busy ? "spin" : ""} /> {busy ? "Собираю…" : "Обновить"}
        </button>
      </div>

      {!months.length ? (
        <div className="card" style={{ padding: 22, borderRadius: 14, color: "var(--t2)", fontSize: 13, lineHeight: 1.6 }}>
          {isPortal() ? "Статистики пока нет — она появится после первых публикаций." : "Статистики пока нет. Нажми «Обновить» — CRM соберёт текущий и прошлый месяц из Metricool."}
        </div>
      ) : (<>
        {/* график просмотров по месяцам */}
        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)", marginBottom: 12 }}>Просмотры по месяцам · клик по столбцу — детали</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 150 }}>
            {bars}
          </div>
          {months.some(m => m.partial) && <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 8 }}>* текущий месяц — на сегодня, ещё идёт</div>}
        </div>

        {cur && (<>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>
            {ymLabel(cur.ym)}{cur.partial ? " · на сегодня" : ""}
            {prev && <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600 }}> · сравнение с {ymLabel(prev.ym)}</span>}
            <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600, marginTop: 2 }}>ролики, вышедшие в этом месяце (включая пробные и перемонтажи), и их просмотры. Просмотры всего аккаунта за 30 дней — в карточке клиента</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {tiles}
          </div>

          {cur.top?.length > 0 && (
            <div className="card" style={{ padding: 16, borderRadius: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)", marginBottom: 10 }}>Лучшие ролики — {ymLabel(cur.ym)}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {topList}
              </div>
            </div>
          )}
        </>)}

        {/* таблица всех месяцев */}
        <div className="card" style={{ padding: 0, borderRadius: 14, overflowX: "auto" }}>
          {monthsTable}
        </div>
        <WeeklyStatsTable clientId={clientId} />
        <div style={{ fontSize: 10.5, color: "var(--t3)", lineHeight: 1.6 }}>
          {isPortal() ? "Данные — из статистики аккаунта, обновляются автоматически. Прошлый месяц закрывается 1-го числа." : "Данные — из Metricool, с момента подключения бренда. Подписчики — из ежедневных снимков CRM, история по ним с сентября 2026. Прошлый месяц собирается автоматически 1-го числа."}
        </div>
      </>)}
      <style dangerouslySetInnerHTML={{ __html: `.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}` }} />
    </div>
  );
}
