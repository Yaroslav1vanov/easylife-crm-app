// Транскрибация: файл (AssemblyAI, асинхронно) или ссылка на чужой ролик (ScrapeCreators).
// Файл заранее лежит в R2 — провайдер забирает его по прямой ссылке, наш сервер аудио не качает.

const AAI = "https://api.assemblyai.com/v2";
const SC = "https://api.scrapecreators.com";

export type Lang = "auto" | "ru" | "uk" | "en";

/** Ставит файл в очередь AssemblyAI. Возвращает id задачи — статус потом опрашиваем. */
export async function submitFile(audioUrl: string, language: Lang) {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) return { ok: false as const, error: "ASSEMBLYAI_API_KEY не задан в переменных Vercel" };
  const body: Record<string, any> = { audio_url: audioUrl, punctuate: true, format_text: true };
  if (language === "auto") body.language_detection = true; else body.language_code = language;
  try {
    const r = await fetch(`${AAI}/transcript`, {
      method: "POST",
      headers: { authorization: key, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) return { ok: false as const, error: j?.error || `AssemblyAI ${r.status}` };
    return { ok: true as const, jobId: String(j.id) };
  } catch (e: any) { return { ok: false as const, error: String(e) }; }
}

/** Опрашивает статус задачи. processing → ждём дальше, done → текст готов. */
export async function pollFile(jobId: string) {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) return { ok: false as const, error: "ASSEMBLYAI_API_KEY не задан" };
  try {
    const r = await fetch(`${AAI}/transcript/${jobId}`, { headers: { authorization: key } });
    const j = await r.json().catch(() => null);
    if (!r.ok) return { ok: false as const, error: j?.error || `AssemblyAI ${r.status}` };
    if (j.status === "error") return { ok: false as const, error: j.error || "провайдер вернул ошибку" };
    if (j.status !== "completed") return { ok: true as const, done: false };
    return {
      ok: true as const, done: true,
      text: (j.text || "").trim(),
      language: j.language_code || null,
      durationSec: j.audio_duration ?? null,
    };
  } catch (e: any) { return { ok: false as const, error: String(e) }; }
}


/** Сообщения провайдера — человеческим языком, с подсказкой что делать дальше. */
function humanLinkError(raw: string): string {
  const m = (raw || "").toLowerCase();
  if (m.includes("does not have a video"))
    return "Instagram не отдал это видео. Чаще всего так с роликами 18+ (возрастное ограничение) и с закрытыми аккаунтами — их видно только из-под входа. Скачай ролик и загрузи через «Свой файл».";
  if (m.includes("too long")) {
    const sec = raw.match(/\((\d+)s\)/)?.[1];
    return `Ролик длиннее 2 минут${sec ? ` (${sec} сек)` : ""} — по ссылке столько не тянется. Загрузи файл через «Свой файл», там ограничения по длине нет.`;
  }
  if (m.includes("not found") || m.includes("404"))
    return "Публикация не найдена — возможно, её удалили или ссылка неверная.";
  if (m.includes("private"))
    return "Аккаунт закрытый — по ссылке текст снять нельзя. Скачай ролик и загрузи через «Свой файл».";
  return raw;
}

export function detectPlatform(url: string) {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  return null;
}

/** Любой формат ответа провайдера → чистая строка (иначе в базу летит «[object Object]»). */
export function toText(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) { const s = v.map(toText).filter(Boolean).join(" "); return s || null; }
  if (typeof v === "object") return toText(v.text ?? v.transcript ?? v.value ?? v.content);
  return String(v);
}

/** Транскрибация чужого ролика по ссылке — тем же ScrapeCreators, что и «Референсы». */
export async function transcribeLink(rawUrl: string) {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) return { ok: false as const, error: "SCRAPECREATORS_API_KEY не задан" };
  let url = (rawUrl || "").trim();
  const platform = detectPlatform(url);
  if (!platform) return { ok: false as const, error: "ссылка не с TikTok/Instagram/YouTube — для своих файлов используй загрузку" };
  if (platform === "instagram") {
    const m = url.match(/instagram\.com\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
    if (m) url = `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/`;
  }
  try {
    if (platform === "instagram") {
      const r = await fetch(`${SC}/v2/instagram/media/transcript?url=${encodeURIComponent(url)}`, { headers: { "x-api-key": key } });
      const j = await r.json().catch(() => null);
      if (!r.ok) return { ok: false as const, error: humanLinkError(j?.message || `ScrapeCreators ${r.status}`) };
      const t = toText(j?.transcript || j?.text || j?.data?.transcript || j?.transcripts);
      return t ? { ok: true as const, text: t, platform } : { ok: false as const, error: "В ролике не нашлось речи — возможно, там только музыка. Если речь есть, загрузи файл через «Свой файл»." };
    }
    if (platform === "youtube") {
      // У YouTube (в т.ч. Shorts) транскрипт отдаёт ОТДЕЛЬНЫЙ эндпоинт —
      // в /v1/youtube/video лежат только ссылки на дорожки субтитров, не текст.
      const r = await fetch(`${SC}/v1/youtube/video/transcript?url=${encodeURIComponent(url)}`, { headers: { "x-api-key": key } });
      const j = await r.json().catch(() => null);
      if (!r.ok) return { ok: false as const, error: humanLinkError(j?.message || j?.error || `ScrapeCreators ${r.status}`) };
      const t = toText(j?.transcript_only_text) || toText(j?.transcript);
      return t ? { ok: true as const, text: t, platform }
        : { ok: false as const, error: "у ролика нет субтитров на YouTube — залей файл через «Свой файл»" };
    }
    const r = await fetch(`${SC}/v2/tiktok/video?url=${encodeURIComponent(url)}&get_transcript=true`, { headers: { "x-api-key": key } });
    const j = await r.json().catch(() => null);
    if (!r.ok) return { ok: false as const, error: humanLinkError(j?.message || `ScrapeCreators ${r.status}`) };
    const d = j?.data || j?.video || j || {};
    const t = toText(d.transcript ?? d.transcription ?? d.subtitles ?? d.text);
    return t ? { ok: true as const, text: t, platform } : { ok: false as const, error: "В ролике не нашлось речи — возможно, там только музыка. Если речь есть, загрузи файл через «Свой файл»." };
  } catch (e: any) { return { ok: false as const, error: String(e) }; }
}
