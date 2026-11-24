import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/apiGuard";
import { socialsFromBrand } from "@/lib/socialsFromBrand";

/* POST /api/clients/{id}/socials-from-metricool — после привязки бренда Metricool
   дописывает в карточку соцсети, подключённые к бренду (только пустые поля). */
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return NextResponse.json({ error: "Metricool не настроен" }, { status: 400 });
  const sb = createClient();
  const { data: c } = await sb.from("clients").select("id, instagram, tiktok, youtube, platforms, metricool_blog_id").eq("id", Number(params.id)).maybeSingle();
  if (!c?.metricool_blog_id) return NextResponse.json({ ok: true, filled: {} });
  const r = await fetch(`https://app.metricool.com/api/admin/simpleProfiles?userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`,
    { headers: { "X-Mc-Auth": token }, cache: "no-store" });
  const j: any = await r.json().catch(() => null);
  const list: any[] = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
  const b = list.find(x => String(x.blogId ?? x.id) === String(c.metricool_blog_id));
  if (!b) return NextResponse.json({ ok: true, filled: {}, note: "бренда нет в Metricool" });
  const filled = socialsFromBrand(b, c as any);
  if (Object.keys(filled).length) {
    const { error } = await sb.from("clients").update(filled).eq("id", c.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, filled });
}
