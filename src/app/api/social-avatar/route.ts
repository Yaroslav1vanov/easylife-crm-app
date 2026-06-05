import { NextRequest, NextResponse } from "next/server";

// Серверный прокси: по ссылке на профиль (IG/TikTok) или прямой ссылке на фото
// резолвит и возвращает байты картинки. Клиент перезаливает их в наш Storage,
// чтобы аватарка была стабильной (без хотлинк-блокировок и протухания).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const RESERVED = ["p", "reel", "reels", "stories", "explore", "tv"];

function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...init, signal: c.signal, redirect: "follow" }).finally(() => clearTimeout(t));
}

/** Превращаем то, что вставил пользователь, в прямой URL картинки (может ходить в сеть). */
async function resolveImageUrl(input: string): Promise<string | null> {
  const s = input.trim();
  if (!s) return null;

  // Instagram — через unavatar.io (он сам резолвит и обходит блокировки IG;
  // прямые серверные запросы к IG с дата-центра режутся).
  let m = s.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  if (m && !RESERVED.includes(m[1].toLowerCase())) {
    return `https://unavatar.io/instagram/${m[1]}?fallback=false`;
  }

  // TikTok — unavatar (бесплатно работает)
  m = s.match(/tiktok\.com\/@?([A-Za-z0-9_.]+)/i);
  if (m) {
    return `https://unavatar.io/tiktok/${m[1]}?fallback=false`;
  }

  // Голый username без домена → пробуем как instagram-ник
  if (/^@?[A-Za-z0-9_.]{2,30}$/.test(s)) {
    return `https://unavatar.io/instagram/${s.replace(/^@/, "")}?fallback=false`;
  }

  // Прямая ссылка
  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get("u") || "";
  let img: string | null;
  try {
    img = await resolveImageUrl(input);
  } catch {
    img = null;
  }
  if (!img) {
    return NextResponse.json({ error: "bad_url", hint: "Не удалось определить фото по ссылке" }, { status: 400 });
  }
  try {
    const r = await fetchWithTimeout(img, { headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/png,image/jpeg,*/*" } }, 12000);
    if (!r.ok) return NextResponse.json({ error: "fetch_failed", status: r.status }, { status: 502 });
    const ct = r.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return NextResponse.json({ error: "not_image", contentType: ct }, { status: 415 });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0) return NextResponse.json({ error: "empty" }, { status: 502 });
    if (buf.length > 8 * 1024 * 1024) return NextResponse.json({ error: "too_big" }, { status: 413 });
    return new NextResponse(buf, { status: 200, headers: { "content-type": ct, "cache-control": "no-store" } });
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    return NextResponse.json({ error: aborted ? "timeout" : "error", message: String(e?.message || e) }, { status: aborted ? 504 : 500 });
  }
}
