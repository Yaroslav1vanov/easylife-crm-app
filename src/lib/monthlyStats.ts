import type { SupabaseClient } from "@supabase/supabase-js";

/* Помесячная статистика клиента: контент из Metricool, подписчики из наших снимков.
   Одна строка на клиента × месяц × соцсеть. История в Metricool — с момента
   подключения бренда (у большинства с мая 2026); подписчики — с начала снимков. */

const MC = "https://app.metricool.com/api";

// Где у Metricool лежат публикации каждой сети. Пробуем по порядку, берём всё непустое.
const NETS: { network: string; snap: string; paths: string[] }[] = [
  { network: "instagram", snap: "ig",  paths: ["/v2/analytics/reels/instagram", "/v2/analytics/posts/instagram"] },
  { network: "tiktok",    snap: "tt",  paths: ["/v2/analytics/posts/tiktok"] },
  { network: "youtube",   snap: "yt",  paths: ["/v2/analytics/posts/youtube", "/v2/analytics/videos/youtube"] },
  { network: "facebook",  snap: "fb",  paths: ["/v2/analytics/reels/facebook", "/v2/analytics/posts/facebook"] },
];

/** Поле без учёта регистра, первое непустое из вариантов. */
function pick(o: any, ...keys: string[]): any {
  if (!o || typeof o !== "object") return undefined;
  const low: Record<string, any> = {};
  for (const k of Object.keys(o)) low[k.toLowerCase()] = o[k];
  for (const k of keys) { const v = low[k.toLowerCase()]; if (v != null && v !== "") return v; }
  return undefined;
}
const num = (v: any) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
const sum = (arr: any[], ...keys: string[]) => {
  let s = 0, has = false;
  for (const it of arr) { const v = num(pick(it, ...keys)); if (v != null) { s += v; has = true; } }
  return has ? Math.round(s) : null;
};

export function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
export function prevYm(d = new Date()) {
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
}

async function mcList(path: string, qs: string, token: string): Promise<any[] | null> {
  try {
    const r = await fetch(`${MC}${path}?${qs}`, { headers: { "X-Mc-Auth": token }, cache: "no-store" });
    if (!r.ok) return null;
    const j: any = await r.json().catch(() => null);
    const arr = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : null;
    return arr;
  } catch { return null; }
}

export type MonthRow = {
  client_id: number; ym: string; network: string;
  reels_count: number | null; posts_count: number | null;
  views: number | null; reach: number | null; likes: number | null; comments: number | null;
  saves: number | null; shares: number | null; interactions: number | null; avg_watch_sec: number | null;
  followers_start: number | null; followers_end: number | null;
  top_posts: any[]; source: string; collected_at: string;
};

/** Собирает месяц по одному клиенту: строка на каждую соцсеть, где есть публикации. */
export async function collectClientMonth(sb: SupabaseClient, client: { id: number; metricool_blog_id: number | null; timezone?: string | null }, ym: string): Promise<MonthRow[]> {
  const token = process.env.METRICOOL_TOKEN, userId = process.env.METRICOOL_USER_ID;
  if (!token || !userId || !client.metricool_blog_id) return [];
  const { from, to } = monthRange(ym);
  const tz = encodeURIComponent(client.timezone || "America/New_York");
  const qs = `from=${from}T00:00:00&to=${to}T23:59:59&timezone=${tz}&blogId=${client.metricool_blog_id}&userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`;

  // подписчики за месяц — из наших ежедневных снимков
  const { data: snaps } = await sb.from("social_snapshots").select("platform, snapshot_date, followers")
    .eq("client_id", client.id).gte("snapshot_date", from).lte("snapshot_date", to).gt("followers", 0)
    .order("snapshot_date", { ascending: true });

  const rows: MonthRow[] = [];
  for (const n of NETS) {
    let reels: any[] = [], posts: any[] = [];
    for (const path of n.paths) {
      const arr = await mcList(path, qs, token);
      if (!arr?.length) continue;
      if (path.includes("/reels/")) reels = arr; else posts = posts.length ? posts : arr;
    }
    const all = [...reels, ...posts];
    const fs = (snaps || []).filter(s => s.platform === n.snap);
    if (!all.length && !fs.length) continue;   // эта сеть у бренда не подключена

    const top = [...all]
      .sort((a, b) => (num(pick(b, "views", "videoViews", "plays", "impressions")) || 0) - (num(pick(a, "views", "videoViews", "plays", "impressions")) || 0))
      .slice(0, 5)
      .map(p => ({
        url: pick(p, "url", "permalink", "link") || null,
        title: String(pick(p, "content", "text", "caption", "title", "description") || "").replace(/\s+/g, " ").slice(0, 110),
        image: pick(p, "imageUrl", "thumbnailUrl", "picture", "image") || null,
        views: num(pick(p, "views", "videoViews", "plays", "impressions")),
        likes: num(pick(p, "likes", "reactions")),
        comments: num(pick(p, "comments")),
        saves: num(pick(p, "saved", "saves")),
        shares: num(pick(p, "shares")),
      }));

    const watch = all.map(p => num(pick(p, "averageWatchTime", "avgWatchTime", "averageViewDuration"))).filter((v): v is number => v != null);
    rows.push({
      client_id: client.id, ym, network: n.network,
      reels_count: reels.length || null,
      posts_count: all.length,
      views: sum(all, "views", "videoViews", "plays", "impressionsTotal", "impressions"),
      reach: sum(all, "reach"),
      likes: sum(all, "likes", "reactions"),
      comments: sum(all, "comments"),
      saves: sum(all, "saved", "saves"),
      shares: sum(all, "shares"),
      interactions: sum(all, "interactions", "engagement"),
      avg_watch_sec: watch.length ? Math.round((watch.reduce((a, b) => a + b, 0) / watch.length) * 10) / 10 : null,
      followers_start: fs.length ? fs[0].followers : null,
      followers_end: fs.length ? fs[fs.length - 1].followers : null,
      top_posts: top,
      source: "metricool",
      collected_at: new Date().toISOString(),
    });
  }
  return rows;
}
