import { createClient } from "@/lib/supabase-server";
import { inlineImage } from "@/lib/weeklyStats";

/* Отчёт клиенту за всё время работы: таблица по неделям + итоги + помесячная динамика.
   GET /api/clients/{id}/report-all?lang=ru|en&download=1 */
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m] as string));
const RU_M = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const RU_MON = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const sp = new URL(req.url).searchParams;
  const sb = createClient();
  const { data: c } = await sb.from("clients").select("id, name, surname, avatar_url, instagram, start_date").eq("id", id).maybeSingle();
  if (!c) return new Response("клиент не найден", { status: 404 });

  const { data: weeks } = await sb.from("client_weekly_stats").select("*").eq("client_id", id).order("week_start");
  const rows = (weeks || []) as any[];
  if (!rows.length)
    return new Response(`<!doctype html><meta charset="utf-8"><body style="background:#070526;color:#f3f2ff;font-family:system-ui;padding:40px;text-align:center"><h2 style="color:#b6f500">Недель пока нет</h2><p style="color:#7a78a3">Открой карточку клиента → «Статистика» → «Собрать за всё время».</p></body>`,
      { headers: { "content-type": "text/html; charset=utf-8" } });

  const avatar = await inlineImage(c.avatar_url, 400_000);
  const n = (v: number | null | undefined) => {
    if (v == null) return "—";
    if (v >= 1_000_000) return (v / 1e6).toFixed(1).replace(".", ",").replace(",0", "") + " млн";
    if (v >= 10_000) return Math.round(v / 1000) + " тыс";
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };
  const dd = (a: string, b: string) => `${+a.slice(8, 10)}–${+b.slice(8, 10)} ${RU_M[+b.slice(5, 7) - 1].slice(0, 3)}`;
  const t = rows.reduce((a, r) => ({
    reels: a.reels + (r.reels_count || 0), views: a.views + (r.views || 0), reach: a.reach + (r.reach || 0),
    likes: a.likes + (r.likes || 0), comments: a.comments + (r.comments || 0),
    saves: a.saves + (r.saves || 0), shares: a.shares + (r.shares || 0),
    gained: a.gained + (r.followers_gained || 0), lost: a.lost + (r.followers_lost || 0),
  }), { reels: 0, views: 0, reach: 0, likes: 0, comments: 0, saves: 0, shares: 0, gained: 0, lost: 0 });
  const erAll = (t.reach || t.views) ? Math.round(((t.likes + t.comments + t.saves + t.shares) / (t.reach || t.views)) * 1000) / 10 : 0;
  const maxViews = Math.max(1, ...rows.map(r => r.views || 0));
  const followersNow = [...rows].reverse().find(r => r.followers_end)?.followers_end ?? null;

  // помесячно — сумма недель, у которых воскресенье попало в этот месяц
  const byMonth = new Map<string, any>();
  for (const r of rows) {
    const ym = r.week_end.slice(0, 7);
    const m = byMonth.get(ym) || { ym, reels: 0, views: 0, reach: 0, likes: 0, comments: 0, saves: 0, shares: 0, gained: 0, lost: 0 };
    m.reels += r.reels_count || 0; m.views += r.views || 0; m.reach += r.reach || 0; m.likes += r.likes || 0;
    m.comments += r.comments || 0; m.saves += r.saves || 0; m.shares += r.shares || 0;
    m.gained += r.followers_gained || 0; m.lost += r.followers_lost || 0;
    byMonth.set(ym, m);
  }
  const months = Array.from(byMonth.values());

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.name)} ${esc(c.surname || "")} · аналитика за всё время</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#070526;--card:#100c3d;--card2:#140f4a;--neon:#b6f500;--teal:#2ee6c8;--red:#ff5c7a;--muted:#8583ad;--muted2:#56547e;--white:#f3f2ff;--line:rgba(182,245,0,.14)}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--white);font-family:'Manrope',system-ui,sans-serif;font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(700px 500px at 8% -5%,rgba(182,245,0,.10),transparent 60%),radial-gradient(800px 600px at 96% 8%,rgba(46,230,200,.10),transparent 55%),radial-gradient(700px 700px at 50% 120%,rgba(125,80,255,.13),transparent 60%)}
.wrap{position:relative;max-width:1000px;margin:0 auto;padding:36px 22px 70px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:30px;flex-wrap:wrap}
.brand{font-weight:800;font-size:14px}.brand b{color:var(--neon)}
.pill{font-size:12px;color:var(--muted);border:1px solid var(--line);padding:6px 13px;border-radius:999px}
.client{display:flex;align-items:center;gap:14px;margin-bottom:16px}
.client img{width:54px;height:54px;border-radius:50%;object-fit:cover;border:2px solid var(--line)}
.client .nm{font-weight:800;font-size:17px}.client .hd{color:var(--muted);font-size:13px}
h1{font-family:'Unbounded',sans-serif;font-size:clamp(22px,4vw,34px);line-height:1.15;font-weight:800;margin-bottom:10px}
h1 span{color:var(--neon)}
h2{font-family:'Unbounded',sans-serif;font-size:18px;font-weight:700;margin:40px 0 14px}
.sub{color:#c9c7e6;font-size:15px;max-width:720px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-top:22px}
@media(max-width:720px){.grid{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:15px}
.kpi.big{grid-column:span 2;background:linear-gradient(135deg,rgba(182,245,0,.10),rgba(46,230,200,.07));border-color:rgba(182,245,0,.3)}
.kpi .l{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:7px}
.kpi .v{font-family:'Unbounded',sans-serif;font-size:23px;font-weight:800;line-height:1}
.kpi.big .v{font-size:34px;color:var(--neon)}
.kpi .d{font-size:12px;color:var(--muted);margin-top:7px}
.chart{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin-top:14px}
.bars{display:flex;align-items:flex-end;gap:4px;height:120px}
.bars i{flex:1;min-width:5px;border-radius:4px 4px 1px 1px;background:linear-gradient(180deg,var(--teal),#7b3fe4);display:block}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:16px;background:var(--card)}
table{width:100%;border-collapse:collapse;font-size:13.5px;min-width:760px}
th,td{padding:10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.06);white-space:nowrap}
th{color:var(--muted);font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em}
th:first-child,td:first-child{text-align:left}
tr:last-child td{border-bottom:0}
td.k{font-weight:700}
.up{color:var(--teal)}.down{color:var(--red)}
.foot{margin-top:40px;color:var(--muted2);font-size:12px;line-height:1.7}
@media print{body{background:#070526;-webkit-print-color-adjust:exact;print-color-adjust:exact}body::before{display:none}tr{break-inside:avoid}}
</style></head><body><div class="wrap">

<div class="top"><div class="brand">Easy<b>Life</b> AI</div><div class="pill">Аналитика за всё время · ${dd(rows[0].week_start, rows[0].week_end)} — ${dd(rows[rows.length - 1].week_start, rows[rows.length - 1].week_end)}</div></div>
<div class="client">${avatar ? `<img src="${avatar}" alt="">` : ""}<div><div class="nm">${esc(c.name)} ${esc(c.surname || "")}</div><div class="hd">${esc(c.instagram || "")}</div></div></div>
<h1>За ${rows.length} недель работы — <span>${n(t.views)}</span> просмотров</h1>
<p class="sub">Все недели в одной таблице: сколько роликов вышло, сколько они собрали и как менялась аудитория. Неделя считается с понедельника по воскресенье.</p>

<div class="grid">
  <div class="kpi big"><div class="l">Просмотры</div><div class="v">${n(t.views)}</div><div class="d">за ${rows.length} недель · ${n(t.reels)} роликов</div></div>
  <div class="kpi"><div class="l">Охват</div><div class="v">${n(t.reach)}</div></div>
  <div class="kpi"><div class="l">Подписчики</div><div class="v">${followersNow ? n(followersNow) : "—"}</div><div class="d">+${n(t.gained - t.lost)} за всё время</div></div>
  <div class="kpi"><div class="l">Лайки</div><div class="v">${n(t.likes)}</div></div>
  <div class="kpi"><div class="l">Комментарии</div><div class="v">${n(t.comments)}</div></div>
  <div class="kpi"><div class="l">Сохранения</div><div class="v">${n(t.saves)}</div></div>
  <div class="kpi"><div class="l">Репосты</div><div class="v">${n(t.shares)}</div></div>
  <div class="kpi"><div class="l">Вовлечённость (ER)</div><div class="v">${String(erAll).replace(".", ",")}%</div><div class="d">реакции делить на охват</div></div>
</div>

<div class="chart"><div class="bars">${rows.map(r => `<i style="height:${Math.max(3, Math.round(((r.views || 0) / maxViews) * 110))}px" title="${dd(r.week_start, r.week_end)} · ${n(r.views)}"></i>`).join("")}</div>
<div style="font-size:11.5px;color:var(--muted);margin-top:9px">Просмотры по неделям</div></div>

<h2>По месяцам</h2>
<div class="tbl"><table>
<thead><tr><th>Месяц</th><th>Роликов</th><th>Просмотры</th><th>Охват</th><th>Лайки</th><th>Комм.</th><th>Сохр.</th><th>Репосты</th><th>Подписчики</th></tr></thead>
<tbody>${months.map((m, i) => {
  const p = months[i - 1];
  const d = p?.views ? Math.round(((m.views - p.views) / p.views) * 100) : null;
  return `<tr><td class="k">${RU_MON[+m.ym.slice(5, 7) - 1]} ${m.ym.slice(0, 4)}</td><td>${n(m.reels)}</td>
  <td class="k">${n(m.views)}${d != null ? ` <span class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : ""}${d}%</span>` : ""}</td>
  <td>${n(m.reach)}</td><td>${n(m.likes)}</td><td>${n(m.comments)}</td><td>${n(m.saves)}</td><td>${n(m.shares)}</td>
  <td>${m.gained - m.lost >= 0 ? "+" : ""}${n(m.gained - m.lost)}</td></tr>`;
}).join("")}</tbody></table></div>

<h2>По неделям</h2>
<div class="tbl"><table>
<thead><tr><th>Неделя</th><th>Роликов</th><th>Просмотры</th><th>Охват</th><th>Лайки</th><th>Комм.</th><th>Сохр.</th><th>Репосты</th><th>ER</th><th>Подписчики</th></tr></thead>
<tbody>${[...rows].reverse().map((r, i, arr) => {
  const p = arr[i + 1];
  const d = p?.views ? Math.round(((r.views - p.views) / p.views) * 100) : null;
  const net = (r.followers_gained || 0) - (r.followers_lost || 0);
  return `<tr><td class="k">${dd(r.week_start, r.week_end)}</td>
  <td>${n(r.reels_count)}</td>
  <td class="k">${n(r.views)}${d != null ? ` <span class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : ""}${d}%</span>` : ""}</td>
  <td>${n(r.reach)}</td><td>${n(r.likes)}</td><td>${n(r.comments)}</td><td>${n(r.saves)}</td><td>${n(r.shares)}</td>
  <td>${r.er != null ? String(r.er).replace(".", ",") + "%" : "—"}</td>
  <td>${r.followers_gained != null ? `${net >= 0 ? "+" : ""}${n(net)}` : "—"}</td></tr>`;
}).join("")}</tbody></table></div>

<p class="foot">Данные — Instagram и другие подключённые сети через Metricool. Неделя — с понедельника по воскресенье. ER — вовлечённость: лайки, комментарии, сохранения и репосты делим на охват. Прирост подписчиков — пришло минус ушло за период. Рекламные и не показанные в ленте ролики в статистику не входят.<br>EasyLife AI · easylifeai.biz</p>
</div></body></html>`;

  const fn = `${[c.name, c.surname].filter(Boolean).join(" ")} — аналитика за всё время.html`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(sp.get("download") ? { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fn)}` } : {}),
    },
  });
}
