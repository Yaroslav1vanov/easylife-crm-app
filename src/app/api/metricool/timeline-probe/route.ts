import { NextResponse } from "next/server";

// ВРЕМЕННО: подбор рабочих названий метрик у /v2/analytics/timelines. Доступ по STRATEGY_AGENT_SECRET.
// Удалить после подбора.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!process.env.STRATEGY_AGENT_SECRET || req.headers.get("x-agent-secret") !== process.env.STRATEGY_AGENT_SECRET)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const token = process.env.METRICOOL_TOKEN!, userId = process.env.METRICOOL_USER_ID!;
  const { blogId, network = "instagram", from, to, metrics, subject, scope } = await req.json();
  const out: any[] = [];
  for (const metric of metrics as string[]) {
    const qs = `network=${network}&metric=${encodeURIComponent(metric)}&from=${from}T00:00:00&to=${to}T23:59:59&timezone=Europe/Kyiv${subject ? `&subject=${subject}` : ""}${scope ? `&scope=${scope}` : ""}&blogId=${blogId}&userToken=${encodeURIComponent(token)}&userId=${userId}`;
    try {
      const r = await fetch(`https://app.metricool.com/api/v2/analytics/timelines?${qs}`, { headers: { "X-Mc-Auth": token }, cache: "no-store" });
      const body = await r.text();
      let j: any = null; try { j = JSON.parse(body); } catch {}
      const series = Array.isArray(j?.data) ? j.data : [];
      const first = series[0] || null;
      const values: any[] = Array.isArray(first?.values) ? first.values : [];
      const nums = values.map((v: any) => Number(v?.value ?? v?.y ?? v)).filter((n: number) => !isNaN(n));
      out.push({
        metric, subject: subject || null, status: r.status,
        seriesMetric: first?.metric ?? null, points: values.length,
        aggregate: first?.aggregate?.value ?? null,
        total: nums.length ? Math.round(nums.reduce((a: number, b: number) => a + b, 0)) : null,
        sampleValue: values[0] ?? null,
        err: r.ok ? null : body.slice(0, 200),
      });
    } catch (e: any) { out.push({ metric, error: String(e) }); }
  }
  return NextResponse.json({ ok: true, result: out });
}
