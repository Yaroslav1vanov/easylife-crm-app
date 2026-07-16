import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// AI-адаптатор: из base_text + brand_voice клиента генерит тексты под выбранные соцсети.
const MODEL = process.env.ADAPTER_MODEL || "claude-sonnet-4-6";

const LIMITS: Record<string, string> = {
  ig: "Instagram Reels caption: до 2200 символов. СТРУКТУРА обязательна: (1) первая строка — цепляющий хук-вопрос или обещание, в конце 1-2 эмодзи по смыслу и стрелка 👇; (2) 2-4 коротких абзаца основного текста, в них по смыслу вплетены эмодзи (💡🔥⚖️🏡 и подобные — там, где усиливают мысль, НЕ в каждой строке); (3) блок CTA в конце: строка «сохрани/поделись» с 🔥, строка-вопрос к аудитории с 💬, строка про подписку/экспертность автора с 📌. В САМОМ конце — МАКСИМУМ 5 хэштегов, только реальные рабочие нишевые/тематические (по теме и нише клиента). БЕЗ выдуманных, без склеенных из фразы, без общих спам-тегов (#love #follow #viral #fyp в IG).",
  tt: "TikTok caption: коротко и хлёстко (1-3 строки) с 1-3 эмодзи, крючок в первой строке. В конце — МАКСИМУМ 5 хэштегов: реальные рабочие, нишевые по теме + максимум 1-2 в меру трендовых по этой же теме. БЕЗ спама и выдуманных тегов.",
  yt: "YouTube Shorts: yt_title до 100 символов с 1 эмодзи-акцентом, yt_description развёрнутое с ключевыми словами, yt_tags 5-12 тегов (это поле тегов, НЕ хэштеги в тексте).",
  threads: "Threads: СТРОГО до 500 символов (это лимит символов, не слов). Разговорный тон, 2-4 эмодзи по смыслу. Текст обязан быть законченной самодостаточной мыслью — НИКОГДА не обрывай предложение на середине. Если не помещается — сократи и переформулируй, чтобы мысль была завершена в пределах 500 символов. Максимум 1 хэштег или без них.",
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

  const system = `Ты — опытный SMM-копирайтер агентства EasyLife AI. Твоя задача — адаптировать готовый текст ролика (сценарий) в нативные подписи под разные соцсети, строго в тоне голоса клиента. Пиши на том же языке, что и сценарий клиента. Не выдумывай фактов, которых нет в сценарии.

ЭМОДЗИ: текст должен быть живым и структурированным с эмодзи — хук с эмодзи и стрелкой 👇, эмодзи-акценты по смыслу в теле, эмодзи-маркеры в CTA (🔥 сохрани/поделись, 💬 вопрос в комменты, 📌 подписка). НО если тон голоса клиента прямо требует минимализма/строгости — снизь количество эмодзи до уместного, не ломай тон.

ХЭШТЕГИ (важно, 2026): много хэштегов не помогает охватам — Instagram и TikTok ранжируют по смыслу текста и ключевым словам, а не по количеству тегов. Поэтому: МАКСИМУМ 5 хэштегов для IG и TikTok, и только РЕАЛЬНЫЕ рабочие теги, реально существующие и релевантные нише и теме ролика. НИКОГДА не выдумывай хэштеги, не склеивай их из целых фраз, не ставь общий спам (#love #follow #viral #fyp). Лучше 3 точных нишевых тега, чем 5 общих. Ключевые слова по теме вплетай в сам текст — это работает лучше тегов.

Верни ТОЛЬКО валидный JSON без markdown-обёртки.`;

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
