import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase-admin";
import { isCron } from "@/lib/apiGuard";
import { COMPANY_CLIENT_ID } from "@/lib/company";

/* Каждое утро в 09:00 по Бали (01:00 UTC) — задача ИИ в чат «Стратегия» компании:
   где мы по плану, главное на сегодня с исполнителями, просрочка, риски. Ответ видят Ярослав и Катя. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCron(req)) return NextResponse.json({ error: "только по расписанию" }, { status: 401 });
  const sb = createAdmin();
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  // уже ставили сегодня — второй раз не ставим (повтор крона)
  const { count } = await sb.from("client_chat_messages").select("id", { count: "exact", head: true })
    .eq("client_id", COMPANY_CLIENT_ID).eq("author_name", "Утренний разбор").gte("created_at", `${day}T00:00:00+08:00`);
  if (count) return NextResponse.json({ ok: true, skipped: "уже есть" });
  const friday = new Date(Date.now() + 8 * 3600e3).getUTCDay() === 5;
  const { error } = await sb.from("client_chat_messages").insert({
    client_id: COMPANY_CLIENT_ID, thread: "strategy", author_type: "user", author_name: "Утренний разбор", ai_status: "queued", attachments: [],
    body: `☀️ Утренний разбор ${day.slice(8, 10)}.${day.slice(5, 7)}: где мы по плану до 31.12, главное на сегодня с исполнителями, что просрочено (сделать / перенести / отменить), риски.` +
      (friday ? " Сегодня пятница — напомни Кате прислать цифры недели." : ""),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
