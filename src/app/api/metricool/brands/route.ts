import { NextResponse } from "next/server";

// Список брендов (аккаунтов) в Metricool — чтобы узнать blogId каждого и прописать клиентам.
const BASE = "https://app.metricool.com/api";

export async function GET(req: Request) {
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
    // ?raw=1&blogId=… — все поля бренда: видно, какие сети реально привязаны
    const q = new URL(req.url).searchParams;
    if (q.get("raw")) {
      const all = Array.isArray(j) ? j : j?.data || [];
      const want = q.get("blogId");
      const pick = want ? all.filter((b: any) => String(b.blogId ?? b.id) === want) : all;
      return NextResponse.json({ raw: pick });
    }
    return NextResponse.json({ brands: list });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
