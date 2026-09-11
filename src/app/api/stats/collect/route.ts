import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { collectClientMonth, prevYm } from "@/lib/monthlyStats";

/* Сбор помесячной статистики.
   GET /api/stats/collect?ym=2026-08&clientId=25
     ym        — месяц (по умолчанию прошлый)
     clientId  — один клиент (по умолчанию все, подключённые к Metricool)
   По расписанию запускается 1-го числа — собирает прошлый месяц по всем. */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const ym = sp.get("ym") || prevYm();
  if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ error: "ym в формате 2026-08" }, { status: 400 });
  const clientId = sp.get("clientId");

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })   // тот же доступ, что у всей CRM;
  let q = sb.from("clients").select("id, name, surname, metricool_blog_id, timezone, stage").not("metricool_blog_id", "is", null);
  if (clientId) q = q.eq("id", Number(clientId)); else q = q.neq("stage", "churned");
  const { data: clients, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out: any[] = [];
  for (const c of clients || []) {
    try {
      const rows = await collectClientMonth(sb, c, ym);
      if (rows.length) {
        const { error: e } = await sb.from("client_monthly_stats").upsert(rows, { onConflict: "client_id,ym,network" });
        if (e) { out.push({ client: c.name, error: e.message }); continue; }
      }
      out.push({ client: `${c.name} ${c.surname || ""}`.trim(), networks: rows.map(r => `${r.network}:${r.posts_count}`), views: rows.reduce((s, r) => s + (r.views || 0), 0) });
    } catch (e: any) { out.push({ client: c.name, error: String(e?.message || e) }); }
  }
  return NextResponse.json({ ok: true, ym, clients: out.length, result: out });
}
