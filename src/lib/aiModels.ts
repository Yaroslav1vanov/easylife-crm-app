import { SupabaseClient } from "@supabase/supabase-js";

/* Какая модель Claude пишет тексты в каждой AI-функции.
   Приоритет: таблица app_settings (меняется в «Настройках») → переменная окружения → дефолт.
   Таблица может отсутствовать (миграция не прогнана) — тогда тихо падаем на env/дефолт. */

export type AiFeature = "adapter" | "script" | "analyze" | "report";

export const AI_FEATURES: { key: AiFeature; label: string; hint: string; env: string; def: string }[] = [
  { key: "adapter", label: "Подписи под соцсети", hint: "Публикации → «Сгенерить тексты»", env: "ADAPTER_MODEL", def: "claude-sonnet-5" },
  { key: "script", label: "Адаптация сценариев", hint: "Сценарии → «Адаптировать»", env: "SCRIPT_MODEL", def: "claude-opus-5" },
  { key: "analyze", label: "Разбор референсов", hint: "Референсы → «Разобрать»", env: "ANALYZE_MODEL", def: "claude-opus-5" },
  { key: "report", label: "Отчёт клиенту", hint: "Карточка клиента → «Отчёт»", env: "REPORT_MODEL", def: "claude-opus-5" },
];

export const AI_MODEL_OPTIONS: { id: string; label: string; note: string }[] = [
  { id: "claude-opus-5", label: "Claude Opus 5", note: "самая умная · $5 / $25 за 1M токенов" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", note: "быстрая и дешёвая · $2 / $10" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", note: "прошлое поколение · $5 / $25" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", note: "прошлое поколение · $3 / $15" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "самая дешёвая · $1 / $5" },
];

const SETTING_KEY = (f: AiFeature) => `ai_model.${f}`;
let cache: { at: number; map: Record<string, string> } | null = null;

/** Серверный резолв модели. sb — серверный клиент Supabase. */
export async function getModel(sb: SupabaseClient, feature: AiFeature): Promise<string> {
  const f = AI_FEATURES.find(x => x.key === feature)!;
  try {
    if (!cache || Date.now() - cache.at > 60_000) {
      const { data, error } = await sb.from("app_settings").select("key, value").like("key", "ai_model.%");
      cache = { at: Date.now(), map: error ? {} : Object.fromEntries((data || []).map((r: any) => [r.key, r.value])) };
    }
    const v = cache.map[SETTING_KEY(feature)];
    if (v && typeof v === "string" && v.startsWith("claude-")) return v;
  } catch {}
  return process.env[f.env] || f.def;
}
export function invalidateModelCache() { cache = null; }
