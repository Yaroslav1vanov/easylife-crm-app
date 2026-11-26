import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, fetchNetworkPosts, median, reelFields } from "@/lib/weeklyStats";

/* Ролики клиента за период с метриками и нашим названием из контент-плана.
   Используется в разворачивающемся месяце статистики и в отчётах. */

export type ClientReel = {
  date: string; net: string; title: string; ourTitle: string | null; caption: string;
  url: string | null; image: string | null;
  views: number; reach: number | null; likes: number | null; comments: number | null;
  saves: number | null; shares: number | null; er: number | null; retention: number | null; retLoop?: boolean; retRaw?: number | null;
  duration: number | null; skip: number | null; x: number; isOurs: boolean;
  watch: number | null;                                  // средний просмотр, сек
  paidViews: number | null; paidReach: number | null; spend: number | null;   // продвижение; органика = views − paidViews
  follows: number | null;                                // подписки с ролика, если сеть отдаёт
  scriptId?: number | null;                              // сценарий из контент-плана, если ролик наш
};

const code = (u: string | null | undefined) => {
  const m = String(u || "").match(/(?:reel|reels|p|video)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
};

export async function clientReels(
  sb: SupabaseClient,
  client: { id: number; metricool_blog_id: number | null; chatplace_bot_id?: string | null; timezone?: string | null; platforms?: string[] | null },
  from: string,
  to: string,
): Promise<ClientReel[]> {
  if (!client.metricool_blog_id && !client.chatplace_bot_id) return [];
  const none = Promise.resolve([] as any[]);
  const [raw, hist, scr] = await Promise.all([
    client.metricool_blog_id ? fetchNetworkPosts(client, from, to) : none,
    client.metricool_blog_id ? fetchNetworkPosts(client, addDays(from, -60), addDays(from, -1)) : none,
    sb.from("scripts").select("id, pub_date, hook_text, hook, video_status, published_url")
      .eq("client_id", client.id).gte("pub_date", addDays(from, -1)).lte("pub_date", addDays(to, 1)),
  ]);
  // «обычный уровень» по каждой площадке свой — просмотры TikTok и Instagram не смешиваем
  // Новый клиент (истории за 60 дней мало): норму считаем по истории + роликам текущего периода.
  // Меньше 3 роликов на площадке — нормы нет (0), и «× к норме» не показываем: раньше там стояло 1, и x был равен просмотрам.
  const netNorm: Record<string, number> = {};
  const pool = (net?: string) => {
    const h = hist.filter((p: any) => !net || p._net === net).map(p => reelFields(p).views).filter(x => x > 0);
    if (h.length >= 5) return h.slice(-30);
    return h.concat(raw.filter((p: any) => !net || p._net === net).map(p => reelFields(p).views).filter(x => x > 0));
  };
  for (const net of Array.from(new Set([...hist, ...raw].map((p: any) => p._net as string)))) {
    const v = pool(net);
    netNorm[net] = v.length >= 3 ? median(v) : 0;
  }
  const allV = pool();
  const normAll = allV.length >= 3 ? median(allV) : 0;
  const scripts = (scr.data || []) as any[];
  const nameOf = (x: any) => String(x.hook_text || x.hook || "").replace(/^Сценарий #\d+$/, "").trim();
  const byCode = new Map(scripts.filter(x => x.published_url).map(x => [code(x.published_url), x]));
  const used = new Set<number>();

  const list: ClientReel[] = raw
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
        retention: f.ret, retLoop: f.retLoop, retRaw: f.retRaw, duration: f.dur, skip: f.skip,
        x: (netNorm[net] || normAll) ? Math.round((f.views / (netNorm[net] || normAll)) * 100) / 100 : 0,
        isOurs: !!sc, scriptId: sc ? sc.id : null,
        watch: f.watch != null ? Math.round(f.watch * 10) / 10 : null,
        paidViews: f.paidViews, paidReach: f.paidReach, spend: f.spend, follows: f.follows,
      };
    });
  if (client.chatplace_bot_id) await mergeChatplace(sb, client.id, from, to, list, scripts, used, nameOf, byCode, netNorm["instagram"] || normAll);
  return list.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
}

/* Instagram из последнего снимка ChatPlace (официальная статистика аккаунта): у совпавших роликов дописываем
   пролистывания и время просмотра и берём более свежие цифры, ролики, которых нет в Metricool, добавляем. */
async function mergeChatplace(sb: SupabaseClient, clientId: number, from: string, to: string, list: ClientReel[],
  scripts: any[], used: Set<number>, nameOf: (x: any) => string, byCode: Map<string | null, any>, norm: number) {
  const { data: cp } = await sb.from("client_chatplace_insights").select("availability, videos")
    .eq("client_id", clientId).order("day", { ascending: false }).limit(1).maybeSingle();
  if (!cp || cp.availability !== "available" || !Array.isArray(cp.videos)) return;
  const er = (v: any) => { const b = v.reach || v.views; return b ? Math.round((((v.likes || 0) + (v.comments || 0) + (v.saves || 0) + (v.shares || 0)) / b) * 1000) / 10 : null; };
  for (const v of cp.videos as any[]) {
    if (v.type !== "reels" || !v.date || v.date < from || v.date > to) continue;
    const skip = v.skip_rate != null ? Math.round(v.skip_rate * 1000) / 10 : null;
    const watch = v.avg_watch_sec != null ? Math.round(v.avg_watch_sec * 10) / 10 : null;
    const hit = list.find(r => r.net === "instagram" && code(r.url) && code(r.url) === code(v.url));
    if (hit) {
      if ((v.views || 0) >= hit.views) Object.assign(hit, { views: v.views, reach: v.reach ?? hit.reach, likes: v.likes ?? hit.likes, comments: v.comments ?? hit.comments, saves: v.saves ?? hit.saves, shares: v.shares ?? hit.shares });
      hit.er = er(hit);
      if (hit.skip == null) hit.skip = skip;
      if (hit.watch == null) hit.watch = watch;
      if (hit.retention == null && hit.duration && watch) { hit.retRaw = Math.round((watch / hit.duration) * 100); hit.retention = Math.min(100, hit.retRaw); hit.retLoop = watch > hit.duration; }
      continue;
    }
    let sc = (code(v.url) && byCode.get(code(v.url))) || null;
    if (!sc) sc = scripts.find(x => x.pub_date === v.date && x.video_status === "published" && !used.has(x.id) && nameOf(x)) || null;
    if (sc) used.add(sc.id);
    const caption = String(v.caption || "").trim();
    list.push({
      date: v.date, net: "instagram", ourTitle: sc ? nameOf(sc) : null, caption,
      title: (sc ? nameOf(sc) : "") || caption || "без подписи", url: v.url || null, image: null,
      views: v.views || 0, reach: v.reach, likes: v.likes, comments: v.comments, saves: v.saves, shares: v.shares, er: er(v),
      retention: null, duration: null, skip, x: norm ? Math.round(((v.views || 0) / norm) * 100) / 100 : 0, isOurs: !!sc, scriptId: sc ? sc.id : null,
      watch, paidViews: null, paidReach: null, spend: null, follows: null,
    });
  }
}
