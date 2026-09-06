import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// AI-адаптатор: из base_text + brand_voice клиента генерит тексты под выбранные соцсети.
import { getModel } from "@/lib/aiModels";
import { getSetting } from "@/lib/appSettings";
import { PROMPT_KEYS, DEFAULT_ADAPTER_SYSTEM, DEFAULT_ADAPTER_NETWORK } from "@/lib/adapterPrompts";


export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const MODEL = await getModel(createClient(), "adapter");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY не задан в окружении" }, { status: 400 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const sb = createClient();
  const { data: pub } = await sb.from("publications").select("*").eq("id", id).maybeSingle();
  if (!pub) return NextResponse.json({ error: "публикация не найдена" }, { status: 404 });

  const { data: client } = await sb.from("clients").select("name, surname, niche, brand_voice, platforms").eq("id", pub.client_id).maybeSingle();

  // Исходный текст: если пуст — собираем из сценария (хук + тело + CTA) и сохраняем в карточку
  let baseText: string = (pub.base_text || "").trim();
  if (!baseText && pub.script_id) {
    const { data: sc } = await sb.from("scripts").select("hook_text, hook, body_text, cta").eq("id", pub.script_id).maybeSingle();
    baseText = [sc?.hook_text || sc?.hook, sc?.body_text, sc?.cta].map(x => (x || "").trim()).filter(Boolean).join("\n\n");
    if (baseText) await sb.from("publications").update({ base_text: baseText }).eq("id", id);
  }
  if (!baseText) return NextResponse.json({ error: "Нет исходного текста. Впиши текст ролика в шаг 3 (или заполни сценарий) и нажми «Сгенерить» ещё раз." }, { status: 400 });

  const channels: string[] = pub.target_channels?.length ? pub.target_channels : client?.platforms?.length ? client.platforms : ["ig", "tt", "yt", "threads"];
  const NETS: Record<string, string> = {
    ig: await getSetting(sb, PROMPT_KEYS.ig, DEFAULT_ADAPTER_NETWORK.ig),
    tt: await getSetting(sb, PROMPT_KEYS.tt, DEFAULT_ADAPTER_NETWORK.tt),
    yt: await getSetting(sb, PROMPT_KEYS.yt, DEFAULT_ADAPTER_NETWORK.yt),
    threads: await getSetting(sb, PROMPT_KEYS.threads, DEFAULT_ADAPTER_NETWORK.threads),
  };
  const limitText = channels.map(c => `- ${NETS[c] || c}`).join("\n");

  const system = `${await getSetting(sb, PROMPT_KEYS.system, DEFAULT_ADAPTER_SYSTEM)}

Верни ТОЛЬКО валидный JSON без markdown-обёртки.`;

  const user = `Клиент: ${client?.name || ""} ${client?.surname || ""}${client?.niche ? ` · ниша: ${client.niche}` : ""}

Тон голоса клиента (соблюдать строго):
${client?.brand_voice || "(не задан — пиши нейтрально-экспертно, минимум эмодзи)"}

Исходный текст ролика (сценарий):
"""
${baseText}
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

  return NextResponse.json({ ok: true, publication: { ...pub, ...patch, base_text: baseText } });
}
