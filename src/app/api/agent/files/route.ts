import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase-admin";
import { r2 } from "@/lib/r2";

/* Канал Telegram-бота загрузки исходников (@easylifeai_crm_bot, работает на нашем сервере).
   Сотрудник выбирает клиента и пересылает боту посты — файлы попадают в медиатеку клиента.
   Доступ — по тому же секрету, что и у исполнителя чата: заголовок x-agent-secret.

   GET  ?op=clients                                  → { clients: [{ id, name }] }   клиенты с включённым ИИ
   POST { op: "check", client_id, uid }              → { exists }   этот файл из Telegram уже загружали
   POST { op: "upload", client_id, filename }        → { uploadUrl, key }
   POST { op: "add", client_id, key, kind, title, uid } → { ok, id }   записать файл в медиатеку
   POST { op: "sort", client_id, by }                → { ok }   отправить ИИ разобрать новые файлы      */
export const dynamic = "force-dynamic";

const KINDS = new Set(["image", "video", "font", "other"]);
const TG_TAG = "из Telegram";

function allowed(req: Request) {
  const s = process.env.STRATEGY_AGENT_SECRET;
  return !!s && req.headers.get("x-agent-secret") === s;
}
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const uidTag = (uid: unknown) => `tg:${String(uid || "").replace(/[^\w-]/g, "").slice(0, 64)}`;

export async function GET(req: Request) {
  if (!allowed(req)) return bad("нет доступа", 403);
  const sb = createAdmin();
  const { data, error } = await sb.from("clients").select("id, name, surname").eq("ai_chat", true).order("name");
  if (error) return bad(error.message, 500);
  return NextResponse.json({ clients: (data || []).map(c => ({ id: c.id, name: [c.name, c.surname].filter(Boolean).join(" ") })) });
}

export async function POST(req: Request) {
  if (!allowed(req)) return bad("нет доступа", 403);
  const b = await req.json().catch(() => ({}));
  const sb = createAdmin();
  const cid = Number(b.client_id);
  if (!cid) return bad("нет client_id");
  const { data: client } = await sb.from("clients").select("id, ai_chat").eq("id", cid).maybeSingle();
  if (!client) return bad("нет такого клиента", 404);

  if (b.op === "check") {
    const { data } = await sb.from("client_assets").select("id").eq("client_id", cid).contains("tags", [uidTag(b.uid)]).limit(1);
    return NextResponse.json({ exists: !!data?.length });
  }

  if (b.op === "upload") {
    const store = r2();
    if (!store) return bad("хранилище R2 не настроено", 500);
    const ext = (String(b.filename || "").split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
    const key = `strategy/${cid}/other/${crypto.randomUUID()}.${ext}`;
    return NextResponse.json({ uploadUrl: await store.signPut(key, 6 * 3600), key });
  }

  if (b.op === "add") {
    const key = String(b.key || "");
    if (!key.startsWith(`strategy/${cid}/other/`) || key.includes("..")) return bad("чужой файл");
    const { data, error } = await sb.from("client_assets").insert({
      client_id: cid, file_key: key, category: "other", kind: KINDS.has(b.kind) ? b.kind : "other",
      title: String(b.title || "").trim().slice(0, 200) || null,
      tags: [TG_TAG, ...(b.uid ? [uidTag(b.uid)] : [])],
      source: "client",   // исходники клиента; лица и согласие отметит ИИ при разборе и проверит команда
    }).select("id").single();
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true, id: data.id });
  }

  // то же, что кнопка «Разобрать с ИИ» в медиатеке: задача в чат «Стратегия» клиента
  if (b.op === "sort") {
    if (!client.ai_chat) return bad("у клиента выключен ИИ");
    const { data: items } = await sb.from("client_assets").select("kind, tags").eq("client_id", cid).in("kind", ["image", "video"]).limit(5000);
    const fresh = (items || []).filter(a => !(a.tags || []).some((t: string) => t.toLowerCase() === "разобрано"));
    if (!fresh.length) return NextResponse.json({ ok: true, count: 0 });
    const { error } = await sb.from("client_chat_messages").insert({
      client_id: cid, author_type: "user", author_name: String(b.by || "Telegram").slice(0, 60),
      thread: "strategy", ai_status: "queued", attachments: [],
      body: `Разбери медиатеку клиента: новых файлов ${fresh.length} (${fresh.filter(a => a.kind === "video").length} видео, ${fresh.filter(a => a.kind === "image").length} фото). ` +
        "Посмотри каждый, подпиши что на нём, разложи по темам (для клиники — по процедурам/услугам), отметь лучшие моменты и куда годится (рилс, сторис). Сохрани в LIBRARY.md и обнови подписи в CRM.",
    });
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true, count: fresh.length });
  }

  return bad("неизвестная операция");
}
