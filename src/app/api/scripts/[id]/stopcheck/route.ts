import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/apiGuard";
import { getModel } from "@/lib/aiModels";
import { askClaude } from "@/lib/claude";
import { getSetting } from "@/lib/appSettings";
import { DEFAULT_IG_RULES, IG_RULES_KEY } from "@/lib/igRules";
import { stopHash, type StopIssue } from "@/lib/database";

/* Проверка сценария на стоп-слова Instagram (по кнопке в карточке сценария).
   Только ПРЕДУПРЕЖДАЕТ: какие фразы рискуют занизить показы и почему. Замены не предлагает —
   хук должен оставаться цепляющим, решение переписать или оставить принимает тимлид. */
export const maxDuration = 180;

const FIELDS: Record<StopIssue["field"], string> = { hook_text: "Тема", hook: "Хук", body_text: "Основной текст", cta: "Призыв", post_caption: "Описание к ролику" };

const SYSTEM = (rules: string) => `Ты — модератор контента для Instagram Reels. Проверяешь сценарий ролика на слова и смыслы, из-за которых Instagram может занизить показы, не рекомендовать ролик или ограничить аккаунт.

ПРАВИЛА (памятка агентства):
${rules}

КАК РАБОТАТЬ:
- Отмечай только реальные риски по этим правилам. Обычные слова в «белых» нишах (недвижимость, авто, туризм, бизнес-услуги, дизайн, образование) — не трогай. Если рисков нет — так и скажи, issues пустой.
- Не придирайся к цепляющим хукам: провокация, спор, интрига, «вы тратите время», цифры без обещания результата — это нормально, такие хуки НЕ отмечай.
- Не больше 7 пунктов — только самые важные. Однотипные фразы объединяй в один пункт (цитата — самая показательная). Риск — это обещание результата/срока/гарантии, болезни и лечение, «до/после», деньги-«заработок», запретные темы, приманки вовлечения, прямое «купи»/промокоды.
- НЕ предлагай замены и не переписывай текст. Только: какая фраза, почему рискованно, насколько.
- quote — дословный кусок из текста сценария (3–12 слов), чтобы его можно было найти поиском. Не перефразируй цитату.
- severity: "high" — почти наверняка занизит показы или нарушает правила Meta; "medium" — спорно, решать тимлиду.
- Учитывай нишу клиента: «ботокс» в ролике клиники про процедуру — medium, только вместе с обещанием («навсегда», «без последствий») — high.
- Пиши по-русски, коротко, без канцелярита.`;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  const id = Number(params.id);
  const sb = createClient();
  const { data: s } = await sb.from("scripts").select("id, client_id, hook, hook_text, body_text, cta, post_caption").eq("id", id).maybeSingle();
  if (!s) return NextResponse.json({ error: "сценарий не найден" }, { status: 404 });
  const filled = (Object.keys(FIELDS) as StopIssue["field"][]).filter(f => String((s as any)[f] || "").trim());
  if (!filled.length) return NextResponse.json({ error: "Сценарий пустой — нечего проверять" }, { status: 400 });

  const { data: client } = await sb.from("clients").select("name, surname, niche, product").eq("id", s.client_id).maybeSingle();
  const [model, rules] = await Promise.all([getModel(sb, "stopcheck"), getSetting(sb, IG_RULES_KEY, DEFAULT_IG_RULES)]);

  const user = `КЛИЕНТ: ${client?.name || ""} ${client?.surname || ""} · ниша: ${client?.niche || "не указана"}${client?.product ? ` · продукт: ${client.product}` : ""}

СЦЕНАРИЙ:
${filled.map(f => `[${f}] ${FIELDS[f]}:\n${String((s as any)[f]).trim()}`).join("\n\n")}

Верни ТОЛЬКО JSON:
{
  "level": "ok | low | medium | high",
  "summary": "одна фраза — общий вывод",
  "issues": [{ "field": "hook | hook_text | body_text | cta | post_caption", "quote": "дословная цитата", "severity": "high | medium", "category": "например: обещание результата", "why": "почему Instagram это режет, 1 фраза" }],
  "checklist": ["короткие пункты из чек-листа, которые стоит проверить в ролике (метка ИИ, текст в кадре = речь = подпись и т.п.), если уместно"]
}`;

  let text = "";
  try { text = await askClaude(sb, { kind: "stopcheck", clientId: s.client_id, model, system: SYSTEM(rules), user, maxTokens: 2000 }); }
  catch (e: any) { return NextResponse.json({ error: e?.message || String(e) }, { status: 502 }); }

  let p: any;
  try { const a = text.indexOf("{"), b = text.lastIndexOf("}"); p = JSON.parse(text.slice(a, b + 1)); }
  catch { return NextResponse.json({ error: "ИИ ответил не по формату — нажмите ещё раз" }, { status: 502 }); }

  const issues: StopIssue[] = (Array.isArray(p.issues) ? p.issues : [])
    .filter((x: any) => x && FIELDS[x.field as StopIssue["field"]] && typeof x.quote === "string")
    .map((x: any) => ({ field: x.field, quote: String(x.quote).trim().slice(0, 200), severity: x.severity === "high" ? "high" : "medium",
      category: String(x.category || "").slice(0, 80), why: String(x.why || "").slice(0, 300) }));
  const level = ["ok", "low", "medium", "high"].includes(p.level) ? p.level : issues.some(i => i.severity === "high") ? "high" : issues.length ? "medium" : "ok";
  const result = { level, summary: String(p.summary || "").slice(0, 300), issues, checklist: Array.isArray(p.checklist) ? p.checklist.slice(0, 6).map(String) : [], hash: stopHash(s) };

  const at = new Date().toISOString();
  await sb.from("scripts").update({ stopcheck: result, stopcheck_at: at }).eq("id", id);
  return NextResponse.json({ ok: true, model, stopcheck: result, stopcheck_at: at });
}
