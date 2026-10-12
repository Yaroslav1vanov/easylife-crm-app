import type { SupabaseClient } from "@supabase/supabase-js";

/* Просмотры аккаунта Instagram по дням с разбивкой (Metricool → client_view_breakdown):
   кто смотрит — подписчики или новые люди, и что смотрят — рилсы, сторис или посты.
   Нужна, чтобы видеть, растёт ли аккаунт за счёт новых людей и сколько дают сторис. */
const MC = "https://app.metricool.com/api";

export async function syncViewBreakdown(sb: SupabaseClient, clientId: number, blogId: number | string, from: string, to: string): Promise<number> {
  const user = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!user || !token) return 0;
  const q = (subject: string, scope: string) =>
    `${MC}/v2/analytics/timelines?network=instagram&metric=views&subject=${subject}&scope=${scope}&from=${from}T00:00:00&to=${to}T23:59:59`
    + `&blogId=${blogId}&userId=${encodeURIComponent(user)}&userToken=${encodeURIComponent(token)}`;
  const parts: [string, string, string][] = [
    ["followers_views", "follow_type", "FOLLOWER"], ["nonfollowers_views", "follow_type", "NON_FOLLOWER"],
    ["reels_views", "media_product_type", "REEL"], ["stories_views", "media_product_type", "STORY"], ["posts_views", "media_product_type", "POST"],
  ];
  const byDay: Record<string, Record<string, number>> = {};
  const res = await Promise.all(parts.map(([, s, sc]) => fetch(q(s, sc), { headers: { "X-Mc-Auth": token }, cache: "no-store" }).then(r => (r.ok ? r.json() : null)).catch(() => null)));
  res.forEach((j, i) => {
    for (const v of j?.data?.[0]?.values || []) {
      const d = String(v.dateTime || "").slice(0, 10);
      if (!d) continue;
      (byDay[d] ||= {})[parts[i][0]] = Math.round(Number(v.value) || 0);
    }
  });
  const rows = Object.entries(byDay).map(([day, m]) => ({ client_id: clientId, day, ...m, updated_at: new Date().toISOString() }));
  if (!rows.length) return 0;
  const { error } = await sb.from("client_view_breakdown").upsert(rows, { onConflict: "client_id,day" });
  if (error) throw new Error(error.message);
  return rows.length;
}
