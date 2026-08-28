import { NextResponse } from "next/server";

// Диагностика/Этап 4: тянет реальный статус поста из Metricool по его id + blogId.
const BASE = "https://app.metricool.com/api";

export async function GET(req: Request) {
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return NextResponse.json({ error: "METRICOOL creds не заданы" }, { status: 400 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const blogId = url.searchParams.get("blogId");
  if (!blogId) return NextResponse.json({ error: "нужен ?blogId=" }, { status: 400 });

  // Без id — список запланированного за период: ?blogId=&from=YYYY-MM-DD&to=YYYY-MM-DD
  if (!id) {
    const from = url.searchParams.get("from") || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const to = url.searchParams.get("to") || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const lep = `${BASE}/v2/scheduler/posts?start=${from}T00:00:00&end=${to}T23:59:59&userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}&blogId=${blogId}`;
    const lr = await fetch(lep, { headers: { "X-Mc-Auth": token } });
    const lj = await lr.json().catch(() => null);
    if (!lr.ok) return NextResponse.json({ error: lj?.message || `Metricool ${lr.status}`, raw: lj }, { status: 502 });
    const list = (lj?.data || lj || []).map((p: any) => ({
      id: p.id, when: p.publicationDate?.dateTime, text: (p.text || "").slice(0, 70),
      networks: (p.providers || []).map((x: any) => x.network),
      status: p.status,
    }));
    return NextResponse.json({ blogId, from, to, count: list.length, list });
  }

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
