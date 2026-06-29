import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Выгрузка публикации в Metricool: на каждую выбранную соцсеть — отдельный запланированный пост
// со своим текстом. Metricool сам публикует в указанное время (autoPublish).
const BASE = "https://app.metricool.com/api";
const NET: Record<string, string> = { ig: "instagram", tt: "tiktok", yt: "youtube", threads: "threads" };

// Подрезать текст под лимит по границе предложения/слова (страховка для Threads ≤500).
function fit(text: string, max: number): string {
  if (!text || text.length <= max) return text || "";
  let t = text.slice(0, max);
  const cut = Math.max(t.lastIndexOf(". "), t.lastIndexOf("! "), t.lastIndexOf("? "), t.lastIndexOf("\n"));
  if (cut > max * 0.5) t = t.slice(0, cut + 1);
  else { const sp = t.lastIndexOf(" "); if (sp > 0) t = t.slice(0, sp); }
  return t.trim();
}

// UTC ISO → "YYYY-MM-DDTHH:mm:ss" в таймзоне клиента (Metricool ждёт локальное время + timezone)
function tzIso(utcIso: string, tz: string) {
  const d = new Date(utcIso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find(p => p.type === t)!.value;
  let hour = g("hour"); if (hour === "24") hour = "00";
  return `${g("year")}-${g("month")}-${g("day")}T${hour}:${g("minute")}:${g("second")}`;
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return NextResponse.json({ error: "METRICOOL_USER_ID / METRICOOL_TOKEN не заданы в окружении" }, { status: 400 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const sb = createClient();
  const { data: pub } = await sb.from("publications").select("*").eq("id", id).maybeSingle();
  if (!pub) return NextResponse.json({ error: "публикация не найдена" }, { status: 404 });
  const { data: client } = await sb.from("clients").select("name, surname, metricool_blog_id, timezone, platforms").eq("id", pub.client_id).maybeSingle();

  const blogId = client?.metricool_blog_id;
  if (!blogId) return NextResponse.json({ error: "У клиента не задан metricool_blog_id (укажи в карточке клиента)" }, { status: 400 });

  const isCarousel = pub.content_type === "carousel";
  const media: string[] = isCarousel ? (pub.media_urls || []).filter(Boolean) : (pub.video_url ? [pub.video_url] : []);
  if (isCarousel && media.length < 1) return NextResponse.json({ error: "Нет картинок-слайдов карусели (загрузи хотя бы одну)" }, { status: 400 });
  if (!isCarousel && media.length < 1) return NextResponse.json({ error: "Нет ссылки на видео (нужен прямой URL, который Metricool сможет скачать)" }, { status: 400 });
  if (!pub.publish_at) return NextResponse.json({ error: "Не задана дата/время публикации" }, { status: 400 });

  const tz = client?.timezone || "America/New_York"; // дефолт — US Eastern (см. lib/tz)
  const dateTime = tzIso(pub.publish_at, tz);
  // карусель уходит только в сети, поддерживающие набор картинок (IG / Threads)
  const allow = isCarousel ? ["ig", "threads"] : ["ig", "tt", "yt", "threads"];
  const channels: string[] = (pub.target_channels?.length ? pub.target_channels : client?.platforms?.length ? client.platforms : allow).filter((ch: string) => allow.includes(ch));
  const textFor = (ch: string) =>
    ch === "ig" ? pub.caption_ig : ch === "tt" ? pub.caption_tt :
    ch === "yt" ? (pub.yt_description || pub.yt_title) : ch === "threads" ? pub.threads_post : "";

  const targets = channels.filter(ch => NET[ch]);
  if (!targets.length) return NextResponse.json({ error: "Не выбрана ни одна соцсеть" }, { status: 400 });

  const results = await Promise.all(targets.map(async ch => {
    const network = NET[ch];
    const raw = textFor(ch) || pub.base_text || "";
    const body: any = {
      text: network === "threads" ? fit(raw, 500) : raw,
      providers: [{ network }],
      publicationDate: { dateTime, timezone: tz },
      draft: false,
      autoPublish: true,
      media,
    };
    if (network === "instagram") body.instagramData = { type: isCarousel ? "POST" : "REEL" };
    if (network === "youtube") body.youtubeData = { title: pub.yt_title || "", type: "SHORT", tags: pub.yt_tags || [], madeForKids: false, privacy: "public" };
    if (network === "tiktok") body.tiktokData = {
      privacyOption: "PUBLIC_TO_EVERYONE",
      disableComment: false, disableDuet: false, disableStitch: false,
      commercialContentThirdParty: false, commercialContentOwnBrand: false,
    };
    const url = `${BASE}/v2/scheduler/posts?userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}&blogId=${blogId}`;
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Mc-Auth": token }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      return { ch, ok: r.ok, status: r.status, id: j?.id ?? j?.data?.id ?? null, resp: j };
    } catch (e: any) {
      return { ch, ok: false, status: 0, id: null, resp: { message: String(e) } };
    }
  }));

  const failed = results.filter(r => !r.ok);
  if (failed.length) {
    const msg = failed.map(f => `${f.ch}: ${f.resp?.message || f.resp?.error || f.status}`).join("; ");
    await sb.from("publications").update({ pub_status: "error", error_message: `Metricool: ${msg}` }).eq("id", id);
    return NextResponse.json({ error: msg, results }, { status: 502 });
  }

  const ids = results.map(r => r.id).filter(Boolean);
  await sb.from("publications").update({ pub_status: "scheduled", metricool_post_id: ids.join(","), error_message: null }).eq("id", id);
  return NextResponse.json({ ok: true, results });
}
