import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Ежедневный сбор аналитики из Metricool в наши таблицы-снапшоты.
// Запускается Vercel Cron (см. vercel.json) и вручную: GET ?key=<CRON_SECRET>.
// Для каждого клиента с metricool_blog_id: account-метрики (/stats/values/{NET})
// + метрики постов за последние 14 дней (per-network эндпоинты).
const BASE = "https://app.metricool.com/api";
export const maxDuration = 60;

const NET_PATH: Record<string, string> = { ig: "INSTAGRAM", tt: "TIKTOK", yt: "YOUTUBE", threads: "THREADS", facebook: "FACEBOOK" };
const ci = (o: any, ...keys: string[]) => {
  if (!o || typeof o !== "object") return null;
  const lower: Record<string, any> = {};
  for (const k of Object.keys(o)) lower[k.toLowerCase()] = o[k];
  for (const k of keys) { const v = lower[k.toLowerCase()]; if (v != null) return v; }
  return null;
};
const num = (v: any) => (v == null || v === "" ? null : Math.round(Number(v)) || (Number(v) === 0 ? 0 : null));

export async function GET(req: Request) {
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return NextResponse.json({ error: "METRICOOL_* не заданы" }, { status: 400 });

  // защита: если задан CRON_SECRET — требуем его (Vercel Cron шлёт в Authorization)
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}` && url.searchParams.get("key") !== secret)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const auth = `userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`;
  const headers = { "X-Mc-Auth": token };
  const sb = createClient();

  const { data: clients } = await sb.from("clients").select("id, metricool_blog_id, platforms").not("metricool_blog_id", "is", null);
  if (!clients?.length) return NextResponse.json({ ok: true, note: "нет клиентов с metricool_blog_id", clients: 0 });

  const today = new Date();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const ymdCompact = (d: Date) => ymd(d).replace(/-/g, "");
  const from14 = new Date(today.getTime() - 14 * 864e5);
  const snapDate = ymd(today);

  const mcGet = async (path: string) => {
    try {
      const r = await fetch(`${BASE}${path}${path.includes("?") ? "&" : "?"}${auth}`, { headers });
      if (!r.ok) return null;
      return await r.json().catch(() => null);
    } catch { return null; }
  };

  let dailyRows = 0, postRows = 0;
  const log: any[] = [];

  for (const c of clients) {
    const blogId = c.metricool_blog_id;
    const platforms: string[] = (c.platforms?.length ? c.platforms : ["ig", "tt", "yt", "threads"]);

    for (const net of platforms) {
      const NET = NET_PATH[net]; if (!NET) continue;

      // ── account-метрики на сегодня ──
      const vals = await mcGet(`/stats/values/${NET}?start=${ymdCompact(today)}&end=${ymdCompact(today)}&blogId=${blogId}`);
      if (vals && typeof vals === "object") {
        const row = {
          client_id: c.id, blog_id: blogId, network: net, snap_date: snapDate,
          followers: num(ci(vals, "Followers", "followers", "followers_count", "instagramFollowers")),
          reach: num(ci(vals, "reach")),
          views: num(ci(vals, "views", "video_views")),
          accounts_engaged: num(ci(vals, "accounts_engaged")),
          raw: vals,
        };
        const { error } = await sb.from("analytics_daily").upsert(row, { onConflict: "client_id,network,snap_date" });
        if (!error) dailyRows++;
      }

      // ── метрики постов за 14 дней ──
      const range = `from=${ymd(from14)}T00:00:00&to=${ymd(today)}T23:59:59&timezone=Europe/Kyiv&blogId=${blogId}`;
      const endpoints: { path: string; type: string }[] =
        net === "ig" ? [{ path: `/v2/analytics/posts/instagram?${range}`, type: "post" }, { path: `/v2/analytics/reels/instagram?${range}`, type: "reel" }]
        : net === "tt" ? [{ path: `/v2/analytics/posts/tiktok?${range}`, type: "video" }]
        : net === "threads" ? [{ path: `/v2/analytics/posts/threads?${range}`, type: "post" }]
        : [];

      for (const ep of endpoints) {
        const res = await mcGet(ep.path);
        const arr: any[] = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        for (const p of arr) {
          const postId = String(ci(p, "postId", "reelId", "videoId", "id") ?? "");
          if (!postId) continue;
          const likes = num(ci(p, "likes", "likeCount"));
          const comments = num(ci(p, "comments", "commentCount", "replies"));
          const shares = num(ci(p, "shares", "shareCount", "reposts"));
          const views = num(ci(p, "views", "viewCount", "impressionsTotal"));
          const row = {
            client_id: c.id, blog_id: blogId, network: net, post_id: postId, post_type: ep.type,
            published_at: ci(p, "publishedAt", "publishedDate", "createTime") || null,
            url: ci(p, "url", "shareUrl", "permalink", "link"),
            thumbnail_url: ci(p, "imageUrl", "coverImageUrl", "thumbnailUrl", "picture"),
            content: ci(p, "content", "videoDescription", "text", "title"),
            views, likes, comments, shares,
            saved: num(ci(p, "saved", "saves")),
            reach: num(ci(p, "reach")),
            engagement: ci(p, "engagement") != null ? Number(ci(p, "engagement")) : null,
            raw: p,
          };
          const { error } = await sb.from("analytics_posts").upsert(row, { onConflict: "client_id,network,post_id" });
          if (!error) postRows++;
        }
      }
    }
    log.push({ client: c.id });
  }

  return NextResponse.json({ ok: true, clients: clients.length, dailyRows, postRows, snapDate });
}
