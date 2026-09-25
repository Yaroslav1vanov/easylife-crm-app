import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/* Кто имеет право дёргать наши API-роуты.

   До 25.09.2026 почти все роуты отвечали кому угодно: посторонний мог публиковать
   ролики клиентов, жечь наши платные ключи (AI, транскрибация) и получать подписанные
   ссылки на загрузку в наше хранилище. Теперь роут либо для вошедшего в CRM,
   либо для крона Vercel (по секрету), либо для того и другого. */

/** Пускаем только того, кто вошёл в CRM. Вернул ответ — значит отказ. */
export async function requireUser(): Promise<NextResponse | null> {
  const sb = createClient();
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: "Нужно войти в CRM" }, { status: 401 });
  return null;
}

/** Запрос от расписания Vercel (или от нашего скрипта с тем же секретом). */
export function isCron(req: Request): boolean {
  const s = process.env.CRON_SECRET;
  if (s) return req.headers.get("authorization") === `Bearer ${s}`;
  return !!req.headers.get("x-vercel-cron");   // секрет не задан — доверяем только заголовку Vercel
}

/** Роут, который дёргают и по расписанию, и руками из CRM. */
export async function requireUserOrCron(req: Request): Promise<NextResponse | null> {
  return isCron(req) ? null : requireUser();
}
