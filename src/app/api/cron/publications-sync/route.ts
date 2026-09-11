import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkPublication } from "@/lib/pubStatus";

/* Раз в час: всё, что запланировано и время уже прошло, сверяем с провайдером.
   Вышло — ставим «опубликовано» (триггер в базе сам закроет сценарий в «Монтаже»).
   Упало — ставим ошибку, чтобы тимлид увидел. Так никому не нужно
   вручную переставлять карточки после публикации. */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })   // тот же доступ, что у всей CRM;

  // даём сервису 15 минут на саму публикацию, раньше не дёргаем
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: pubs } = await sb.from("publications")
    .select("id, client_id, script_id, metricool_post_id, publish_at, published_urls")
    .eq("pub_status", "scheduled").lt("publish_at", cutoff).not("metricool_post_id", "is", null)
    .limit(80);
  if (!pubs?.length) return NextResponse.json({ ok: true, checked: 0 });

  const { data: clients } = await sb.from("clients").select("id, metricool_blog_id").in("id", Array.from(new Set(pubs.map(p => p.client_id))));
  const blogOf = Object.fromEntries((clients || []).map(c => [c.id, c.metricool_blog_id]));

  let published = 0, failed = 0, pending = 0;
  for (const p of pubs) {
    const r = await checkPublication(p, blogOf[p.client_id] ?? null);
    if (!r) { pending++; continue; }
    const patch: any = {};
    if (Object.keys(r.urls).length) patch.published_urls = { ...(p.published_urls || {}), ...r.urls };
    if (r.allPublished) { patch.pub_status = "published"; published++; }
    else if (r.anyError) { patch.pub_status = "error"; patch.error_message = r.errorText; failed++; }
    else pending++;
    if (Object.keys(patch).length) await sb.from("publications").update(patch).eq("id", p.id);
    // запасной путь, если триггер ещё не установлен: закрываем сценарий сами
    if (r.allPublished && p.script_id) {
      await sb.from("scripts").update({ video_status: "published" }).eq("id", p.script_id).neq("video_status", "published");
    }
  }
  return NextResponse.json({ ok: true, checked: pubs.length, published, failed, pending });
}
