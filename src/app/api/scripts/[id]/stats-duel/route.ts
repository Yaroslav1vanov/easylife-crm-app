import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { fetchClipStats } from "@/lib/scrape";

// Обновляет «дуэль»: свежая статистика исходника (ref_url) и нашего видео (video_url).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) return NextResponse.json({ error: "SCRAPECREATORS_API_KEY не задан" }, { status: 400 });
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const sb = createClient();
  const { data: s } = await sb.from("scripts").select("id, ref_url, video_url, published_url").eq("id", id).maybeSingle();
  if (!s) return NextResponse.json({ error: "сценарий не найден" }, { status: 404 });

  const patch: any = {};
  // исходник
  if (s.ref_url) {
    const src = await fetchClipStats(s.ref_url, key);
    if (src) { patch.ref_views = src.views; patch.ref_likes = src.likes; patch.ref_comments = src.comments; }
  }
  // наше опубликованное видео — только ссылка на пост; файл из R2 статистику не отдаёт
  const oursUrl = s.published_url || (s.video_url && !/r2\.dev|cloudflarestorage/.test(s.video_url) ? s.video_url : null);
  let ourFound = false;
  if (oursUrl) {
    const ours = await fetchClipStats(oursUrl, key);
    if (ours) { patch.our_views = ours.views; patch.our_likes = ours.likes; patch.our_comments = ours.comments; patch.our_stats_at = new Date().toISOString(); ourFound = true; }
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Нет ссылок для статистики (реф / наше видео)" }, { status: 400 });

  const { error } = await sb.from("scripts").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...patch, ourFound, ourHint: !ourFound && oursUrl ? "Ссылка не похожа на публичный TikTok/IG/YT — вставь ссылку на сам пост" : !oursUrl ? "Нет ссылки на публикацию — вставь её в карточке после выхода ролика" : null });
}
