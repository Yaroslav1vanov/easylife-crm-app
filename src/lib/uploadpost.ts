// Upload-Post: публикация ролика во все сети клиента одним запросом.
// Отличие от Metricool: аккаунт заводит сам клиент и сам подключает соцсети,
// мы шлём ссылку на файл из R2 — сервис скачивает его сам.
const BASE = "https://api.upload-post.com/api";

/** Наши коды сетей → их названия платформ */
export const UP_NET: Record<string, string> = {
  ig: "instagram", tt: "tiktok", yt: "youtube", threads: "threads",
  fb: "facebook", li: "linkedin",
};

export type UpAccount = { handle: string; display?: string; reauth: boolean };

/** Что реально подключено в профиле клиента. */
export async function fetchProfile(apiKey: string, profile: string) {
  try {
    const r = await fetch(`${BASE}/uploadposts/users`, { headers: { Authorization: `Apikey ${apiKey}` } });
    const j = await r.json().catch(() => null);
    if (!r.ok) return { ok: false as const, error: j?.message || `Upload-Post ${r.status}` };
    const p = (j?.profiles || []).find((x: any) => x.username === profile);
    if (!p) return { ok: false as const, error: `Профиль «${profile}» не найден в аккаунте Upload-Post` };
    const accounts: Record<string, UpAccount> = {};
    for (const [net, info] of Object.entries(p.social_accounts || {})) {
      if (!info || typeof info !== "object") continue;
      const i = info as any;
      accounts[net] = { handle: i.handle || i.display_name || "", display: i.display_name, reauth: !!i.reauth_required };
    }
    return { ok: true as const, accounts, profiles: (j?.profiles || []).map((x: any) => x.username) };
  } catch (e: any) { return { ok: false as const, error: String(e) }; }
}

type PublishArgs = {
  apiKey: string;
  profile: string;
  videoUrl: string;
  channels: string[];                    // наши коды: ig / tt / yt / threads …
  titleFor: (ch: string) => string;      // текст под каждую сеть
  fallbackTitle: string;                 // если под сеть текста нет
  scheduledIso?: string | null;          // время публикации (UTC ISO)
  timezone?: string | null;
};

/** Ставит ролик в очередь. Возвращает request_id — по нему потом смотрим статус. */
export async function publishVideo(a: PublishArgs) {
  const platforms = a.channels.map(ch => UP_NET[ch]).filter(Boolean);
  if (!platforms.length) return { ok: false as const, error: "Не выбрана ни одна соцсеть" };

  const body: Record<string, any> = {
    user: a.profile,
    platform: platforms,
    video_url: a.videoUrl,
    title: a.fallbackTitle || "",
    async_upload: true,
  };
  // текст под каждую сеть отдельно — иначе везде уйдёт один и тот же
  for (const ch of a.channels) {
    const net = UP_NET[ch]; if (!net) continue;
    const t = (a.titleFor(ch) || "").trim();
    if (t) body[`${net}_title`] = t;
  }
  if (a.scheduledIso) {
    body.scheduled_date = a.scheduledIso;
    if (a.timezone) body.timezone = a.timezone;
  }

  try {
    const r = await fetch(`${BASE}/upload`, {
      method: "POST",
      headers: { Authorization: `Apikey ${a.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || j?.success === false) {
      return { ok: false as const, error: humanError(j?.message || j?.error || `Upload-Post ${r.status}`, r.status) };
    }
    return { ok: true as const, requestId: String(j?.request_id || ""), platforms: j?.total_platforms ?? platforms.length };
  } catch (e: any) { return { ok: false as const, error: String(e) }; }
}

/** Статус отправки по request_id. */
export async function checkStatus(apiKey: string, requestId: string) {
  try {
    const r = await fetch(`${BASE}/uploadposts/status?request_id=${encodeURIComponent(requestId)}`, {
      headers: { Authorization: `Apikey ${apiKey}` },
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) return { ok: false as const, error: j?.message || `Upload-Post ${r.status}` };
    return { ok: true as const, data: j };
  } catch (e: any) { return { ok: false as const, error: String(e) }; }
}

function humanError(raw: string, status: number): string {
  const m = (raw || "").toLowerCase();
  if (status === 401) return "Ключ Upload-Post не принят — проверь UPLOADPOST_API_KEY в переменных окружения.";
  if (status === 429) return "Исчерпан лимит тарифа Upload-Post — клиенту нужно поднять план.";
  if (m.includes("not found") && m.includes("user")) return "Профиль не найден в аккаунте Upload-Post — проверь имя профиля в карточке клиента.";
  if (m.includes("not connected") || m.includes("no account")) return "Соцсеть не подключена в аккаунте Upload-Post — клиент должен подключить её у себя.";
  return raw;
}
