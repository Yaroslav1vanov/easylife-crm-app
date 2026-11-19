import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase-admin";
import { resolvePortal } from "@/lib/portal";

/* Кабинет клиента: «кто и что смотрит» за N дней — то же, что /api/clients/{id}/breakdown, только чтение
   уже собранных данных (подтягивание из аналитики делает сама CRM). */
export const dynamic = "force-dynamic";
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const sb = createAdmin();
  const cid = await resolvePortal(sb, params.token);
  if (!cid) return NextResponse.json({ error: "Ссылка недействительна" }, { status: 404 });
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 30, 7), 120);
  const from = ymd(new Date(Date.now() - (days - 1) * 864e5)), to = ymd(new Date());
  const { data } = await sb.from("client_view_breakdown").select("day, followers_views, nonfollowers_views, reels_views, stories_views, posts_views")
    .eq("client_id", cid).gte("day", from).lte("day", to).order("day");
  return NextResponse.json({ from, to, days, rows: data || [] });
}
