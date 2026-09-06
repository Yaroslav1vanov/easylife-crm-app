import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/* Реальный статус публикации в Metricool по каждой сети.
   Если все сети опубликованы — переводим карточку в «Опубликовано»
   и сохраняем ссылки на вышедшие посты (published_urls). */
const BASE = "https://app.metricool.com/api";
export const maxDuration = 30;

function parseIds(s: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  s.split(",").map(x => x.trim()).filter(Boolean).forEach((x, i) => { const m = x.match(/^([a-z]+):(.+)$/); if (m) out[m[1]] = m[2]; else out[`_${i}`] = x; });
  return out;
}
const NET2CH: Record<string, string> = { instagram: "ig", tiktok: "tt", youtube: "yt", threads: "threads" };

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return NextResponse.json({ error: "METRICOOL_* не заданы" }, { status: 400 });
  const id = Number(params.id);
  const sb = createClient();
  const { data: pub } = await sb.from("publications").select("id, client_id, metricool_post_id, pub_status, published_urls").eq("id", id).maybeSingle();
  if (!pub) return NextResponse.json({ error: "публикация не найдена" }, { status: 404 });
  const { data: client } = await sb.from("clients").select("metricool_blog_id").eq("id", pub.client_id).maybeSingle();
  const blogId = client?.metricool_blog_id;
  if (!blogId) return NextResponse.json({ error: "нет бренда Metricool" }, { status: 400 });
  const ids = parseIds(pub.metricool_post_id);
  if (!Object.keys(ids).length) return NextResponse.json({ ok: true, items: [], note: "в Metricool не отправлялось" });

  const items: { key: string; ch: string; id: string; status: string | null; error: string | null; url: string | null; when: string | null }[] = [];
  for (const [key, pid] of Object.entries(ids)) {
    try {
      const r = await fetch(`${BASE}/v2/scheduler/posts/${pid}?userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}&blogId=${blogId}`, { headers: { "X-Mc-Auth": token }, cache: "no-store" });
      const j: any = await r.json().catch(() => null);
      if (!r.ok) { items.push({ key, ch: key, id: pid, status: r.status === 404 ? "DELETED" : `HTTP ${r.status}`, error: j?.message || null, url: null, when: null }); continue; }
      const data = j?.data || j;
      const p = (data?.providers || [])[0] || {};
      const ch = NET2CH[p.network] || key;
      items.push({ key, ch, id: pid, status: p.status || data?.status || null, error: p.error || p.errorMessage || p.publishingError || null, url: p.url || p.publicationUrl || null, when: data?.publicationDate?.dateTime || null });
    } catch (e: any) { items.push({ key, ch: key, id: pid, status: "ERR", error: String(e?.message || e), url: null, when: null }); }
  }
  const live = items.filter(i => i.status !== "DELETED");
  const allPublished = live.length > 0 && live.every(i => String(i.status || "").toUpperCase() === "PUBLISHED");
  const anyError = live.some(i => String(i.status || "").toUpperCase() === "ERROR");
  const patch: any = {};
  const urls: Record<string, string> = { ...(pub.published_urls || {}) };
  for (const i of live) if (i.url) urls[i.ch] = i.url;
  if (Object.keys(urls).length) patch.published_urls = urls;
  if (allPublished && pub.pub_status !== "published") patch.pub_status = "published";
  if (anyError && pub.pub_status === "scheduled") { patch.pub_status = "error"; patch.error_message = `Metricool: ${live.filter(i => String(i.status).toUpperCase() === "ERROR").map(i => `${i.ch}: ${i.error || "ошибка публикации"}`).join("; ")}`; }
  if (Object.keys(patch).length) await sb.from("publications").update(patch).eq("id", id);
  return NextResponse.json({ ok: true, items, allPublished, anyError, patch });
}
