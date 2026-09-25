/* Единая точка правды про подключение к Supabase.

   У части сотрудников (провайдер, корпоративный фильтр, антивирус) домен
   *.supabase.co не открывается — браузер отдаёт «Failed to fetch», и CRM
   выглядит сломанной. На этот случай есть запасной путь: тот же Supabase,
   но через наш домен — /sb/... (реврайт в next.config.js). Флаг в localStorage
   включается сам при сетевой ошибке входа. */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const ref = (SUPABASE_URL.match(/^https?:\/\/([^.]+)\./) || [])[1] || "crm";
/** Имя cookie сессии фиксируем: иначе при работе через /sb оно поменяется и сервер перестанет видеть вход. */
export const AUTH_COOKIE = `sb-${ref}-auth-token`;
export const PROXY_FLAG = "crm_sb_proxy";

export function proxyOn(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(PROXY_FLAG) === "1"; } catch { return false; }
}
export function setProxy(on: boolean) {
  try { on ? localStorage.setItem(PROXY_FLAG, "1") : localStorage.removeItem(PROXY_FLAG); } catch {}
}
/** Адрес Supabase для браузера: прямой или через наш домен. */
export function browserSupabaseUrl(): string {
  return proxyOn() && typeof window !== "undefined" ? `${window.location.origin}/sb` : SUPABASE_URL;
}
/** Похоже на «сеть не пускает», а не на ошибку данных. */
export function isNetworkError(e: any): boolean {
  const m = String(e?.message || e || "");
  return /failed to fetch|networkerror|load failed|fetch failed|timeout|err_/i.test(m);
}
/** Таблицы действительно нет (а не RLS/сеть). */
export function isMissingTable(e: any): boolean {
  const m = String(e?.message || "");
  return /does not exist|schema cache|relation .* does not exist/i.test(m) || e?.code === "42P01" || e?.code === "PGRST205";
}
