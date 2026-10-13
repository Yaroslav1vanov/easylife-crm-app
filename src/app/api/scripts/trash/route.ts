import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdmin } from "@/lib/supabase-admin";

/* Корзина сценариев. Удалённый сценарий (с текстом или взятый в работу) триггер в базе кладёт в scripts_trash
   вместе с публикацией. Храним 30 дней.
   GET  /api/scripts/trash?clientId=  — список (свежие сверху)
   POST /api/scripts/trash { id }     — вернуть сценарий с тем же id, публикацию и все связи */
export const dynamic = "force-dynamic";
const KEEP_DAYS = 30;
const CAN = ["owner", "admin", "assistant", "teamlead"];

async function guard() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Нужно войти в CRM" }, { status: 401 }) };
  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!prof || !CAN.includes(prof.role)) return { error: NextResponse.json({ error: "Нет доступа к корзине" }, { status: 403 }) };
  return { user };
}

export async function GET(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const sb = createAdmin();
  await sb.from("scripts_trash").delete().lt("deleted_at", new Date(Date.now() - KEEP_DAYS * 864e5).toISOString());
  const clientId = Number(new URL(req.url).searchParams.get("clientId")) || null;
  let q = sb.from("scripts_trash").select("id, script_id, client_id, row, pub, deleted_at, deleted_by, restored_at")
    .is("restored_at", null).order("deleted_at", { ascending: false }).limit(500);
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const who = Array.from(new Set((data || []).map(r => r.deleted_by).filter(Boolean)));
  const { data: profs } = who.length ? await sb.from("profiles").select("id, name, email").in("id", who) : { data: [] as any[] };
  const nameOf = new Map((profs || []).map((p: any) => [p.id, p.name || p.email || "сотрудник"]));
  const items = (data || []).map(r => {
    const s: any = r.row || {};
    return {
      id: r.id, script_id: r.script_id, client_id: r.client_id, deleted_at: r.deleted_at,
      deleted_by: r.deleted_by ? nameOf.get(r.deleted_by) || "сотрудник" : "система",
      title: String(s.hook_text || s.hook || s.body_text || "").trim().slice(0, 140) || `Сценарий #${s.order_num ?? r.script_id}`,
      month_number: s.month_number ?? null, pub_date: s.pub_date ?? null,
      script_status: s.script_status ?? null, video_status: s.video_status ?? null,
      has_video: !!(s.video_url || s.published_url), has_pub: !!r.pub,
    };
  });
  return NextResponse.json({ items, keep_days: KEEP_DAYS });
}

export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const { id } = await req.json().catch(() => ({}));
  if (!Number(id)) return NextResponse.json({ error: "id?" }, { status: 400 });
  const { data, error } = await createAdmin().rpc("restore_script_from_trash", { p_trash_id: Number(id) });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, script_id: data });
}
