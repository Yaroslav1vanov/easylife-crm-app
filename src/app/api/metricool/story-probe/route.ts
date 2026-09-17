import { NextResponse } from "next/server";

// ВРЕМЕННО: проверка, что Metricool принимает Instagram STORY. Создаёт пост на 2027 год в личном бренде
// и сразу удаляет. Доступ по STRATEGY_AGENT_SECRET. Удалить после проверки.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!process.env.STRATEGY_AGENT_SECRET || req.headers.get("x-agent-secret") !== process.env.STRATEGY_AGENT_SECRET)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const token = process.env.METRICOOL_TOKEN!, userId = process.env.METRICOOL_USER_ID!;
  const { blogId, media, type } = await req.json();
  const mc = (p: string) => `https://app.metricool.com/api${p}?userToken=${encodeURIComponent(token)}&userId=${userId}&blogId=${blogId}`;
  const hdr = { "Content-Type": "application/json", "X-Mc-Auth": token };
  const body = { text: "", providers: [{ network: "instagram" }], publicationDate: { dateTime: "2027-12-31T10:00:00", timezone: "Europe/Kyiv" }, draft: false, autoPublish: true, media: [media], instagramData: { type } };
  const r = await fetch(mc("/v2/scheduler/posts"), { method: "POST", headers: hdr, body: JSON.stringify(body) });
  const created = await r.json().catch(() => null);
  const id = created?.id ?? created?.data?.id;
  let readBack: any = null, deleted: number | null = null;
  if (id) {
    readBack = await fetch(mc(`/v2/scheduler/posts/${id}`), { headers: hdr }).then(x => x.json()).catch(() => null);
    deleted = (await fetch(mc(`/v2/scheduler/posts/${id}`), { method: "DELETE", headers: hdr })).status;
  }
  return NextResponse.json({ status: r.status, created, readBackType: readBack?.data?.instagramData?.type ?? readBack?.instagramData?.type ?? null, deleted });
}
