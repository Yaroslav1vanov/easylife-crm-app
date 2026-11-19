/* Режим «кабинет клиента» (/p/<секрет>) в браузере.

   В кабинете работают те же компоненты, что в карточке клиента CRM (план, доска сценариев,
   статистика), — поэтому выглядит один в один. Но у клиента нет входа в CRM: вместо настоящего
   клиента базы компоненты получают «клиент только для чтения» (lib/portalClient), который ходит
   в /api/portal/<секрет>/q. Сервер сам ограничивает всё одним клиентом и белым списком полей,
   а любые изменения отклоняет. Вызовы наших API тоже перенаправляются или блокируются здесь. */

export type PortalCtx = { token: string; clientId: number };

const KEY = "__CRM_PORTAL__";

export function portalCtx(): PortalCtx | null {
  if (typeof window === "undefined") return null;
  return ((window as any)[KEY] as PortalCtx) || null;
}
export const isPortal = () => !!portalCtx();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function enterPortal(ctx: PortalCtx) {
  if (typeof window === "undefined") return;
  const w = window as any;
  if (w[KEY]) return;
  w[KEY] = ctx;
  const orig: typeof fetch = window.fetch.bind(window);
  w.__CRM_PORTAL_FETCH__ = orig;
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    let u: URL;
    try { u = new URL(raw, window.location.origin); } catch { return orig(input as any, init); }
    if (u.origin !== window.location.origin || !u.pathname.startsWith("/api/")) return orig(input as any, init);
    if (u.pathname.startsWith(`/api/portal/${ctx.token}/`)) return orig(input as any, init);
    // данные для вкладки «Статистика» — через кабинет, строго по этому клиенту
    const m = u.pathname.match(/^\/api\/clients\/(\d+)\/(reels|breakdown)$/);
    if (m && Number(m[1]) === ctx.clientId) return orig(`/api/portal/${ctx.token}/${m[2]}${u.search}`, { method: "GET" });
    // «Обновить статистику» — в кабинете ничего не пересобираем, просто отвечаем «ок»
    if (u.pathname.startsWith("/api/stats/collect")) return json({ ok: true });
    return json({ error: "Режим просмотра — изменения недоступны" }, 403);
  }) as typeof fetch;
}

/** Исходный fetch (без перенаправлений) — для самого клиента базы кабинета. */
export function portalFetch(): typeof fetch {
  return ((typeof window !== "undefined" && (window as any).__CRM_PORTAL_FETCH__) || fetch) as typeof fetch;
}
