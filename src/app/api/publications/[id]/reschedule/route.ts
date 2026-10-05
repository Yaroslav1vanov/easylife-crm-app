import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/apiGuard";
import { POST as publish } from "../publish/route";

/* Перенос времени у уже запланированной публикации.
   Поменять время поста в Metricool нельзя — меняем в CRM и пересоздаём пост
   (та же «Переотправить»: старый пост удаляется, новый ставится на новое время).
   POST { publish_at: ISO } */
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  const at = Date.parse(String(b?.publish_at || ""));
  if (!id || !at) return NextResponse.json({ error: "нужно время publish_at" }, { status: 400 });
  if (at < Date.now() + 2 * 60 * 1000) return NextResponse.json({ error: "Новое время должно быть хотя бы на 2 минуты позже текущего" }, { status: 400 });

  const sb = createClient();
  const { data: pub } = await sb.from("publications").select("id, pub_status").eq("id", id).maybeSingle();
  if (!pub) return NextResponse.json({ error: "публикация не найдена" }, { status: 404 });
  if (pub.pub_status === "published") return NextResponse.json({ error: "Уже опубликовано — время не поменять" }, { status: 400 });

  const { error } = await sb.from("publications").update({ publish_at: new Date(at).toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (pub.pub_status !== "scheduled") return NextResponse.json({ ok: true, resent: false });

  // пост уже в сервисе публикации — пересоздаём с новым временем
  return publish(new Request(req.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force: true }) }), { params });
}
