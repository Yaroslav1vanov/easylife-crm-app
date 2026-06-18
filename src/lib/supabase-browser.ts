import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Один клиент на вкладку: иначе несколько Auth-менеджеров конкурируют за
// блокировку токена и валятся с "Lock broken by another request with the 'steal' option".
let client: SupabaseClient | null = null;

export function createClient() {
  if (client) return client;
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return client;
}
