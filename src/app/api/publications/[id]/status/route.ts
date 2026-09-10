import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { checkPublication } from "@/lib/pubStatus";

/* Реальный статус публикации у провайдера (Metricool или Upload-Post).
   Если всё вышло — карточка становится «Опубликовано», а сценарий в «Монтаже»
   закрывается сам (триггер в базе + запасной путь ниже). */
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const sb = createClient();
  const { data: pub } = await sb.from("publications").select("id, client_id, script_id, metricool_post_id, pub_status, published_urls").eq("id", id).maybeSingle();
  if (!pub) return NextResponse.json({ error: "публикация не найдена" }, { status: 404 });
  if (!pub.metricool_post_id) return NextResponse.json({ ok: true, items: [], note: "ещё не отправлялось" });
  const { data: client } = await sb.from("clients").select("metricool_blog_id").eq("id", pub.client_id).maybeSingle();

  const r = await checkPublication(pub, client?.metricool_blog_id ?? null);
  if (!r) return NextResponse.json({ error: "не удалось получить статус у сервиса публикации" }, { status: 502 });

  const patch: any = {};
  if (Object.keys(r.urls).length) patch.published_urls = { ...(pub.published_urls || {}), ...r.urls };
  if (r.allPublished && pub.pub_status !== "published") patch.pub_status = "published";
  if (r.anyError && pub.pub_status === "scheduled") { patch.pub_status = "error"; patch.error_message = r.errorText; }
  if (Object.keys(patch).length) await sb.from("publications").update(patch).eq("id", id);
  if (r.allPublished && pub.script_id) {
    await sb.from("scripts").update({ video_status: "published" }).eq("id", pub.script_id).neq("video_status", "published");
  }
  return NextResponse.json({ ok: true, items: r.items.map(i => ({ ...i, key: i.ch, id: "" , when: null })), allPublished: r.allPublished, anyError: r.anyError, patch });
}
