import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createAdmin } from "@supabase/supabase-js";

// Выдать сотруднику доступ в CRM: создать/привязать аккаунт и поставить роль.
// Делает только владелец/админ.
//
// Работает в двух режимах:
//  1) есть SUPABASE_SERVICE_ROLE_KEY → аккаунт создаётся сразу (email + пароль);
//  2) ключа нет → сотрудник сам регистрируется на /login, а тут мы его находим
//     по почте, ставим роль и привязываем к строке в команде.

export const dynamic = "force-dynamic";

const ROLES = ["owner", "admin", "teamlead", "montager"];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const teamId = Number(params.id);
  if (!teamId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "не авторизован" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) {
    return NextResponse.json({ error: "выдавать доступ может только владелец" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const email = String(body?.email || "").trim().toLowerCase();
  const password = body?.password ? String(body.password) : "";
  const role = ROLES.includes(body?.role) ? body.role : "montager";
  if (!email || !email.includes("@")) return NextResponse.json({ error: "нужна корректная почта" }, { status: 400 });

  const { data: member } = await sb.from("team_members").select("id, name").eq("id", teamId).maybeSingle();
  if (!member) return NextResponse.json({ error: "сотрудник не найден" }, { status: 404 });

  // Уже есть профиль с такой почтой?
  let { data: profile } = await sb.from("profiles").select("id, email").eq("email", email).maybeSingle();

  // Нет профиля — пробуем создать аккаунт (нужен service-role ключ)
  if (!profile) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({
        error: "Аккаунта с такой почтой ещё нет. Пусть сотрудник зарегистрируется на странице входа CRM, после этого нажми «Выдать доступ» ещё раз — роль и привязка проставятся автоматически.",
        needsSignup: true,
      }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "нужен пароль минимум 6 символов" }, { status: 400 });
    }
    const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name: member.name },
    });
    if (cErr || !created?.user) return NextResponse.json({ error: cErr?.message || "не удалось создать аккаунт" }, { status: 500 });
    profile = { id: created.user.id, email };
  }

  // Роль + имя в профиле
  const { error: pErr } = await sb.from("profiles").update({ role, name: member.name }).eq("id", profile.id);
  if (pErr) return NextResponse.json({ error: `роль: ${pErr.message}` }, { status: 500 });

  // Привязка аккаунта к строке в команде
  const { error: tErr } = await sb.from("team_members").update({ profile_id: profile.id }).eq("id", teamId);
  if (tErr) return NextResponse.json({ error: `привязка: ${tErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, email, role, profileId: profile.id });
}

// Отозвать доступ: отвязать аккаунт от сотрудника (сам аккаунт остаётся).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const teamId = Number(params.id);
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "не авторизован" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) {
    return NextResponse.json({ error: "только владелец" }, { status: 403 });
  }
  const { error } = await sb.from("team_members").update({ profile_id: null }).eq("id", teamId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
