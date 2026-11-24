/* Соцсети клиента из его бренда в Metricool: что подключено к бренду, то и появляется в шапке карточки.
   Заполняем только пустые поля (ручные ссылки не трогаем). Если у карточки задан список platforms
   (один бренд на две карточки, как у Панченко) — только эти сети. */
type B = { instagram?: string | null; tiktok?: string | null; youtube?: string | null; youtubeChannelName?: string | null };
type C = { instagram?: string | null; tiktok?: string | null; youtube?: string | null; platforms?: string[] | null };

export function socialsFromBrand(b: B, c: C): Record<string, string> {
  const want = (c.platforms || []).filter(p => ["ig", "tt", "yt"].includes(p));
  const ok = (p: string) => !want.length || want.includes(p);
  const clean = (s: any) => String(s || "").trim().replace(/^@/, "");
  const out: Record<string, string> = {};
  if (!c.instagram && b.instagram && ok("ig")) out.instagram = `instagram.com/${clean(b.instagram)}`;
  if (!c.tiktok && b.tiktok && ok("tt")) out.tiktok = `tiktok.com/@${clean(b.tiktok)}`;
  const yt = clean(b.youtube);
  if (!c.youtube && yt && ok("yt")) out.youtube = /^UC[\w-]{20,}$/.test(yt) ? `youtube.com/channel/${yt}` : `youtube.com/@${yt}`;
  return out;
}
