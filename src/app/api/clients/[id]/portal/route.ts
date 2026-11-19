import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdmin } from "@/lib/supabase-admin";
import { getPortalToken, issuePortalToken, revokePortalToken } from "@/lib/portal";

/* Ссылка на кабинет клиента: GET — текущая, POST — выпустить/перевыпустить, DELETE — отключить.
   Управляют владелец, админ, ассистент и тимлид этого клиента. Монтажёрам нельзя. */
export const dynamic = "force-dynamic";

async function guard(clientId: number) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { err: NextResponse.json({ error: "Нужно войти в CRM" }, { status: 401 }) };
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = me?.role || "";
  if (["owner", "admin", "assistant"].includes(role)) return { ok: true };
  if (role === "teamlead") {
    const [{ data: tm }, { data: c }] = await Promise.all([
      sb.from("team_members").select("id").eq("profile_id", user.id).maybeSingle(),
      sb.from("clients").select("teamlead_id").eq("id", clientId).maybeSingle(),
    ]);
    if (tm && c && c.teamlead_id === tm.id) return { ok: true };
    return { err: NextResponse.json({ error: "Кабинет выдаёт тимлид этого клиента или владелец" }, { status: 403 }) };
  }
  return { err: NextResponse.json({ error: "Кабинет клиента выдаёт тимлид или владелец" }, { status: 403 }) };
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const g = await guard(id); if (g.err) return g.err;
  const token = await getPortalToken(createAdmin(), id);
  return NextResponse.json({ ok: true, token });
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const g = await guard(id); if (g.err) return g.err;
  try { return NextResponse.json({ ok: true, token: await issuePortalToken(createAdmin(), id) }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const g = await guard(id); if (g.err) return g.err;
  try { await revokePortalToken(createAdmin(), id); return NextResponse.json({ ok: true }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
