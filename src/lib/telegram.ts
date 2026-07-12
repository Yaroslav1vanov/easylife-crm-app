// Отправка сообщения ботом в чат (в нужную тему форума через message_thread_id).
export async function tgReply(chatId: number | string, text: string, threadId?: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        message_thread_id: threadId,
        disable_web_page_preview: true,
        parse_mode: "HTML",
      }),
    });
  } catch {}
}

// Достаёт все ссылки из текста + entities Telegram-сообщения.
export function extractUrls(msg: any): string[] {
  const out = new Set<string>();
  const text: string = msg?.text || msg?.caption || "";
  const entities = msg?.entities || msg?.caption_entities || [];
  for (const e of entities) {
    if (e.type === "text_link" && e.url) out.add(e.url);
    if (e.type === "url") out.add(text.slice(e.offset, e.offset + e.length));
  }
  const re = /https?:\/\/[^\s<>"']+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[0]);
  return Array.from(out);
}
