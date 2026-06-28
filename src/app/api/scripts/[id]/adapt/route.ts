import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Адаптация сценария из донора: транскрибация + разбор (что сохранить) + тон клиента → Хук/Основной/Призыв.
const MODEL = process.env.SCRIPT_MODEL || "claude-opus-4-8";

const SYSTEM = `Ты — топовый сценарист коротких видео по методологии «инженерия внимания». Не пишешь с нуля — берёшь донора (уже виральный ролик) и переносишь его РЫЧАГ на клиента, не потеряв то, что заставляло смотреть.

Структура и веса: 🔥 Хук 0–3с (35%, остановить скролл) · 🌉 Связка/open loop (10%) · 👀 Удержание (20%, ритм каждые 2–3с) · 💎 Ценность (20%) · 📢 CTA (10%, ключевое слово в комментах, зашитое в логику).
Хук-паттерны: противоречие / результат+срок / разрыв любопытства / удар по страху / срочность. Хук понятен холодному зрителю и открывает петлю.
🚫 Стоп-слова: «привет», «сегодня расскажу», «по сути», «на самом деле», «идеальный/волшебный», обращение «вы», длинное тире как пунктуация, шаблонные шутки. Обращение на «ты», короткие рубленые фразы, один ролик = одна мысль = один CTA, 30–45 сек.

ГЛАВНОЕ: сохрани РЫЧАГ донора (из разбора) — то, что тащило ролик. Контекст и примеры меняем под нишу/оффер клиента, смысловой механизм сохраняем. Не копируй дословно — уникализируй под клиента и его тон голоса.`;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY не задан" }, { status: 400 });
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const reqBody = await req.json().catch(() => ({}));
  const instruction: string = (reqBody.instruction || "").trim();
  const model: string = reqBody.model || MODEL;          // для A/B-сравнения моделей
  const save: boolean = reqBody.save !== false;          // save=false → не писать в БД (dry-run)

  const sb = createClient();
  const { data: s } = await sb.from("scripts").select("*").eq("id", id).maybeSingle();
  if (!s) return NextResponse.json({ error: "сценарий не найден" }, { status: 404 });
  const donor = s.transcription || s.ref_text || "";
  if (!donor) return NextResponse.json({ error: "Нет транскрибации донора — нечего адаптировать" }, { status: 400 });

  const { data: client } = await sb.from("clients").select("name, surname, niche, product, brand_voice").eq("id", s.client_id).maybeSingle();

  const ctx = `КЛИЕНТ: ${client?.name || ""} ${client?.surname || ""}${client?.niche ? ` · ниша: ${client.niche}` : ""}${client?.product ? ` · продукт: ${client.product}` : ""}

ТОН ГОЛОСА КЛИЕНТА (соблюдать строго):
${client?.brand_voice || "(не задан — пиши живо, экспертно, на «ты», минимум эмодзи)"}

РАЗБОР ДОНОРА (что именно тащило ролик — ОБЯЗАТЕЛЬНО сохранить рычаг):
${s.description || "(разбор не делался — опирайся на транскрибацию)"}

ТРАНСКРИБАЦИЯ ДОНОРА:
"""
${donor}
"""`;

  const task = instruction
    ? `Текущая версия сценария:
Хук: ${s.hook || "(пусто)"}
Основной: ${s.body_text || "(пусто)"}
Призыв: ${s.cta || "(пусто)"}

ПРАВКА от автора: «${instruction}»

Перепиши сценарий с учётом этой правки. Меняй то, что просит правка (и связанное с ней), остальное сохраняй. НЕ потеряй рычаг донора и тон клиента.`
    : `Напиши адаптацию под клиента, сохранив рычаг донора и уникализировав под его нишу/оффер/тон.`;

  const user = `${ctx}

${task}

Верни ТОЛЬКО валидный JSON:
{
  "hook": "Хук — первые 1–2 секунды, останавливает скролл, открывает петлю",
  "body": "Основной текст — удержание + ценность, ритм короткими фразами, выполняет обещание хука 1:1",
  "cta": "Призыв — ключевое слово в комментах, зашитое в логику"
}`;

  let text = "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 2000, system: SYSTEM, messages: [{ role: "user", content: user }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `Anthropic ${r.status}`);
    text = (j.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
  } catch (e: any) { return NextResponse.json({ error: e?.message || String(e) }, { status: 502 }); }

  let parsed: any;
  try { const a = text.indexOf("{"), b = text.lastIndexOf("}"); parsed = JSON.parse(text.slice(a, b + 1)); }
  catch { return NextResponse.json({ error: "AI вернул не-JSON", raw: text }, { status: 502 }); }

  const patch = { hook: parsed.hook || "", body_text: parsed.body || "", cta: parsed.cta || "" };
  if (save) {
    const { error } = await sb.from("scripts").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, model, ...patch });
}
