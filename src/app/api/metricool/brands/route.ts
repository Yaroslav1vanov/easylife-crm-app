import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiGuard";

// Список брендов (аккаунтов) в Metricool — чтобы узнать blogId каждого и прописать клиентам.
const BASE = "https://app.metricool.com/api";

export async function GET(req: Request) {
  const denied = await requireUser(); if (denied) return denied;
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return NextResponse.json({ error: "METRICOOL_USER_ID / METRICOOL_TOKEN не заданы" }, { status: 400 });

  try {
    const url = `${BASE}/admin/simpleProfiles?userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`;
    const r = await fetch(url, { headers: { "X-Mc-Auth": token } });
    const j = await r.json().catch(() => null);
    if (!r.ok) return NextResponse.json({ error: j?.message || `Metricool ${r.status}` }, { status: 502 });
    // нормализуем: оставляем имя + blogId
    // Название бренда в Metricool часто пустое — подписываем по подключённому аккаунту
    const handles = (b: any) => {
      const out: { net: string; handle: string }[] = [];
      if (b.instagram) out.push({ net: "IG", handle: String(b.instagram) });
      if (b.tiktok) out.push({ net: "TT", handle: String(b.tiktok) });
      if (b.youtube || b.youtubeChannelName) out.push({ net: "YT", handle: String(b.youtubeChannelName || b.youtube) });
      if (b.threads || b.threadsAccountName) out.push({ net: "Threads", handle: String(b.threadsAccountName || b.threads) });
      if (b.facebook || b.facebookPageId) out.push({ net: "FB", handle: String(b.facebook || b.facebookPageId) });
      return out;
    };
    const list = (Array.isArray(j) ? j : j?.data || []).map((b: any) => {
      const hs = handles(b);
      const name = b.label ?? b.title ?? b.name ?? b.brand ?? null;
      return {
        blogId: b.blogId ?? b.id ?? b.blog ?? null,
        label: name || (hs.length ? `@${hs[0].handle}` : "(без названия · сети не подключены)"),
        networks: hs.map(h => h.net),
        handles: hs.map(h => `${h.net} @${h.handle}`).join(" · "),
      };
    }).filter((b: any) => b.blogId != null);
    // ?raw=1&blogId=… — все поля бренда: видно, какие сети реально привязаны
    const q = new URL(req.url).searchParams;
    if (q.get("raw")) {
      const all = Array.isArray(j) ? j : j?.data || [];
      const want = q.get("blogId");
      const pick = want ? all.filter((b: any) => String(b.blogId ?? b.id) === want) : all;
      return NextResponse.json({ raw: pick });
    }
    return NextResponse.json({ brands: list });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
