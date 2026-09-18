import { NextResponse } from "next/server";

// ВРЕМЕННО: подбор рабочих названий метрик у /v2/analytics/timelines. Доступ по STRATEGY_AGENT_SECRET.
// Удалить после подбора.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!process.env.STRATEGY_AGENT_SECRET || req.headers.get("x-agent-secret") !== process.env.STRATEGY_AGENT_SECRET)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const token = process.env.METRICOOL_TOKEN!, userId = process.env.METRICOOL_USER_ID!;
  const { blogId, network = "instagram", from, to, metrics } = await req.json();
  const out: any[] = [];
  for (const metric of metrics as string[]) {
    const qs = `network=${network}&metric=${encodeURIComponent(metric)}&from=${from}T00:00:00&to=${to}T23:59:59&timezone=Europe/Kyiv&blogId=${blogId}&userToken=${encodeURIComponent(token)}&userId=${userId}`;
    try {
      const r = await fetch(`https://app.metricool.com/api/v2/analytics/timelines?${qs}`, { headers: { "X-Mc-Auth": token }, cache: "no-store" });
      const j: any = await r.json().catch(() => null);
      const arr = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : null;
      const nums = (arr || []).map((x: any) => (typeof x === "number" ? x : Number(x?.value ?? x?.values?.[0] ?? x?.y ?? NaN))).filter((n: number) => !isNaN(n));
      out.push({
        metric, status: r.status, points: arr ? arr.length : null,
        total: nums.length ? Math.round(nums.reduce((a: number, b: number) => a + b, 0)) : null,
        sample: arr?.[0] ?? (j?.message || j?.error || null),
      });
    } catch (e: any) { out.push({ metric, error: String(e) }); }
  }
  return NextResponse.json({ ok: true, result: out });
}
