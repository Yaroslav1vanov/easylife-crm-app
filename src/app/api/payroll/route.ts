import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { computePayroll } from "@/lib/payroll";

// Готовый расчёт ЗП за месяц — источник правды для финмонитора.
// Доступ: сессия с ролью owner/admin ЛИБО заголовок x-payroll-token (машинный доступ).
// GET /api/payroll?ym=2026-07

export const dynamic = "force-dynamic";

// Supabase REST отдаёт максимум 1000 строк — тянем страницами.
async function fetchAll(sb: any, table: string, columns: string) {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(columns).order("id").range(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ym = url.searchParams.get("ym") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ error: "bad ym (ожидается YYYY-MM)" }, { status: 400 });

  const sb = createClient();

  // Авторизация: либо машинный токен, либо сессия владельца/админа
  const token = process.env.PAYROLL_TOKEN;
  const sentToken = req.headers.get("x-payroll-token");
  const machineOk = !!token && sentToken === token;

  if (!machineOk) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "не авторизован" }, { status: 401 });
    const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile || !["owner", "admin"].includes(profile.role)) {
      return NextResponse.json({ error: "доступ только для владельца" }, { status: 403 });
    }
  }

  const [clients, clientMonths, scripts, team] = await Promise.all([
    fetchAll(sb, "clients", "id,name,surname,package,montager_id,teamlead_id,stage,niche"),
    fetchAll(sb, "client_months", "id,client_id,month_number,start_date,end_date,package,status"),
    fetchAll(sb, "scripts", "id,client_id,month_number,order_num,hook,hook_text,script_status,video_status,pub_date,ready_at"),
    fetchAll(sb, "team_members", "id,name,member_type"),
  ]);

  const result = computePayroll(ym, { clients, clientMonths, scripts, team } as any);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
