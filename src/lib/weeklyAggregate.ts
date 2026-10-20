import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, fetchNetworkPosts, followersDelta, median, mondayOf, reelFields } from "@/lib/weeklyStats";

/* Итоги одной недели по клиенту → строка client_weekly_stats.
   Ролики недели берём из Metricool, прирост подписчиков — из метрик аккаунта,
   «наших роликов» — из CRM. Рекламные/нерасходившиеся ролики в статистику не идут. */

export type WeekRow = {
  client_id: number; week_start: string; week_end: string;
  reels_count: number; posts_count: number; by_net: Record<string, number>; our_videos: number | null;
  views: number; reach: number; likes: number; comments: number; saves: number; shares: number;
  er: number | null; avg_retention: number | null;
  followers_end: number | null; followers_gained: number | null; followers_lost: number | null;
  top_post: any | null; collected_at: string;
};

type ClientLike = { id: number; metricool_blog_id: number | null; timezone?: string | null; platforms?: string[] | null };

export async function collectClientWeek(sb: SupabaseClient, client: ClientLike, weekStart: string): Promise<WeekRow | null> {
  if (!client.metricool_blog_id) return null;
  const from = mondayOf(weekStart), to = addDays(from, 6);

  const [raw, hist] = await Promise.all([
    fetchNetworkPosts(client, from, to),
    fetchNetworkPosts(client, addDays(from, -60), addDays(from, -1)),
  ]);
  // «обычный уровень» по каждой площадке свой; почти не показанные (реклама из кабинета, тесты) — меньше 3% нормы.
  // Жёсткий порог 50 просмотров убран: у небольших аккаунтов (Lash Couture) так выпадали все ролики недели.
  const netNorm: Record<string, number> = {};
  for (const net of Array.from(new Set(hist.map((p: any) => p._net as string)))) {
    const v = hist.filter((p: any) => p._net === net).map(p => reelFields(p).views).filter(x => x > 0);
    netNorm[net] = median(v.slice(-30)) || median(v) || 1;
  }
  const items = raw.map(p => ({ ...reelFields(p), net: (p as any)._net as string }))
    .filter(r => !(r.views < Math.max(5, (netNorm[r.net] || 1) * 0.03)));
  // один ролик в Instagram, TikTok и YouTube — это 1 ролик и 3 публикации
  const byNet: Record<string, number> = {};
  for (const r of items) byNet[r.net] = (byNet[r.net] || 0) + 1;
  const uniqueReels = Math.max(0, ...Object.values(byNet));

  const sum = (k: "views" | "reach" | "likes" | "comments" | "saved" | "shares") =>
    items.reduce((a, r) => a + (Number((r as any)[k]) || 0), 0);
  const views = sum("views"), reach = sum("reach"), likes = sum("likes"),
    comments = sum("comments"), saves = sum("saved"), shares = sum("shares");
  const rets = items.map(r => r.ret).filter((v): v is number => v != null);
  const base = reach || views;

  const [{ count: ourVideos }, fd, snap] = await Promise.all([
    sb.from("scripts").select("id", { count: "exact", head: true })
      .eq("client_id", client.id).eq("video_status", "published").gte("pub_date", from).lte("pub_date", to),
    followersDelta(client, from, to),
    sb.from("social_snapshots").select("followers, snapshot_date").eq("client_id", client.id)
      .eq("platform", "ig").gt("followers", 0).lte("snapshot_date", to)
      .order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const top = items.length ? items.reduce((a, b) => (b.views > a.views ? b : a), items[0]) : null;
  return {
    client_id: client.id, week_start: from, week_end: to,
    reels_count: uniqueReels, posts_count: items.length, by_net: byNet, our_videos: ourVideos ?? null,
    views, reach, likes, comments, saves, shares,
    er: base ? Math.round(((likes + comments + saves + shares) / base) * 1000) / 10 : null,
    avg_retention: rets.length ? Math.round(rets.reduce((a, b) => a + b, 0) / rets.length) : null,
    followers_end: (snap.data as any)?.followers ?? null,
    followers_gained: fd?.gained ?? null, followers_lost: fd?.lost ?? null,
    top_post: top ? { title: safeText(top.title.slice(0, 120)), url: top.url || null, views: top.views, date: top.date || null, image: top.image || null } : null,
    collected_at: new Date().toISOString(),
  };
}

/** Понедельники всех недель от start до end включительно. */
export function weeksBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let w = mondayOf(start);
  const last = mondayOf(end);
  while (w <= last && out.length < 200) { out.push(w); w = addDays(w, 7); }
  return out;
}

/** Текст без управляющих символов и «половинок» эмодзи — иначе Postgres не принимает JSON. */
function safeText(v: string): string {
  return String(v || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
