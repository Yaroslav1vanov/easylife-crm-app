// Серверный хелпер: тянет статистику публичного ролика (TikTok/IG/YT) через ScrapeCreators.
const BASE = "https://api.scrapecreators.com";

export function detectPlatform(url: string): "tiktok" | "instagram" | "youtube" | null {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  return null;
}
const num = (v: any) => (v == null || v === "" ? null : Math.round(Number(v)) || (Number(v) === 0 ? 0 : null));

export type ClipStats = { views: number | null; likes: number | null; comments: number | null; thumbnail: string | null };

export async function fetchClipStats(rawUrl: string, key: string): Promise<ClipStats | null> {
  const platform = detectPlatform(rawUrl);
  if (!platform) return null; // не публичная соц-ссылка (напр. R2) — пропускаем
  let url = rawUrl.trim();
  if (platform === "instagram") {
    const m = url.match(/instagram\.com\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
    if (m) url = `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/`;
  }
  const ep = platform === "tiktok" ? `${BASE}/v2/tiktok/video?url=${encodeURIComponent(url)}`
    : platform === "instagram" ? `${BASE}/v1/instagram/post?url=${encodeURIComponent(url)}`
    : `${BASE}/v1/youtube/video?url=${encodeURIComponent(url)}`;
  try {
    const r = await fetch(ep, { headers: { "x-api-key": key } });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const d = j?.data || j?.video || j?.post || j || {};
    const pick = (...keys: string[]) => { for (const k of keys) { const v = k.split(".").reduce((o: any, kk) => (o == null ? o : o[kk]), d); if (v != null) return v; } return null; };
    if (platform === "instagram") {
      const m = d?.xdt_shortcode_media || d?.shortcode_media || d?.media || d || {};
      return {
        views: num(m?.video_play_count ?? m?.video_view_count ?? m?.play_count),
        likes: num(m?.edge_media_preview_like?.count ?? m?.like_count),
        comments: num(m?.edge_media_to_parent_comment?.count ?? m?.edge_media_to_comment?.count ?? m?.comment_count),
        thumbnail: m?.thumbnail_src ?? m?.display_url ?? null,
      };
    }
    return {
      views: num(pick("viewCount", "playCount", "play_count", "views", "stats.playCount", "statistics.viewCount", "aweme_info.statistics.play_count")),
      likes: num(pick("likeCount", "diggCount", "likes", "stats.diggCount", "statistics.likeCount")),
      comments: num(pick("commentCount", "comments", "stats.commentCount", "statistics.commentCount")),
      thumbnail: pick("thumbnailUrl", "cover", "thumbnail", "image", "coverUrl", "thumbnail_url"),
    };
  } catch { return null; }
}
