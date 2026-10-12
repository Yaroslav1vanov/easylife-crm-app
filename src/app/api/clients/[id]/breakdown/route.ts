import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/apiGuard";
import { syncViewBreakdown } from "@/lib/viewBreakdown";

/* Кто и что смотрит у клиента за N дней (7/30/90): подписчики / новые люди, рилсы / сторис / посты.
   Берём из client_view_breakdown; данных мало или они старые — подтягиваем из аналитики и сохраняем. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  const cid = Number(params.id);
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 30, 7), 120);
  const from = ymd(new Date(Date.now() - (days - 1) * 864e5)), to = ymd(new Date());
  const sb = createClient();
  const read = () => sb.from("client_view_breakdown").select("day, followers_views, nonfollowers_views, reels_views, stories_views, posts_views")
    .eq("client_id", cid).gte("day", from).lte("day", to).order("day");
  let { data } = await read();
  const fresh = (data || []).some(r => r.day >= ymd(new Date(Date.now() - 2 * 864e5)));
  if ((data || []).length < days * 0.6 || !fresh) {
    const { data: c } = await sb.from("clients").select("metricool_blog_id").eq("id", cid).maybeSingle();
    if (c?.metricool_blog_id) { try { await syncViewBreakdown(sb, cid, c.metricool_blog_id, from, to); ({ data } = await read()); } catch {} }
  }
  return NextResponse.json({ from, to, days, rows: data || [] });
}
