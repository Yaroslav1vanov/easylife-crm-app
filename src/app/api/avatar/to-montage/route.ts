import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdmin } from "@/lib/supabase-admin";

/* «В монтаж →» под готовым видео аватара: задача в чат «Рилсы» с этим видео во вложении.
   Сценарий переносится, если видео делалось по сценарию.
   POST { messageId, key } — сообщение ИИ из чата «Аватар» и ключ видео в нём */
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return bad("Нужно войти в CRM", 401);
  const b = await req.json().catch(() => ({}));
  const sb = createAdmin();
  const { data: m } = await sb.from("client_chat_messages").select("id, client_id, thread, attachments, reply_to, script_id")
    .eq("id", Number(b.messageId)).maybeSingle();
  if (!m || m.thread !== "avatar") return bad("Сообщение не из чата «Аватар»", 404);
  const att = (m.attachments || []).find((a: any) => a.key === b.key);
  if (!att) return bad("Видео не найдено в сообщении");

  // сценарий: из самого сообщения, из задачи, на которую оно ответ, или из генерации
  let sid = m.script_id;
  if (!sid && m.reply_to) sid = (await sb.from("client_chat_messages").select("script_id").eq("id", m.reply_to).maybeSingle()).data?.script_id || null;
  const { data: s } = sid ? await sb.from("scripts").select("id, order_num, hook_text, hook").eq("id", sid).maybeSingle() : { data: null };
  const [{ data: client }, { data: tm }, { data: prof }] = await Promise.all([
    sb.from("clients").select("ai_chat").eq("id", m.client_id).maybeSingle(),
    sb.from("team_members").select("name").eq("profile_id", user.id).maybeSingle(),
    sb.from("profiles").select("name").eq("id", user.id).maybeSingle(),
  ]);

  const title = s ? `#${s.order_num || s.id} «${(s.hook_text || s.hook || "").trim().slice(0, 80)}»` : "";
  const body = `🎬 Смонтируй ролик${title ? ` по сценарию ${title}` : ""}, исходник аватара во вложении. ` +
    "Стиль — STYLE.md клиента, субтитры, акценты на каждую фразу, музыку даст Ярослав.";
  const { data: out, error } = await sb.from("client_chat_messages").insert({
    client_id: m.client_id, thread: "reels", author_type: "user", author_id: user.id,
    author_name: tm?.name || prof?.name || user.email?.split("@")[0] || "Сотрудник",
    ai_status: client?.ai_chat ? "queued" : null, body, attachments: [att], script_id: s?.id ?? null,
  }).select("id").single();
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true, id: out.id });
}
