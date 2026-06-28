import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// По ссылке на чужой ролик тянет статистику + транскрибацию через ScrapeCreators и сохраняет в reference_videos.
const BASE = "https://api.scrapecreators.com";

function detectPlatform(url: string) {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  return null;
}
const num = (v: any) => (typeof v === "number" ? v : v != null && !isNaN(Number(v)) ? Number(v) : null);

export async function POST(req: Request) {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) return NextResponse.json({ error: "SCRAPECREATORS_API_KEY не задан в окружении" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const url: string = (body.url || "").trim();
  const clientId = body.clientId;
  if (!url || !clientId) return NextResponse.json({ error: "нужны url и clientId" }, { status: 400 });
  const platform = detectPlatform(url);
  if (!platform) return NextResponse.json({ error: "Поддерживаются ссылки TikTok / Instagram / YouTube" }, { status: 400 });

  let ep: string;
  if (platform === "tiktok") ep = `${BASE}/v2/tiktok/video?url=${encodeURIComponent(url)}&get_transcript=true`;
  else if (platform === "instagram") ep = `${BASE}/v1/instagram/post?url=${encodeURIComponent(url)}`;
  else ep = `${BASE}/v1/youtube/video?url=${encodeURIComponent(url)}`;

  let j: any;
  try {
    const r = await fetch(ep, { headers: { "x-api-key": key } });
    j = await r.json().catch(() => null);
    if (!r.ok) return NextResponse.json({ error: j?.message || j?.error || `ScrapeCreators ${r.status}`, raw: j }, { status: 502 });
  } catch (e: any) { return NextResponse.json({ error: String(e) }, { status: 502 }); }

  const d = j?.data || j?.video || j?.post || j || {};
  const pick = (...keys: string[]) => {
    for (const k of keys) { const v = k.split(".").reduce((o: any, kk) => (o == null ? o : o[kk]), d); if (v != null) return v; }
    return null;
  };

  let transcript: any = pick("transcript", "transcription", "subtitles", "text");
  if (platform === "instagram" && !transcript) {
    try {
      const tr = await fetch(`${BASE}/v2/instagram/media/transcript?url=${encodeURIComponent(url)}`, { headers: { "x-api-key": key } });
      const tj = await tr.json().catch(() => null);
      transcript = tj?.transcript || tj?.text || tj?.data?.transcript || null;
    } catch {}
  }

  const row = {
    client_id: clientId,
    url,
    platform,
    author: pick("authorName", "author.nickname", "author.uniqueId", "author.username", "username", "owner.username", "author") || null,
    caption: pick("caption", "description", "title", "desc") || null,
    transcript: typeof transcript === "string" ? transcript : transcript ? JSON.stringify(transcript) : null,
    views: num(pick("viewCount", "playCount", "play_count", "views", "stats.playCount", "statistics.viewCount")),
    likes: num(pick("likeCount", "diggCount", "likes", "stats.diggCount", "statistics.likeCount")),
    comments: num(pick("commentCount", "comments", "stats.commentCount", "statistics.commentCount")),
    thumbnail_url: pick("thumbnailUrl", "cover", "thumbnail", "image", "displayUrl", "coverUrl", "thumbnail_url") || null,
    fetched_at: new Date().toISOString(),
  };

  const sb = createClient();
  const { data, error } = await sb.from("reference_videos").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reference: data });
}
