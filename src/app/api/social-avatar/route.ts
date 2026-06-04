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

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

async function ogImage(pageUrl: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(pageUrl, { headers: { "User-Agent": UA, Accept: "text/html" } }, 10000);
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? decodeEntities(m[1]) : null;
  } catch { return null; }
}

/** Превращаем то, что вставил пользователь, в прямой URL картинки (может ходить в сеть). */
async function resolveImageUrl(input: string): Promise<string | null> {
  const s = input.trim();
  if (!s) return null;

  // Instagram
  let m = s.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  if (m && !RESERVED.includes(m[1].toLowerCase())) {
    const user = m[1];
    // 1) официальный публичный профиль-API (нужны браузерные заголовки, иначе IG отдаёт 400)
    try {
      const r = await fetchWithTimeout(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(user)}`,
        { headers: {
          "User-Agent": UA,
          "x-ig-app-id": "936619743392459",
          "x-requested-with": "XMLHttpRequest",
          "x-asbd-id": "198387",
          Accept: "*/*",
          Referer: `https://www.instagram.com/${user}/`,
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Dest": "empty",
        } },
        10000,
      );
      if (r.ok) {
        const j: any = await r.json();
        const u = j?.data?.user;
        const pic = u?.profile_pic_url_hd || u?.profile_pic_url;
        if (pic) return pic;
      }
    } catch { /* fallthrough */ }
    // 2) запасной — og:image со страницы профиля
    return await ogImage(`https://www.instagram.com/${user}/`);
  }

  // TikTok — unavatar (бесплатно работает), запасной — og:image
  m = s.match(/tiktok\.com\/@?([A-Za-z0-9_.]+)/i);
  if (m) {
    return `https://unavatar.io/tiktok/${m[1]}?fallback=false`;
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
