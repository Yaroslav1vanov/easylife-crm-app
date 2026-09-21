import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { clientReels } from "@/lib/clientReels";

/* Все ролики клиента за период с метриками и нашим названием из контент-плана.
   GET /api/clients/{id}/reels?ym=2026-09   или   ?from=2026-09-01&to=2026-09-30 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const sp = new URL(req.url).searchParams;
  const ym = sp.get("ym");
  let from = sp.get("from") || "", to = sp.get("to") || "";
  if (ym) {
    const [y, m] = ym.split("-").map(Number);
    from = `${ym}-01`;
    to = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  }
  if (!from || !to) return NextResponse.json({ error: "нужен ym или from и to" }, { status: 400 });

  const sb = createClient();
  const { data: c } = await sb.from("clients")
    .select("id, name, metricool_blog_id, timezone, platforms").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ error: "клиент не найден" }, { status: 404 });
  if (!c.metricool_blog_id) return NextResponse.json({ ok: true, reels: [], note: "нет бренда Metricool" });

  const reels = await clientReels(sb, c, from, to);
  return NextResponse.json({ ok: true, from, to, count: reels.length, reels });
}
