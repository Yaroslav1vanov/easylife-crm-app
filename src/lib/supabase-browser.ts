import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_COOKIE, SUPABASE_ANON, browserSupabaseUrl } from "@/lib/supabaseConfig";
import { isPortal } from "@/lib/portalMode";
import { portalClient } from "@/lib/portalClient";

// Один клиент на вкладку: иначе несколько Auth-менеджеров конкурируют за
// блокировку токена и валятся с "Lock broken by another request with the 'steal' option".
let client: SupabaseClient | null = null;

export function createClient() {
  // кабинет клиента (/p/<секрет>): никакой сессии CRM — только чтение через сервер кабинета
  if (isPortal()) return portalClient();
  if (client) return client;
  client = createBrowserClient(browserSupabaseUrl(), SUPABASE_ANON, { cookieOptions: { name: AUTH_COOKIE } });
  return client;
}
/** После переключения на запасной путь клиента нужно пересоздать. */
export function resetClient() { client = null; }
