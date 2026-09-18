// Сбор данных по роликам за период из Metricool — общий код для недельных отчётов и снимков.

const MC = "https://app.metricool.com/api";

const NETS: { network: string; snap: string; paths: string[] }[] = [
  { network: "instagram", snap: "ig", paths: ["/v2/analytics/reels/instagram"] },
  { network: "tiktok", snap: "tt", paths: ["/v2/analytics/posts/tiktok"] },
  { network: "youtube", snap: "yt", paths: ["/v2/analytics/posts/youtube"] },
  { network: "facebook", snap: "fb", paths: ["/v2/analytics/reels/facebook"] },
];

const F = {
  views: ["views", "viewCount", "videoViews", "plays", "impressionsTotal", "impressions"],
  likes: ["likes", "likeCount", "reactions"],
  comments: ["comments", "commentCount"],
  saves: ["saved", "saves"],
  shares: ["shares", "shareCount"],
  url: ["url", "shareUrl", "watchUrl", "permalink", "link"],
  title: ["content", "videoDescription", "title", "text", "caption", "description"],
  image: ["imageUrl", "coverImageUrl", "thumbnailUrl", "picture", "image"],
  watch: ["averageWatchTime", "averageViewDuration", "avgWatchTime"],
  dur: ["durationSeconds", "duration", "videoDuration"],
  skip: ["reelsSkipRate"],
  date: ["publishedAt", "createTime", "publicationDate", "created", "timestamp"],
};

function pick(o: any, ...keys: string[]): any {
  if (!o || typeof o !== "object") return undefined;
  const low: Record<string, any> = {};
  for (const k of Object.keys(o)) low[k.toLowerCase()] = o[k];
  for (const k of keys) { const v = low[k.toLowerCase()]; if (v != null && v !== "") return v; }
  return undefined;
}
const num = (v: any) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

export function postDate(p: any): string | null {
  let v = pick(p, ...F.date);
  if (v && typeof v === "object") v = v.dateTime || v.date || null;
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

/** Метрики ролика в едином виде (у каждой сети свои названия полей). */
export function reelFields(p: any) {
  const dur = num(pick(p, ...F.dur));
  const watch = num(pick(p, ...F.watch));
  return {
    date: postDate(p),
    views: num(pick(p, ...F.views)) ?? 0,
    reach: num(pick(p, "reach")),
    likes: num(pick(p, ...F.likes)),
    comments: num(pick(p, ...F.comments)),
    saved: num(pick(p, ...F.saves)),
    shares: num(pick(p, ...F.shares)),
    url: (pick(p, ...F.url) as string) || null,
    title: String(pick(p, ...F.title) || "").replace(/\s+/g, " ").trim(),
    image: (pick(p, ...F.image) as string) || null,
    watch,
    dur,
    skip: num(pick(p, ...F.skip)),
    ret: dur && watch ? Math.round((watch / dur) * 100) : null,
  };
}

type ClientLike = { id: number; metricool_blog_id: number | null; timezone?: string | null; platforms?: string[] | null };

/** Все ролики клиента за период по всем его сетям. К каждому добавлен _net. */
export async function fetchNetworkPosts(client: ClientLike, from: string, to: string): Promise<any[]> {
  const token = process.env.METRICOOL_TOKEN, userId = process.env.METRICOOL_USER_ID;
  if (!token || !userId || !client.metricool_blog_id) return [];
  const tz = encodeURIComponent(client.timezone || "America/New_York");
  const qs = `from=${from}T00:00:00&to=${to}T23:59:59&timezone=${tz}&blogId=${client.metricool_blog_id}&userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`;
  const allowed = client.platforms?.length ? new Set(client.platforms) : null;
  const out: any[] = [];
  for (const n of NETS) {
    if (allowed && !allowed.has(n.snap)) continue;
    for (const path of n.paths) {
      try {
        const r = await fetch(`${MC}${path}?${qs}`, { headers: { "X-Mc-Auth": token }, cache: "no-store" });
        if (!r.ok) continue;
        const j: any = await r.json().catch(() => null);
        const arr = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
        // YouTube отдаёт весь канал — режем по датам сами
        for (const p of arr) {
          const d = postDate(p);
          if (!d || d < from || d > to) continue;
          out.push({ ...p, _net: n.network });
        }
      } catch {}
    }
  }
  return out;
}

/** Медиана просмотров — «обычный уровень аккаунта». */
export function median(values: number[]): number {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

/** Понедельник недели, в которой лежит дата. */
export function mondayOf(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Пн = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
export function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Картинка → data:URI, чтобы отчёт был самодостаточным файлом (ссылки Instagram живут недолго). */
export async function inlineImage(url: string | null | undefined, maxBytes = 900_000): Promise<string | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength > maxBytes) return url;   // слишком тяжёлая — оставляем ссылкой
    const type = r.headers.get("content-type") || "image/jpeg";
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch { return null; }
}
