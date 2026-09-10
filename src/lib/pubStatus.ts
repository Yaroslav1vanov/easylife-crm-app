// Реальный статус публикации у провайдера. Общий для ручной проверки и крона.
import { checkStatus as upStatus } from "@/lib/uploadpost";

const MC = "https://app.metricool.com/api";
const NET2CH: Record<string, string> = { instagram: "ig", tiktok: "tt", youtube: "yt", threads: "threads" };

export type PubCheck = {
  allPublished: boolean;
  anyError: boolean;
  urls: Record<string, string>;
  errorText: string | null;
  items: { ch: string; status: string | null; error: string | null; url: string | null }[];
};

function parseIds(s: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  s.split(",").map(x => x.trim()).filter(Boolean).forEach((x, i) => {
    const m = x.match(/^([a-z]+):(.+)$/); if (m) out[m[1]] = m[2]; else out[`_${i}`] = x;
  });
  return out;
}

/** Upload-Post: один запрос на все сети, статус по request_id. */
async function checkUploadPost(requestId: string): Promise<PubCheck | null> {
  const key = process.env.UPLOADPOST_API_KEY;
  if (!key) return null;
  const r = await upStatus(key, requestId);
  if (!r.ok) return null;
  const d: any = r.data || {};
  const results: any[] = d.results || [];
  const items = results.map(x => ({
    ch: x.platform, status: x.success ? "PUBLISHED" : String(x.status || "").toUpperCase(),
    error: x.error || x.message || null, url: x.url || x.post_url || null,
  }));
  const total = Number(d.total ?? results.length);
  const failed = Number(d.failed ?? 0);
  const completed = Number(d.completed ?? results.filter(x => x.success).length);
  const urls: Record<string, string> = {};
  for (const i of items) if (i.url) urls[i.ch] = i.url;
  return {
    allPublished: total > 0 && completed >= total && failed === 0,
    anyError: failed > 0,
    urls,
    errorText: failed > 0 ? items.filter(i => i.status !== "PUBLISHED").map(i => `${i.ch}: ${i.error || i.status}`).join("; ") : null,
    items,
  };
}

/** Metricool: у каждой сети свой пост, смотрим все. */
async function checkMetricool(postIds: string, blogId: number): Promise<PubCheck | null> {
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return null;
  const ids = parseIds(postIds);
  const items: PubCheck["items"] = [];
  for (const [key, pid] of Object.entries(ids)) {
    try {
      const r = await fetch(`${MC}/v2/scheduler/posts/${pid}?userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}&blogId=${blogId}`,
        { headers: { "X-Mc-Auth": token }, cache: "no-store" });
      const j: any = await r.json().catch(() => null);
      if (!r.ok) { if (r.status !== 404) items.push({ ch: key, status: `HTTP ${r.status}`, error: j?.message || null, url: null }); continue; }
      const data = j?.data || j;
      const p = (data?.providers || [])[0] || {};
      items.push({ ch: NET2CH[p.network] || key, status: p.status || data?.status || null,
        error: p.error || p.errorMessage || p.publishingError || p.detailedStatus || null, url: p.url || p.publicationUrl || null });
    } catch { /* сеть недоступна — проверим в следующий раз */ }
  }
  if (!items.length) return null;
  const up = (s: string | null) => String(s || "").toUpperCase();
  const urls: Record<string, string> = {};
  for (const i of items) if (i.url) urls[i.ch] = i.url;
  const bad = items.filter(i => up(i.status) === "ERROR");
  return {
    allPublished: items.every(i => up(i.status) === "PUBLISHED"),
    anyError: bad.length > 0,
    urls,
    errorText: bad.length ? `Metricool: ${bad.map(i => `${i.ch}: ${i.error || "ошибка публикации"}`).join("; ")}` : null,
    items,
  };
}

/** Статус публикации у того провайдера, через который она ушла. */
export async function checkPublication(pub: { metricool_post_id: string | null }, blogId: number | null): Promise<PubCheck | null> {
  const ref = pub.metricool_post_id || "";
  if (!ref) return null;
  if (ref.startsWith("up:")) return checkUploadPost(ref.slice(3));
  if (!blogId) return null;
  return checkMetricool(ref, blogId);
}
