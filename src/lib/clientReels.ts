import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, fetchNetworkPosts, median, reelFields } from "@/lib/weeklyStats";

/* Ролики клиента за период с метриками и нашим названием из контент-плана.
   Используется в разворачивающемся месяце статистики и в отчётах. */

export type ClientReel = {
  date: string; net: string; title: string; ourTitle: string | null; caption: string;
  url: string | null; image: string | null;
  views: number; reach: number | null; likes: number | null; comments: number | null;
  saves: number | null; shares: number | null; er: number | null; retention: number | null;
  duration: number | null; x: number; isOurs: boolean;
};

const code = (u: string | null | undefined) => {
  const m = String(u || "").match(/(?:reel|reels|p|video)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
};

export async function clientReels(
  sb: SupabaseClient,
  client: { id: number; metricool_blog_id: number | null; timezone?: string | null; platforms?: string[] | null },
  from: string,
  to: string,
): Promise<ClientReel[]> {
  if (!client.metricool_blog_id) return [];
  const [raw, hist, scr] = await Promise.all([
    fetchNetworkPosts(client, from, to),
    fetchNetworkPosts(client, addDays(from, -60), addDays(from, -1)),
    sb.from("scripts").select("id, pub_date, hook_text, hook, video_status, published_url")
      .eq("client_id", client.id).gte("pub_date", addDays(from, -1)).lte("pub_date", addDays(to, 1)),
  ]);
  const norm = median(hist.map(p => reelFields(p).views).filter(v => v > 0).slice(-30)) || 1;
  const scripts = (scr.data || []) as any[];
  const nameOf = (x: any) => String(x.hook_text || x.hook || "").replace(/^Сценарий #\d+$/, "").trim();
  const byCode = new Map(scripts.filter(x => x.published_url).map(x => [code(x.published_url), x]));
  const used = new Set<number>();

  return raw
    .map(p => ({ f: reelFields(p), net: (p as any)._net as string }))
    .filter(r => r.f.date)
    .sort((a, b) => (b.f.date! > a.f.date! ? 1 : -1))
    .map(({ f, net }) => {
      let sc = (code(f.url) && byCode.get(code(f.url))) || null;
      if (!sc) sc = scripts.find(x => x.pub_date === f.date && x.video_status === "published" && !used.has(x.id) && nameOf(x)) || null;
      if (!sc) sc = scripts.find(x => x.pub_date === f.date && !used.has(x.id) && nameOf(x)) || null;
      if (sc) used.add(sc.id);
      const base = f.reach || f.views;
      const caption = f.title.replace(/^@\S+\s*/, "").trim();
      return {
        date: f.date!, net, ourTitle: sc ? nameOf(sc) : null, caption,
        title: (sc ? nameOf(sc) : "") || caption || "без подписи",
        url: f.url, image: f.image,
        views: f.views, reach: f.reach, likes: f.likes, comments: f.comments, saves: f.saved, shares: f.shares,
        er: base ? Math.round((((f.likes || 0) + (f.comments || 0) + (f.saved || 0) + (f.shares || 0)) / base) * 1000) / 10 : null,
        retention: f.ret, duration: f.dur,
        x: Math.round((f.views / norm) * 100) / 100,
        isOurs: !!sc,
      };
    });
}
