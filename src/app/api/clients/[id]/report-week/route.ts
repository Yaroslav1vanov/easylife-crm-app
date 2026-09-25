import { createClient } from "@/lib/supabase-server";
import { getModel } from "@/lib/aiModels";
import { buildWeeklyHtml, type PlanItem, type WeekReel, type WeekTotals } from "@/lib/weeklyReport";
import { accountWeekDelta, addDays, fetchNetworkPosts, followersDelta, inlineImage, lastSyncs, median, mondayOf, reelFields } from "@/lib/weeklyStats";
import { requireUser } from "@/lib/apiGuard";

/* Недельный отчёт клиенту.
   GET /api/clients/{id}/report-week?week=YYYY-MM-DD (понедельник) | ?from&to | ?lang=ru|en | ?download=1
   По умолчанию — прошлая полная неделя (пн–вс): в пятницу это неделя, закончившаяся в воскресенье.
   Картинки зашиваются в файл, чтобы отчёт можно было просто отправить клиенту. */
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const todayIso = () => new Date().toISOString().slice(0, 10);
const htmlHeaders = (filename?: string) => ({
  "content-type": "text/html; charset=utf-8",
  ...(filename ? { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` } : {}),
});
const htmlError = (msg: string) =>
  `<!doctype html><meta charset="utf-8"><body style="background:#070526;color:#f3f2ff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:40px"><div><h2 style="color:#b6f500">Отчёт не собран</h2><p style="color:#7a78a3;margin-top:12px">${msg}</p></div></body>`;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  const id = Number(params.id);
  const sp = new URL(req.url).searchParams;
  const lang = sp.get("lang") === "en" ? "en" : "ru";
  const from = sp.get("from") || (sp.get("week") ? mondayOf(sp.get("week")!) : addDays(mondayOf(todayIso()), -7));
  const to = sp.get("to") || addDays(from, 6);
  const prevFrom = addDays(from, -7), prevTo = addDays(from, -1);

  const sb = createClient();
  const { data: c } = await sb.from("clients")
    .select("id, name, surname, niche, avatar_url, instagram, package, metricool_blog_id, timezone, platforms")
    .eq("id", id).maybeSingle();
  if (!c) return new Response("клиент не найден", { status: 404 });
  if (!c.metricool_blog_id)
    return new Response(htmlError("У клиента не привязан бренд Metricool — цифр по роликам нет."), { status: 400, headers: htmlHeaders() });

  // ролики недели, прошлой недели и 60 дней до недели (для «обычного уровня аккаунта»)
  const [curRaw, prevRaw, histRaw] = await Promise.all([
    fetchNetworkPosts(c, from, to),
    fetchNetworkPosts(c, prevFrom, prevTo),
    fetchNetworkPosts(c, addDays(from, -60), prevTo),
  ]);

  const today = todayIso();
  const map = (p: any): WeekReel => {
    const f = reelFields(p);
    return {
      date: f.date || from, net: p._net, views: f.views, reach: f.reach, likes: f.likes,
      comments: f.comments, saved: f.saved, shares: f.shares, ret: f.ret, skip: f.skip, dur: f.dur,
      url: f.url, title: f.title, img: f.image, x: 0,
      ageDays: f.date ? Math.max(0, Math.round((Date.parse(today) - Date.parse(f.date)) / 86400000)) : 0,
    };
  };
  const histViews = histRaw.map(p => reelFields(p).views).filter(v => v > 0);
  const norm = median(histViews.slice(-30)) || median(histViews) || 1;
  // почти не показанные ролики (реклама, тесты) не портят статистику — только сноской
  const isTest = (r: WeekReel) => r.views < Math.max(50, norm * 0.01) && r.ageDays >= 3;

  const curAll = curRaw.map(map), prevAll = prevRaw.map(map);
  const reels = curAll.filter(r => !isTest(r)).map(r => ({ ...r, x: Math.round((r.views / norm) * 100) / 100 }));
  const excluded = curAll.filter(isTest).map(r => ({ views: r.views }));
  const prevReels = prevAll.filter(r => !isTest(r));

  const totals = (list: WeekReel[]): WeekTotals => {
    const s = (k: keyof WeekReel) => list.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const rets = list.map(r => r.ret).filter((v): v is number => v != null);
    return {
      n: list.length, views: s("views"), reach: s("reach"), likes: s("likes"),
      comments: s("comments"), saved: s("saved"), shares: s("shares"),
      ret: rets.length ? Math.round(rets.reduce((a, b) => a + b, 0) / rets.length) : null,
    };
  };
  const cur = totals(reels), prev = totals(prevReels);
  if (!reels.length && !prevReels.length)
    return new Response(htmlError(`За ${from} — ${to} Metricool не отдал ни одного ролика. Проверь период и привязку бренда.`), { status: 502, headers: htmlHeaders() });

  // наши сценарии: названия вышедших роликов и план на следующую неделю
  const { data: scr } = await sb.from("scripts")
    .select("id, pub_date, hook_text, hook, content_type, video_status, published_url, ref_url, ref_views, description")
    .eq("client_id", id).gte("pub_date", addDays(from, -1)).lte("pub_date", addDays(to, 8)).order("pub_date");
  const scripts = (scr || []) as any[];
  const nameOf = (x: any) => String(x.hook_text || x.hook || "").replace(/^Сценарий #\d+$/, "").trim();
  const code = (u: string | null) => { const m = String(u || "").match(/(?:reel|reels|p|video)\/([A-Za-z0-9_-]+)/); return m ? m[1] : null; };
  const byCode = new Map(scripts.filter(x => x.published_url).map(x => [code(x.published_url), x]));
  const used = new Set<number>();
  for (const r of reels) {
    let sc = (code(r.url) && byCode.get(code(r.url))) || null;
    if (!sc) sc = scripts.find(x => x.pub_date === r.date && x.video_status === "published" && !used.has(x.id) && nameOf(x)) || null;
    if (!sc) sc = scripts.find(x => x.pub_date === r.date && !used.has(x.id) && nameOf(x)) || null;
    if (sc) { used.add(sc.id); r.ourTitle = nameOf(sc); }
  }
  const fmtViews = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(".", ",")} млн` : v >= 1e3 ? `${Math.round(v / 1000)} тыс` : String(v));
  const nextWeek: PlanItem[] = scripts
    .filter(x => x.pub_date > to && x.pub_date <= addDays(to, 7) && nameOf(x))
    .map(x => ({
      date: x.pub_date, title: nameOf(x), type: x.content_type || "reel",
      why: x.ref_views
        ? (lang === "ru" ? `Формат уже сработал: похожий ролик собрал ${fmtViews(Number(x.ref_views))} просмотров` : `The format already worked: a similar video got ${fmtViews(Number(x.ref_views))} views`)
        : (x.description ? String(x.description).slice(0, 140) : null),
    }));

  // сколько роликов недели сделали мы (по CRM), план месяца и подписчики
  const [{ count: ourVideos }, monthsRes, snapsRes] = await Promise.all([
    sb.from("scripts").select("id", { count: "exact", head: true })
      .eq("client_id", id).eq("video_status", "published").gte("pub_date", from).lte("pub_date", to),
    sb.from("client_months").select("month_number, start_date, end_date, status, package")
      .eq("client_id", id).in("status", ["active", "onboarding"]).order("month_number", { ascending: false }).limit(1),
    sb.from("social_snapshots").select("snapshot_date, followers").eq("client_id", id)
      .gt("followers", 0).lte("snapshot_date", to).order("snapshot_date", { ascending: false }).limit(60),
  ]);

  const m = monthsRes.data?.[0] || null;
  let month: { published: number; package: number; from: string; to: string } | null = null;
  if (m) {
    const { count } = await sb.from("scripts").select("id", { count: "exact", head: true })
      .eq("client_id", id).eq("month_number", m.month_number).eq("video_status", "published")
      .gte("pub_date", m.start_date).lte("pub_date", m.end_date);
    month = { published: count || 0, package: m.package || c.package || 0, from: m.start_date, to: m.end_date };
  }
  // подписчики: число — из наших ежедневных снимков, прирост за неделю — из метрик аккаунта Metricool
  const snaps = snapsRes.data || [];
  const [fd, fdPrev] = await Promise.all([followersDelta(c, from, to), followersDelta(c, prevFrom, prevTo)]);
  const snapVal = snaps.length ? (snaps[0].followers as number) : null;
  const snapPrev = snaps.find(s => s.snapshot_date <= prevTo)?.followers ?? null;
  const followers = snapVal != null || fd
    ? {
        value: snapVal ?? 0,
        delta: fd ? fd.net : (snapPrev != null && snapVal != null && snapPrev !== snapVal ? snapVal - snapPrev : null),
        deltaPrev: fdPrev ? fdPrev.net : null,
        gained: fd?.gained ?? null, lost: fd?.lost ?? null,
      }
    : null;

  // прирост за неделю по всем роликам аккаунта (включая старые) — из наших ежедневных снимков
  const account = await accountWeekDelta(sb, id, from, to);
  const syncs = await lastSyncs(c);   // когда Metricool последний раз забирал данные из сетей
  const narrative = await aiNarrative(sb, { c, from, to, cur, prev, reels, norm, lang });

  // картинки в файл: топ-ролик крупно, остальные — миниатюрами
  const top = reels.length ? reels.reduce((a, b) => (b.views > a.views ? b : a), reels[0]) : null;
  const [avatar, ...thumbs] = await Promise.all([
    inlineImage(c.avatar_url, 400_000),
    ...reels.slice(0, 10).map(r => inlineImage(r.img, r === top ? 900_000 : 250_000)),
  ]);
  reels.slice(0, 10).forEach((r, i) => { r.img = thumbs[i] || r.img; });

  const html = buildWeeklyHtml({
    client: c, avatar, from, to, prevFrom, prevTo, cur, prev, reels, excluded, norm,
    ourVideos: ourVideos ?? null, month, followers, account, nextWeek, syncs, narrative, lang, generatedAt: today,
  });
  const fn = `${[c.name, c.surname].filter(Boolean).join(" ")} — отчёт ${from}—${to}.html`;
  return new Response(html, { headers: htmlHeaders(sp.get("download") ? fn : undefined) });
}

/* ---- выводы: AI-черновик, с фолбэком на цифры ---- */
async function aiNarrative(sb: any, x: {
  c: any; from: string; to: string; cur: WeekTotals; prev: WeekTotals; reels: WeekReel[]; norm: number; lang: "ru" | "en";
}): Promise<{ headline: string; lead: string; hit: string[]; cards: { tone: "g" | "y" | "r"; title: string; text: string }[]; plan: string[] }> {
  const ru = x.lang === "ru";
  const top = x.reels.length ? x.reels.reduce((a, b) => (b.views > a.views ? b : a), x.reels[0]) : null;
  const num = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)} ${ru ? "тыс" : "K"}` : String(v));
  const dm = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  const diff = x.prev.views ? Math.round(((x.cur.views - x.prev.views) / x.prev.views) * 100) : null;

  const fallback = {
    headline: top && top.x >= 1.5
      ? (ru ? `Ролик ${dm(top.date)} собрал ${num(top.views)} просмотров` : `The ${dm(top.date)} video reached ${num(top.views)} views`)
      : (ru ? `За неделю ${num(x.cur.views)} просмотров на ${x.cur.n} роликах` : `${num(x.cur.views)} views from ${x.cur.n} videos this week`),
    lead: ru
      ? `Вышло ${x.cur.n} роликов, просмотров ${num(x.cur.views)}${diff != null ? `, это ${diff >= 0 ? "+" : "−"}${Math.abs(diff)}% к прошлой неделе` : ""}. Обычный уровень аккаунта — ${num(Math.round(x.norm))} просмотров на ролик.`
      : `${x.cur.n} videos went live with ${num(x.cur.views)} views${diff != null ? `, ${diff >= 0 ? "+" : "−"}${Math.abs(diff)}% vs the previous week` : ""}. The account's usual level is ${num(Math.round(x.norm))} views per video.`,
    hit: [] as string[],
    cards: [] as { tone: "g" | "y" | "r"; title: string; text: string }[],
    plan: [] as string[],
  };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fallback;

  const model = await getModel(sb, "report");
  const list = x.reels.slice(0, 12).map(r =>
    `${dm(r.date)} · ${r.views} просм · ×${r.x} к норме · досмотр ${r.ret ?? "—"}% · сохр ${r.saved ?? 0} · реп ${r.shares ?? 0} · комм ${r.comments ?? 0} · ${r.dur ?? "—"} сек · «${r.title.slice(0, 120)}»`).join("\n");
  const facts = `Клиент: ${[x.c.name, x.c.surname].filter(Boolean).join(" ")}${x.c.niche ? ` · ниша: ${x.c.niche}` : ""}
Неделя: ${x.from} — ${x.to}
Эта неделя: роликов ${x.cur.n}, просмотров ${x.cur.views}, охват ${x.cur.reach}, лайки ${x.cur.likes}, комментарии ${x.cur.comments}, сохранения ${x.cur.saved}, репосты ${x.cur.shares}, средний досмотр ${x.cur.ret ?? "—"}%
Прошлая неделя: роликов ${x.prev.n}, просмотров ${x.prev.views}, сохранения ${x.prev.saved}, репосты ${x.prev.shares}, досмотр ${x.prev.ret ?? "—"}%
Обычный уровень аккаунта (медиана последних 30 роликов): ${Math.round(x.norm)} просмотров
Ролики недели:
${list}`;
  const sys = ru
    ? `Ты аккаунт-менеджер агентства EasyLife AI. Пишешь недельный отчёт КЛИЕНТУ: по делу, с цифрами, без воды и без похвалы себе. Не обещай результатов, не выдумывай данных, которых нет в цифрах. Пиши простыми словами, короткими предложениями, без длинных тире. Верни ТОЛЬКО валидный JSON.`
    : `You are an account manager at EasyLife AI. You write a weekly report FOR THE CLIENT: factual, number-driven, no fluff, no self-praise. Never promise results or invent data. Short plain sentences. Return ONLY valid JSON.`;
  const user = `${facts}

Верни JSON:
{
 "headline": "заголовок отчёта, одна короткая фраза с главным числом недели",
 "lead": "2-3 предложения: что произошло за неделю и почему цифры такие",
 "hit": ["2-4 пункта разбора лучшего ролика в формате «Короткий заголовок — объяснение на 1-2 предложения», опираясь на его цифры и текст"],
 "cards": [{"tone":"g|y|r","title":"короткий заголовок","text":"1-2 предложения"}],
 "plan": ["3-4 конкретных пункта плана на следующую неделю"]
}
tone: g — что сработало, y — на что обратить внимание, r — проблема. Нужно 3 карточки.${ru ? "" : " Write all text in English."}`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1600, system: sys, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) return fallback;
    const j = await r.json();
    const text = (j.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    const a = text.indexOf("{"), z = text.lastIndexOf("}");
    const p = JSON.parse(text.slice(a, z + 1));
    const arr = (v: any, n: number) => (Array.isArray(v) ? v.filter((s: any) => typeof s === "string" && s.trim()).slice(0, n) : []);
    return {
      headline: typeof p.headline === "string" && p.headline.trim() ? p.headline.trim() : fallback.headline,
      lead: typeof p.lead === "string" && p.lead.trim() ? p.lead.trim() : fallback.lead,
      hit: arr(p.hit, 4),
      cards: Array.isArray(p.cards)
        ? p.cards.filter((k: any) => k?.title && k?.text).slice(0, 4).map((k: any) => ({ tone: ["g", "y", "r"].includes(k.tone) ? k.tone : "y", title: String(k.title), text: String(k.text) }))
        : [],
      plan: arr(p.plan, 5),
    };
  } catch { return fallback; }
}
