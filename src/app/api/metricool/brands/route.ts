import { NextResponse } from "next/server";

// Список брендов (аккаунтов) в Metricool — чтобы узнать blogId каждого и прописать клиентам.
const BASE = "https://app.metricool.com/api";

export async function GET() {
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return NextResponse.json({ error: "METRICOOL_USER_ID / METRICOOL_TOKEN не заданы" }, { status: 400 });

  try {
    const url = `${BASE}/admin/simpleProfiles?userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`;
    const r = await fetch(url, { headers: { "X-Mc-Auth": token } });
    const j = await r.json().catch(() => null);
    if (!r.ok) return NextResponse.json({ error: j?.message || `Metricool ${r.status}` }, { status: 502 });
    // нормализуем: оставляем имя + blogId
    const list = (Array.isArray(j) ? j : j?.data || []).map((b: any) => ({
      blogId: b.blogId ?? b.id ?? b.blog ?? null,
      label: b.label ?? b.title ?? b.name ?? b.brand ?? "(без названия)",
    })).filter((b: any) => b.blogId != null);
    return NextResponse.json({ brands: list });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
