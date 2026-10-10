/* Снимок профиля клиента из Metricool — для прогноза (PROFILE.md у ИИ-исполнителя).
   По каждой подключённой сети: подписчики сейчас и 30/90 дней назад, последние 30 роликов
   (медиана и среднее просмотров, топ-5, доля топ-10%), сколько роликов в неделю выходило за 90 дней, ER.
   Данных мало или сеть не подключена — так и пишем, ничего не выдумываем. */

const MC = "https://app.metricool.com/api";
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

type Clip = { date: string; views: number; inter: number; url: string; text: string };

export async function metricoolProfile(blogId: number | string): Promise<string> {
  const user = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!user || !token) return "Metricool не настроен — цифр профиля нет.";
  const get = async (path: string) => {
    const r = await fetch(`${MC}${path}${path.includes("?") ? "&" : "?"}blogId=${blogId}&userId=${encodeURIComponent(user)}&userToken=${encodeURIComponent(token)}`,
      { headers: { "X-Mc-Auth": token }, cache: "no-store" });
    if (!r.ok) throw new Error(`Metricool ${r.status}`);
    return r.json();
  };
  const list = (j: any): any[] => (Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []);
  const series = (j: any) => (Array.isArray(j?.data?.[0]?.values) ? j.data[0].values : [])
    .map((x: any) => ({ d: String(x.dateTime || "").slice(0, 10), v: Number(x.value) }))
    .filter((x: any) => x.d && x.v > 0).sort((a: any, b: any) => (a.d < b.d ? -1 : 1));

  const now = new Date();
  const from120 = ymd(new Date(now.getTime() - 120 * 864e5)), from95 = ymd(new Date(now.getTime() - 95 * 864e5)), to = ymd(now);
  const range = (from: string) => `from=${from}T00:00:00&to=${to}T23:59:59`;

  let nets = { ig: false, tt: false, yt: false };
  try {
    const b = list(await fetch(`${MC}/admin/simpleProfiles?userId=${encodeURIComponent(user)}&userToken=${encodeURIComponent(token)}`, { headers: { "X-Mc-Auth": token }, cache: "no-store" }).then(r => r.json()))
      .find((x: any) => String(x.blogId ?? x.id) === String(blogId));
    if (!b) return `Бренд Metricool ${blogId} не найден — цифр профиля нет.`;
    nets = { ig: !!b.instagram, tt: !!b.tiktok, yt: !!(b.youtube || b.youtubeChannelName) };
  } catch (e: any) { return `Metricool не ответил (${e.message}) — цифр профиля нет.`; }

  const followersBlock = (h: { d: string; v: number }[]) => {
    if (!h.length) return "- Подписчики: нет данных";
    const last = h[h.length - 1];
    const at = (days: number) => { const t = ymd(new Date(now.getTime() - days * 864e5)); return h.find(x => x.d >= t); };
    const d30 = at(30), d90 = at(90);
    return `- Подписчики сейчас: ${fmt(last.v)} (на ${last.d})`
      + (d30 ? ` · за 30 дней ${last.v - d30.v >= 0 ? "+" : ""}${fmt(last.v - d30.v)}` : "")
      + (d90 && d90.d <= ymd(new Date(now.getTime() - 80 * 864e5)) ? ` · за 90 дней ${last.v - d90.v >= 0 ? "+" : ""}${fmt(last.v - d90.v)}` : " · за 90 дней: истории нет");
  };
  const clipsBlock = (clips: Clip[]) => {
    if (!clips.length) return "- Роликов за 120 дней нет.";
    const sorted = [...clips].sort((a, b) => (a.date < b.date ? 1 : -1));
    const last30 = sorted.slice(0, 30);
    const views = last30.map(c => c.views).sort((a, b) => a - b);
    const total = views.reduce((s, v) => s + v, 0);
    const median = views.length % 2 ? views[(views.length - 1) / 2] : (views[views.length / 2 - 1] + views[views.length / 2]) / 2;
    const k = Math.max(1, Math.ceil(last30.length * 0.1));
    const topShare = total ? Math.round(([...views].reverse().slice(0, k).reduce((s, v) => s + v, 0) / total) * 100) : 0;
    const t90 = ymd(new Date(now.getTime() - 90 * 864e5));
    const perWeek = sorted.filter(c => c.date >= t90).length / (90 / 7);
    const inter = last30.reduce((s, c) => s + c.inter, 0);
    const top5 = [...last30].sort((a, b) => b.views - a.views).slice(0, 5);
    return [
      `- Последние ${last30.length} роликов${last30.length < 10 ? " (МАЛО ДАННЫХ — меньше 10 роликов, выводы осторожные)" : ""}: медиана ${fmt(median)} просмотров, среднее ${fmt(total / last30.length)}, всего ${fmt(total)}`,
      `- Доля просмотров у топ-10% роликов (${k} шт.): ${topShare}%`,
      `- Выходило роликов в неделю за 90 дней: ${perWeek.toFixed(1)}`,
      total ? `- ER (взаимодействия / просмотры): ${((inter / total) * 100).toFixed(2)}%` : "",
      `- Топ-5 из последних ${last30.length}:`,
      ...top5.map(c => `  - ${c.date}: ${fmt(c.views)} просмотров — «${c.text}» ${c.url}`),
    ].filter(Boolean).join("\n");
  };

  const out: string[] = [];
  if (nets.ig) {
    try {
      const items = [...list(await get(`/v2/analytics/reels/instagram?${range(from120)}`)), ...list(await get(`/v2/analytics/posts/instagram?${range(from120)}`))];
      const clips: Clip[] = items.map((x: any) => ({ date: String(x.publishedAt?.dateTime || x.publishedAt || "").slice(0, 10), views: Number(x.views) || 0,
        inter: Number(x.interactions) || 0, url: x.url || "", text: String(x.content || "").replace(/\s+/g, " ").slice(0, 70) })).filter(c => c.date);
      const h = series(await get(`/v2/analytics/timelines?network=instagram&subject=account&metric=followers&${range(from95)}`));
      out.push(`## Instagram\n${followersBlock(h)}\n${clipsBlock(clips)}`);
    } catch (e: any) { out.push(`## Instagram\n- Metricool не отдал данные (${e.message})`); }
  }
  if (nets.tt) {
    try {
      const vids = list(await get(`/v2/analytics/posts/tiktok?${range(from120)}`));
      const clips: Clip[] = vids.map((x: any) => {
        const t = x.createTime; const d = typeof t === "number" ? new Date(t * (t < 1e12 ? 1000 : 1)) : new Date(t?.dateTime || t || 0);
        return { date: isNaN(d.getTime()) ? "" : ymd(d), views: Number(x.viewCount) || 0, inter: (Number(x.likeCount) || 0) + (Number(x.commentCount) || 0) + (Number(x.shareCount) || 0),
          url: x.shareUrl || "", text: String(x.videoDescription || x.title || "").replace(/\s+/g, " ").slice(0, 70) };
      }).filter(c => c.date);
      const h = series(await get(`/v2/analytics/timelines?network=tiktok&subject=account&metric=followers_count&${range(from95)}`));
      out.push(`## TikTok\n${followersBlock(h)}\n${clipsBlock(clips)}`);
    } catch (e: any) { out.push(`## TikTok\n- Metricool не отдал данные (${e.message})`); }
  }
  if (nets.yt) {
    try {
      const h = series(await get(`/v2/analytics/timelines?network=youtube&subject=account&metric=totalSubscribers&${range(from95)}`));
      const v = series(await get(`/v2/analytics/timelines?network=youtube&subject=account&metric=views&scope=all&${range(ymd(new Date(now.getTime() - 30 * 864e5)))}`));
      out.push(`## YouTube\n${followersBlock(h)}\n- Просмотры канала за 30 дней: ${fmt(v.reduce((s: number, x: any) => s + x.v, 0))}`);
    } catch (e: any) { out.push(`## YouTube\n- Metricool не отдал данные (${e.message})`); }
  }
  const missing = [!nets.ig && "Instagram", !nets.tt && "TikTok", !nets.yt && "YouTube"].filter(Boolean);
  return `# Снимок профиля (Metricool, ${to})\n\n${out.join("\n\n") || "Ни одна сеть не подключена к бренду."}`
    + (missing.length ? `\n\nНе подключены к Metricool: ${missing.join(", ")} — по ним цифр нет.` : "");
}
