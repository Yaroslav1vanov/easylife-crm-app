import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase-admin";
import { r2 } from "@/lib/r2";

/* Канал Telegram-бота загрузки исходников (@easylifeai_crm_bot, работает на нашем сервере).
   Сотрудник выбирает клиента и пересылает боту посты — файлы попадают в медиатеку клиента.
   Доступ — по тому же секрету, что и у исполнителя чата: заголовок x-agent-secret.

   GET  ?op=clients                                  → { clients: [{ id, name }] }   клиенты с включённым ИИ
   POST { op: "check", client_id, uid }              → { exists }   этот файл из Telegram уже загружали
   POST { op: "upload", client_id, filename }        → { uploadUrl, key }
   POST { op: "add", client_id, key, kind, title, uid, topic? } → { ok, id }   записать файл в медиатеку (topic → тег «тема:…»)
   POST { op: "untopiced", client_id, hours }        → { count }   файлы из Telegram без папки за последние N часов
   POST { op: "set_topic", client_id, topic, hours } → { updated } положить их в папку
   POST { op: "retopic", client_id, ids, topic }     → { updated } переложить эти файлы в другую папку
   POST { op: "recent", client_id, limit }           → { assets }  последние файлы из Telegram (для проверки)
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
const cleanTopic = (t: unknown) => String(t || "").replace(/\s+/g, " ").trim().slice(0, 50);
const hasTopic = (tags: string[] | null) => (tags || []).some(t => t.toLowerCase().startsWith("тема:"));

/** Файлы из Telegram этого клиента без папки, загруженные за последние N часов. */
async function untopiced(sb: ReturnType<typeof createAdmin>, cid: number, hours: number) {
  const since = new Date(Date.now() - Math.min(Math.max(hours || 24, 1), 24 * 7) * 3600_000).toISOString();
  const { data } = await sb.from("client_assets").select("id, tags").eq("client_id", cid).contains("tags", [TG_TAG])
    .gte("created_at", since).limit(2000);
  return (data || []).filter(a => !hasTopic(a.tags));
}

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
      tags: [TG_TAG, ...(b.uid ? [uidTag(b.uid)] : []), ...(cleanTopic(b.topic) ? [`тема:${cleanTopic(b.topic)}`] : [])],
      source: "client",   // исходники клиента; лица и согласие отметит ИИ при разборе и проверит команда
    }).select("id").single();
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (b.op === "untopiced") {
    return NextResponse.json({ count: (await untopiced(sb, cid, Number(b.hours))).length });
  }

  if (b.op === "set_topic") {
    const topic = cleanTopic(b.topic);
    if (!topic) return bad("нет названия папки");
    const rows = await untopiced(sb, cid, Number(b.hours));
    let updated = 0;
    for (let i = 0; i < rows.length; i += 25) {
      const res = await Promise.all(rows.slice(i, i + 25).map(a =>
        sb.from("client_assets").update({ tags: [...(a.tags || []), `тема:${topic}`] }).eq("id", a.id).select("id")));
      updated += res.reduce((n, r) => n + (r.data?.length || 0), 0);
    }
    return NextResponse.json({ updated });
  }

  if (b.op === "retopic") {
    const topic = cleanTopic(b.topic);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 500);
    if (!topic || !ids.length) return bad("нет папки или файлов");
    const { data: rows } = await sb.from("client_assets").select("id, tags").eq("client_id", cid).in("id", ids);
    let updated = 0;
    for (let i = 0; i < (rows || []).length; i += 25) {
      const res = await Promise.all(rows!.slice(i, i + 25).map(a =>
        sb.from("client_assets").update({ tags: [...(a.tags || []).filter((t: string) => !t.toLowerCase().startsWith("тема:")), `тема:${topic}`] })
          .eq("id", a.id).select("id")));
      updated += res.reduce((n, r) => n + (r.data?.length || 0), 0);
    }
    return NextResponse.json({ updated });
  }

  if (b.op === "recent") {
    const { data } = await sb.from("client_assets").select("id, title, tags, created_at").eq("client_id", cid).contains("tags", [TG_TAG])
      .order("created_at", { ascending: false }).limit(Math.min(Number(b.limit) || 50, 300));
    return NextResponse.json({ assets: data || [] });
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
