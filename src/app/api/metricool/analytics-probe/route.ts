import { NextResponse } from "next/server";

// ВРЕМЕННЫЙ пробник: проверяет, что токен Metricool даёт доступ к analytics API.
// Берёт первый бренд (или ?blogId=) и дёргает 3 ключевых эндпоинта за последние 30 дней.
// Удалить после подтверждения доступа.
const BASE = "https://app.metricool.com/api";

export async function GET(req: Request) {
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return NextResponse.json({ error: "METRICOOL_USER_ID / METRICOOL_TOKEN не заданы" }, { status: 400 });

  const auth = `userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`;
  const headers = { "X-Mc-Auth": token };
  const url = new URL(req.url);
  let blogId = url.searchParams.get("blogId");
  let brandLabel = "";

  // 1) если blogId не передан — берём первый бренд
  if (!blogId) {
    const r = await fetch(`${BASE}/admin/simpleProfiles?${auth}`, { headers });
    const j = await r.json().catch(() => null);
    if (!r.ok) return NextResponse.json({ step: "brands", error: j?.message || `Metricool ${r.status}` }, { status: 502 });
    const arr = Array.isArray(j) ? j : j?.data || [];
    const first = arr.find((b: any) => (b.blogId ?? b.id) != null);
    if (!first) return NextResponse.json({ error: "Нет ни одного бренда" }, { status: 404 });
    blogId = String(first.blogId ?? first.id);
    brandLabel = first.label ?? first.title ?? first.name ?? "";
  }

  // даты: последние 30 дней, ISO 8601
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
  const isoLocal = (d: Date) => d.toISOString().slice(0, 19);
  const range = `from=${isoLocal(from)}&to=${isoLocal(to)}&timezone=Europe/Kyiv`;

  async function probe(label: string, path: string) {
    const u = `${BASE}${path}${path.includes("?") ? "&" : "?"}${auth}&blogId=${blogId}`;
    try {
      const r = await fetch(u, { headers });
      const text = await r.text();
      let body: any; try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
      // короткая сводка вместо мегабайтов данных
      const sample = Array.isArray(body) ? { isArray: true, len: body.length, first: body[0] ?? null }
        : (body && typeof body === "object" ? { keys: Object.keys(body).slice(0, 12), data_len: Array.isArray(body.data) ? body.data.length : undefined } : body);
      return { label, ok: r.ok, status: r.status, sample };
    } catch (e: any) {
      return { label, ok: false, status: 0, error: String(e) };
    }
  }

  // полный дамп нужных эндпоинтов, чтобы спроектировать схему снапшотов
  async function full(path: string) {
    const u = `${BASE}${path}${path.includes("?") ? "&" : "?"}${auth}&blogId=${blogId}`;
    const r = await fetch(u, { headers });
    const text = await r.text();
    let body: any; try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
    return { ok: r.ok, status: r.status, body };
  }

  const [summary, postsIg, reelsIg, postsTt, postsTh] = await Promise.all([
    full(`/v2/analytics/brand-summary/posts?${range}`),
    full(`/v2/analytics/posts/instagram?${range}`),
    full(`/v2/analytics/reels/instagram?${range}`),
    full(`/v2/analytics/posts/tiktok?${range}`),
    full(`/v2/analytics/posts/threads?${range}`),
  ]);
  const firstOf = (res: any) => Array.isArray(res.body?.data) ? res.body.data[0] ?? null : res.body;

  return NextResponse.json({
    blogId, brandLabel, range: { from: isoLocal(from), to: isoLocal(to) },
    brand_summary_full: summary,                       // весь объект — ищем тут подписчиков/охваты
    sample_post_ig: { status: postsIg.status, first: firstOf(postsIg) },
    sample_reel_ig: { status: reelsIg.status, first: firstOf(reelsIg) },
    sample_post_tt: { status: postsTt.status, first: firstOf(postsTt) },
    sample_post_th: { status: postsTh.status, first: firstOf(postsTh) },
  });
}
