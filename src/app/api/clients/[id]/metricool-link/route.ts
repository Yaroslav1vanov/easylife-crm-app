import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/apiGuard";
import { mcFetch } from "@/lib/mcFetch";

/* Ссылка Metricool для клиента: по ней он сам подключает свои соцсети к своему бренду, без аккаунта в Metricool.
   GET  — текущая действующая ссылка (или { link: null }, если её нет);
   POST — новая ссылка (старая сразу перестаёт работать). Ссылка живёт ~71 час.
   API Metricool: /v2/settings/brands/connections/anonymous-link (тариф Advanced и выше). */
export const dynamic = "force-dynamic";

async function call(method: "GET" | "POST", id: number) {
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return NextResponse.json({ error: "Metricool не настроен" }, { status: 400 });
  const sb = createClient();
  const { data: c } = await sb.from("clients").select("id, metricool_blog_id").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ error: "клиент не найден" }, { status: 404 });
  if (!c.metricool_blog_id) return NextResponse.json({ error: "Сначала привяжите бренд Metricool" }, { status: 400 });
  const url = `https://app.metricool.com/api/v2/settings/brands/connections/anonymous-link?blogId=${c.metricool_blog_id}&userId=${encodeURIComponent(userId)}&userToken=${encodeURIComponent(token)}`;
  const r = await mcFetch(url, { method, headers: { "X-Mc-Auth": token }, cache: "no-store" });
  const text = await r.text();
  let j: any = null; try { j = JSON.parse(text); } catch {}
  if (method === "GET" && r.status === 404 && !j?.brandMissing) return NextResponse.json({ ok: true, link: null });
  if (!r.ok) {
    const why = r.status === 403 ? "Metricool не дал создать ссылку: нужен тариф Advanced или права управления брендом" : j?.error || j?.detail || j?.message || text.slice(0, 200);
    return NextResponse.json({ error: why, status: r.status }, { status: 502 });
  }
  const d = j?.data || j || {};
  return NextResponse.json({ ok: true, link: d.link || null, expiresAt: d.expiresAt?.dateTime ? `${d.expiresAt.dateTime}${d.expiresAt.timezone ? ` (${d.expiresAt.timezone})` : ""}` : null });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  return call("GET", Number(params.id));
}
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  return call("POST", Number(params.id));
}
