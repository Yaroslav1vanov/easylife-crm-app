import { NextRequest, NextResponse } from "next/server";
import { handleOf, type Plat } from "@/lib/socialHandles";
import { vmxFindAccount, vmxAvatarUrl } from "@/lib/viralmaxing";

// Серверный прокси: по ссылке на профиль (IG / TikTok / YouTube) или прямой ссылке
// на фото возвращает байты картинки. Клиент перезаливает их в наш Storage.
// Источники по порядку:
//   1. Viralmaxing — если аккаунт отслеживается (свой или конкурент), аватар лежит на его CDN.
//   2. TikTok / YouTube — публичная страница профиля (с Vercel открывается).
//   3. Instagram напрямую с сервера не отдаёт (429/логин), unavatar.io стал платным —
//      поэтому для IG без Viralmaxing честно говорим «загрузи файлом».
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function fetchT(url: string, init: RequestInit, ms: number) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...init, signal: c.signal, redirect: "follow", cache: "no-store" }).finally(() => clearTimeout(t));
}
const unescapeJson = (s: string) => s.replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&");

function detect(input: string): { plat: Plat; handle: string } | null {
  const s = input.trim();
  const tryP = (p: Plat) => { const h = handleOf(s, p); return h ? { plat: p, handle: h } : null; };
  if (/instagram\.com/i.test(s)) return tryP("ig");
  if (/tiktok\.com/i.test(s)) return tryP("tt");
  if (/youtube\.com|youtu\.be/i.test(s)) return tryP("yt");
  if (/^@?[A-Za-z0-9_.]{2,30}$/.test(s)) return { plat: "ig", handle: s.replace(/^@/, "") };
  return null;
}

async function tiktokAvatar(handle: string): Promise<string | null> {
  try {
    const r = await fetchT(`https://www.tiktok.com/@${handle}`, { headers: { "User-Agent": UA, accept: "text/html" } }, 12000);
    if (!r.ok) return null;
    const t = await r.text();
    const m = t.match(/"avatarLarger":"([^"]+)"/) || t.match(/"avatarMedium":"([^"]+)"/) || t.match(/<meta property="og:image" content="([^"]+)"/);
    return m ? unescapeJson(m[1]) : null;
  } catch { return null; }
}
async function youtubeAvatar(handle: string): Promise<string | null> {
  try {
    const r = await fetchT(`https://www.youtube.com/@${handle}`, { headers: { "User-Agent": UA, accept: "text/html", "accept-language": "en-US,en;q=0.9" } }, 12000);
    if (!r.ok) return null;
    const t = await r.text();
    const m = t.match(/<meta property="og:image" content="([^"]+)"/) || t.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/);
    return m ? unescapeJson(m[1]) : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get("u") || "";
  const candidates: string[] = [];
  let hint = "Не удалось определить фото по ссылке";

  if (/^https?:\/\/.*\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i.test(input.trim())) {
    candidates.push(input.trim());
  } else {
    const d = detect(input);
    if (!d) return NextResponse.json({ error: "bad_url", hint }, { status: 400 });
    const key = process.env.VIRALMAXING_API_KEY;
    if (key) {
      const acc = await vmxFindAccount(key, d.handle, d.plat);
      if (acc) candidates.push(vmxAvatarUrl(acc.id));
    }
    if (d.plat === "tt") { const u = await tiktokAvatar(d.handle); if (u) candidates.push(u); }
    if (d.plat === "yt") { const u = await youtubeAvatar(d.handle); if (u) candidates.push(u); }
    if (d.plat === "ig") hint = key
      ? `Instagram не отдаёт фото напрямую. Аккаунт @${d.handle} не отслеживается в Viralmaxing — добавь его туда или загрузи фото файлом.`
      : "Instagram не отдаёт фото напрямую. Загрузи файлом.";
    if (!candidates.length) return NextResponse.json({ error: "no_source", hint }, { status: 404 });
  }

  for (const img of candidates) {
    try {
      const r = await fetchT(img, { headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/png,image/jpeg,*/*" } }, 12000);
      if (!r.ok) continue;
      const ct = r.headers.get("content-type") || "";
      if (!ct.startsWith("image/")) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || buf.length > 8 * 1024 * 1024) continue;
      return new NextResponse(buf, { status: 200, headers: { "content-type": ct, "cache-control": "no-store" } });
    } catch { /* следующий кандидат */ }
  }
  return NextResponse.json({ error: "fetch_failed", hint }, { status: 502 });
}
