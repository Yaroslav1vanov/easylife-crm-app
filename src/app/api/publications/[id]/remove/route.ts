import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/apiGuard";

/* Удалить публикацию: сначала запланированный пост в Metricool (чтобы он не вышел), потом карточку в CRM.
   Если до выхода меньше 2 минут или пост уже опубликован — не трогаем: из соцсети его удаляют вручную.
   POST {} */
export const maxDuration = 60;
const BASE = "https://app.metricool.com/api";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  const id = Number(params.id);
  const sb = createClient();
  const { data: pub } = await sb.from("publications").select("id, client_id, pub_status, publish_at, metricool_post_id").eq("id", id).maybeSingle();
  if (!pub) return NextResponse.json({ error: "публикация не найдена" }, { status: 404 });
  if (pub.pub_status === "published") return NextResponse.json({ error: "Уже опубликовано — удалите пост в соцсети вручную, из CRM уберём после этого" }, { status: 400 });

  const ids = String(pub.metricool_post_id || "").split(",").map(x => x.trim()).filter(Boolean);
  if (ids.some(x => x.startsWith("up:"))) return NextResponse.json({ error: "Пост стоит в Upload-Post — удалите его там, затем здесь" }, { status: 400 });
  const mcIds = ids.map(x => x.replace(/^[a-z]+:/, ""));
  if (mcIds.length) {
    if (pub.publish_at && Date.parse(pub.publish_at) < Date.now() + 2 * 60 * 1000)
      return NextResponse.json({ error: "До публикации меньше 2 минут — пост уже уходит. Если вышел, удалите его в Instagram вручную." }, { status: 400 });
    const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
    const { data: client } = await sb.from("clients").select("metricool_blog_id").eq("id", pub.client_id).maybeSingle();
    if (!userId || !token || !client?.metricool_blog_id) return NextResponse.json({ error: "Нет доступа к Metricool для этого клиента" }, { status: 400 });
    const fails: string[] = [];
    for (const pid of mcIds) {
      const r = await fetch(`${BASE}/v2/scheduler/posts/${pid}?userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}&blogId=${client.metricool_blog_id}`,
        { method: "DELETE", headers: { "X-Mc-Auth": token } }).catch(() => null);
      if (!r || (!r.ok && r.status !== 404)) fails.push(`${pid}: ${r ? r.status : "нет ответа"}`);   // 404 — поста уже нет, это нам и нужно
    }
    if (fails.length) return NextResponse.json({ error: `Metricool не удалил пост (${fails.join(", ")}). В CRM ничего не трогали — попробуйте ещё раз.` }, { status: 502 });
  }
  const { error } = await sb.from("publications").delete().eq("id", id);
  if (error) {
    // карточку держит что-то ещё — снимаем с публикации, но оставляем в CRM
    await sb.from("publications").update({ pub_status: "queued", metricool_post_id: null }).eq("id", id);
    return NextResponse.json({ ok: true, deleted: false, note: "Пост в Metricool удалён; карточка осталась в CRM как «готово к отправке»: " + error.message });
  }
  return NextResponse.json({ ok: true, deleted: true });
}
