import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/apiGuard";
import { POST as publish } from "../publish/route";

/* Замена файла у публикации, которая уже стоит в Metricool (кадр сторис, ролик).
   Поменять файл в готовом посте Metricool нельзя — записываем новый файл в CRM и пересоздаём пост
   на то же время (как «Переотправить»: старый пост удаляется, новый ставится заново).
   POST { media_urls?: string[], video_url?: string } */
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  const patch: any = {};
  if (Array.isArray(b.media_urls) && b.media_urls.every((u: unknown) => typeof u === "string" && u)) patch.media_urls = b.media_urls;
  if (typeof b.video_url === "string" && b.video_url) patch.video_url = b.video_url;
  if (!id || !Object.keys(patch).length) return NextResponse.json({ error: "нет нового файла" }, { status: 400 });

  const sb = createClient();
  const { data: pub } = await sb.from("publications").select("id, pub_status, publish_at").eq("id", id).maybeSingle();
  if (!pub) return NextResponse.json({ error: "публикация не найдена" }, { status: 404 });
  if (pub.pub_status === "published") return NextResponse.json({ error: "Уже опубликовано — файл в соцсети не заменить" }, { status: 400 });
  if (pub.pub_status === "scheduled" && pub.publish_at && Date.parse(pub.publish_at) < Date.now() + 2 * 60 * 1000)
    return NextResponse.json({ error: "До публикации меньше 2 минут — пост уже уходит в соцсеть. Если вышел не тот файл, удалите сторис в Instagram вручную." }, { status: 400 });

  const { error } = await sb.from("publications").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (pub.pub_status !== "scheduled") return NextResponse.json({ ok: true, resent: false });
  return publish(new Request(req.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force: true }) }), { params });
}
