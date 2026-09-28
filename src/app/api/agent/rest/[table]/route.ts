import { NextResponse } from "next/server";

/* Чтение CRM для наших ботов (CEO-агент и т.п.), которые работают на своём сервере.
   После закрытия базы публичный ключ ничего не читает, поэтому боты ходят сюда:
   только GET, только перечисленные таблицы, только по секрету x-agent-secret.
   Запрос пробрасывается в базу как есть (фильтры PostgREST: select, order, limit, offset, eq…).
   GET /api/agent/rest/clients?select=id,name&stage=eq.active */

export const dynamic = "force-dynamic";

const READABLE = new Set([
  "clients", "team_members", "client_months", "scripts", "publications",
  "client_tasks", "app_settings", "client_weekly_stats", "social_snapshots",
]);

export async function GET(req: Request, { params }: { params: { table: string } }) {
  const secret = process.env.STRATEGY_AGENT_SECRET;
  if (!secret || req.headers.get("x-agent-secret") !== secret)
    return NextResponse.json({ error: "нет доступа" }, { status: 403 });
  if (!READABLE.has(params.table))
    return NextResponse.json({ error: `таблица «${params.table}» агентам не открыта` }, { status: 400 });

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY не задан" }, { status: 500 });

  const qs = new URL(req.url).search;
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${params.table}${qs}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
  });
  const body = await r.text();
  return new NextResponse(body, { status: r.status, headers: { "content-type": "application/json" } });
}
