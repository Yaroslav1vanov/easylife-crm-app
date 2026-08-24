import { createClient } from "@/lib/supabase-server";

// Общая логика: по ссылке на чужой ролик тянет статистику + транскрибацию
// через ScrapeCreators и сохраняет в reference_videos под клиента.
// Используется и кнопкой в UI (/api/references/fetch), и ТГ-ботом (/api/telegram/webhook).
const BASE = "https://api.scrapecreators.com";

export function detectPlatform(url: string) {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  return null;
}
const num = (v: any) => (typeof v === "number" ? v : v != null && !isNaN(Number(v)) ? Number(v) : null);

export type IngestResult =
  | { ok: true; reference: any }
  | { ok: false; error: string; status?: number };

export async function ingestReference(rawUrl: string, clientId: number): Promise<IngestResult> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) return { ok: false, error: "SCRAPECREATORS_API_KEY не задан" };
  let url = (rawUrl || "").trim();
  const platform = detectPlatform(url);
  if (!platform) return { ok: false, error: "не TikTok/Instagram/YouTube ссылка" };

  if (platform === "instagram") {
    const m = url.match(/instagram\.com\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
    if (m) url = `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/`;
  }

  // защита от дублей: тот же клиент + тот же ролик
  const sb = createClient();
  const { data: dup } = await sb.from("reference_videos").select("id").eq("client_id", clientId).eq("url", url).maybeSingle();
  if (dup) return { ok: false, error: "уже добавлен ранее" };

  const ep = platform === "tiktok" ? `${BASE}/v2/tiktok/video?url=${encodeURIComponent(url)}&get_transcript=true`
    : platform === "instagram" ? `${BASE}/v1/instagram/post?url=${encodeURIComponent(url)}`
    : `${BASE}/v1/youtube/video?url=${encodeURIComponent(url)}`;

  let j: any;
  try {
    const r = await fetch(ep, { headers: { "x-api-key": key } });
    j = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, error: j?.message || j?.error || `ScrapeCreators ${r.status}`, status: 502 };
  } catch (e: any) { return { ok: false, error: String(e), status: 502 }; }

  const d = j?.data || j?.video || j?.post || j || {};
  const pick = (...keys: string[]) => { for (const k of keys) { const v = k.split(".").reduce((o: any, kk) => (o == null ? o : o[kk]), d); if (v != null) return v; } return null; };
  let author: any, caption: any, views: any, likes: any, comments: any, thumbnail: any, transcript: any = null;

  if (platform === "instagram") {
    const m = d?.xdt_shortcode_media || d?.shortcode_media || d?.media || d || {};
    views = m?.video_play_count ?? m?.video_view_count ?? m?.play_count;
    likes = m?.edge_media_preview_like?.count ?? m?.like_count;
    comments = m?.edge_media_to_parent_comment?.count ?? m?.edge_media_to_comment?.count ?? m?.comment_count;
    caption = m?.edge_media_to_caption?.edges?.[0]?.node?.text ?? m?.caption ?? null;
    thumbnail = m?.thumbnail_src ?? m?.display_url ?? null;
    author = m?.owner?.username ?? null;
  } else {
    author = pick("authorName", "author.nickname", "author.uniqueId", "author.username", "username", "author");
    caption = pick("caption", "description", "title", "desc");
    views = pick("viewCount", "playCount", "play_count", "views", "stats.playCount", "statistics.viewCount", "aweme_info.statistics.play_count");
    likes = pick("likeCount", "diggCount", "likes", "stats.diggCount", "statistics.likeCount");
    comments = pick("commentCount", "comments", "stats.commentCount", "statistics.commentCount");
    thumbnail = pick("thumbnailUrl", "cover", "thumbnail", "image", "coverUrl", "thumbnail_url");
    transcript = pick("transcript", "transcription", "subtitles", "text");
  }

  if (platform === "instagram") {
    try {
      const tr = await fetch(`${BASE}/v2/instagram/media/transcript?url=${encodeURIComponent(url)}`, { headers: { "x-api-key": key } });
      const tj = await tr.json().catch(() => null);
      transcript = tj?.transcript || tj?.text || tj?.data?.transcript || tj?.transcripts || null;
    } catch {}
  }
  if (platform === "youtube") {
    // Текст у YouTube отдаёт отдельный эндпоинт — в /v1/youtube/video его нет
    try {
      const tr = await fetch(`${BASE}/v1/youtube/video/transcript?url=${encodeURIComponent(url)}`, { headers: { "x-api-key": key } });
      const tj = await tr.json().catch(() => null);
      transcript = tj?.transcript_only_text || tj?.transcript || transcript;
    } catch {}
  }

  // Любой формат транскрибации → чистая строка (без «[object Object]»)
  const toText = (v: any): string | null => {
    if (v == null) return null;
    if (typeof v === "string") return v.trim() || null;
    if (Array.isArray(v)) { const s = v.map(toText).filter(Boolean).join(" "); return s || null; }
    if (typeof v === "object") { const s = toText(v.text ?? v.transcript ?? v.value ?? v.content); return s; }
    return String(v);
  };

  const row = {
    client_id: clientId, url, platform,
    author: author || null, caption: caption || null,
    transcript: toText(transcript),
    views: num(views), likes: num(likes), comments: num(comments),
    thumbnail_url: thumbnail || null,
    fetched_at: new Date().toISOString(),
  };
  const { data, error } = await sb.from("reference_videos").insert(row).select().single();
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, reference: data };
}
