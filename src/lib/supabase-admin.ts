import { createClient as createJs } from "@supabase/supabase-js";

/* Служебный доступ к базе — только для кода, который работает БЕЗ вошедшего
   сотрудника: задачи по расписанию и вебхук телеграм-бота. Ключ серверный,
   в браузер не попадает. Все такие роуты закрыты секретом крона или входом
   в CRM (см. lib/apiGuard). Обычные страницы и API работают от имени сотрудника,
   чтобы правила доступа в базе продолжали действовать. */
export function createAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY не задан в переменных окружения");
  return createJs(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}
