import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_COOKIE, SUPABASE_ANON, browserSupabaseUrl } from "@/lib/supabaseConfig";

// Один клиент на вкладку: иначе несколько Auth-менеджеров конкурируют за
// блокировку токена и валятся с "Lock broken by another request with the 'steal' option".
let client: SupabaseClient | null = null;

export function createClient() {
  if (client) return client;
  client = createBrowserClient(browserSupabaseUrl(), SUPABASE_ANON, { cookieOptions: { name: AUTH_COOKIE } });
  return client;
}
/** После переключения на запасной путь клиента нужно пересоздать. */
export function resetClient() { client = null; }
