import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase-admin";
import { resolvePortal } from "@/lib/portal";
import { clientReels } from "@/lib/clientReels";

/* Кабинет клиента: ролики месяца с метриками — то же, что /api/clients/{id}/reels, но по секрету ссылки. */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const sb = createAdmin();
  const cid = await resolvePortal(sb, params.token);
  if (!cid) return NextResponse.json({ error: "Ссылка недействительна" }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const ym = sp.get("ym") || "";
  let from = sp.get("from") || "", to = sp.get("to") || "";
  if (/^\d{4}-\d{2}$/.test(ym)) {
    const [y, m] = ym.split("-").map(Number);
    from = `${ym}-01`;
    to = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({ error: "нужен ym" }, { status: 400 });
  const { data: c } = await sb.from("clients").select("id, metricool_blog_id, timezone, platforms").eq("id", cid).maybeSingle();
  if (!c?.metricool_blog_id) return NextResponse.json({ ok: true, reels: [] });
  const reels = await clientReels(sb, c, from, to);
  return NextResponse.json({ ok: true, from, to, count: reels.length, reels });
}
