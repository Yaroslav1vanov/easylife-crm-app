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

  const [tasks, replies, clients, status, quick, gens] = await Promise.all([
    all((a, b) => sb.from("client_chat_messages")
      .select("id, client_id, author_id, author_name, thread, ai_status, ai_error, created_at, ai_started_at, ai_finished_at, ai_minutes, ai_cost_usd, ai_files, body")
      .eq("author_type", "user").not("ai_status", "is", null).gte("created_at", since).order("id").range(a, b)),
    all((a, b) => sb.from("client_chat_messages").select("reply_to, attachments, created_at")
      .eq("author_type", "ai").not("reply_to", "is", null).gte("created_at", since).order("id").range(a, b)),
    sb.from("clients").select("id, name, surname, avatar_url").then(r => r.data || []),
    sb.from("server_status").select("at, disk_used_gb, disk_total_gb, load1, cpus, mem_used_mb, mem_total_mb, running")
      .gte("at", new Date(Date.now() - Math.max(days, 7) * 864e5).toISOString()).order("at").limit(20000).then(r => r.data || []),
    all((a, b) => sb.from("ai_jobs").select("kind, status, created_at").gte("created_at", since).order("id").range(a, b)).catch(() => []),
    all((a, b) => sb.from("avatar_generations").select("id, client_id, kind, status, seconds, credits_before, credits_after, is_redo, requested_name, created_at, finished_at, error")
      .gte("created_at", since).order("id").range(a, b)).catch(() => []),
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

  return NextResponse.json({
    days, total: tot, today, heygen,
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
