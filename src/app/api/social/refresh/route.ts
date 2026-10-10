import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase-admin";
import { handleOf, type Plat } from "@/lib/socialHandles";
import { vmxMcp, vmxMyAccounts, vmxAvatarUrl } from "@/lib/viralmaxing";
import { requireUserOrCron } from "@/lib/apiGuard";

/* ============================================================
   Соц-статистика клиентов → social_snapshots.
   Источник 1 (основной): Viralmaxing REST — аккаунт, отслеживаемый в
   Viralmaxing, матчится по хэндлу из ссылки в карточке клиента.
     followers      = followersCount (текущее)
     reach_30d      = сумма просмотров роликов за 30 дней
     engagement_rate = (лайки+комменты+шеры+сохранения)/просмотры ×100
     + история подписчиков (metricsHistory) пишется задним числом,
       чтобы «рост за 30 дней» появился сразу.
   Источник 2: Metricool — официальные данные подключённых аккаунтов (просмотры, подписчики);
   без ключа Viralmaxing — основной. Только для клиентов с привязанным брендом.
   GET ?dry=1 — посчитать, не писать. Ответ содержит unmatched —
   кого стоит добавить в отслеживание Viralmaxing.
   ============================================================ */

export const maxDuration = 300; // ~12 брендов × 3 сети × 2 запроса к Metricool
const VMX = "https://api.viralmaxing.com/api";
const MC = "https://app.metricool.com/api";
const VM_PLAT: Record<string, Plat> = { instagram: "ig", tiktok: "tt", youtube: "yt" };
const MC_NET: Record<Plat, string> = { ig: "INSTAGRAM", tt: "TIKTOK", yt: "YOUTUBE" };

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const int = (v: any) => (v == null || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v)));


export async function GET(req: Request) {
  const denied = await requireUserOrCron(req); if (denied) return denied;
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const debug = url.searchParams.get("debug") === "1";
  const vmxKey = process.env.VIRALMAXING_API_KEY;
  const mcUser = process.env.METRICOOL_USER_ID, mcToken = process.env.METRICOOL_TOKEN;
  if (!vmxKey && !(mcUser && mcToken)) return NextResponse.json({ error: "Не задан ни VIRALMAXING_API_KEY, ни METRICOOL_*" }, { status: 400 });

  const sb = createAdmin();
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

  /* ---------- Metricool: официальные данные подключённых аккаунтов (основной источник без Viralmaxing) ----------
     Instagram: просмотры = сумма views рилсов и постов, вышедших за 30 дней; подписчики = ряд followers.
     TikTok:    просмотры = сумма viewCount видео за 30 дней; подписчики = followers_count.
     YouTube:   просмотры = дневные просмотры канала за 30 дней; подписчики = totalSubscribers.
     Берём только сети, реально подключённые к бренду; если у клиента задан список platforms — только их
     (один бренд на две карточки клиента, как у Панченко). История подписчиков пишется задним числом. */
  const followerHistory: { client_id: number; platform: Plat; snapshot_date: string; followers: number }[] = [];
  if (mcUser && mcToken) {
    const auth = `userToken=${encodeURIComponent(mcToken)}&userId=${encodeURIComponent(mcUser)}`;
    const headers = { "X-Mc-Auth": mcToken };
    const mcGet = async (path: string) => {
      const r = await fetch(`${MC}${path}${path.includes("?") ? "&" : "?"}${auth}`, { headers, cache: "no-store" });
      if (!r.ok) throw new Error(`Metricool ${r.status} ${path.split("?")[0]}`);
      return await r.json();
    };
    const listOf = (j: any): any[] => (Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []);
    const series = (j: any): { d: string; v: number }[] => {
      const vals: any[] = Array.isArray(j?.data?.[0]?.values) ? j.data[0].values : [];
      return vals.map(x => ({ d: String(x.dateTime || "").slice(0, 10), v: Number(x.value) })).filter(x => x.d && !isNaN(x.v)).sort((a, b) => (a.d < b.d ? -1 : 1));
    };
    const sum = (arr: any[], key: string) => arr.reduce((s, x) => s + (Number(x?.[key]) || 0), 0);

    // какие сети реально подключены к каждому бренду
    const brandNets = new Map<string, Set<Plat>>();
    try {
      for (const b of listOf(await mcGet(`/admin/simpleProfiles`))) {
        const nets = new Set<Plat>();
        if (b.instagram) nets.add("ig");
        if (b.tiktok) nets.add("tt");
        if (b.youtube || b.youtubeChannelName) nets.add("yt");
        brandNets.set(String(b.blogId ?? b.id), nets);
      }
    } catch (e: any) { errors.push({ stage: "metricool brands", error: String(e?.message || e) }); }

    for (const c of clients) {
      if (!c.metricool_blog_id) continue;
      const blogId = c.metricool_blog_id;
      const connected = brandNets.get(String(blogId));
      if (!connected) { errors.push({ client_id: c.id, client: c.name, error: `бренда ${blogId} нет в Metricool — привяжите заново` }); continue; }
      const wanted = ((c.platforms || []) as string[]).filter(p => MC_NET[p as Plat]) as Plat[];
      const plats = (wanted.length ? wanted : (["ig", "tt", "yt"] as Plat[])).filter(p => connected.has(p));
      const range = `from=${ymd(from30)}T00:00:00&to=${snapDate}T23:59:59&blogId=${blogId}`;
      for (const p of plats) {
        if (covered.has(`${c.id}:${p}`)) continue;
        try {
          let followers: number | null = null, views: number | null = null, er: number | null = null, hist: { d: string; v: number }[] = [];
          if (p === "ig") {
            const items = [...listOf(await mcGet(`/v2/analytics/reels/instagram?${range}`)), ...listOf(await mcGet(`/v2/analytics/posts/instagram?${range}`))];
            views = items.length ? sum(items, "views") : 0;
            const inter = sum(items, "interactions");
            er = views ? Math.round((inter / views) * 10000) / 100 : null;
            hist = series(await mcGet(`/v2/analytics/timelines?network=instagram&subject=account&metric=followers&${range}`));
          } else if (p === "tt") {
            const vids = listOf(await mcGet(`/v2/analytics/posts/tiktok?${range}`));
            views = vids.length ? sum(vids, "viewCount") : 0;
            const inter = sum(vids, "likeCount") + sum(vids, "commentCount") + sum(vids, "shareCount");
            er = views ? Math.round((inter / views) * 10000) / 100 : null;
            hist = series(await mcGet(`/v2/analytics/timelines?network=tiktok&subject=account&metric=followers_count&${range}`));
          } else {
            views = series(await mcGet(`/v2/analytics/timelines?network=youtube&subject=account&metric=views&scope=all&${range}`)).reduce((s, x) => s + x.v, 0);
            hist = series(await mcGet(`/v2/analytics/timelines?network=youtube&subject=account&metric=totalSubscribers&${range}`));
          }
          hist = hist.filter(x => x.v > 0);
          if (hist.length) {
            followers = Math.round(hist[hist.length - 1].v);
            for (const h of hist) if (h.d < snapDate) followerHistory.push({ client_id: c.id, platform: p, snapshot_date: h.d, followers: Math.round(h.v) });
          }
          if (followers == null && !views) continue; // Metricool пуст — не затираем прошлые цифры
          rowsOut.push({ client_id: c.id, client: c.name, platform: p, snapshot_date: snapDate, followers, reach_30d: views, engagement_rate: er, source: "metricool" });
          covered.add(`${c.id}:${p}`);
        } catch (e: any) { errors.push({ client_id: c.id, client: c.name, platform: p, error: String(e?.message || e) }); }
      }
    }
    // клиенты вне Metricool и вне Viralmaxing — чтобы было видно, кого подключить
    for (const c of clients) {
      if (c.stage !== "active") continue;
      if (!c.metricool_blog_id && !["ig", "tt", "yt"].some(p => covered.has(`${c.id}:${p}`))) unmatched.push({ client_id: c.id, client: c.name, note: "нет бренда Metricool" });
    }
  }

  if (dry) return NextResponse.json({ ok: true, dry: true, rows: rowsOut, history: followerHistory.length, avatars: Array.from(avatarFor.entries()), unmatched, noHandle, errors });

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
  let history = 0;
  for (let i = 0; i < followerHistory.length; i += 200) {
    const { error } = await sb.from("social_snapshots").upsert(followerHistory.slice(i, i + 200), { onConflict: "client_id,platform,snapshot_date" });
    if (error) errors.push({ stage: "история подписчиков", error: error.message }); else history += Math.min(200, followerHistory.length - i);
  }
  return NextResponse.json({
    ok: true, written, history, avatarsSet, snapDate,
    viralmaxing: rowsOut.filter(r => r.source === "viralmaxing").map(r => ({ client: r.client, platform: r.platform, followers: r.followers, views30: r.reach_30d, er: r.engagement_rate, posts: r.posts })),
    metricool: rowsOut.filter(r => r.source === "metricool").map(r => ({ client: r.client, platform: r.platform, followers: r.followers, views30: r.reach_30d, er: r.engagement_rate })),
    unmatched, noHandle, errors,
  });
}
