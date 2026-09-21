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

export type AccountWeek = {
  ready: boolean; views: number; reach: number; likes: number; comments: number; saved: number; shares: number;
  tracked: number; newInWeek: number; older: number; olderViews: number; baseDate: string | null; endDate: string | null;
};

/** Сколько НЕДЕЛЯ принесла по всем роликам аккаунта, включая выпущенные раньше.
 *  Считается как разница наших ежедневных снимков: снимок на конец недели минус снимок на её начало.
 *  Ролики, вышедшие внутри недели, идут целиком. */
export async function accountWeekDelta(sb: any, clientId: number, from: string, to: string): Promise<AccountWeek> {
  const empty: AccountWeek = { ready: false, views: 0, reach: 0, likes: 0, comments: 0, saved: 0, shares: 0, tracked: 0, newInWeek: 0, older: 0, olderViews: 0, baseDate: null, endDate: null };
  const { data } = await sb.from("reel_snapshots")
    .select("post_url, published_at, snapshot_date, views, reach, likes, comments, saves, shares")
    .eq("client_id", clientId).gte("snapshot_date", addDays(from, -3)).lte("snapshot_date", addDays(to, 3))
    .order("snapshot_date", { ascending: true });
  const rows = (data || []) as any[];
  if (!rows.length) return empty;
  const dates = Array.from(new Set(rows.map(r => r.snapshot_date))).sort();
  const baseDate = [...dates].reverse().find(d => d <= from) || null;           // снимок на начало недели
  const endDate = dates.find(d => d >= to) || dates[dates.length - 1] || null;  // снимок на конец недели
  if (!baseDate || !endDate || baseDate >= endDate) return { ...empty, baseDate, endDate };

  const at = (d: string) => new Map(rows.filter(r => r.snapshot_date === d).map(r => [r.post_url, r]));
  const base = at(baseDate), end = at(endDate);
  const out: AccountWeek = { ...empty, ready: true, baseDate, endDate };
  end.forEach((cur: any, url: string) => {
    const was: any = base.get(url);
    const isNew = !was || (cur.published_at && cur.published_at >= from);
    const d = (k: string) => Math.max(0, Number(cur[k] || 0) - (isNew ? 0 : Number(was?.[k] || 0)));
    out.views += d("views"); out.reach += d("reach"); out.likes += d("likes");
    out.comments += d("comments"); out.saved += d("saves"); out.shares += d("shares");
    out.tracked++;
    if (isNew) out.newInWeek++; else { out.older++; out.olderViews += d("views"); }
  });
  return out;
}

/** Прирост подписчиков за период: Metricool, метрики аккаунта (пришло минус ушло). */
export async function followersDelta(client: ClientLike, from: string, to: string): Promise<{ gained: number; lost: number; net: number } | null> {
  const token = process.env.METRICOOL_TOKEN, userId = process.env.METRICOOL_USER_ID;
  if (!token || !userId || !client.metricool_blog_id) return null;
  const tz = encodeURIComponent(client.timezone || "Europe/Kyiv");
  const one = async (metric: string): Promise<number | null> => {
    const qs = `network=instagram&subject=account&metric=${metric}&from=${from}T00:00:00&to=${to}T23:59:59`
      + `&timezone=${tz}&blogId=${client.metricool_blog_id}&userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`;
    try {
      const r = await fetch(`${MC}/v2/analytics/timelines?${qs}`, { headers: { "X-Mc-Auth": token }, cache: "no-store" });
      if (!r.ok) return null;
      const j: any = await r.json().catch(() => null);
      const values: any[] = Array.isArray(j?.data) ? (j.data[0]?.values || []) : [];
      const nums = values.map(v => Number(v?.value ?? v?.y ?? v)).filter(n => !isNaN(n));
      return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0)) : null;
    } catch { return null; }
  };
  const [gained, lost] = await Promise.all([one("followers_gained"), one("followers_lost")]);
  if (gained == null && lost == null) return null;
  return { gained: gained || 0, lost: lost || 0, net: (gained || 0) - (lost || 0) };
}
