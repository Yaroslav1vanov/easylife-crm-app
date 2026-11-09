import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdmin } from "@/lib/supabase-admin";
import { canGenerate } from "@/lib/avatar";

/* «Обновить образы из HeyGen»: задача исполнителю — забрать все образы группы аватара с картинками.
   Только просмотр списка, кредиты не тратятся. Жмут Ярослав, ассистент, тимлид и монтажёр клиента —
   новые образы, загруженные в HeyGen, сразу появляются в выборе образа. POST { clientId } */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужно войти в CRM" }, { status: 401 });
  const sb = createAdmin();
  const cid = Number((await req.json().catch(() => ({}))).clientId);
  if (!cid) return NextResponse.json({ error: "нет клиента" }, { status: 400 });
  const [{ data: prof }, { data: tm }, { data: c }, { data: av }] = await Promise.all([
    sb.from("profiles").select("role, name").eq("id", user.id).maybeSingle(),
    sb.from("team_members").select("id, name").eq("profile_id", user.id).maybeSingle(),
    sb.from("clients").select("ai_chat, teamlead_id, montager_id, extra_montager_ids").eq("id", cid).maybeSingle(),
    sb.from("client_avatars").select("heygen_group_id, looks_synced_at").eq("client_id", cid).maybeSingle(),
  ]);
  if (!c) return NextResponse.json({ error: "клиент не найден" }, { status: 404 });
  if (prof?.role !== "assistant" && !canGenerate(prof?.role, tm?.id, c))
    return NextResponse.json({ error: "Обновлять образы могут тимлид и монтажёр этого клиента, ассистент и Ярослав" }, { status: 403 });
  if (!av?.heygen_group_id) return NextResponse.json({ error: "К клиенту не привязана группа аватара (привязывает Ярослав в «Настройках»)" }, { status: 400 });
  if (!c.ai_chat) return NextResponse.json({ error: "У клиента выключен ИИ в чате" }, { status: 400 });

  // уже обновляется — второй раз не ставим, просто ждём ту же задачу
  const since = new Date(Date.now() - 10 * 60e3).toISOString();
  const { data: running } = await sb.from("client_chat_messages").select("id").eq("client_id", cid).eq("thread", "avatar")
    .in("ai_status", ["queued", "working"]).contains("meta", { avatar_sync: true }).gte("created_at", since).limit(1);
  if (running?.length) return NextResponse.json({ ok: true, already: true, syncedAt: av.looks_synced_at || null });

  const { error } = await sb.from("client_chat_messages").insert({
    client_id: cid, thread: "avatar", author_type: "user", author_id: user.id, author_name: tm?.name || prof?.name || "Команда", ai_status: "queued",
    body: "🔄 Обнови образы из HeyGen (только список с картинками, без генерации)", attachments: [], meta: { avatar_sync: true },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, syncedAt: av.looks_synced_at || null });
}
