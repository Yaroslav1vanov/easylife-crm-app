import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, fetchNetworkPosts, reelFields } from "@/lib/weeklyStats";

/* Вышедшие ролики клиента (из аналитики Metricool) → ссылка в карточку сценария + его цифры.
   Неважно, выложили ролик через CRM или вручную с телефона: берём реальные посты за 60 дней
   и сопоставляем со сценариями без ссылки — от точного к осторожному:
     1) ссылка уже есть в публикации этого сценария (вышла через CRM);
     2) подпись ролика = подпись НАШЕЙ публикации этого сценария (CRM сама её отправляла) — почти точное совпадение;
     3) похожий текст описания — только сильное и однозначное совпадение, без слов, общих для всего аккаунта
        (у Lash Couture «lash, lashes, DM…» есть в каждой подписи — 22.10 ролики цеплялись к соседним сценариям),
        и дата выхода в пределах 2 дней;
     4) сценарий уже вручную отмечен «опубликован», а в этот день у клиента ровно один ролик Instagram.
   Сценарий без ссылки, но «готов / в монтаже» по пп. 1–3 становится «опубликован», прежний статус запоминаем.
   Ссылку сняли или поменяли вручную (autolink_off) — сценарий больше не трогаем. */

export type Reel = { date: string; net: string; url: string | null; title: string; views: number; likes: number | null; comments: number | null; reach: number | null; retention: number | null; skip: number | null; ts?: number | null };

/** Время выхода поста в UTC (мс). Metricool отдаёт местное время + часовой пояс бренда (IG), TikTok — со смещением. */
function postTs(p: any): number | null {
  const pa = p?.publishedAt;
  if (pa && typeof pa === "object" && pa.dateTime) {
    const asUtc = Date.parse(String(pa.dateTime).slice(0, 19) + "Z");
    if (!isFinite(asUtc)) return null;
    if (!pa.timezone) return asUtc;
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: pa.timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(new Date(asUtc)).map(x => [x.type, x.value]));
      const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
      return asUtc - (local - asUtc);
    } catch { return asUtc; }
  }
  const t = Date.parse(String(p?.createTime || pa || p?.created || "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return isFinite(t) ? t : null;
}

const code = (u: string | null | undefined) => String(u || "").match(/(?:reel|reels|p|video|shorts)\/([A-Za-z0-9_-]+)/)?.[1] || null;
const norm = (s: string | null | undefined) => String(s || "").toLowerCase().replace(/https?:\S+/g, " ").replace(/[^a-zа-яёіїєґ0-9]+/g, " ").trim();
const head = (s: string | null | undefined) => norm(s).slice(0, 60);
const tokens = (s: string | null | undefined) => Array.from(new Set(norm(s).split(" ").filter(w => w.length >= 3))).slice(0, 40);
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 864e5;

export async function linkPublishedReels(
  sb: SupabaseClient,
  client: { id: number; metricool_blog_id: number | null; timezone?: string | null; platforms?: string[] | null },
): Promise<{ linked: number; updated: number; reels: Reel[] }> {
  if (!client.metricool_blog_id) return { linked: 0, updated: 0, reels: [] };
  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -60);
  const raw = await fetchNetworkPosts(client, from, today);
  const reels: Reel[] = raw.map((p: any) => { const f = reelFields(p); return { date: f.date || "", net: p._net, url: f.url, title: f.title, views: f.views, likes: f.likes, comments: f.comments, reach: f.reach, retention: f.ret, skip: f.skip, ts: postTs(p) }; })
    .filter(r => r.date && r.url).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!reels.length) return { linked: 0, updated: 0, reels };

  const { data: scripts } = await sb.from("scripts").select("id, pub_date, hook, hook_text, post_caption, published_url, video_status, our_views, our_retention_pct, autolink_off")
    .eq("client_id", client.id).gte("pub_date", addDays(from, -3));
  const list = (scripts || []) as any[];
  const ids = list.map(s => s.id);
  const { data: pubs } = ids.length ? await sb.from("publications").select("script_id, published_urls, caption_ig, base_text, publish_at").in("script_id", ids) : { data: [] as any[] };
  const pubOf = new Map((pubs || []).map((p: any) => [p.script_id, p]));
  const byCode = new Map(reels.map(r => [code(r.url), r]));
  const used = new Set(list.map(s => code(s.published_url)).filter(Boolean) as string[]);

  // Чей это ролик по времени выхода: публикация CRM, вышедшая в те же ±20 минут (в т.ч. пробные и без сценария).
  // Ролик чужой публикации никогда не привязываем к другому сценарию (22.10: пробный MedSpa ушёл в «13. Процедуры…»).
  const { data: allPubs } = await sb.from("publications").select("id, script_id, publish_at, pub_status")
    .eq("client_id", client.id).gte("publish_at", addDays(from, -1)).in("pub_status", ["published", "scheduled", "error"]);
  const owner = new Map<Reel, any>();
  for (const r of reels) {
    if (r.ts == null) continue;
    let best: any = null, bestD = 20 * 60 * 1000;
    for (const p of (allPubs || []) as any[]) {
      const d = Math.abs(Date.parse(p.publish_at) - r.ts);
      if (d <= bestD) { best = p; bestD = d; }
    }
    if (best) owner.set(r, best);
  }
  const othersReel = (r: Reel, sid: number) => { const o = owner.get(r); return !!o && o.script_id !== sid; };

  // слова, которые есть в трети и больше подписей аккаунта, — не признак конкретного ролика
  const df = new Map<string, number>();
  for (const r of reels) for (const w of tokens(r.title)) df.set(w, (df.get(w) || 0) + 1);
  const common = new Set(Array.from(df.entries()).filter(([, n]) => reels.length >= 4 && n / reels.length >= 0.3).map(([w]) => w));
  const distinct = (s: string | null | undefined) => tokens(s).filter(w => !common.has(w));
  const sim = (a: string | null | undefined, b: string | null | undefined) => {
    const A = distinct(a), B = new Set(distinct(b));
    if (A.length < 4 || B.size < 4) return 0;
    const inter = A.filter(w => B.has(w)).length;
    return inter >= 4 ? inter / Math.min(A.length, B.size) : 0;
  };

  let linked = 0, updated = 0;
  const stats = (r: Reel) => ({ our_views: r.views, our_likes: r.likes, our_comments: r.comments, our_stats_at: new Date().toISOString(),
    our_retention_pct: r.retention, our_skip_rate: r.skip != null ? Math.round(r.skip * 10) / 10 : null });

  for (const s of list) {
    if (s.autolink_off) continue;   // ссылку правили руками — не вмешиваемся
    // уже привязан — освежаем цифры
    if (s.published_url) {
      const r = byCode.get(code(s.published_url));
      if (r && (r.views !== s.our_views || s.our_retention_pct == null)) { await sb.from("scripts").update(stats(r)).eq("id", s.id); updated++; }
      continue;
    }
    if (!["published", "ready", "review", "inProgress"].includes(s.video_status)) continue;
    const pub: any = pubOf.get(s.id);
    const free = (r: Reel) => !used.has(code(r.url) || "") && !othersReel(r, s.id);
    let match: Reel | null = null;
    // 1) вышло через CRM — ссылка уже в публикации
    const pubUrl = pub?.published_urls ? (pub.published_urls.ig || pub.published_urls.instagram || Object.values(pub.published_urls)[0]) : null;
    if (pubUrl && !used.has(code(pubUrl as string) || "")) match = byCode.get(code(pubUrl as string)) || { date: s.pub_date, net: "instagram", url: pubUrl as string, title: "", views: 0, likes: null, comments: null, reach: null, retention: null, skip: null };
    // 1б) ролик вышел ровно во время нашей публикации этого сценария (±20 минут)
    if (!match) {
      const mine = reels.filter(r => free(r) && owner.get(r)?.script_id === s.id);
      if (mine.length) match = mine.find(r => r.net === "instagram") || mine[0];
    }
    // 2) подпись ролика = подпись нашей публикации этого сценария
    if (!match && pub) {
      const h = head(pub.caption_ig) || head(pub.base_text);
      if (h.length >= 20) {
        const hits = reels.filter(r => free(r) && head(r.title) === h);
        if (hits.length) match = hits.find(r => r.net === "instagram") || hits[0];
      }
    }
    // 3) похожий текст — только сильное и однозначное совпадение рядом с датой
    if (!match && s.pub_date) {
      const texts = [s.post_caption, pub?.caption_ig, pub?.base_text, s.hook_text];
      const scored = reels.filter(r => free(r) && dayDiff(r.date, s.pub_date) <= 2)
        .map(r => ({ r, sc: Math.max(...texts.map(t => sim(t, r.title))) }))
        .filter(x => x.sc >= 0.6).sort((a, b) => b.sc - a.sc);
      if (scored.length && (scored.length === 1 || scored[0].sc - scored[1].sc >= 0.2)) match = scored[0].r;
    }
    // 4) сценарий уже отмечен «опубликован», в этот день ровно один ролик Instagram и один такой сценарий
    let byDateOnly = false;
    if (!match && s.pub_date && s.video_status === "published") {
      const near = reels.filter(r => r.net === "instagram" && free(r) && dayDiff(r.date, s.pub_date) === 0);
      const otherScripts = list.filter(x => x.id !== s.id && !x.published_url && x.pub_date === s.pub_date);
      if (near.length === 1 && otherScripts.length === 0) { match = near[0]; byDateOnly = true; }
    }
    if (!match?.url) continue;
    used.add(code(match.url) || match.url);
    await sb.from("scripts").update({
      published_url: match.url, ...(match.views ? stats(match) : {}),
      // «опубликован» ставим только при надёжной привязке (пп. 1–3); прежний статус — чтобы вернуть, если ссылку снимут
      ...(!byDateOnly && s.video_status !== "published" ? { video_status: "published", autolink_prev_status: s.video_status } : {}),
      ...(!s.pub_date && match.date ? { pub_date: match.date } : {}),
    }).eq("id", s.id);
    linked++;
  }
  return { linked, updated, reels };
}
