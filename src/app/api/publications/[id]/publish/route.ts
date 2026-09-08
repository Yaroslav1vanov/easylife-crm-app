import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { publishVideo, UP_NET } from "@/lib/uploadpost";

/* ============================================================
   Выгрузка публикации в Metricool: на каждую выбранную соцсеть — отдельный
   запланированный пост. Metricool публикует сам (autoPublish).

   Защита от дублей (2026-09-06):
   - metricool_post_id хранит id ПО СЕТЯМ: "ig:123,tt:456" (старый формат
     "123,456" тоже читается). Сеть, у которой id уже есть, второй раз не
     отправляется — повторное нажатие досылает только то, что не ушло.
   - Уже запланированную (все сети с id) публикацию повторно отправить нельзя
     без { force: true } — тогда старые посты сначала удаляются в Metricool.
   - Замок на время отправки: два параллельных запроса не создадут два комплекта.
   - Частичный сбой: успешные id всё равно сохраняются, статус error,
     в сообщении — что ушло, а что нет.
   - Время в прошлом больше чем на 10 минут — отказ (иначе Metricool публикует
     сразу, и это выглядит как «опубликовалось само»).
   ============================================================ */
const BASE = "https://app.metricool.com/api";
const NET: Record<string, string> = { ig: "instagram", tt: "tiktok", yt: "youtube", threads: "threads" };
const LOCK = "⏳ отправка в Metricool…";
export const maxDuration = 60;

function fit(text: string, max: number): string {
  if (!text || text.length <= max) return text || "";
  let t = text.slice(0, max);
  const cut = Math.max(t.lastIndexOf(". "), t.lastIndexOf("! "), t.lastIndexOf("? "), t.lastIndexOf("\n"));
  if (cut > max * 0.5) t = t.slice(0, cut + 1);
  else { const sp = t.lastIndexOf(" "); if (sp > 0) t = t.slice(0, sp); }
  return t.trim();
}
function tzIso(utcIso: string, tz: string) {
  const d = new Date(utcIso);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => parts.find(p => p.type === t)!.value;
  let hour = g("hour"); if (hour === "24") hour = "00";
  return `${g("year")}-${g("month")}-${g("day")}T${hour}:${g("minute")}:${g("second")}`;
}
/** "ig:1,tt:2" | "1,2" → { ig: "1", tt: "2" } (старый формат без сетей → под ключами _0, _1…) */
function parseIds(s: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  s.split(",").map(x => x.trim()).filter(Boolean).forEach((x, i) => {
    const m = x.match(/^([a-z]+):(.+)$/);
    if (m) out[m[1]] = m[2]; else out[`_${i}`] = x;
  });
  return out;
}
const serializeIds = (m: Record<string, string>) => Object.entries(m).map(([k, v]) => `${k}:${v}`).join(",");

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return NextResponse.json({ error: "METRICOOL_USER_ID / METRICOOL_TOKEN не заданы в окружении" }, { status: 400 });
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  let opts: any = {};
  try { opts = await req.json(); } catch {}
  const force = !!opts?.force;

  const sb = createClient();
  const { data: pub } = await sb.from("publications").select("*").eq("id", id).maybeSingle();
  if (!pub) return NextResponse.json({ error: "публикация не найдена" }, { status: 404 });
  const { data: client } = await sb.from("clients").select("name, surname, metricool_blog_id, timezone, platforms, publisher, uploadpost_profile").eq("id", pub.client_id).maybeSingle();

  // ---- Upload-Post: клиент публикуется через свой аккаунт
  if (client?.publisher === "uploadpost") {
    return await publishViaUploadPost(sb, pub, client, force);
  }

  const blogId = client?.metricool_blog_id;
  if (!blogId) return NextResponse.json({ error: "У клиента не задан бренд Metricool (карточка клиента → Настройки)" }, { status: 400 });

  const isCarousel = pub.content_type === "carousel";
  const media: string[] = isCarousel ? (pub.media_urls || []).filter(Boolean) : (pub.video_url ? [pub.video_url] : []);
  if (isCarousel && media.length < 1) return NextResponse.json({ error: "Нет картинок-слайдов карусели (загрузи хотя бы одну)" }, { status: 400 });
  if (!isCarousel && media.length < 1) return NextResponse.json({ error: "Нет видео — загрузи файл ролика или вставь прямую ссылку" }, { status: 400 });
  if (!pub.publish_at) return NextResponse.json({ error: "Не задана дата и время публикации" }, { status: 400 });
  if (Date.parse(pub.publish_at) < Date.now() - 10 * 60 * 1000 && !opts?.allowPast) {
    return NextResponse.json({ error: "Время публикации уже прошло — Metricool опубликует сразу. Поставь новое время или подтверди «опубликовать сейчас».", code: "past" }, { status: 400 });
  }

  const tz = client?.timezone || "America/New_York";
  const dateTime = tzIso(pub.publish_at, tz);
  const allow = isCarousel ? ["ig", "threads"] : ["ig", "tt", "yt", "threads"];
  const channels: string[] = (pub.target_channels?.length ? pub.target_channels : client?.platforms?.length ? client.platforms : allow).filter((ch: string) => allow.includes(ch));
  const targetsAll = channels.filter(ch => NET[ch]);
  if (!targetsAll.length) return NextResponse.json({ error: "Не выбрана ни одна соцсеть" }, { status: 400 });

  // ---- что уже ушло в Metricool
  const existing = parseIds(pub.metricool_post_id);
  const legacyIds = Object.entries(existing).filter(([k]) => k.startsWith("_")).map(([, v]) => v);
  const knownByNet = Object.fromEntries(Object.entries(existing).filter(([k]) => !k.startsWith("_")));
  const alreadyAll = pub.pub_status === "scheduled" && (legacyIds.length > 0 || targetsAll.every(ch => knownByNet[ch]));
  if (alreadyAll && !force) {
    return NextResponse.json({
      error: "Уже запланировано в Metricool. Повторная отправка создаст дубли. Если нужно переотправить — нажми «Переотправить», старые посты будут удалены.",
      code: "already_scheduled", ids: existing,
    }, { status: 409 });
  }

  // ---- замок от параллельных запросов (двойной клик, две вкладки)
  const { data: locked } = await sb.from("publications").update({ error_message: LOCK })
    .eq("id", id).or(`error_message.is.null,error_message.neq.${LOCK}`).select("id");
  if (!locked?.length) return NextResponse.json({ error: "Публикация уже отправляется — подожди пару секунд", code: "in_flight" }, { status: 409 });

  const mc = (path: string) => `${BASE}${path}${path.includes("?") ? "&" : "?"}userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}&blogId=${blogId}`;
  const hdr = { "Content-Type": "application/json", "X-Mc-Auth": token };

  try {
    // ---- force: удалить старые посты, чтобы не было дублей
    const deleted: any[] = [];
    let idsByNet: Record<string, string> = { ...knownByNet };
    if (force) {
      for (const pid of [...legacyIds, ...Object.values(knownByNet)]) {
        try { const r = await fetch(mc(`/v2/scheduler/posts/${pid}`), { method: "DELETE", headers: hdr }); deleted.push({ id: pid, ok: r.ok, status: r.status }); }
        catch (e: any) { deleted.push({ id: pid, ok: false, error: String(e) }); }
      }
      idsByNet = {};
    }

    // ---- отправляем только те сети, у которых ещё нет поста
    const targets = targetsAll.filter(ch => !idsByNet[ch]);
    const textFor = (ch: string) => ch === "ig" ? pub.caption_ig : ch === "tt" ? pub.caption_tt : ch === "yt" ? (pub.yt_description || pub.yt_title) : ch === "threads" ? pub.threads_post : "";
    const ytTitle = (() => {
      if ((pub.yt_title || "").trim()) return pub.yt_title.trim().slice(0, 95);
      const src = (pub.base_text || pub.caption_ig || pub.caption_tt || pub.threads_post || "").trim();
      if (!src) return "";
      const firstLine = src.split(/\n/).map((x: string) => x.trim()).find(Boolean) || src;
      const sentence = (firstLine.split(/(?<=[.!?])\s/)[0] || firstLine).trim();
      return sentence.replace(/[<>]/g, "").slice(0, 95).trim();
    })();
    if (targets.includes("yt") && !ytTitle) {
      await sb.from("publications").update({ error_message: "Для YouTube нужен заголовок ролика — заполни «Название YouTube» или текст поста" }).eq("id", id);
      return NextResponse.json({ error: "Для YouTube нужен заголовок ролика — заполни «Название YouTube» или текст поста" }, { status: 400 });
    }

    const results = await Promise.all(targets.map(async ch => {
      const network = NET[ch];
      const raw = textFor(ch) || pub.base_text || "";
      const body: any = { text: network === "threads" ? fit(raw, 500) : raw, providers: [{ network }], publicationDate: { dateTime, timezone: tz }, draft: false, autoPublish: true, media };
      if (!isCarousel && pub.video_thumbnail_url) body.videoThumbnailUrl = pub.video_thumbnail_url;
      if (network === "instagram") body.instagramData = { type: isCarousel ? "POST" : "REEL" };
      if (network === "youtube") body.youtubeData = { title: ytTitle, type: "SHORT", tags: pub.yt_tags || [], madeForKids: false, privacy: "public" };
      if (network === "tiktok") body.tiktokData = { privacyOption: "PUBLIC_TO_EVERYONE", disableComment: false, disableDuet: false, disableStitch: false, commercialContentThirdParty: false, commercialContentOwnBrand: false };
      try {
        const r = await fetch(mc(`/v2/scheduler/posts`), { method: "POST", headers: hdr, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        return { ch, ok: r.ok, status: r.status, id: j?.id ?? j?.data?.id ?? null, msg: j?.message || j?.error || null };
      } catch (e: any) { return { ch, ok: false, status: 0, id: null, msg: String(e) }; }
    }));

    for (const r of results) if (r.ok && r.id) idsByNet[r.ch] = String(r.id);
    const failed = results.filter(r => !r.ok);
    const okNow = results.filter(r => r.ok).map(r => r.ch);
    const scheduledAll = targetsAll.every(ch => idsByNet[ch]);

    if (failed.length) {
      const msg = `Metricool: ${failed.map(f => `${f.ch}: ${f.msg || f.status}`).join("; ")}` + (Object.keys(idsByNet).length ? ` · уже ушло: ${Object.keys(idsByNet).join(", ")} — при повторе не продублируется` : "");
      await sb.from("publications").update({ pub_status: "error", error_message: msg, metricool_post_id: serializeIds(idsByNet) || null }).eq("id", id);
      return NextResponse.json({ error: msg, results, deleted }, { status: 502 });
    }
    await sb.from("publications").update({ pub_status: scheduledAll ? "scheduled" : pub.pub_status === "error" ? "error" : pub.pub_status, metricool_post_id: serializeIds(idsByNet) || null, error_message: null }).eq("id", id);
    return NextResponse.json({ ok: true, sent: okNow, skipped: targetsAll.filter(ch => !targets.includes(ch)), ids: idsByNet, deleted });
  } catch (e: any) {
    await sb.from("publications").update({ error_message: `Ошибка отправки: ${String(e?.message || e)}` }).eq("id", id);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}


/* ============================================================
   Upload-Post: один запрос на все сети сразу, файл забирается по ссылке из R2.
   request_id храним в metricool_post_id как "up:<id>" — по нему смотрим статус.
   ============================================================ */
async function publishViaUploadPost(sb: any, pub: any, client: any, force: boolean) {
  const apiKey = process.env.UPLOADPOST_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "UPLOADPOST_API_KEY не задан в переменных окружения" }, { status: 400 });
  const profile = (client.uploadpost_profile || "").trim();
  if (!profile) return NextResponse.json({ error: "У клиента не указан профиль Upload-Post (карточка клиента → Настройки)" }, { status: 400 });

  if (pub.content_type === "carousel")
    return NextResponse.json({ error: "Карусели через Upload-Post пока не отправляем — только ролики" }, { status: 400 });
  if (!pub.video_url)
    return NextResponse.json({ error: "Нет видео — загрузи файл ролика" }, { status: 400 });
  if (!pub.publish_at)
    return NextResponse.json({ error: "Не задана дата и время публикации" }, { status: 400 });

  // повторная отправка создаст второй пост — без force не пускаем
  const already = (pub.metricool_post_id || "").startsWith("up:");
  if (already && !force) {
    return NextResponse.json({
      error: "Уже отправлено в Upload-Post. Повторная отправка создаст дубль.",
      code: "already_scheduled",
    }, { status: 409 });
  }

  const allow = Object.keys(UP_NET);
  const channels: string[] = (pub.target_channels?.length ? pub.target_channels : client?.platforms?.length ? client.platforms : ["ig"])
    .filter((ch: string) => allow.includes(ch));
  if (!channels.length) return NextResponse.json({ error: "Не выбрана ни одна соцсеть (карточка клиента → Настройки)" }, { status: 400 });

  const textFor = (ch: string) =>
    ch === "ig" ? pub.caption_ig : ch === "tt" ? pub.caption_tt :
    ch === "yt" ? (pub.yt_title || pub.yt_description) : ch === "threads" ? pub.threads_post : pub.base_text;

  const future = Date.parse(pub.publish_at) > Date.now() + 60 * 1000;
  const r = await publishVideo({
    apiKey, profile,
    videoUrl: pub.video_url,
    channels,
    titleFor: (ch) => textFor(ch) || "",
    fallbackTitle: pub.base_text || pub.caption_ig || "",
    scheduledIso: future ? new Date(pub.publish_at).toISOString() : null,
    timezone: client.timezone || null,
  });

  if (!r.ok) {
    await sb.from("publications").update({ pub_status: "error", error_message: r.error }).eq("id", pub.id);
    return NextResponse.json({ error: r.error }, { status: 502 });
  }
  await sb.from("publications").update({
    pub_status: "scheduled",
    metricool_post_id: `up:${r.requestId}`,
    error_message: null,
  }).eq("id", pub.id);
  return NextResponse.json({ ok: true, provider: "uploadpost", requestId: r.requestId, platforms: channels });
}
