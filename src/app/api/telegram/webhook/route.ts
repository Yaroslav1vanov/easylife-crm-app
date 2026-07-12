import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { ingestReference, detectPlatform } from "@/lib/ingestReference";
import { tgReply, extractUrls } from "@/lib/telegram";

// Вебхук ТГ-бота: ссылка в теме клиента → авто-загрузка рефа в CRM под этого клиента.
// Тема форума ↔ клиент по clients.telegram_topic_id.
export async function POST(req: Request) {
  // защита: Telegram шлёт секрет в заголовке
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret)
    return NextResponse.json({ ok: false }, { status: 401 });

  const update = await req.json().catch(() => null);
  const msg = update?.message || update?.channel_post || update?.edited_message;
  if (!msg) return NextResponse.json({ ok: true }); // не сообщение — игнор

  const chatId = msg.chat?.id;
  const threadId: number | undefined = msg.message_thread_id; // id темы форума
  const urls = extractUrls(msg).filter(u => detectPlatform(u));
  if (!urls.length) return NextResponse.json({ ok: true }); // нет реф-ссылок — молчим

  const sb = createClient();
  // ищем клиента по привязке темы
  const { data: client } = threadId != null
    ? await sb.from("clients").select("id, name, surname").eq("telegram_topic_id", threadId).maybeSingle()
    : { data: null };

  if (!client) {
    await tgReply(chatId,
      `⚠️ Эта тема не привязана к клиенту в CRM.\nID темы: <code>${threadId ?? "—"}</code>\nВпиши его в карточку клиента → поле «Telegram topic ID», и рефы начнут добавляться сами.`,
      threadId);
    return NextResponse.json({ ok: true });
  }

  const cname = `${client.name} ${client.surname || ""}`.trim();
  const results: string[] = [];
  for (const url of urls) {
    const r = await ingestReference(url, client.id);
    if (r.ok) {
      const ref = r.reference;
      const fmt = (n: number | null) => n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);
      results.push(`✅ добавлен · 👁 ${fmt(ref.views)} · 💬 ${fmt(ref.comments)}`);
    } else {
      results.push(`⚠️ ${r.error}`);
    }
  }

  await tgReply(chatId, `<b>${cname}</b>\n${results.join("\n")}`, threadId);
  return NextResponse.json({ ok: true });
}
