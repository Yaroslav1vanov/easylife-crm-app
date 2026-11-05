/* Защита от «чужих» данных Metricool (05.11.2026).
   Если бренда нет в аккаунте Metricool (удалён или переподключён), API Metricool не отдаёт ошибку, а молча
   отвечает данными ПЕРВОГО бренда аккаунта (это Госпожа Еля): у Olena Hart с сентября в CRM были Елины
   просмотры, и они дважды попадали в цифры агентства. Тот же путь опасен и для публикации — ролик мог уйти
   не в тот Instagram. Поэтому любой запрос к Metricool с blogId сверяем со списком брендов аккаунта
   (кэш 10 минут); бренда нет — запрос не уходит, отвечаем 404 «бренд не найден». */

const MC = "app.metricool.com/api";
let cache: { at: number; ids: Set<string> } | null = null;

async function brandIds(origFetch: typeof fetch): Promise<Set<string> | null> {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.ids;
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return null;
  try {
    const r = await origFetch(`https://${MC}/admin/simpleProfiles?userToken=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`,
      { headers: { "X-Mc-Auth": token }, cache: "no-store" } as RequestInit);
    if (!r.ok) return cache?.ids || null;
    const j: any = await r.json();
    const list: any[] = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
    const ids = new Set(list.map((b) => String(b?.id ?? b?.blogId ?? "")).filter(Boolean));
    if (!ids.size) return cache?.ids || null;
    cache = { at: Date.now(), ids };
    return ids;
  } catch {
    return cache?.ids || null;   // список не получили — не блокируем работу
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as any;
  if (g.__mcGuard) return;
  g.__mcGuard = true;
  const orig: typeof fetch = g.fetch.bind(globalThis);
  g.fetch = async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url || String(input);
    if (url.includes(MC) && !url.includes("/admin/simpleProfiles")) {
      const m = url.match(/[?&]blogId=(\d+)/);
      if (m) {
        const ids = await brandIds(orig);
        if (ids && !ids.has(m[1])) {
          console.warn(`[metricool] бренд ${m[1]} не найден в аккаунте — запрос не отправлен: ${url.split("?")[0].replace(/^https:\/\/app\.metricool\.com\/api/, "")}`);
          return new Response(JSON.stringify({ error: `Бренд Metricool ${m[1]} не найден в аккаунте (удалён или переподключён). Привяжите бренд заново: карточка клиента → «Настройки» → «Бренд в Metricool».`, brandMissing: true }),
            { status: 404, headers: { "content-type": "application/json" } });
        }
      }
    }
    return orig(input, init);
  };
}
