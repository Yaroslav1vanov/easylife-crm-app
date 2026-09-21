import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { fetchNetworkPosts, reelFields } from "@/lib/weeklyStats";
import { handleOf } from "@/lib/socialHandles";

/* Ежедневный снимок метрик по роликам последних 45 дней у всех клиентов Metricool.
   Зачем: в недельном отчёте сравнивать ролики в одинаковом возрасте (например, «через 7 дней
   после выхода»), а не свежие против созревших. GET /api/cron/reel-snapshots */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: Request) {
  const sb = createClient();
  const sp = new URL(req.url).searchParams;
  const today = iso(new Date());
  const from = iso(new Date(Date.now() - 45 * 86400000));

  const { data: clients } = await sb.from("clients")
    .select("id, name, metricool_blog_id, timezone, platforms, stage, instagram")
    .not("metricool_blog_id", "is", null);
  const list = (clients || []).filter(c => c.stage !== "churned" && (!sp.get("clientId") || c.id === Number(sp.get("clientId"))));

  const out: { client: string; saved: number; followers?: number | null; error?: string }[] = [];
  for (const c of list) {
    const posts = await fetchNetworkPosts(c, from, today);
    const rows = posts.map(p => {
      const f = reelFields(p);
      return {
        client_id: c.id, network: p._net, post_url: f.url || `${p._net}:${f.date}:${f.views}`,
        published_at: f.date, snapshot_date: today,
        age_days: f.date ? Math.round((Date.parse(today) - Date.parse(f.date)) / 86400000) : null,
        views: f.views, reach: f.reach, likes: f.likes, comments: f.comments, saves: f.saved,
        shares: f.shares, avg_watch_sec: f.watch,
      };
    }).filter(r => r.published_at);
    // один ключ (клиент + ссылка + день) не должен встречаться в пачке дважды, иначе Postgres отклонит весь upsert
    const uniq = new Map<string, (typeof rows)[number]>();
    for (const r of rows) uniq.set(`${r.post_url}`, r);
    const list2 = Array.from(uniq.values());
    if (!list2.length) { out.push({ client: c.name, saved: 0 }); continue; }
    const { error } = await sb.from("reel_snapshots").upsert(list2, { onConflict: "client_id,post_url,snapshot_date" });
    // подписчики Instagram: Viralmaxing их часто не отдаёт, берём из ScrapeCreators
    const followers = await instagramFollowers((c as any).instagram);
    if (followers) {
      await sb.from("social_snapshots").upsert(
        { client_id: c.id, platform: "ig", snapshot_date: today, followers },
        { onConflict: "client_id,platform,snapshot_date" });
    }
    out.push({ client: c.name, saved: error ? 0 : list2.length, followers, ...(error ? { error: error.message } : {}) });
    if (error) console.error("reel_snapshots", c.name, error.message);
  }
  return NextResponse.json({ ok: true, date: today, clients: out.length, result: out });
}

/** Подписчики Instagram по ссылке из карточки клиента (ScrapeCreators). */
async function instagramFollowers(link: string | null | undefined): Promise<number | null> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  const handle = handleOf(link, "ig");
  if (!key || !handle) return null;
  try {
    const r = await fetch(`https://api.scrapecreators.com/v1/instagram/profile?handle=${encodeURIComponent(handle)}`,
      { headers: { "x-api-key": key }, cache: "no-store" });
    if (!r.ok) return null;
    const j: any = await r.json().catch(() => null);
    const u = j?.data?.user || j?.user || {};
    const n = Number(u?.edge_followed_by?.count ?? u?.follower_count ?? u?.followers ?? NaN);
    return isNaN(n) || n <= 0 ? null : Math.round(n);
  } catch { return null; }
}
