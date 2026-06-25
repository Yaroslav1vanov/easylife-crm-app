import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// AI-адаптатор: из base_text + brand_voice клиента генерит тексты под выбранные соцсети.
const MODEL = process.env.ADAPTER_MODEL || "claude-sonnet-4-6";

const LIMITS: Record<string, string> = {
  ig: "Instagram Reels caption: до 2200 символов, живой цепляющий первый абзац, 5-12 релевантных хэштегов в конце.",
  tt: "TikTok caption: до ~2200 символов, но по факту коротко и хлёстко (1-3 строки) + 3-6 хэштегов.",
  yt: "YouTube Shorts: yt_title до 100 символов, yt_description развёрнутое с ключевыми словами, yt_tags 5-12 тегов.",
  threads: "Threads: до 500 символов, разговорный тон, без обилия хэштегов (0-2).",
};

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY не задан в окружении" }, { status: 400 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const sb = createClient();
  const { data: pub } = await sb.from("publications").select("*").eq("id", id).maybeSingle();
  if (!pub) return NextResponse.json({ error: "публикация не найдена" }, { status: 404 });

  const { data: client } = await sb.from("clients").select("name, surname, brand_voice, platforms").eq("id", pub.client_id).maybeSingle();

  const channels: string[] = pub.target_channels?.length ? pub.target_channels : client?.platforms?.length ? client.platforms : ["ig", "tt", "yt", "threads"];
  const limitText = channels.map(c => `- ${LIMITS[c] || c}`).join("\n");

  const system = `Ты — опытный SMM-копирайтер агентства EasyLife AI. Твоя задача — адаптировать готовый текст ролика (сценарий) в нативные подписи под разные соцсети, строго в тоне голоса клиента. Пиши на том же языке, что и сценарий клиента. Не выдумывай фактов, которых нет в сценарии. Не используй clickbait, если тон клиента это запрещает. Верни ТОЛЬКО валидный JSON без markdown-обёртки.`;

  const user = `Клиент: ${client?.name || ""} ${client?.surname || ""}

Тон голоса клиента (соблюдать строго):
${client?.brand_voice || "(не задан — пиши нейтрально-экспертно, минимум эмодзи)"}

Исходный текст ролика (сценарий):
"""
${pub.base_text || "(пусто)"}
"""

Сделай адаптации ТОЛЬКО под эти соцсети: ${channels.join(", ")}.
Требования по каждой:
${limitText}

Верни JSON строго такой формы (поля для НЕ выбранных соцсетей оставь пустыми строками или []):
{
  "caption_ig": "",
  "caption_tt": "",
  "yt_title": "",
  "yt_description": "",
  "yt_tags": [],
  "threads_post": ""
}`;

  let text = "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, system, messages: [{ role: "user", content: user }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `Anthropic ${r.status}`);
    text = (j.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
  } catch (e: any) {
    await sb.from("publications").update({ pub_status: "error", error_message: `AI: ${e?.message || e}` }).eq("id", id);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 502 });
  }

  let parsed: any;
  try {
    const s = text.indexOf("{"), eIdx = text.lastIndexOf("}");
    parsed = JSON.parse(text.slice(s, eIdx + 1));
  } catch {
    return NextResponse.json({ error: "AI вернул не-JSON", raw: text }, { status: 502 });
  }

  const patch = {
    caption_ig: parsed.caption_ig || null,
    caption_tt: parsed.caption_tt || null,
    yt_title: parsed.yt_title || null,
    yt_description: parsed.yt_description || null,
    yt_tags: Array.isArray(parsed.yt_tags) ? parsed.yt_tags : null,
    threads_post: parsed.threads_post || null,
    ai_generated_at: new Date().toISOString(),
    ai_model: MODEL,
    pub_status: "review" as const,
    error_message: null,
  };
  const { error } = await sb.from("publications").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, publication: { ...pub, ...patch } });
}
