import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdmin } from "@/lib/supabase-admin";

/* «Обновить образы из HeyGen» (только владелец): задача исполнителю — забрать все образы группы аватара
   с картинками. Только просмотр списка, кредиты не тратятся. POST { clientId } */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужно войти в CRM" }, { status: 401 });
  const sb = createAdmin();
  const { data: prof } = await sb.from("profiles").select("role, name").eq("id", user.id).maybeSingle();
  if (!prof || !["owner", "admin"].includes(prof.role)) return NextResponse.json({ error: "Только Ярослав" }, { status: 403 });
  const cid = Number((await req.json().catch(() => ({}))).clientId);
  const { data: av } = await sb.from("client_avatars").select("heygen_group_id").eq("client_id", cid).maybeSingle();
  if (!av?.heygen_group_id) return NextResponse.json({ error: "Сначала укажите группу аватара" }, { status: 400 });
  const { data: c } = await sb.from("clients").select("ai_chat").eq("id", cid).maybeSingle();
  if (!c?.ai_chat) return NextResponse.json({ error: "У клиента выключен ИИ в чате" }, { status: 400 });
  const { error } = await sb.from("client_chat_messages").insert({
    client_id: cid, thread: "avatar", author_type: "user", author_id: user.id, author_name: prof.name || "Ярослав", ai_status: "queued",
    body: "🔄 Обнови образы из HeyGen (только список с картинками, без генерации)", attachments: [], meta: { avatar_sync: true },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
