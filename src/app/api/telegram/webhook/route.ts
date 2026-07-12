import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase-server";
import { ingestReference, detectPlatform } from "@/lib/ingestReference";
import { tgReply, extractUrls } from "@/lib/telegram";

// Вебхук ТГ-бота: ссылки в теме клиента → авто-загрузка рефов в CRM.
// Тема форума ↔ клиент по clients.telegram_topic_id.
// Мгновенно отвечаем Telegram (200), а загрузку делаем в фоне (waitUntil) —
// поэтому в одном сообщении можно кидать хоть 1, хоть 20 ссылок.
export const maxDuration = 60;

const fmt = (n: number | null) => n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);

async function process(msg: any) {
  const chatId = msg.chat?.id;
  const threadId: number | undefined = msg.message_thread_id;
  const urls = extractUrls(msg).filter(u => detectPlatform(u));
  if (!urls.length) return;

  const sb = createClient();
  const { data: client } = threadId != null
    ? await sb.from("clients").select("id, name, surname").eq("telegram_topic_id", threadId).maybeSingle()
    : { data: null };

  if (!client) {
    await tgReply(chatId,
      `⚠️ Эта тема не привязана к клиенту в CRM.\nID темы: <code>${threadId ?? "—"}</code>\nВпиши его в карточку клиента → поле «Telegram topic ID», и рефы начнут добавляться сами.`,
      threadId);
    return;
  }

  const cname = `${client.name} ${client.surname || ""}`.trim();
  const lines: string[] = [];
  let added = 0;
  for (const url of urls) {
    const r = await ingestReference(url, client.id);
    if (r.ok) { added++; lines.push(`✅ 👁 ${fmt(r.reference.views)} · 💬 ${fmt(r.reference.comments)}`); }
    else lines.push(`⚠️ ${r.error}`);
  }
  const head = urls.length > 1 ? `<b>${cname}</b> · добавлено ${added}/${urls.length}` : `<b>${cname}</b>`;
  await tgReply(chatId, `${head}\n${lines.join("\n")}`, threadId);
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret)
    return NextResponse.json({ ok: false }, { status: 401 });

  const update = await req.json().catch(() => null);
  const msg = update?.message || update?.channel_post || update?.edited_message;
  if (msg) waitUntil(process(msg)); // ack мгновенно, обработка в фоне
  return NextResponse.json({ ok: true });
}
