import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// «Оценка вирусности» = РАЗБОР ДОНОРА (шаг 2 методологии): вскрыть, какой элемент тащил ролик.
const MODEL = process.env.ANALYZE_MODEL || "claude-sonnet-4-6";

const SYSTEM = `Ты — эксперт по виральности коротких видео (Reels/TikTok/Shorts). Работаешь по методологии «инженерия внимания».

Бюджет внимания (веса): 🔥 Хук 0–3с — 35% (остановить скролл) · 🌉 Связка/Bridge 3–5с — 10% (open loop, заставить досмотреть) · 👀 Удержание 5–30с — 20% · 💎 Ценность — 20% (причина сохранить/переслать) · 📢 CTA — 10% · 📐 Формат — 5%.

5 паттернов хука: 1) противоречие/слом ожидания 2) конкретный результат+срок 3) разрыв любопытства 4) прямое попадание в страх 5) срочность/новость. Сильный хук понятен холодному зрителю и открывает петлю. Убийцы: «привет», «сегодня расскажу», абстракция, длинный заход.
Связка = второй микро-хук: команда досмотреть ИЛИ анонс перечня (list loop).
Ценность: польза / эмоция / идентификация («это про меня») / развлечение.
CTA: ключевое слово в комментах, зашитое в логику. ❌ «ставь лайк/подписывайся».

ВАЖНО: донор УЖЕ виральный. Твоя задача не «хорош ли он», а понять, КАКОЙ ЭЛЕМЕНТ ЕГО ТАЩИЛ — чтобы при адаптации под клиента этот рычаг НЕ потеряли. Будь конкретным и жёстким, без воды.`;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY не задан" }, { status: 400 });
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const sb = createClient();
  const { data: ref } = await sb.from("reference_videos").select("*").eq("id", id).maybeSingle();
  if (!ref) return NextResponse.json({ error: "референс не найден" }, { status: 404 });
  if (!ref.transcript) return NextResponse.json({ error: "Нет транскрибации — сначала подтяни ролик" }, { status: 400 });

  const metrics = [
    ref.views != null ? `просмотры: ${ref.views}` : null,
    ref.comments != null ? `комментарии: ${ref.comments}` : null,
    ref.likes != null ? `лайки: ${ref.likes}` : null,
  ].filter(Boolean).join(" · ") || "метрики неизвестны";

  const user = `ДОНОР (${ref.platform || "?"}) — ${metrics}
${ref.author ? `Автор: ${ref.author}` : ""}
${ref.caption ? `Подпись: ${ref.caption}` : ""}

Транскрибация ролика:
"""
${ref.transcript}
"""

Сделай РАЗБОР ДОНОРА строго в этом формате (без вступлений):

РАЗБОР ДОНОРА
Главный рычаг: [что именно тащило — 1 фраза]

🔥 Хук:      [/10] — какой паттерн, почему остановил
🌉 Связка:   [/10] — есть/нет, тип (команда / list loop)
👀 Тело:     [/10] — структура, ритм, петли
💎 Ценность: [/10] — доминирующий тип
📢 CTA:      [/10] — механика

✅ ЧТО СРАБОТАЛО (обязательно сохранить при адаптации): 1–3 пункта
🔧 ЧТО ДОКРУТИТЬ (слабые места донора): 1–3 пункта`;

  let text = "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: SYSTEM, messages: [{ role: "user", content: user }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `Anthropic ${r.status}`);
    text = (j.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
  } catch (e: any) { return NextResponse.json({ error: e?.message || String(e) }, { status: 502 }); }

  const patch = { analysis: text, analyzed_at: new Date().toISOString() };
  const { error } = await sb.from("reference_videos").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, analysis: text });
}
