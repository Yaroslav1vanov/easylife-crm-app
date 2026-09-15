import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

// API для CEO-агента (@CEO_EasyLifeAi_bot на сервере): задачи стратегии и журнал «мозга».
// Доступ только по секрету STRATEGY_AGENT_SECRET (заголовок x-agent-secret). Таблицы закрыты RLS,
// поэтому здесь service_role.
export const dynamic = "force-dynamic";

const DIRECTIONS = ["Удержание", "Трафик", "Продажи", "Производство", "HR", "Деньги", "Разгрузка", "Итог"];
const COLS = ["text", "status", "priority", "direction", "planned_for", "owner", "result", "source", "created_at", "updated_at", "done_at"];

function directionOf(text: string): string | null {
  const head = String(text || "").split(":")[0].trim().toLowerCase();
  if (head.startsWith("итог")) return "Итог";
  return DIRECTIONS.find(d => head === d.toLowerCase()) || null;
}

function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}

function authorized(req: Request) {
  const secret = process.env.STRATEGY_AGENT_SECRET;
  return !!secret && req.headers.get("x-agent-secret") === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = admin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY не задан" }, { status: 500 });
  const [t, j] = await Promise.all([
    sb.from("strategy_tasks").select("*").order("id"),
    sb.from("strategy_journal").select("id, kind, day, text, source, created_at")
      .eq("source", "crm").order("id", { ascending: false }).limit(30),
  ]);
  if (t.error) return NextResponse.json({ error: t.error.message }, { status: 500 });
  return NextResponse.json({ tasks: t.data || [], crm_journal: j.data || [] });
}

// body: { tasks: [...] } — upsert задач (id число → обновить, иначе создать; вернёт соответствие id)
//       { journal: [{ kind, day, text }] } — записи журнала от агента
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = admin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY не задан" }, { status: 500 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const ids: Record<string, number> = {};
  for (const raw of Array.isArray(body?.tasks) ? body.tasks : []) {
    const row: Record<string, any> = {};
    const meta: Record<string, any> = {};
    for (const [k, v] of Object.entries(raw || {})) {
      if (k === "id") continue;
      if (COLS.includes(k)) row[k] = v === "" ? null : v;
      else meta[k] = v;
    }
    if (!row.text) continue;
    row.meta = meta;
    if (!row.direction) row.direction = directionOf(row.text);
    row.updated_at = row.updated_at || new Date().toISOString();
    const idStr = String(raw.id ?? "");
    if (/^\d+$/.test(idStr)) {
      const { error } = await sb.from("strategy_tasks").update(row).eq("id", Number(idStr));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      ids[idStr] = Number(idStr);
    } else {
      const { data, error } = await sb.from("strategy_tasks").insert(row).select("id").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      ids[idStr || `new${Object.keys(ids).length}`] = data!.id;
    }
  }

  const entries = (Array.isArray(body?.journal) ? body.journal : [])
    .filter((e: any) => e?.kind && e?.text)
    .map((e: any) => ({ kind: String(e.kind), day: e.day || new Date().toISOString().slice(0, 10), text: String(e.text), source: "agent" }));
  if (entries.length) {
    const { error } = await sb.from("strategy_journal").insert(entries);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ids, journal: entries.length });
}
