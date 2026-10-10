import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, fetchNetworkPosts, reelFields } from "@/lib/weeklyStats";

/* Вышедшие ролики клиента (из аналитики Metricool) → ссылка в карточку сценария + его цифры.
   Неважно, выложили ролик через CRM или вручную с телефона: берём реальные посты за 60 дней
   и сопоставляем со сценариями без ссылки:
     1) ссылка уже есть в публикации этого сценария (вышла через CRM);
     2) совпадает текст описания (подпись ролика ↔ описание / тексты публикации / тема);
     3) единственный ролик в Instagram в ±1 день от даты публикации в CRM.
   В сценарий пишутся published_url и our_views / our_likes / our_comments — «Результат: исходник vs наше»
   заполняется сам. У уже привязанных сценариев цифры просто обновляются. */

export type Reel = { date: string; net: string; url: string | null; title: string; views: number; likes: number | null; comments: number | null; reach: number | null };

const code = (u: string | null | undefined) => String(u || "").match(/(?:reel|reels|p|video|shorts)\/([A-Za-z0-9_-]+)/)?.[1] || null;
const words = (s: string | null | undefined) => new Set(String(s || "").toLowerCase().replace(/https?:\S+/g, " ").replace(/[^a-zа-яёіїєґ0-9]+/g, " ").split(" ").filter(w => w.length >= 3).slice(0, 30));
function similar(a: string | null | undefined, b: string | null | undefined) {
  const A = words(a), B = words(b);
  if (A.size < 3 || B.size < 3) return 0;
  let inter = 0; A.forEach(w => { if (B.has(w)) inter++; });
  return inter / Math.min(A.size, B.size);
}
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 864e5;

export async function linkPublishedReels(
  sb: SupabaseClient,
  client: { id: number; metricool_blog_id: number | null; timezone?: string | null; platforms?: string[] | null },
): Promise<{ linked: number; updated: number; reels: Reel[] }> {
  if (!client.metricool_blog_id) return { linked: 0, updated: 0, reels: [] };
  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -60);
  const raw = await fetchNetworkPosts(client, from, today);
  const reels: Reel[] = raw.map((p: any) => { const f = reelFields(p); return { date: f.date || "", net: p._net, url: f.url, title: f.title, views: f.views, likes: f.likes, comments: f.comments, reach: f.reach }; })
    .filter(r => r.date && r.url).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!reels.length) return { linked: 0, updated: 0, reels };

  const { data: scripts } = await sb.from("scripts").select("id, pub_date, hook, hook_text, post_caption, published_url, video_status, our_views")
    .eq("client_id", client.id).gte("pub_date", addDays(from, -3));
  const list = (scripts || []) as any[];
  const ids = list.map(s => s.id);
  const { data: pubs } = ids.length ? await sb.from("publications").select("script_id, published_urls, caption_ig, base_text").in("script_id", ids) : { data: [] as any[] };
  const pubOf = new Map((pubs || []).map((p: any) => [p.script_id, p]));
  const byCode = new Map(reels.map(r => [code(r.url), r]));
  const used = new Set(list.map(s => code(s.published_url)).filter(Boolean) as string[]);

  let linked = 0, updated = 0;
  const stats = (r: Reel) => ({ our_views: r.views, our_likes: r.likes, our_comments: r.comments, our_stats_at: new Date().toISOString() });

  for (const s of list) {
    // уже привязан — освежаем цифры
    if (s.published_url) {
      const r = byCode.get(code(s.published_url));
      if (r && r.views !== s.our_views) { await sb.from("scripts").update(stats(r)).eq("id", s.id); updated++; }
      continue;
    }
    if (!["published", "ready"].includes(s.video_status)) continue;
    const pub: any = pubOf.get(s.id);
    let match: Reel | null = null;
    // 1) вышло через CRM — ссылка уже в публикации
    const pubUrl = pub?.published_urls ? (pub.published_urls.ig || pub.published_urls.instagram || Object.values(pub.published_urls)[0]) : null;
    if (pubUrl && !used.has(code(pubUrl as string) || "")) match = byCode.get(code(pubUrl as string)) || { date: s.pub_date, net: "instagram", url: pubUrl as string, title: "", views: 0, likes: null, comments: null, reach: null };
    // 2) по тексту описания
    if (!match) {
      const texts = [s.post_caption, pub?.caption_ig, pub?.base_text, s.hook_text, s.hook];
      let best = 0;
      for (const r of reels) {
        if (used.has(code(r.url) || "")) continue;
        if (s.pub_date && dayDiff(r.date, s.pub_date) > 7) continue;
        const sc = Math.max(...texts.map(t => similar(t, r.title))) + (r.net === "instagram" ? 0.01 : 0);
        if (sc > best && sc >= 0.5) { best = sc; match = r; }
      }
    }
    // 3) единственный ролик Instagram рядом с датой
    if (!match && s.pub_date && s.video_status === "published") {
      const near = reels.filter(r => r.net === "instagram" && !used.has(code(r.url) || "") && dayDiff(r.date, s.pub_date) <= 1);
      const otherScripts = list.filter(x => x.id !== s.id && !x.published_url && x.pub_date && dayDiff(x.pub_date, s.pub_date) <= 1);
      if (near.length === 1 && otherScripts.length === 0) match = near[0];
    }
    if (!match?.url) continue;
    used.add(code(match.url) || match.url);
    await sb.from("scripts").update({ published_url: match.url, ...(match.views ? stats(match) : {}) }).eq("id", s.id);
    linked++;
  }
  return { linked, updated, reels };
}
