import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase-admin";

/* Канал исполнителя на сервере для КОРОТКИХ ИИ-задач кнопок CRM (таблица ai_jobs, см. lib/claude.ts).
   Доступ — по тому же секрету, что и чат: заголовок x-agent-secret = AGENT/STRATEGY_AGENT_SECRET.
     GET  ?op=queue                       → { jobs: [...] }  до 6 задач в очереди
     POST { op: "claim", id }             → { ok }           забрать (никто другой не возьмёт)
     POST { op: "done", id, result }      → { ok }
     POST { op: "error", id, error }      → { ok }                                              */
export const dynamic = "force-dynamic";

function allowed(req: Request) {
  const s = process.env.STRATEGY_AGENT_SECRET;
  return !!s && req.headers.get("x-agent-secret") === s;
}
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: Request) {
  if (!allowed(req)) return bad("нет доступа", 403);
  const sb = createAdmin();
  // зависшие дольше 5 минут — в ошибку, CRM уже перестала их ждать
  await sb.from("ai_jobs").update({ status: "error", error: "исполнитель не ответил" })
    .eq("status", "working").lt("started_at", new Date(Date.now() - 5 * 60_000).toISOString());
  const { data, error } = await sb.from("ai_jobs").select("id, kind, model, system, prompt, max_tokens")
    .eq("status", "queued").order("id").limit(6);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ jobs: data || [] });
}

export async function POST(req: Request) {
  if (!allowed(req)) return bad("нет доступа", 403);
  const b = await req.json().catch(() => ({}));
  const sb = createAdmin();
  const id = Number(b.id);
  if (!id) return bad("нет id");
  if (b.op === "claim") {
    const { data } = await sb.from("ai_jobs").update({ status: "working", started_at: new Date().toISOString() })
      .eq("id", id).eq("status", "queued").select("id");
    return NextResponse.json({ ok: !!data?.length });
  }
  if (b.op === "done" || b.op === "error") {
    await sb.from("ai_jobs").update({
      status: b.op, finished_at: new Date().toISOString(),
      ...(b.op === "done" ? { result: String(b.result || "").slice(0, 200_000) } : { error: String(b.error || "ошибка").slice(0, 1000) }),
    }).eq("id", id);
    return NextResponse.json({ ok: true });
  }
  return bad("неизвестная операция");
}
