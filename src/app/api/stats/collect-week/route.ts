import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { collectClientWeek, weeksBetween } from "@/lib/weeklyAggregate";
import { addDays, mondayOf } from "@/lib/weeklyStats";

/* Недельные итоги в client_weekly_stats.
   GET /api/stats/collect-week?clientId=25&week=2026-09-14        — одна неделя
   GET /api/stats/collect-week?clientId=25&weeks=12               — последние 12 недель
   GET /api/stats/collect-week?clientId=25&all=1                  — всё время работы клиента
   Без clientId — по всем активным клиентам Metricool. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sb = createClient();
  const sp = new URL(req.url).searchParams;
  const today = new Date().toISOString().slice(0, 10);

  const { data: clients } = await sb.from("clients")
    .select("id, name, stage, metricool_blog_id, timezone, platforms, start_date, first_pub_date")
    .not("metricool_blog_id", "is", null);
  const list = (clients || []).filter(c =>
    (sp.get("clientId") ? c.id === Number(sp.get("clientId")) : c.stage === "active"));
  if (!list.length) return NextResponse.json({ ok: true, note: "нет подходящих клиентов", rows: 0 });

  const out: { client: string; weeks: number; from?: string }[] = [];
  for (const c of list) {
    let weeks: string[];
    if (sp.get("week")) weeks = [mondayOf(sp.get("week")!)];
    else if (sp.get("all")) {
      // с первой публикации (или старта клиента) по прошлую неделю
      const { data: first } = await sb.from("scripts").select("pub_date")
        .eq("client_id", c.id).eq("video_status", "published").not("pub_date", "is", null)
        .order("pub_date").limit(1).maybeSingle();
      const start = (first as any)?.pub_date || (c as any).first_pub_date || c.start_date || addDays(today, -180);
      weeks = weeksBetween(start, addDays(mondayOf(today), -7));
    } else {
      const n = Math.min(52, Math.max(1, Number(sp.get("weeks") || 2)));
      weeks = Array.from({ length: n }, (_, i) => addDays(mondayOf(today), -7 * (i + 1))).reverse();
    }

    const rows: any[] = [];
    for (const w of weeks) {
      const row = await collectClientWeek(sb, c, w);
      if (row && (row.reels_count > 0 || row.followers_gained)) rows.push(row);
    }
    if (sp.get("dry")) return NextResponse.json({ ok: true, dry: true, client: c.name, rows: rows.slice(0, 3) });
    if (rows.length) {
      // пишем по одной неделе: так видно, какая именно строка ломается
      for (const row of rows) {
        const { error } = await sb.from("client_weekly_stats").upsert([row], { onConflict: "client_id,week_start" });
        if (error) return NextResponse.json({ error: error.message, client: c.name, week: row.week_start, row }, { status: 500 });
      }
      const error = null as any;
      if (error) return NextResponse.json({ error: error.message, client: c.name }, { status: 500 });
    }
    out.push({ client: c.name, weeks: rows.length, from: weeks[0] });
  }
  return NextResponse.json({ ok: true, clients: out.length, result: out });
}
