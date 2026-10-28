import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdmin } from "@/lib/supabase-admin";

/* Аналитика ИИ-чата — только владелец. Кто из сотрудников сколько ставил задач ИИ, сколько смонтировано роликов,
   ошибки, время, условная стоимость, по клиентам и чатам; плюс состояние сервера (пульс исполнителя раз в 5 минут).
   GET ?days=1..90 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VIDEO = /\.(mp4|mov|webm|m4v)$/i, IMAGE = /\.(png|jpe?g|webp)$/i;

async function all<T = any>(q: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET(req: Request) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужно войти в CRM" }, { status: 401 });
  const { data: prof } = await auth.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!prof || !["owner", "admin"].includes(prof.role)) return NextResponse.json({ error: "только владелец" }, { status: 403 });

  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const sb = createAdmin();

  const [tasks, replies, clients, status, quick, limitRows, gens, hvids] = await Promise.all([
    all((a, b) => sb.from("client_chat_messages")
      .select("id, client_id, author_id, author_name, thread, ai_status, ai_error, created_at, ai_started_at, ai_finished_at, ai_minutes, ai_cost_usd, ai_files, body")
      .eq("author_type", "user").not("ai_status", "is", null).gte("created_at", since).order("id").range(a, b)),
    all((a, b) => sb.from("client_chat_messages").select("reply_to, attachments, created_at")
      .eq("author_type", "ai").not("reply_to", "is", null).gte("created_at", since).order("id").range(a, b)),
    sb.from("clients").select("id, name, surname, avatar_url").then(r => r.data || []),
    // постранично: пульс раз в 5 минут = ~2000 строк за неделю, а Supabase отдаёт максимум 1000 за раз
    // (до 27.10 брались 1000 самых старых — «последний пульс» был пятидневной давности и сервер казался «без связи»)
    all((a, b) => sb.from("server_status").select("at, disk_used_gb, disk_total_gb, load1, cpus, mem_used_mb, mem_total_mb, running")
      .gte("at", new Date(Date.now() - Math.max(days, 7) * 864e5).toISOString()).order("at").range(a, b)),
    all((a, b) => sb.from("ai_jobs").select("kind, status, created_at").gte("created_at", since).order("id").range(a, b)).catch(() => []),
    // лимиты подписки Claude из пульса (до миграции 2026-10-27_claude_limits колонок нет — тогда пусто)
    all((a, b) => sb.from("server_status").select("at, claude_5h_util, claude_5h_reset, claude_7d_util, claude_7d_reset, claude_status, claude_overage")
      .not("claude_7d_util", "is", null).gte("at", new Date(Date.now() - Math.max(days, 7) * 864e5).toISOString()).order("at").range(a, b)).catch(() => []),
    all((a, b) => sb.from("avatar_generations").select("id, client_id, kind, status, seconds, credits_before, credits_after, is_redo, requested_name, created_at, finished_at, error")
      .gte("created_at", since).order("id").range(a, b)).catch(() => []),
    // все видео HeyGen (CRM + веб) с 1 октября 2026 — для таблицы «по клиентам за месяц»
    all((a, b) => sb.from("heygen_videos").select("id, title, created_at, duration, engine, client_id, match, source, credits_est, status")
      .gte("created_at", "2026-10-01").order("created_at").range(a, b)).catch(() => []),
  ]);

  // ответы ИИ по задаче: ролики, картинки, первое время ответа
  const byTask = new Map<number, { videos: number; images: number; files: number; first: string }>();
  for (const r of replies as any[]) {
    const atts = (r.attachments || []) as any[];
    const cur = byTask.get(r.reply_to) || { videos: 0, images: 0, files: 0, first: r.created_at };
    cur.videos += atts.filter(a => VIDEO.test(a?.name || a?.key || "")).length;
    cur.images += atts.filter(a => IMAGE.test(a?.name || a?.key || "")).length;
    cur.files += atts.length;
    if (r.created_at < cur.first) cur.first = r.created_at;
    byTask.set(r.reply_to, cur);
  }
  const cname = new Map((clients as any[]).map(c => [c.id, `${c.name} ${c.surname || ""}`.trim()]));
  const cavatar = new Map((clients as any[]).map(c => [c.id, c.avatar_url]));

  const rows = (tasks as any[]).map(t => {
    const r = byTask.get(t.id);
    // время работы: от исполнителя (точно) или от постановки до ответа (с ожиданием в очереди)
    const minutes = t.ai_status !== "done" ? null : t.ai_minutes != null ? Number(t.ai_minutes)
      : r ? Math.max(0, (Date.parse(r.first) - Date.parse(t.created_at)) / 60000) : null;
    return {
      id: t.id, client_id: t.client_id, client: cname.get(t.client_id) || `клиент ${t.client_id}`, avatar: cavatar.get(t.client_id) || null,
      who: t.author_name || "сотрудник", thread: t.thread || "reels", status: t.ai_status, error: t.ai_error,
      at: t.created_at, minutes: minutes != null ? Math.round(minutes * 10) / 10 : null,
      cost: t.ai_cost_usd != null ? Number(t.ai_cost_usd) : null,
      videos: r?.videos || 0, images: r?.images || 0, files: r?.files || 0,
      text: String(t.body || "").replace(/\s+/g, " ").slice(0, 600),
    };
  });

  const day = (iso: string) => new Date(new Date(iso).getTime()).toISOString().slice(0, 10);
  const group = <K extends string>(key: (r: typeof rows[number]) => K) => {
    const m = new Map<K, any>();
    for (const r of rows) {
      const k = key(r);
      const g = m.get(k) || { key: k, tasks: 0, done: 0, error: 0, working: 0, videos: 0, images: 0, minutes: 0, minN: 0, cost: 0, last: r.at, clients: new Set<number>(), people: new Set<string>() };
      g.tasks++; if (r.status === "done") g.done++; else if (r.status === "error") g.error++; else g.working++;
      g.videos += r.videos; g.images += r.images;
      if (r.minutes != null && r.status === "done") { g.minutes += r.minutes; g.minN++; }
      if (r.cost) g.cost += r.cost;
      if (r.at > g.last) g.last = r.at;
      g.clients.add(r.client_id); g.people.add(r.who);
      m.set(k, g);
    }
    return Array.from(m.values()).map(g => ({ ...g, avgMin: g.minN ? Math.round((g.minutes / g.minN) * 10) / 10 : null, cost: Math.round(g.cost * 100) / 100, clients: g.clients.size, people: g.people.size }));
  };

  const daysList: string[] = [];
  for (let i = days - 1; i >= 0; i--) daysList.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  const perDay = group(r => day(r.at));
  const dayMap = new Map(perDay.map(d => [d.key, d]));
  const timeline = daysList.map(d => ({ day: d, tasks: dayMap.get(d)?.tasks || 0, done: dayMap.get(d)?.done || 0, error: dayMap.get(d)?.error || 0, videos: dayMap.get(d)?.videos || 0 }));

  const tot = group(() => "all")[0] || { tasks: 0, done: 0, error: 0, working: 0, videos: 0, images: 0, avgMin: null, cost: 0, clients: 0, people: 0 };
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = dayMap.get(todayKey) || { tasks: 0, videos: 0, error: 0 };

  // сервер: последнее значение + по часу для графика
  const last = (status as any[]).at(-1) || null;
  const hourly = new Map<string, any>();
  for (const s of status as any[]) {
    const h = s.at.slice(0, 13);
    const cur = hourly.get(h) || { at: h, disk: 0, load: 0, run: 0, n: 0 };
    cur.disk = Math.max(cur.disk, Number(s.disk_used_gb) || 0); cur.load = Math.max(cur.load, Number(s.load1) || 0); cur.run = Math.max(cur.run, Number(s.running) || 0); cur.n++;
    hourly.set(h, cur);
  }
  const quickBy: Record<string, number> = {};
  for (const q of quick as any[]) quickBy[q.kind] = (quickBy[q.kind] || 0) + 1;

  // HeyGen: кредиты по клиентам и сотрудникам (только для владельца; сотрудники кредитов не видят)
  const spent = (g: any) => (g.credits_before != null && g.credits_after != null ? Math.max(0, Number(g.credits_before) - Number(g.credits_after)) : 0);
  const hgAgg = (key: (g: any) => string) => {
    const m = new Map<string, any>();
    for (const g of gens as any[]) {
      const k = key(g);
      const a = m.get(k) || { key: k, credits: 0, voices: 0, videos: 0, redos: 0, errors: 0, seconds: 0, last: g.created_at };
      if (g.status === "error") a.errors++;
      else { if (g.kind === "voice") a.voices++; if (g.kind === "video") a.videos++; if (g.is_redo) a.redos++; a.seconds += Number(g.seconds) || 0; }
      a.credits += spent(g);
      if (g.created_at > a.last) a.last = g.created_at;
      m.set(k, a);
    }
    return Array.from(m.values()).map(a => ({ ...a, credits: Math.round(a.credits * 10) / 10, seconds: Math.round(a.seconds) })).sort((x, y) => y.credits - x.credits || (y.voices + y.videos) - (x.voices + x.videos));
  };
  const withBalance = (gens as any[]).filter(g => g.credits_after != null).sort((a, b) => String(b.finished_at || b.created_at).localeCompare(String(a.finished_at || a.created_at)));
  const heygen = {
    total: hgAgg(() => "all")[0] || { credits: 0, voices: 0, videos: 0, redos: 0, errors: 0, seconds: 0 },
    remaining: withBalance[0] ? Number(withBalance[0].credits_after) : null, remainingAt: withBalance[0]?.finished_at || null,
    clients: hgAgg(g => String(g.client_id)).map(a => ({ ...a, name: cname.get(Number(a.key)) || `клиент ${a.key}`, avatar: cavatar.get(Number(a.key)) || null })),
    people: hgAgg(g => g.requested_name || "сотрудник"),
  };

  // Подписка Claude: загрузка 5-часового окна и недели, прогноз к сбросу недели, расход по ценам API
  const lim = limitRows as any[];
  const L = lim.at(-1) || null;
  const WEEK = 7 * 864e5;
  let weekForecast: number | null = null;
  if (L?.claude_7d_reset && L.claude_7d_util != null) {
    const elapsed = 1 - (Date.parse(L.claude_7d_reset) - Date.parse(L.at)) / WEEK;   // доля недели, что уже прошла
    if (elapsed > 0.05) weekForecast = Math.round((Number(L.claude_7d_util) / elapsed) * 100);
  }
  const limHourly = new Map<string, { at: string; h5: number; d7: number }>();
  for (const r of lim) {
    const h = String(r.at).slice(0, 13);
    const cur = limHourly.get(h) || { at: h, h5: 0, d7: 0 };
    cur.h5 = Math.max(cur.h5, Math.round(Number(r.claude_5h_util || 0) * 100)); cur.d7 = Math.max(cur.d7, Math.round(Number(r.claude_7d_util || 0) * 100));
    limHourly.set(h, cur);
  }
  const costSince = (ms: number) => Math.round((rows as any[]).filter(r => Date.parse(r.at) >= Date.now() - ms).reduce((x, r) => x + (r.cost || 0), 0));
  const claude = {
    last: L ? { at: L.at, h5: L.claude_5h_util != null ? Math.round(Number(L.claude_5h_util) * 100) : null, h5Reset: L.claude_5h_reset,
      d7: Math.round(Number(L.claude_7d_util) * 100), d7Reset: L.claude_7d_reset, status: L.claude_status, overage: L.claude_overage } : null,
    weekForecast, hourly: Array.from(limHourly.values()),
    cost: { day: costSince(864e5), week: costSince(WEEK), perDay: Math.round((rows as any[]).reduce((x, r) => x + (r.cost || 0), 0) / days) },
  };

  // «Все видео HeyGen» по месяцам: клиент → видео/секунды/кредиты, отдельно сделанные в CRM и в вебе HeyGen
  const hv = (hvids as any[]).filter(v => v.status !== "failed");
  const months = Array.from(new Set(hv.map(v => String(v.created_at).slice(0, 7)))).sort().reverse();
  const byMonth: Record<string, any> = {};
  for (const ym of months) {
    const rowsM = hv.filter(v => String(v.created_at).startsWith(ym));
    const m = new Map<string, any>();
    for (const v of rowsM) {
      const k = v.client_id ? String(v.client_id) : "none";
      const a = m.get(k) || { key: k, name: v.client_id ? cname.get(v.client_id) || `клиент ${v.client_id}` : "Не распознано", avatar: v.client_id ? cavatar.get(v.client_id) || null : null,
        videos: 0, crm: 0, web: 0, seconds: 0, credits: 0, engines: {} as Record<string, number> };
      a.videos++; v.source === "crm" ? a.crm++ : a.web++;
      a.seconds += Number(v.duration) || 0; a.credits += Number(v.credits_est) || 0;
      const e = v.engine || "?"; a.engines[e] = (a.engines[e] || 0) + 1;
      m.set(k, a);
    }
    const list = Array.from(m.values()).map(a => ({ ...a, seconds: Math.round(a.seconds), credits: Math.round(a.credits) })).sort((x, y) => (x.key === "none" ? 1 : 0) - (y.key === "none" ? 1 : 0) || y.credits - x.credits);
    byMonth[ym] = {
      clients: list,
      total: { videos: rowsM.length, crm: rowsM.filter(v => v.source === "crm").length, seconds: Math.round(rowsM.reduce((s, v) => s + (Number(v.duration) || 0), 0)), credits: Math.round(rowsM.reduce((s, v) => s + (Number(v.credits_est) || 0), 0)) },
      unmatched: rowsM.filter(v => !v.client_id).map(v => ({ id: v.id, title: v.title, at: v.created_at, seconds: Math.round(Number(v.duration) || 0) })),
    };
  }
  const heygenAll = { months, byMonth, clientsList: (clients as any[]).map(c => ({ id: c.id, name: cname.get(c.id) })) };

  return NextResponse.json({
    days, total: tot, today, heygen, claude, heygenAll,
    timeline,
    people: group(r => r.who).sort((a, b) => b.tasks - a.tasks),
    clients: group(r => String(r.client_id) as string).map(g => ({ ...g, name: cname.get(Number(g.key)) || g.key, avatar: cavatar.get(Number(g.key)) || null })).sort((a, b) => b.tasks - a.tasks),
    threads: group(r => r.thread),
    errors: rows.filter(r => r.status === "error").slice(-15).reverse(),
    recent: rows.slice(-40).reverse(),
    rows: rows.slice().reverse(),   // все задачи периода — фильтры по сотруднику / клиенту / дню считаются на странице
    server: { last, online: last ? Date.now() - Date.parse(last.at) < 15 * 60000 : false, hourly: Array.from(hourly.values()) },
    quick: { total: (quick as any[]).length, byKind: quickBy },
  });
}
