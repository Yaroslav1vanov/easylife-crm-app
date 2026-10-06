import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// «Оценка вирусности» = РАЗБОР ДОНОРА (шаг 2 методологии): вскрыть, какой элемент тащил ролик.
import { getModel } from "@/lib/aiModels";
import { askClaude } from "@/lib/claude";
import { requireUser } from "@/lib/apiGuard";

const SYSTEM = `Ты — эксперт по виральности коротких видео (Reels/TikTok/Shorts). Работаешь по методологии «инженерия внимания».

Бюджет внимания (веса): 🔥 Хук 0–3с — 35% (остановить скролл) · 🌉 Связка/Bridge 3–5с — 10% (open loop, заставить досмотреть) · 👀 Удержание 5–30с — 20% · 💎 Ценность — 20% (причина сохранить/переслать) · 📢 CTA — 10% · 📐 Формат — 5%.

5 паттернов хука: 1) противоречие/слом ожидания 2) конкретный результат+срок 3) разрыв любопытства 4) прямое попадание в страх 5) срочность/новость. Сильный хук понятен холодному зрителю и открывает петлю. Убийцы: «привет», «сегодня расскажу», абстракция, длинный заход.
Связка = второй микро-хук: команда досмотреть ИЛИ анонс перечня (list loop).
Ценность: польза / эмоция / идентификация («это про меня») / развлечение.
CTA: ключевое слово в комментах, зашитое в логику. ❌ «ставь лайк/подписывайся».

ВАЖНО: донор УЖЕ виральный. Твоя задача не «хорош ли он», а понять, КАКОЙ ЭЛЕМЕНТ ЕГО ТАЩИЛ — чтобы при адаптации под клиента этот рычаг НЕ потеряли. Будь конкретным и жёстким, без воды.`;

// ИИ может отвечать через сервер (подписка) — даём до 3 минут
export const maxDuration = 180;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  const MODEL = await getModel(createClient(), "analyze");
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
  try { text = await askClaude(createClient(), { kind: "ref_analyze", model: MODEL, system: SYSTEM, user, maxTokens: 1500 }); }
  catch (e: any) { return NextResponse.json({ error: e?.message || String(e) }, { status: 502 }); }

  const patch = { analysis: text, analyzed_at: new Date().toISOString() };
  const { error } = await sb.from("reference_videos").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, analysis: text });
}
