import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/* Подписчики по дням из Metricool (метрики аккаунта).
   GET /api/metricool/followers?clientId=25&from=2026-09-01&to=2026-09-21
   Пробуем несколько метрик: прирост за день и накопленное число. Если Metricool
   отвечает ошибкой (у них это бывает), возвращаем, что именно не получилось. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://app.metricool.com/api";
const METRICS = ["followers_gained", "followers_lost", "delta_followers", "followers"];

export async function GET(req: Request) {
  const token = process.env.METRICOOL_TOKEN, userId = process.env.METRICOOL_USER_ID;
  if (!token || !userId) return NextResponse.json({ error: "METRICOOL_* не заданы" }, { status: 400 });
  const sp = new URL(req.url).searchParams;
  const clientId = Number(sp.get("clientId"));
  const from = sp.get("from"), to = sp.get("to");
  if (!clientId || !from || !to) return NextResponse.json({ error: "нужны clientId, from, to" }, { status: 400 });

  const sb = createClient();
  const { data: c } = await sb.from("clients").select("id, name, metricool_blog_id, timezone").eq("id", clientId).maybeSingle();
  if (!c?.metricool_blog_id) return NextResponse.json({ error: "у клиента нет бренда Metricool" }, { status: 400 });

  const tz = c.timezone || "Europe/Kyiv";
  const out: Record<string, any> = {};
  for (const metric of METRICS) {
    const qs = `network=instagram&subject=account&metric=${metric}&from=${from}T00:00:00&to=${to}T23:59:59`
      + `&timezone=${encodeURIComponent(tz)}&blogId=${c.metricool_blog_id}&userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`;
    try {
      const r = await fetch(`${BASE}/v2/analytics/timelines?${qs}`, { headers: { "X-Mc-Auth": token }, cache: "no-store" });
      const body = await r.text();
      if (!r.ok) { out[metric] = { status: r.status, error: body.slice(0, 120) }; continue; }
      const j: any = JSON.parse(body);
      const series = Array.isArray(j?.data) ? j.data[0] : null;
      const values: any[] = Array.isArray(series?.values) ? series.values : [];
      const nums = values.map(v => Number(v?.value ?? v?.y ?? v)).filter(n => !isNaN(n));
      out[metric] = {
        status: r.status, points: values.length,
        total: nums.length ? Math.round(nums.reduce((a, b) => a + b, 0)) : null,
        last: nums.length ? nums[nums.length - 1] : null,
        sample: values.slice(0, 3),
      };
    } catch (e: any) { out[metric] = { error: String(e?.message || e) }; }
  }
  return NextResponse.json({ ok: true, client: c.name, blogId: c.metricool_blog_id, from, to, metrics: out });
}
