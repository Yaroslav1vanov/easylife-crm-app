import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/apiGuard";

/* «Уникализировать в чате ИИ»: сценарий уходит задачей в чат «Рилсы» клиента, привязанной к сценарию.
   ИИ на сервере получает сценарий, расшифровку и разбор референса, сам скачивает видео-референс
   и предлагает нашу версию под клиента. Дальше в том же чате: «записывай» → текст в сценарий,
   видео аватара → монтаж с учётом референса. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  const sb = createClient();
  const { data: s } = await sb.from("scripts").select("id, client_id, order_num, hook_text, hook, ref_url, ref_text, transcription, body_text")
    .eq("id", Number(params.id)).maybeSingle();
  if (!s) return NextResponse.json({ error: "сценарий не найден" }, { status: 404 });
  const { data: c } = await sb.from("clients").select("ai_chat").eq("id", s.client_id).maybeSingle();
  if (!c?.ai_chat) return NextResponse.json({ error: "У клиента выключен ИИ: карточка клиента → «Настройки» → «ИИ-монтажёр в чате»" }, { status: 400 });

  const { data: { user } } = await sb.auth.getUser();
  const { data: tm } = user ? await sb.from("team_members").select("name").eq("profile_id", user.id).maybeSingle() : { data: null };
  const title = (s.hook_text || s.hook || "").trim().slice(0, 90) || `сценарий #${s.order_num || s.id}`;
  const hasRef = !!(s.ref_url || "").trim();
  const hasText = !!((s.ref_text || s.transcription || "").trim());
  const body = `✨ Уникализируй сценарий «${title}» под клиента.\n` +
    (hasRef ? "Посмотри референс (видео по ссылке" + (hasText ? " и расшифровку" : "") + "), разбери, что в нём цепляет: хук, структура, подача, финал.\n"
            : hasText ? "Ссылки на референс нет, есть расшифровка — разбери по ней.\n" : "Референса нет — работай от текста сценария.\n") +
    "Предложи нашу версию: хук, текст, призыв, описание к ролику — на основе информации о клиенте. В сценарий пока ничего не записывай, сначала обсудим.";

  const { data: m, error } = await sb.from("client_chat_messages").insert({
    client_id: s.client_id, author_type: "user", author_id: user?.id ?? null,
    author_name: tm?.name || user?.email?.split("@")[0] || "Сотрудник",
    thread: "reels", ai_status: "queued", attachments: [], script_id: s.id, body,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, client_id: s.client_id, message_id: m.id });
}
