export type Plat = "ig" | "tt" | "yt";

/** Хэндл из ссылки/текста в карточке клиента. */
export function handleOf(raw: string | null | undefined, p: Plat): string | null {
  if (!raw) return null;
  let s = raw.trim().toLowerCase();
  if (!s || s.includes("instagram.com/example")) return null;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/^m\./, "");
  const host = p === "ig" ? "instagram.com/" : p === "tt" ? "tiktok.com/" : "youtube.com/";
  if (s.startsWith(host)) s = s.slice(host.length);
  else if (s.includes(".com/") || s.includes(".ru/")) return null;   // чужой домен
  s = s.split(/[?#]/)[0].replace(/^@/, "");
  const first = s.split("/").filter(Boolean)[0] || "";
  if (!first || ["reels", "reel", "p", "shorts", "channel", "c", "user"].includes(first)) return null;
  return first.replace(/^@/, "") || null;
}
