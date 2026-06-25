import { NextResponse } from "next/server";

// Диагностика/Этап 4: тянет реальный статус поста из Metricool по его id + blogId.
const BASE = "https://app.metricool.com/api";

export async function GET(req: Request) {
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return NextResponse.json({ error: "METRICOOL creds не заданы" }, { status: 400 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const blogId = url.searchParams.get("blogId");
  if (!id || !blogId) return NextResponse.json({ error: "нужны ?id= и ?blogId=" }, { status: 400 });

  const ep = `${BASE}/v2/scheduler/posts/${id}?userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}&blogId=${blogId}`;
  const r = await fetch(ep, { headers: { "X-Mc-Auth": token } });
  const j = await r.json().catch(() => null);
  if (!r.ok) return NextResponse.json({ error: j?.message || `Metricool ${r.status}`, raw: j }, { status: 502 });

  const data = j?.data || j;
  // вытаскиваем главное: статус по каждой сети + текст ошибки
  const providers = (data?.providers || []).map((p: any) => ({
    network: p.network, status: p.status, detailedStatus: p.detailedStatus,
    error: p.error || p.errorMessage || p.publishingError || null,
    url: p.url || p.publicationUrl || null,
  }));
  return NextResponse.json({ id, status: data?.status, providers, notes: data?.notes ?? null, raw: data });
}
