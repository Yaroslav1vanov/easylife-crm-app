import { SupabaseClient } from "@supabase/supabase-js";

/* Ключ → значение из таблицы app_settings, с кэшем на минуту.
   Таблицы может не быть (миграция не прогнана) — тогда пустая карта, всё падает на дефолты. */
let cache: { at: number; map: Record<string, string> } | null = null;

export async function getSettings(sb: SupabaseClient): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.map;
  try {
    const { data, error } = await sb.from("app_settings").select("key, value");
    cache = { at: Date.now(), map: error ? {} : Object.fromEntries((data || []).map((r: any) => [r.key, r.value ?? ""])) };
  } catch { cache = { at: Date.now(), map: {} }; }
  return cache.map;
}
export async function getSetting(sb: SupabaseClient, key: string, def = ""): Promise<string> {
  const m = await getSettings(sb);
  const v = m[key];
  return v != null && String(v).trim() !== "" ? String(v) : def;
}
export function invalidateSettingsCache() { cache = null; }
