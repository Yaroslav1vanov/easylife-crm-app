import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// On-demand сбор базовой соц-статистики для карточек клиентов (без крона).
// Для каждого клиента с metricool_blog_id и платформой ig/tt/yt тянет
// /stats/values/{NET} за 30 дней → followers / reach_30d / ER → social_snapshots.
// ?dry=1 — не писать в БД, только вернуть распарсенные числа (для проверки).
const BASE = "https://app.metricool.com/api";
export const maxDuration = 60;

const NET: Record<string, string> = { ig: "INSTAGRAM", tt: "TIKTOK", yt: "YOUTUBE" };
const ci = (o: any, ...keys: string[]) => {
  if (!o || typeof o !== "object") return null;
  const low: Record<string, any> = {};
  for (const k of Object.keys(o)) low[k.toLowerCase()] = o[k];
  for (const k of keys) { const v = low[k.toLowerCase()]; if (v != null && v !== "") return v; }
  return null;
};
const int = (v: any) => (v == null ? null : Math.round(Number(v)));

export async function GET(req: Request) {
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return NextResponse.json({ error: "METRICOOL_* не заданы" }, { status: 400 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";

  const auth = `userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`;
  const headers = { "X-Mc-Auth": token };
  const sb = createClient();

  const { data: clients } = await sb.from("clients").select("id, name, metricool_blog_id, platforms").not("metricool_blog_id", "is", null);
  if (!clients?.length) return NextResponse.json({ ok: true, note: "нет клиентов с metricool_blog_id", written: 0 });

  const today = new Date();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const compact = (d: Date) => ymd(d).replace(/-/g, "");
  const from30 = new Date(today.getTime() - 30 * 864e5);
  const snapDate = ymd(today);

  const mcGet = async (path: string) => {
    try { const r = await fetch(`${BASE}${path}${path.includes("?") ? "&" : "?"}${auth}`, { headers }); if (!r.ok) return null; return await r.json().catch(() => null); }
    catch { return null; }
  };
  const range = `from=${ymd(from30)}T00:00:00&to=${ymd(today)}T23:59:59&timezone=Europe/Kyiv`;
  const listOf = (j: any): any[] => (Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []);
  const sumField = (arr: any[], ...keys: string[]) => {
    let s = 0, has = false;
    for (const it of arr) { const v = ci(it, ...keys); if (v != null) { s += Number(v) || 0; has = true; } }
    return has ? Math.round(s) : null;
  };

  const rows: any[] = [];
  for (const c of clients) {
    const plats: string[] = (c.platforms || []).filter((p: string) => NET[p]);
    const blogId = c.metricool_blog_id;
    for (const p of plats) {
      try {
        let followers: number | null = null, reach: number | null = null, er: number | null = null;
        let dbg: any = {};
        if (p === "ig") {
          // подписчики — текущее число; охват/ER — суммарно по постам и рилсам за 30 дней
          const v = await mcGet(`/stats/values/INSTAGRAM?start=${compact(from30)}&end=${compact(today)}&blogId=${blogId}`);
          followers = int(ci(v, "Followers", "followers"));
          const posts = listOf(await mcGet(`/v2/analytics/posts/instagram?${range}&blogId=${blogId}`));
          const reels = listOf(await mcGet(`/v2/analytics/reels/instagram?${range}&blogId=${blogId}`));
          const all = [...posts, ...reels];
          reach = sumField(all, "reach");
          const inter = sumField(all, "interactions");
          er = reach && inter != null ? Math.round((inter / reach) * 10000) / 100 : null;
          dbg = { posts: posts.length, reels: reels.length, reach, inter };
        } else if (p === "tt") {
          // у TikTok в публичном API нет подписчиков/reach; берём просмотры за период как «охват»
          const vids = listOf(await mcGet(`/v2/analytics/posts/tiktok?${range}&blogId=${blogId}`));
          reach = sumField(vids, "viewCount", "views");
          dbg = { videos: vids.length, views: reach };
        } else if (p === "yt") {
          const vids = listOf(await mcGet(`/stats/youtube/videos?start=${compact(from30)}&end=${compact(today)}&blogId=${blogId}`));
          reach = sumField(vids, "views", "viewCount");
          dbg = { videos: vids.length, views: reach };
        }
        rows.push({ client_id: c.id, client: c.name, platform: p, snapshot_date: snapDate, followers, reach_30d: reach, engagement_rate: er, _dbg: dbg });
      } catch (e: any) { rows.push({ client_id: c.id, platform: p, error: String(e) }); }
    }
  }

  if (dry) return NextResponse.json({ ok: true, dry: true, rows });

  let written = 0;
  for (const row of rows) {
    if (row.error) continue;
    const { error } = await sb.from("social_snapshots").upsert(
      { client_id: row.client_id, platform: row.platform, snapshot_date: row.snapshot_date, followers: row.followers, reach_30d: row.reach_30d, engagement_rate: row.engagement_rate },
      { onConflict: "client_id,platform,snapshot_date" }
    );
    if (!error) written++;
  }
  return NextResponse.json({ ok: true, written, total: rows.length, snapDate });
}
