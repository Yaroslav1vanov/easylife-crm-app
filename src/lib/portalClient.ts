import type { SupabaseClient } from "@supabase/supabase-js";
import { portalCtx, portalFetch } from "@/lib/portalMode";

/* «Клиент базы только для чтения» для кабинета клиента.
   Повторяет цепочку supabase-js (from().select().eq().order()…), но выполняет запрос через
   /api/portal/<секрет>/q. Изменения (insert/update/upsert/delete/rpc/storage) не отправляются —
   сразу возвращают ошибку «режим просмотра». Неизвестные методы цепочки не ломают компонент. */

const RO = { message: "Режим просмотра — изменения недоступны" };

type Filter = [string, string, unknown];

function builder(table: string) {
  const st = {
    table, select: "*", filters: [] as Filter[], order: [] as [string, boolean][], limit: null as number | null,
    offset: null as number | null, single: null as null | "single" | "maybe", write: false, count: false, head: false,
  };
  const exec = async () => {
    if (st.write) return { data: null, error: RO, count: null, status: 403 };
    const ctx = portalCtx();
    if (!ctx) return { data: null, error: { message: "нет кабинета" }, count: null };
    try {
      const r = await portalFetch()(`/api/portal/${ctx.token}/q`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(st),
      });
      const j = await r.json();
      return { data: j.data ?? null, error: j.error ?? null, count: j.count ?? null, status: r.status };
    } catch (e: any) {
      return { data: null, error: { message: e?.message || "сеть" }, count: null };
    }
  };
  const add = (op: string) => (col: string, val?: unknown) => { st.filters.push([op, col, val]); return proxy; };
  const api: Record<string, any> = {
    select(cols = "*", opts?: { count?: string; head?: boolean }) { if (!st.write) st.select = cols; if (opts?.count) st.count = true; if (opts?.head) st.head = true; return proxy; },
    eq: add("eq"), neq: add("neq"), gt: add("gt"), gte: add("gte"), lt: add("lt"), lte: add("lte"),
    like: add("like"), ilike: add("ilike"), is: add("is"), in: add("in"),
    not(col: string, op: string, val: unknown) { st.filters.push(["not", col, [op, val]]); return proxy; },
    order(col: string, o?: { ascending?: boolean }) { st.order.push([col, o?.ascending !== false]); return proxy; },
    limit(n: number) { st.limit = n; return proxy; },
    range(a: number, b: number) { st.offset = a; st.limit = b - a + 1; return proxy; },
    single() { st.single = "single"; return proxy; },
    maybeSingle() { st.single = "maybe"; return proxy; },
    insert() { st.write = true; return proxy; }, update() { st.write = true; return proxy; },
    upsert() { st.write = true; return proxy; }, delete() { st.write = true; return proxy; },
    then(res: any, rej: any) { return exec().then(res, rej); },
  };
  const proxy: any = new Proxy(api, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return () => proxy;   // or(), contains(), returns() и пр. — молча пропускаем
    },
  });
  return proxy;
}

let cached: SupabaseClient | null = null;

export function portalClient(): SupabaseClient {
  if (cached) return cached;
  const noop = { data: { subscription: { unsubscribe() {} } } };
  const channel: any = { on() { return channel; }, subscribe() { return channel; }, unsubscribe() {} };
  cached = {
    from: (t: string) => builder(t),
    rpc: async () => ({ data: null, error: RO }),
    channel: () => channel,
    removeChannel: async () => {},
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => noop,
      signOut: async () => ({ error: null }),
    },
    storage: { from: () => ({ upload: async () => ({ data: null, error: RO }), remove: async () => ({ data: null, error: RO }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  } as unknown as SupabaseClient;
  return cached;
}
