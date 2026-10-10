import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/apiGuard";

/* «План / факт» клиента за контрактный месяц.
   GET ?month=N (без — текущий месяц по датам) →
     months  — все контрактные месяцы клиента; month — выбранный (даты);
     plan    — план тимлида на месяц (client_plans);
     daily   — просмотры по дням (аналитика: IG и YouTube по аккаунту, TikTok по видео);
     followers — подписчики по дням (сумма сетей) из social_snapshots;
     reels   — вышедшие ролики по дням (опубликованные сценарии + публикации без сценария);
     weeks   — ручной факт тимлида по неделям (кодовые слова, заявки, консультации, продажи);
     forecast — месяцы из актуального прогноза (для «Взять из прогноза»). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const MC = "https://app.metricool.com/api";
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function dailyViews(blogId: number | string, from: string, to: string) {
  const user = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!user || !token) return { byDate: {} as Record<string, number>, note: "аналитика не настроена" };
  const auth = `blogId=${blogId}&userId=${encodeURIComponent(user)}&userToken=${encodeURIComponent(token)}`;
  const get = async (path: string) => {
    const r = await fetch(`${MC}${path}${path.includes("?") ? "&" : "?"}${auth}`, { headers: { "X-Mc-Auth": token }, cache: "no-store" });
    return r.ok ? r.json() : null;
  };
  const prof = await fetch(`${MC}/admin/simpleProfiles?userId=${encodeURIComponent(user)}&userToken=${encodeURIComponent(token)}`, { headers: { "X-Mc-Auth": token }, cache: "no-store" })
    .then(r => r.json()).catch(() => null);
  const b = (Array.isArray(prof) ? prof : prof?.data || []).find((x: any) => String(x.blogId ?? x.id) === String(blogId));
  if (!b) return { byDate: {}, note: "бренд аналитики не найден" };
  const range = `from=${from}T00:00:00&to=${to}T23:59:59`;
  const queries: string[] = [];
  if (b.instagram) queries.push(`/v2/analytics/timelines?network=instagram&subject=account&metric=views&${range}`);
  if (b.tiktok) queries.push(`/v2/analytics/timelines?network=tiktok&subject=video&metric=views&${range}`);
  if (b.youtube || b.youtubeChannelName) queries.push(`/v2/analytics/timelines?network=youtube&subject=account&metric=views&scope=all&${range}`);
  const byDate: Record<string, number> = {};
  for (const j of await Promise.all(queries.map(get))) {
    for (const v of (j?.data?.[0]?.values || [])) {
      const d = String(v.dateTime || "").slice(0, 10), n = Number(v.value) || 0;
      if (d) byDate[d] = (byDate[d] || 0) + n;
    }
  }
  return { byDate, note: queries.length ? "" : "к бренду не подключены соцсети" };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  const cid = Number(params.id);
  const sb = createClient();
  const [{ data: client }, { data: months }] = await Promise.all([
    sb.from("clients").select("id, metricool_blog_id, package").eq("id", cid).maybeSingle(),
    sb.from("client_months").select("month_number, start_date, end_date, package, status").eq("client_id", cid).neq("status", "cancelled").order("month_number"),
  ]);
  if (!client) return NextResponse.json({ error: "клиент не найден" }, { status: 404 });
  if (!months?.length) return NextResponse.json({ error: "У клиента нет контрактных месяцев — план ставится на месяц M1, M2…" }, { status: 400 });

  const today = ymd(new Date());
  const want = Number(new URL(req.url).searchParams.get("month"));
  const month = months.find(m => m.month_number === want)
    || months.find(m => m.start_date <= today && m.end_date >= today)
    || months[months.length - 1];
  const from = month.start_date, to = month.end_date < today ? month.end_date : today;

  const [{ data: plan }, { data: weeks }, { data: snaps }, { data: scr }, { data: pubs }, { data: fc }, views] = await Promise.all([
    sb.from("client_plans").select("metrics, source, updated_by, updated_at").eq("client_id", cid).eq("month_number", month.month_number).maybeSingle(),
    sb.from("client_fact_weeks").select("week_start, codewords, leads, calls, sales, note, entered_by, updated_at").eq("client_id", cid).gte("week_start", month.start_date).lte("week_start", month.end_date),
    sb.from("social_snapshots").select("platform, snapshot_date, followers").eq("client_id", cid)
      .gte("snapshot_date", ymd(new Date(Date.parse(from) - 3 * 864e5))).lte("snapshot_date", to).order("snapshot_date"),
    sb.from("scripts").select("id, pub_date").eq("client_id", cid).eq("video_status", "published").gte("pub_date", from).lte("pub_date", to),
    sb.from("publications").select("publish_at, script_id, content_type").eq("client_id", cid).eq("pub_status", "published").is("script_id", null)
      .eq("content_type", "reel").gte("publish_at", `${from}T00:00:00`).lte("publish_at", `${to}T23:59:59`),
    sb.from("client_documents").select("data, version, status").eq("client_id", cid).eq("kind", "forecast").eq("is_current", true).maybeSingle(),
    from <= to && client.metricool_blog_id ? dailyViews(client.metricool_blog_id, from, to) : Promise.resolve({ byDate: {}, note: client.metricool_blog_id ? "" : "у клиента не привязан бренд аналитики" }),
  ]);

  // подписчики: по каждой сети последнее известное число на дату, сумма сетей
  const last: Record<string, number> = {}; const followers: Record<string, number> = {};
  for (const s of snaps || []) {
    if (s.followers == null) continue;
    last[s.platform] = s.followers;
    followers[s.snapshot_date] = Object.values(last).reduce((a, b) => a + b, 0);
  }
  const reels: Record<string, number> = {};
  for (const s of scr || []) if (s.pub_date) reels[s.pub_date.slice(0, 10)] = (reels[s.pub_date.slice(0, 10)] || 0) + 1;
  for (const p of pubs || []) if (p.publish_at) reels[p.publish_at.slice(0, 10)] = (reels[p.publish_at.slice(0, 10)] || 0) + 1;

  return NextResponse.json({
    months, month, today, plan: plan || null, weeks: weeks || [],
    daily: views.byDate, viewsNote: views.note, followers, reels,
    forecast: fc?.data?.months ? { version: fc.version, status: fc.status, months: fc.data.months } : null,
    packageSize: month.package || client.package || null,
  });
}
