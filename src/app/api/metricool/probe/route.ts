import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/* Диагностика Metricool (только владелец/админ): сырой ответ любого ЧИТАЮЩЕГО эндпоинта аналитики
   для бренда клиента — чтобы видеть реальные поля (просмотры, подписчики), а не гадать по схеме.
   GET /api/metricool/probe?clientId=15&path=/v2/analytics/reels/instagram?from=…&to=…
   Разрешены только GET на /stats/… и /v2/analytics/… ; токен Metricool наружу не отдаётся. */
export const dynamic = "force-dynamic";
const BASE = "https://app.metricool.com/api";

export async function GET(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужно войти в CRM" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!prof || !["owner", "admin"].includes(prof.role)) return NextResponse.json({ error: "только владелец" }, { status: 403 });
  const token = process.env.METRICOOL_TOKEN, userId = process.env.METRICOOL_USER_ID;
  if (!token || !userId) return NextResponse.json({ error: "METRICOOL_* не заданы" }, { status: 400 });

  const sp = new URL(req.url).searchParams;
  const path = sp.get("path") || "";
  if (!/^\/(stats|v2\/analytics)\//.test(path) || path.includes("..")) return NextResponse.json({ error: "path: только /stats/… или /v2/analytics/…" }, { status: 400 });
  let blogId = sp.get("blogId");
  if (!blogId) {
    const { data: c } = await sb.from("clients").select("metricool_blog_id").eq("id", Number(sp.get("clientId"))).maybeSingle();
    blogId = c?.metricool_blog_id ? String(c.metricool_blog_id) : null;
  }
  if (!blogId) return NextResponse.json({ error: "нет blogId" }, { status: 400 });
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}blogId=${blogId}&userId=${encodeURIComponent(userId)}&userToken=${encodeURIComponent(token)}`;
  const r = await fetch(url, { headers: { "X-Mc-Auth": token }, cache: "no-store" });
  const text = await r.text();
  let body: any = text.slice(0, 20000);
  try { body = JSON.parse(text); } catch {}
  return NextResponse.json({ status: r.status, body });
}
