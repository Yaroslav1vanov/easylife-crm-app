import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { handleOf, type Plat } from "@/lib/socialHandles";
import { vmxMcp, vmxMyAccounts, vmxAvatarUrl } from "@/lib/viralmaxing";

/* ============================================================
   Соц-статистика клиентов → social_snapshots.
   Источник 1 (основной): Viralmaxing REST — аккаунт, отслеживаемый в
   Viralmaxing, матчится по хэндлу из ссылки в карточке клиента.
     followers      = followersCount (текущее)
     reach_30d      = сумма просмотров роликов за 30 дней
     engagement_rate = (лайки+комменты+шеры+сохранения)/просмотры ×100
     + история подписчиков (metricsHistory) пишется задним числом,
       чтобы «рост за 30 дней» появился сразу.
   Источник 2 (запасной): Metricool — только для платформ, которых
   в Viralmaxing нет, и только если у клиента привязан бренд.
   GET ?dry=1 — посчитать, не писать. Ответ содержит unmatched —
   кого стоит добавить в отслеживание Viralmaxing.
   ============================================================ */

export const maxDuration = 60;
const VMX = "https://api.viralmaxing.com/api";
const MC = "https://app.metricool.com/api";
const VM_PLAT: Record<string, Plat> = { instagram: "ig", tiktok: "tt", youtube: "yt" };
const MC_NET: Record<Plat, string> = { ig: "INSTAGRAM", tt: "TIKTOK", yt: "YOUTUBE" };

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const int = (v: any) => (v == null || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v)));


export async function GET(req: Request) {
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const debug = url.searchParams.get("debug") === "1";
  const vmxKey = process.env.VIRALMAXING_API_KEY;
  const mcUser = process.env.METRICOOL_USER_ID, mcToken = process.env.METRICOOL_TOKEN;
  if (!vmxKey && !(mcUser && mcToken)) return NextResponse.json({ error: "Не задан ни VIRALMAXING_API_KEY, ни METRICOOL_*" }, { status: 400 });

  const sb = createClient();
  const { data: clients } = await sb.from("clients")
    .select("id, name, surname, stage, platforms, instagram, tiktok, youtube, metricool_blog_id, avatar_url")
    .neq("stage", "churned");
  if (!clients?.length) return NextResponse.json({ ok: true, written: 0, note: "нет клиентов" });

  const today = new Date();
  const snapDate = ymd(today);
  const from30 = new Date(today.getTime() - 30 * 864e5);
  const rowsOut: any[] = [];       // что пишем
  const covered = new Set<string>(); // `${clientId}:${plat}` уже покрыто Viralmaxing
  const unmatched: any[] = [];     // есть хэндл, но в Viralmaxing не отслеживается
  const noHandle: any[] = [];      // ссылки нет — нечего искать
  const errors: any[] = [];
  const avatarFor = new Map<number, string>(); // clientId → url аватарки из Viralmaxing

  /* ---------- Viralmaxing (через MCP-эндпоинт с API-ключом: REST не отдаёт «свои» аккаунты) ---------- */
  if (vmxKey) {
    const mcpCall = (name: string, args: Record<string, any>) => vmxMcp(vmxKey, name, args);
    const parseCsv = (txt: string): string[][] => {
      const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
      for (let i = 0; i < txt.length; i++) {
        const ch = txt[i];
        if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
        else if (ch === '"') q = true;
        else if (ch === ",") { row.push(cell); cell = ""; }
        else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
        else cell += ch;
      }
      if (cell.length || row.length) { row.push(cell); rows.push(row); }
      return rows.filter(r => r.length > 1);
    };
    try {
      // 1) свои аккаунты
      const accounts = await vmxMyAccounts(vmxKey);
      if (debug) return NextResponse.json({ debug: true, accounts });
      const byKey = new Map(accounts.map(a => [`${a.plat}:${a.handle}`, a]));

      for (const c of clients) {
        for (const p of ["ig", "tt", "yt"] as Plat[]) {
          const raw = p === "ig" ? c.instagram : p === "tt" ? c.tiktok : c.youtube;
          const h = handleOf(raw, p);
          if (!h) { if (p === "ig") noHandle.push({ client_id: c.id, client: c.name }); continue; }
          const acc = byKey.get(`${p}:${h}`);
          if (!acc) { unmatched.push({ client_id: c.id, client: c.name, platform: p, handle: h, url: p === "ig" ? `https://www.instagram.com/${h}/` : p === "tt" ? `https://www.tiktok.com/@${h}` : `https://www.youtube.com/@${h}` }); continue; }
          try {
            // 2) ролики за 30 дней — CSV с точными цифрами
            const csvText = await mcpCall("export_posts", { account_id: acc.id, period: "30d", scope: "my", limit: 500, sort: "date" });
            const m = csvText.match(/```csv\s*([\s\S]*?)```/);
            const rows = parseCsv(m ? m[1].trim() : "");
            const head = rows[0] || [];
            const col = (name: string) => head.findIndex(x => x.trim().toLowerCase() === name.toLowerCase());
            const iF = col("Подписчики"), iL = col("Лайки"), iC = col("Комментарии"), iV = col("Просмотры"), iS = col("Репосты"), iAcc = col("Аккаунт");
            let views = 0, inter = 0, posts = 0, followers: number | null = null, hasViews = false;
            for (const r of rows.slice(1)) {
              if (iAcc >= 0 && r[iAcc] && r[iAcc].replace(/^@/, "").toLowerCase() !== acc.handle) continue;
              posts++;
              const v = iV >= 0 ? int(r[iV]) : null; if (v != null) { views += v; hasViews = true; }
              inter += (iL >= 0 ? int(r[iL]) || 0 : 0) + (iC >= 0 ? int(r[iC]) || 0 : 0) + (iS >= 0 ? int(r[iS]) || 0 : 0);
              if (followers == null && iF >= 0) followers = int(r[iF]);
            }
            if (followers == null) followers = acc.followersApprox;
            const er = hasViews && views > 0 ? Math.round((inter / views) * 10000) / 100 : null;
            rowsOut.push({ client_id: c.id, client: c.name, platform: p, snapshot_date: snapDate, followers, reach_30d: hasViews ? views : null, engagement_rate: er, source: "viralmaxing", posts, vm_account_id: acc.id });
            covered.add(`${c.id}:${p}`);
            // аватарка клиента пустая → берём с CDN Viralmaxing (IG приоритетнее)
            if (!c.avatar_url && (p === "ig" || !avatarFor.has(c.id))) avatarFor.set(c.id, vmxAvatarUrl(acc.id));
          } catch (e: any) { errors.push({ client_id: c.id, platform: p, error: String(e?.message || e) }); }
        }
      }
    } catch (e: any) { errors.push({ stage: "viralmaxing", error: String(e?.message || e) }); }
  }

  /* ---------- Metricool (запасной) ---------- */
  if (mcUser && mcToken) {
    const auth = `userToken=${encodeURIComponent(mcToken)}&userId=${encodeURIComponent(mcUser)}`;
    const headers = { "X-Mc-Auth": mcToken };
    const mcGet = async (path: string) => {
      try { const r = await fetch(`${MC}${path}${path.includes("?") ? "&" : "?"}${auth}`, { headers, cache: "no-store" }); if (!r.ok) return null; return await r.json().catch(() => null); } catch { return null; }
    };
    const ci = (o: any, ...keys: string[]) => { if (!o || typeof o !== "object") return null; const low: Record<string, any> = {}; for (const k of Object.keys(o)) low[k.toLowerCase()] = o[k]; for (const k of keys) { const v = low[k.toLowerCase()]; if (v != null && v !== "") return v; } return null; };
    const listOf = (j: any): any[] => (Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []);
    const sumField = (arr: any[], ...keys: string[]) => { let s = 0, has = false; for (const it of arr) { const v = ci(it, ...keys); if (v != null) { s += Number(v) || 0; has = true; } } return has ? Math.round(s) : null; };
    const compact = (d: Date) => ymd(d).replace(/-/g, "");
    const range = `from=${ymd(from30)}T00:00:00&to=${snapDate}T23:59:59&timezone=Europe/Kyiv`;

    for (const c of clients) {
      if (!c.metricool_blog_id) continue;
      const blogId = c.metricool_blog_id;
      const plats = ((c.platforms || []) as string[]).filter(p => MC_NET[p as Plat]) as Plat[];
      for (const p of plats) {
        if (covered.has(`${c.id}:${p}`)) continue;
        try {
          let followers: number | null = null, reach: number | null = null, er: number | null = null;
          if (p === "ig") {
            const v = await mcGet(`/stats/values/INSTAGRAM?start=${compact(from30)}&end=${compact(today)}&blogId=${blogId}`);
            followers = int(ci(v, "Followers", "followers"));
            if (followers == null) {
              const tl = listOf(await mcGet(`/stats/timeline/Followers?start=${compact(from30)}&end=${compact(today)}&blogId=${blogId}`));
              const last = tl[tl.length - 1];
              const val = last ? (Array.isArray(last) ? Number(last[1]) : Number(ci(last, "value", "followers", "Followers", "y"))) : NaN;
              followers = isNaN(val) || val === 0 ? null : Math.round(val);
            }
            const all = [...listOf(await mcGet(`/v2/analytics/posts/instagram?${range}&blogId=${blogId}`)), ...listOf(await mcGet(`/v2/analytics/reels/instagram?${range}&blogId=${blogId}`))];
            reach = sumField(all, "reach");
            const inter = sumField(all, "interactions");
            er = reach && inter != null ? Math.round((inter / reach) * 10000) / 100 : null;
          } else if (p === "tt") {
            reach = sumField(listOf(await mcGet(`/v2/analytics/posts/tiktok?${range}&blogId=${blogId}`)), "viewCount", "views");
          } else {
            reach = sumField(listOf(await mcGet(`/stats/youtube/videos?start=${compact(from30)}&end=${compact(today)}&blogId=${blogId}`)), "views", "viewCount");
          }
          if (followers == null && reach == null) continue; // Metricool пуст — не затираем
          rowsOut.push({ client_id: c.id, client: c.name, platform: p, snapshot_date: snapDate, followers, reach_30d: reach, engagement_rate: er, source: "metricool" });
        } catch (e: any) { errors.push({ client_id: c.id, platform: p, error: String(e?.message || e) }); }
      }
    }
  }

  if (dry) return NextResponse.json({ ok: true, dry: true, rows: rowsOut, avatars: Array.from(avatarFor.entries()), unmatched, noHandle, errors });

  let avatarsSet = 0;
  for (const [cid, url2] of Array.from(avatarFor.entries())) { const { error } = await sb.from("clients").update({ avatar_url: url2 }).eq("id", cid); if (!error) avatarsSet++; }
  let written = 0;
  for (const row of rowsOut) {
    const { error } = await sb.from("social_snapshots").upsert(
      { client_id: row.client_id, platform: row.platform, snapshot_date: row.snapshot_date, followers: row.followers, reach_30d: row.reach_30d, engagement_rate: row.engagement_rate },
      { onConflict: "client_id,platform,snapshot_date" },
    );
    if (error) errors.push({ client_id: row.client_id, platform: row.platform, error: error.message }); else written++;
  }
  return NextResponse.json({
    ok: true, written, avatarsSet, snapDate,
    viralmaxing: rowsOut.filter(r => r.source === "viralmaxing").map(r => ({ client: r.client, platform: r.platform, followers: r.followers, views30: r.reach_30d, er: r.engagement_rate, posts: r.posts })),
    metricool: rowsOut.filter(r => r.source === "metricool").map(r => ({ client: r.client, platform: r.platform, followers: r.followers, reach30: r.reach_30d })),
    unmatched, noHandle, errors,
  });
}
