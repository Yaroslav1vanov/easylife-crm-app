import type { SupabaseClient } from "@supabase/supabase-js";

/* ChatPlace: у сервиса нет REST, только MCP (JSON-RPC по HTTP). Ключ — CHATPLACE_API_KEY (cpk_…),
   один на весь проект ChatPlace, поэтому каждый вызов здесь ограничен ботом из карточки клиента
   (clients.chatplace_bot_id) и только ЧИТАЮЩИМИ инструментами. Лимит сервиса — 60 запросов в минуту. */

const CP = "https://mcp.chatplace.io/mcp";
const READ_ONLY = new Set(["virale_own_insights", "automations_list_with_stats"]);
let rpcId = 1;

async function cpCall(name: string, args: Record<string, any>): Promise<any> {
  const key = process.env.CHATPLACE_API_KEY;
  if (!key) throw new Error("CHATPLACE_API_KEY не задан");
  if (!READ_ONLY.has(name)) throw new Error(`ChatPlace: ${name} не разрешён`);
  const r = await fetch(CP, {
    method: "POST", cache: "no-store",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`ChatPlace ${r.status} ${name}: ${text.slice(0, 200)}`);
  let j: any = null;
  try { j = JSON.parse(text); } catch {
    const lines = text.split("\n").filter(l => l.startsWith("data:"));
    try { j = JSON.parse(lines[lines.length - 1].slice(5)); } catch { throw new Error(`ChatPlace: нечитаемый ответ ${name}`); }
  }
  if (j?.error) throw new Error(`ChatPlace ${name}: ${j.error.message || JSON.stringify(j.error)}`);
  const out = (j?.result?.content || []).filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n");
  if (j?.result?.isError) throw new Error(`ChatPlace ${name}: ${out.slice(0, 200)}`);
  try { return JSON.parse(out); } catch { return out; }
}

export type CpVideo = {
  id: string; url: string | null; caption: string; date: string | null; type: string;
  views: number | null; reach: number | null; likes: number | null; comments: number | null;
  saves: number | null; shares: number | null; avg_watch_sec: number | null; skip_rate: number | null;
};
export type CpFunnel = { id: string; name: string; words: string[]; active: boolean; total: number; last_run: string | null };
export type CpSnapshot = { availability: string; reason: string | null; summary: any; videos: CpVideo[]; funnels: CpFunnel[] };

const n = (v: any) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

/** Статистика аккаунта, ролики за 90 дней и воронки — одним снимком. */
export async function cpFetchSnapshot(botId: string): Promise<CpSnapshot> {
  const ins = await cpCall("virale_own_insights", { botId, periodDays: 90, sortBy: "recent", limit: 30 });
  const s = ins?.summary || {};
  const items: any[] = ins?.videos?.items || [];
  const videos: CpVideo[] = items.map(v => ({
    id: String(v.id), url: v.url || null,
    caption: String(v.caption || "").replace(/\s+/g, " ").slice(0, 600),
    date: typeof v.publishedAt === "string" ? v.publishedAt.slice(0, 10) : null,
    type: v.mediaType || "reels",
    views: n(v.metrics?.views), reach: n(v.metrics?.reach), likes: n(v.metrics?.likes), comments: n(v.metrics?.comments),
    saves: n(v.metrics?.saves), shares: n(v.metrics?.shares),
    avg_watch_sec: n(v.metrics?.avgWatchTimeSec), skip_rate: n(v.metrics?.skipRate),
  }));
  let funnels: CpFunnel[] = [];
  try {
    const list = await cpCall("automations_list_with_stats", { botId });
    funnels = (Array.isArray(list) ? list : []).filter((a: any) => a.botId === botId).map((a: any) => ({
      id: a.id, name: a.name, words: a.startMessages || [], active: a.status === 2,
      total: n(a.totalClients) || 0, last_run: a.lastRunAt || null,
    }));
  } catch { /* воронки — не главное, статистика важнее */ }
  return {
    availability: s.availability || ins?.videos?.availability || "unavailable",
    reason: s.reason || null,
    summary: s.availability === "available" ? { periodDays: s.periodDays, dataThrough: s.dataThrough, metrics: s.metrics, breakdowns: s.breakdowns } : null,
    videos, funnels,
  };
}

/** Снимок в базу (client_chatplace_insights) + подписчики в social_snapshots, как у остальных источников. */
export async function cpSyncClient(sb: SupabaseClient, client: { id: number; chatplace_bot_id: string | null }): Promise<CpSnapshot | null> {
  if (!client.chatplace_bot_id || !process.env.CHATPLACE_API_KEY) return null;
  const snap = await cpFetchSnapshot(client.chatplace_bot_id);
  const day = new Date().toISOString().slice(0, 10);
  const { error } = await sb.from("client_chatplace_insights").upsert({
    client_id: client.id, day, bot_id: client.chatplace_bot_id, availability: snap.availability,
    summary: snap.summary, videos: snap.videos, funnels: snap.funnels, updated_at: new Date().toISOString(),
  }, { onConflict: "client_id,day" });
  if (error) throw new Error(`client_chatplace_insights: ${error.message}`);
  const m = snap.summary?.metrics;
  if (m && n(m.followers)) {
    const views = n(m.views), inter = n(m.totalInteractions);
    await sb.from("social_snapshots").upsert({
      client_id: client.id, platform: "ig", snapshot_date: day, followers: n(m.followers),
      reach_30d: views, engagement_rate: views && inter != null ? Math.round((inter / views) * 10000) / 100 : null,
    }, { onConflict: "client_id,platform,snapshot_date" });
  }
  return snap;
}
