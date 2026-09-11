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

  // debug=1&clientId=… — сырой первый элемент каждого эндпоинта (разбор полей новой сети)
  if (sp.get("debug") === "1" && clientId) {
    const sbd = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: c } = await sbd.from("clients").select("metricool_blog_id, timezone").eq("id", Number(clientId)).maybeSingle();
    const token = process.env.METRICOOL_TOKEN!, uid = process.env.METRICOOL_USER_ID!;
    const [yy, mm] = ym.split("-").map(Number); const last = new Date(yy, mm, 0).getDate();
    const qs = `from=${ym}-01T00:00:00&to=${ym}-${last}T23:59:59&timezone=America%2FNew_York&blogId=${c?.metricool_blog_id}&userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(uid)}`;
    const out: any = { blogId: c?.metricool_blog_id };
    for (const path of ["/v2/analytics/posts/tiktok", "/v2/analytics/posts/youtube", "/v2/analytics/videos/youtube"]) {
      const r = await fetch(`https://app.metricool.com/api${path}?${qs}`, { headers: { "X-Mc-Auth": token } });
      const j: any = await r.json().catch(() => null);
      const arr = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
      out[path] = { status: r.status, count: arr.length, first: arr[0] || j };
    }
    return NextResponse.json(out);
  }

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
