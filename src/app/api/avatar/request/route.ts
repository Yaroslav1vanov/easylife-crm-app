import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdmin } from "@/lib/supabase-admin";
import { allowedLooks, canGenerate, loadAvatar, monthStart, videoLimit } from "@/lib/avatar";

/* Кнопки «Озвучить» и «Сделать видео» в чате «Аватар».
   Одна кнопка = одна задача исполнителю = одна генерация HeyGen. Проверяем здесь, а не в браузере:
   кто нажал (тимлид/монтажёр клиента или владелец), лук из разрешённых клиенту, лимит видео за месяц.
   POST { clientId, kind: "voice" | "video", fromMessageId, text?, lookId?, sourceKey?, transparent?, captions?, scriptId?, overLimit? } */
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return bad("Нужно войти в CRM", 401);
  const b = await req.json().catch(() => ({}));
  const cid = Number(b.clientId);
  const kind = b.kind === "video" ? "video" : b.kind === "voice" ? "voice" : null;
  if (!cid || !kind) return bad("нет клиента или вида генерации");

  const sb = createAdmin();
  const [{ data: prof }, { data: tm }, { data: client }, av] = await Promise.all([
    sb.from("profiles").select("role, name").eq("id", user.id).maybeSingle(),
    sb.from("team_members").select("id, name").eq("profile_id", user.id).maybeSingle(),
    sb.from("clients").select("id, package, teamlead_id, montager_id, ai_chat").eq("id", cid).maybeSingle(),
    loadAvatar(sb, cid),
  ]);
  if (!client) return bad("клиент не найден", 404);
  if (!av) return bad("К клиенту не привязан аватар: «Настройки» → «Аватар HeyGen» (привязывает Ярослав)");
  if (!client.ai_chat) return bad("У клиента выключен ИИ в чате: «Настройки» → «ИИ-монтажёр в чате»");
  const isOwner = prof?.role === "owner" || prof?.role === "admin";
  if (!canGenerate(prof?.role, tm?.id, client)) return bad("Генерировать голос и видео могут тимлид и монтажёр этого клиента и Ярослав", 403);

  const lookId = String(b.lookId || av.default_look_id || av.look_ids[0] || av.group_looks?.[0]?.id || "");
  if (!allowedLooks(av).has(lookId)) return bad("Этот образ не из группы аватара клиента");
  const text = String(b.text || "").trim();
  if (kind === "voice" && !text) return bad("Пустой текст для озвучки");
  if (kind === "voice" && text.length > 5000) return bad("Текст длиннее 5000 знаков — разбейте на части");
  const sourceKey = String(b.sourceKey || "");
  if (kind === "video" && !sourceKey.startsWith(`strategy/${cid}/`)) return bad("Нет аудио для видео");

  // уже идёт такая же генерация по этому сообщению — второй раз не ставим (двойной клик)
  const fromId = Number(b.fromMessageId) || null;
  const { data: busy } = await sb.from("avatar_generations").select("id").eq("client_id", cid).eq("kind", kind)
    .in("status", ["queued", "working"]).gte("created_at", new Date(Date.now() - 2 * 3600e3).toISOString()).limit(1);   // зависшую дольше 2 ч не ждём
  if (busy?.length) return bad("Предыдущая генерация ещё идёт — дождитесь результата");

  // лимит видео за календарный месяц (ошибки не считаются)
  let overLimit = false;
  if (kind === "video") {
    const { count } = await sb.from("avatar_generations").select("id", { count: "exact", head: true })
      .eq("client_id", cid).eq("kind", "video").neq("status", "error").gte("created_at", monthStart());
    const lim = videoLimit(av, client.package);
    if ((count || 0) >= lim) {
      if (!isOwner) return bad(`Лимит видео на месяц исчерпан (${count} из ${lim}). Сверх лимита — только с подтверждения Ярослава.`, 403);
      if (!b.overLimit) return NextResponse.json({ needConfirm: `Лимит видео на месяц исчерпан (${count} из ${lim}). Сделать сверх лимита?` }, { status: 409 });
      overLimit = true;
    }
  }

  // переделка = по этому же сообщению уже была успешная генерация того же вида
  let isRedo = false;
  if (fromId) {
    const { data: prev } = await sb.from("avatar_generations").select("id").eq("client_id", cid).eq("kind", kind)
      .neq("status", "error").or(`message_id.eq.${fromId},source_key.eq.${sourceKey || "-"}`).limit(1);
    isRedo = !!prev?.length;
  }

  const scriptId = Number(b.scriptId) || null;
  const who = tm?.name || prof?.name || user.email?.split("@")[0] || "Сотрудник";
  const { data: gen, error: gErr } = await sb.from("avatar_generations").insert({
    client_id: cid, kind, status: "queued", script_id: scriptId, look_id: lookId, voice_id: av.voice_id, engine: av.engine,
    text: kind === "voice" ? text : null, source_key: kind === "video" ? sourceKey : null,
    is_redo: isRedo, over_limit_ok: overLimit, requested_by: user.id, requested_name: who,
  }).select("id").single();
  if (gErr) return bad(gErr.message, 500);

  const lookName = av.look_names?.[lookId] || (av.group_looks || []).find((l) => l.id === lookId)?.name || lookId.slice(0, 8);
  const body = kind === "voice"
    ? `🎙 Озвучить${isRedo ? " заново" : ""} (лук «${lookName}»):\n\n${text}`
    : `🎬 Сделать видео${isRedo ? " заново" : ""} на луке «${lookName}» по аудио выше${b.transparent ? " · прозрачный фон" : ""}${b.captions ? " · субтитры" : ""}${overLimit ? " · сверх лимита, подтвердил Ярослав" : ""}`;
  const { data: msg, error: mErr } = await sb.from("client_chat_messages").insert({
    client_id: cid, thread: "avatar", author_type: "user", author_id: user.id, author_name: who, ai_status: "queued",
    body, attachments: [], script_id: scriptId, quote_id: fromId,
    meta: { avatar_job: { gen_id: gen.id, kind, look_id: lookId, text: kind === "voice" ? text : null, source_key: kind === "video" ? sourceKey : null,
      transparent: !!b.transparent, captions: !!b.captions } },
  }).select("id").single();
  if (mErr) { await sb.from("avatar_generations").update({ status: "error", error: mErr.message }).eq("id", gen.id); return bad(mErr.message, 500); }
  await sb.from("avatar_generations").update({ message_id: msg.id }).eq("id", gen.id);
  return NextResponse.json({ ok: true, genId: gen.id, messageId: msg.id });
}
