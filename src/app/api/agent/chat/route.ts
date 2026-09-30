import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase-admin";
import { r2 } from "@/lib/r2";

/* Канал для ИИ-исполнителя чата по клиенту (работает на нашем сервере).
   Только по секрету x-agent-secret, работает служебным ключом.

   GET  ?op=queue                         → задачи в очереди + контекст клиента
   POST {op:"claim", id}                  → взять задачу (если её ещё никто не взял)
   POST {op:"reply", id, body, attachments, status:"done"|"error", error?}
                                          → ответ ИИ в чат + закрыть задачу
   POST {op:"progress", id, body}         → промежуточное сообщение ИИ (вопрос, «начал монтаж»)
   POST {op:"upload", client_id, filename} → ссылка, чтобы залить готовый файл
   POST {op:"download", key}              → ссылка, чтобы скачать файл из чата */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_MIN = 360; // страховка на случай, если сервер лёг совсем; прерванные задачи исполнитель возвращает в очередь сам

function allowed(req: Request) {
  const s = process.env.STRATEGY_AGENT_SECRET;
  return !!s && req.headers.get("x-agent-secret") === s;
}
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: Request) {
  if (!allowed(req)) return bad("нет доступа", 403);
  const sb = createAdmin();

  // зависшие задачи — в ошибку, чтобы человек видел и мог написать снова
  const staleBefore = new Date(Date.now() - STALE_MIN * 60000).toISOString();
  const { data: stale } = await sb.from("client_chat_messages").select("id")
    .eq("ai_status", "working").lt("created_at", staleBefore);
  for (const s of stale || []) {
    await sb.from("client_chat_messages").update({ ai_status: "error", ai_error: "Исполнитель не ответил за 6 часов. Напишите задачу ещё раз." }).eq("id", s.id);
  }

  const { data: queued, error } = await sb.from("client_chat_messages").select("*")
    .eq("ai_status", "queued").order("id").limit(3);
  if (error) return bad(error.message, 500);

  const jobs = [];
  for (const m of queued || []) {
    const cid = m.client_id;
    const [{ data: client }, { data: brand }, { data: strategy }, { data: history }] = await Promise.all([
      sb.from("clients").select("id, name, surname, niche, product, instagram, tiktok, youtube, brand_voice, timezone, ai_chat").eq("id", cid).maybeSingle(),
      sb.from("client_brand").select("kit, version").eq("client_id", cid).maybeSingle(),
      sb.from("client_documents").select("title, body, version").eq("client_id", cid).eq("kind", "strategy").eq("is_current", true).maybeSingle(),
      sb.from("client_chat_messages").select("id, author_type, author_name, body, attachments, created_at, ai_status")
        .eq("client_id", cid).lte("id", m.id).order("id", { ascending: false }).limit(40),
    ]);
    if (!client?.ai_chat) {
      // ИИ у клиента выключили, пока сообщение ждало — снимаем его с очереди
      await sb.from("client_chat_messages").update({ ai_status: null }).eq("id", m.id);
      continue;
    }
    jobs.push({ message: m, client, brand_kit: brand?.kit || null, strategy: strategy?.body || null, history: (history || []).reverse() });
  }
  return NextResponse.json({ jobs });
}

export async function POST(req: Request) {
  if (!allowed(req)) return bad("нет доступа", 403);
  const b = await req.json().catch(() => ({}));
  const sb = createAdmin();

  if (b.op === "claim") {
    const { data } = await sb.from("client_chat_messages").update({ ai_status: "working" })
      .eq("id", b.id).eq("ai_status", "queued").select("id");
    return NextResponse.json({ ok: !!data?.length });
  }

  // исполнитель перезапустился посреди задачи — возвращаем её в очередь, он доделает с того же места
  if (b.op === "requeue") {
    const { data } = await sb.from("client_chat_messages").update({ ai_status: "queued" })
      .eq("id", b.id).eq("ai_status", "working").select("id");
    return NextResponse.json({ ok: !!data?.length });
  }

  if (b.op === "progress" || b.op === "reply") {
    const { data: m } = await sb.from("client_chat_messages").select("id, client_id").eq("id", b.id).maybeSingle();
    if (!m) return bad("нет такой задачи", 404);
    const atts = Array.isArray(b.attachments) ? b.attachments.filter((a: any) => typeof a?.key === "string" && a.key.startsWith(`strategy/${m.client_id}/chat/`)) : [];
    if ((b.body && String(b.body).trim()) || atts.length) {
      const { error } = await sb.from("client_chat_messages").insert({
        client_id: m.client_id, author_type: "ai", author_name: "ИИ", body: String(b.body || "").slice(0, 20000),
        attachments: atts, reply_to: m.id,
      });
      if (error) return bad(error.message, 500);
    }
    if (b.op === "reply") {
      const status = b.status === "error" ? "error" : "done";
      await sb.from("client_chat_messages").update({ ai_status: status, ai_error: status === "error" ? String(b.error || "ошибка").slice(0, 1000) : null }).eq("id", m.id);
    }
    return NextResponse.json({ ok: true });
  }

  const store = r2();
  if (!store) return bad("хранилище R2 не настроено", 500);

  if (b.op === "upload") {
    const cid = Number(b.client_id);
    if (!cid) return bad("нет client_id");
    const ext = (String(b.filename || "").split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
    const key = `strategy/${cid}/chat/${crypto.randomUUID()}.${ext}`;
    return NextResponse.json({ uploadUrl: await store.signPut(key), key });
  }

  if (b.op === "download") {
    const key = String(b.key || "");
    if (!key.startsWith("strategy/") || key.includes("..")) return bad("нет файла");
    return NextResponse.json({ url: await store.signGet(key) });
  }

  return bad("неизвестная операция");
}
