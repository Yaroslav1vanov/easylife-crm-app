import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Read-only аналитика за произвольный период — источник цифр для месячных отчётов клиентам.
// GET /api/metricool/analytics?from=2026-06-01&to=2026-06-30&clientId=25
//   from,to    — границы периода (YYYY-MM-DD), обязательны
//   clientId   — необяз., фильтр на одного клиента (иначе все с metricool_blog_id)
//   tz         — необяз. таймзона (по умолч. Europe/Kyiv)
// Возвращает по IG: reach/interactions/ER/кол-во постов+рилс за период + попытку followers было→стало.
const BASE = "https://app.metricool.com/api";
export const maxDuration = 60;

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

  const sp = new URL(req.url).searchParams;
  const from = sp.get("from"), to = sp.get("to");
  if (!from || !to) return NextResponse.json({ error: "нужны from и to (YYYY-MM-DD)" }, { status: 400 });
  const tz = sp.get("tz") || "Europe/Kyiv";
  const clientIdFilter = sp.get("clientId");

  const compact = (ymd: string) => ymd.replace(/-/g, "");
  const auth = `userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`;
  const headers = { "X-Mc-Auth": token };
  const mcGet = async (path: string) => {
    try {
      const r = await fetch(`${BASE}${path}${path.includes("?") ? "&" : "?"}${auth}`, { headers });
      if (!r.ok) return { _err: r.status };
      return await r.json().catch(() => null);
    } catch (e: any) { return { _err: String(e) }; }
  };
  const listOf = (j: any): any[] => (Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []);
  const sumField = (arr: any[], ...keys: string[]) => {
    let s = 0, has = false;
    for (const it of arr) { const v = ci(it, ...keys); if (v != null) { s += Number(v) || 0; has = true; } }
    return has ? Math.round(s) : null;
  };

  const sb = createClient();
  let q = sb.from("clients").select("id, name, surname, metricool_blog_id, platforms").not("metricool_blog_id", "is", null);
  if (clientIdFilter) q = q.eq("id", Number(clientIdFilter));
  const { data: clients } = await q;
  if (!clients?.length) return NextResponse.json({ ok: true, note: "нет клиентов с metricool_blog_id", rows: [] });

  const range = `from=${from}T00:00:00&to=${to}T23:59:59&timezone=${encodeURIComponent(tz)}`;

  // debug=1 — сырой дамп кандидатов на «подписчиков», чтобы найти рабочий эндпоинт
  if (sp.get("debug") === "1") {
    const bId = clients[0].metricool_blog_id;
    const s = compact(from), e = compact(to);
    const probes: Record<string, string> = {
      timeline_Followers: `/stats/timeline/Followers?start=${s}&end=${e}&blogId=${bId}`,
      timeline_Community: `/stats/timeline/Community?start=${s}&end=${e}&blogId=${bId}`,
      timeline_InstagramFollowers: `/stats/timeline/InstagramFollowers?start=${s}&end=${e}&blogId=${bId}`,
      explore_followers: `/explore/followers/${bId}?start=${s}&end=${e}`,
      values_instagram: `/stats/values/INSTAGRAM?start=${s}&end=${e}&blogId=${bId}`,
      v2_ig_account_postsCount: `/v2/analytics/timelines?network=instagram&metric=postsCount&${range}&blogId=${bId}`,
    };
    const out: Record<string, any> = { blogId: bId };
    for (const [k, path] of Object.entries(probes)) out[k] = await mcGet(path);
    return NextResponse.json({ ok: true, debug: true, probes: out });
  }

  // raw=1 — сырые reels/posts за период (для топ-постов и динамики по неделям)
  if (sp.get("raw") === "1") {
    const bId = clients[0].metricool_blog_id;
    const posts = listOf(await mcGet(`/v2/analytics/posts/instagram?${range}&blogId=${bId}`));
    const reels = listOf(await mcGet(`/v2/analytics/reels/instagram?${range}&blogId=${bId}`));
    return NextResponse.json({ ok: true, raw: true, blogId: bId, posts, reels });
  }

  // followers было→стало: пробуем несколько источников, возвращаем сырьё для диагностики
  const fetchFollowers = async (blogId: any) => {
    const dbg: any = {};
    // 1) v1 timeline по дням
    const tl = await mcGet(`/stats/timeline/Followers?start=${compact(from)}&end=${compact(to)}&blogId=${blogId}`);
    dbg.timeline_type = Array.isArray(tl) ? "array" : Array.isArray(tl?.data) ? "data[]" : typeof tl;
    const series = listOf(tl);
    let start: number | null = null, end: number | null = null;
    if (series.length) {
      const val = (row: any) => {
        if (Array.isArray(row)) return Number(row[1]);
        return Number(ci(row, "value", "followers", "Followers", "y"));
      };
      start = int(val(series[0]));
      end = int(val(series[series.length - 1]));
      dbg.points = series.length;
      dbg.sample = series.slice(0, 2);
    }
    // 2) fallback: одиночное значение на конец периода
    if (end == null) {
      const v = await mcGet(`/stats/values/INSTAGRAM?start=${compact(from)}&end=${compact(to)}&blogId=${blogId}`);
      end = int(ci(v, "Followers", "followers"));
      dbg.values_fallback = end;
    }
    return { start, end, _dbg: dbg };
  };

  const rows: any[] = [];
  for (const c of clients) {
    const blogId = c.metricool_blog_id;
    const plats: string[] = (c.platforms || []);
    if (!plats.includes("ig")) continue; // отчёт строим по IG
    try {
      const posts = listOf(await mcGet(`/v2/analytics/posts/instagram?${range}&blogId=${blogId}`));
      const reels = listOf(await mcGet(`/v2/analytics/reels/instagram?${range}&blogId=${blogId}`));
      const all = [...posts, ...reels];
      const reach = sumField(all, "reach");
      const impressions = sumField(all, "impressions");
      const inter = sumField(all, "interactions");
      const er = reach && inter != null ? Math.round((inter / reach) * 10000) / 100 : null;
      const followers = await fetchFollowers(blogId);
      rows.push({
        client_id: c.id,
        client: [c.name, c.surname].filter(Boolean).join(" "),
        blogId,
        period: { from, to },
        posts_count: posts.length,
        reels_count: reels.length,
        content_units: all.length,
        reach,
        impressions,
        interactions: inter,
        engagement_rate: er,
        followers_start: followers.start,
        followers_end: followers.end,
        followers_delta: followers.start != null && followers.end != null ? followers.end - followers.start : null,
        _dbg_followers: followers._dbg,
      });
    } catch (e: any) {
      rows.push({ client_id: c.id, error: String(e) });
    }
  }

  return NextResponse.json({ ok: true, from, to, tz, rows });
}
