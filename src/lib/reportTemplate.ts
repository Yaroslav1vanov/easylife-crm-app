// Сборка клиентского месячного отчёта (HTML) в неоновом дизайне EasyLife.
// Числа — из Metricool, выводы («что сработало / план») — AI-черновик.

type Row = {
  reels_count?: number; posts_count?: number; content_units?: number;
  reach?: number | null; impressions?: number | null; interactions?: number | null;
  engagement_rate?: number | null; followers_end?: number | null; followers_delta?: number | null;
};
type Args = {
  client: any; cur: Row; prev: Row | null;
  raw: { posts: any[]; reels: any[] };
  monthLabel: string; ym: string;
  narrative: { worked: string[]; plan: string[] };
};

const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m] as string));
const ru = (n: number | null | undefined) => n == null ? "—" : Math.round(n).toLocaleString("ru-RU");
const compact = (n: number | null | undefined) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 2).replace(".", ",").replace(/,00$/, "") + "М";
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(".", ",").replace(/,0$/, "") + "К";
  return String(Math.round(n));
};
const pct = (n: number | null | undefined) => n == null ? "—" : String(n).replace(".", ",") + "%";
const ci = (o: any, ...keys: string[]) => { for (const k of keys) { const v = o?.[k]; if (v != null) return v; } return null; };

function deltaPill(cur: number | null | undefined, prev: number | null | undefined): string {
  if (cur == null || prev == null || prev === 0) return "";
  const d = Math.round(((cur - prev) / prev) * 100);
  return `<span class="pill">${d >= 0 ? "+" : ""}${d}%</span>`;
}

function weeklyReach(items: any[]): { cap: string; reach: number }[] {
  const buckets: number[] = [0, 0, 0, 0, 0];
  for (const it of items) {
    const d = ci(it, "publishedAt", "publishedDate", "createTime", "pub_date");
    const reach = Number(ci(it, "reach") || 0);
    if (!d) continue;
    const day = new Date(d).getDate();
    const wk = Math.min(4, Math.floor((day - 1) / 7));
    buckets[wk] += reach;
  }
  const weeks = buckets.filter((_, i) => i < 4 || buckets[4] > 0);
  return weeks.map((r, i) => ({ cap: `Неделя ${i + 1}`, reach: r }));
}

function topPosts(items: any[]): { title: string; reach: number }[] {
  return [...items]
    .map(it => ({ title: String(ci(it, "content", "text", "title", "videoDescription") || "Публикация").replace(/\s+/g, " ").trim(), reach: Number(ci(it, "reach") || ci(it, "views") || 0) }))
    .filter(x => x.reach > 0)
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 3);
}

export function buildReportHtml(a: Args): string {
  const { client: c, cur, prev, raw, monthLabel, narrative } = a;
  const all = [...raw.posts, ...raw.reels];
  const reels = cur.reels_count ?? raw.reels.length;
  const reach = cur.reach ?? null;
  const views = cur.impressions ?? null;
  const inter = cur.interactions ?? null;
  const er = cur.engagement_rate ?? null;
  const avgReach = reach && reels ? Math.round(reach / reels) : null;
  const weeks = weeklyReach(all);
  const maxW = Math.max(1, ...weeks.map(w => w.reach));
  const tops = topPosts(all);
  const medals = ["🥇", "🥈", "🥉"];
  const handle = (c.instagram || "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "").replace(/^@?/, "@") || "";
  const fullName = [c.name, c.surname].filter(Boolean).join(" ");
  const hasFollowers = cur.followers_end != null;

  const kpiFollowers = hasFollowers ? `
      <div class="kpi-card">
        <div class="label">Подписчики</div>
        <div class="ba-num">${cur.followers_delta != null && prev ? `<span class="was">${ru((cur.followers_end || 0) - cur.followers_delta)}</span><span class="arrow">→</span>` : ""}<span class="now">${ru(cur.followers_end)}</span></div>
        <div class="delta">${cur.followers_delta != null ? `<span class="pill">${cur.followers_delta >= 0 ? "+" : ""}${ru(cur.followers_delta)}</span> за месяц` : "текущее число"}</div>
      </div>` : "";

  const followersNote = hasFollowers ? "" : `<div class="followers-note">📌 <b>Подписчики</b> в этом отчёте не показаны — аккаунт переподключается в Metricool для доступа к статистике подписчиков. Добавим динамику «было → стало» со следующего отчёта.</div>`;

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>EasyLife AI — Отчёт · ${esc(fullName)} · ${esc(monthLabel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--bg:#070526;--bg-2:#0c0938;--bg-card:#100c3d;--neon:#b6f500;--teal:#2ee6c8;--muted:#7a78a3;--muted-2:#4f4d75;--line:rgba(182,245,0,.14);--white:#f3f2ff;--maxw:1180px}
*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--white);font-family:'Manrope',system-ui,sans-serif;font-size:18px;line-height:1.55;overflow-x:hidden;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(800px 600px at 12% -5%,rgba(182,245,0,.10),transparent 60%),radial-gradient(900px 700px at 95% 8%,rgba(46,230,200,.10),transparent 55%),radial-gradient(700px 700px at 50% 120%,rgba(125,80,255,.12),transparent 60%)}
.wrap{position:relative;z-index:1;max-width:var(--maxw);margin:0 auto;padding:0 28px}
.topbar{position:fixed;top:0;left:0;right:0;z-index:40;display:flex;align-items:center;justify-content:space-between;padding:18px 28px;backdrop-filter:blur(6px)}
.topbar .brand{font-weight:800;letter-spacing:.02em;font-size:15px}.topbar .brand b{color:var(--neon)}
.topbar .period-mini{font-size:13px;color:var(--muted);border:1px solid var(--line);padding:7px 14px;border-radius:999px}
.eyebrow{display:inline-flex;align-items:center;gap:9px;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--teal);font-weight:600;margin-bottom:22px}
.eyebrow::before{content:"";width:30px;height:1px;background:var(--teal)}
.hero{padding:118px 0 50px}.hero-grid{display:grid;grid-template-columns:1.04fr .96fr;gap:54px;align-items:center}
.hero h1{font-family:'Unbounded',sans-serif;font-weight:800;line-height:1.08;font-size:clamp(27px,3.4vw,44px);letter-spacing:-.015em;max-width:16ch}
.hero h1 .hl{color:var(--neon);text-shadow:0 0 38px rgba(182,245,0,.45)}
.hero p.lead{margin-top:26px;font-size:clamp(16px,2vw,20px);color:var(--muted);max-width:52ch}
.results{position:relative;border-radius:28px;padding:40px 42px;background:linear-gradient(160deg,var(--bg-2),var(--bg-card));border:1px solid var(--line);box-shadow:0 44px 100px -54px rgba(0,0,0,.9);overflow:hidden}
.agg-row{position:relative;display:flex;align-items:center;gap:22px;margin:18px 0}
.agg-row .n{font-family:'Unbounded',sans-serif;font-weight:800;line-height:.92;font-size:clamp(30px,4vw,48px);letter-spacing:-.02em;flex-shrink:0;background:linear-gradient(180deg,#fff 34%,#a98bff);-webkit-background-clip:text;background-clip:text;color:transparent}
.agg-row .n .unit{font-size:.42em;font-weight:700;-webkit-text-fill-color:var(--neon)}
.agg-row .l{color:var(--muted);font-size:15px;line-height:1.32}
.results .divider{position:relative;height:1px;background:var(--line);margin:26px 0 18px}
.results .foot{position:relative;display:flex;align-items:center;gap:11px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--teal);font-weight:600}
.results .foot::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--neon);box-shadow:0 0 12px var(--neon)}
.sec-head{text-align:center;padding:96px 0 10px}.sec-head .eyebrow{justify-content:center}.sec-head .eyebrow::before{display:none}
.sec-head h2{font-family:'Unbounded',sans-serif;font-weight:700;font-size:clamp(26px,4vw,44px)}
.sec-head p{margin-top:14px;color:var(--muted);max-width:56ch;margin-left:auto;margin-right:auto;font-size:16px}
.kpi-band{padding:34px 0 10px}.kpi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
.kpi-card{position:relative;border-radius:22px;padding:26px 28px;overflow:hidden;background:linear-gradient(160deg,var(--bg-2),var(--bg-card));border:1px solid var(--line);box-shadow:0 30px 70px -44px rgba(0,0,0,.85)}
.kpi-card .label{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:16px}
.kpi-card .ba-num{font-family:'Unbounded',sans-serif;font-weight:800;line-height:1;font-size:clamp(28px,3.4vw,42px);display:flex;align-items:baseline;gap:.3em;flex-wrap:wrap}
.kpi-card .was{color:var(--muted-2)}.kpi-card .arrow{color:var(--muted-2);font-size:.7em}.kpi-card .now{color:var(--neon);text-shadow:0 0 30px rgba(182,245,0,.4)}
.kpi-card .delta{margin-top:14px;display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:var(--teal)}
.kpi-card .delta .pill{background:rgba(46,230,200,.12);padding:3px 11px;border-radius:999px;border:1px solid rgba(46,230,200,.25)}
.followers-note{margin-top:18px;font-size:13.5px;color:var(--muted);border:1px dashed var(--muted-2);border-radius:12px;padding:12px 16px}.followers-note b{color:var(--teal)}
.case{padding:56px 0}.case-grid{display:grid;grid-template-columns:.86fr 1.14fr;gap:54px;align-items:center}
.photo{position:relative;border-radius:22px;overflow:hidden;aspect-ratio:4/5;background:linear-gradient(160deg,var(--bg-2),var(--bg-card));border:1px solid var(--line)}
.photo img{width:100%;height:100%;object-fit:cover}
.photo .ph-label{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;color:var(--muted-2);padding:24px}
.photo .ph-label b{color:var(--muted);font-weight:600;font-size:15px}
.photo .glow-tag{position:absolute;left:16px;bottom:16px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bg);background:var(--neon);padding:6px 12px;border-radius:8px;box-shadow:0 0 24px rgba(182,245,0,.5)}
.case-index{font-family:'Unbounded',sans-serif;font-weight:800;font-size:13px;letter-spacing:.06em;color:var(--neon);margin-bottom:14px;display:flex;align-items:center;gap:10px}
.case-index::after{content:"";flex:0 0 40px;height:1px;background:var(--line)}
.pill{display:inline-block;font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--teal);border:1px solid rgba(46,230,200,.3);padding:5px 13px;border-radius:999px;margin-bottom:18px}
.client-name{font-family:'Unbounded',sans-serif;font-weight:700;font-size:clamp(22px,2.6vw,30px);line-height:1.08}
.client-sub{margin-top:10px;color:var(--muted);font-size:15.5px;max-width:44ch}
.ba{display:grid;grid-template-columns:1fr auto 1fr;gap:18px;align-items:stretch;margin-top:28px}
.ba-card{border-radius:16px;padding:20px;border:1px solid rgba(255,255,255,.06)}
.ba-card.before{background:rgba(255,255,255,.02)}.ba-card.after{background:linear-gradient(160deg,rgba(182,245,0,.08),rgba(46,230,200,.05));border-color:var(--line)}
.ba-card h4{font-size:12px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:14px;font-weight:700}
.ba-card.before h4{color:var(--muted-2)}.ba-card.after h4{color:var(--neon)}
.ba-card ul{list-style:none;display:flex;flex-direction:column;gap:9px}
.ba-card li{font-size:14.5px;line-height:1.4;position:relative;padding-left:20px}
.ba-card li::before{content:"";position:absolute;left:0;top:8px;width:7px;height:7px;border-radius:50%}
.ba-card.before li{color:var(--muted)}.ba-card.before li::before{background:var(--muted-2)}
.ba-card.after li{color:var(--white)}.ba-card.after li::before{background:var(--neon);box-shadow:0 0 10px var(--neon)}.ba-card.after li b{color:var(--neon)}
.ba-arrow{display:flex;align-items:center;justify-content:center;color:var(--muted-2)}.ba-arrow svg{width:26px;height:26px}
.panel{position:relative;border-radius:22px;padding:34px 36px;background:linear-gradient(160deg,var(--bg-2),var(--bg-card));border:1px solid var(--line);box-shadow:0 30px 70px -44px rgba(0,0,0,.85)}
.bars{display:flex;align-items:flex-end;gap:20px;height:260px;margin-top:8px;padding:0 4px}
.bar{flex:1;display:flex;flex-direction:column;align-items:center;gap:10px;justify-content:flex-end;height:100%}
.bar .col{width:100%;background:linear-gradient(180deg,var(--neon),rgba(46,230,200,.5));border-radius:8px 8px 0 0;min-height:8px;box-shadow:0 0 24px rgba(182,245,0,.25)}
.bar .cap{font-size:12.5px;color:var(--muted)}.bar .top{font-family:'Unbounded',sans-serif;font-size:15px;font-weight:700;color:var(--neon)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:8px}
.panel h3{font-family:'Unbounded',sans-serif;font-weight:700;font-size:22px;margin-bottom:18px}
.rowline{display:flex;justify-content:space-between;gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:16px;color:var(--muted)}
.rowline:last-child{border-bottom:0}.rowline span:last-child{font-weight:700;color:var(--white);font-family:'Unbounded',sans-serif;font-size:14px;white-space:nowrap}
.rowline .theme{color:var(--white);font-weight:500;font-family:'Manrope',sans-serif}
.plan{padding:80px 0 40px}.plan .box{position:relative;border-radius:28px;padding:56px 48px;overflow:hidden;background:linear-gradient(160deg,var(--bg-2),var(--bg-card));border:1px solid var(--line)}
.plan .box::before{content:"";position:absolute;inset:0;background:radial-gradient(600px 300px at 50% -20%,rgba(182,245,0,.14),transparent 60%)}
.plan h2{position:relative;font-family:'Unbounded',sans-serif;font-weight:800;font-size:clamp(24px,3.4vw,38px);margin-bottom:8px}.plan h2 .neon{color:var(--neon)}
.plan .grid2{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:28px}
.plan .list{display:flex;flex-direction:column;gap:14px}
.plan .li{display:flex;gap:13px;align-items:flex-start;font-size:16.5px;color:var(--white)}
.plan .li .dot{flex:none;width:24px;height:24px;border-radius:50%;background:var(--neon);color:var(--bg);font-weight:800;display:flex;align-items:center;justify-content:center;font-size:13px}
.plan .sub-h{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--teal);font-weight:700;margin-bottom:16px}
footer{border-top:1px solid var(--line);padding:34px 0;text-align:center;color:var(--muted-2);font-size:13px;position:relative;z-index:1}footer b{color:var(--muted)}
@media print{body::before{display:none}body{background:#fff;color:#111}.topbar{display:none}.panel,.kpi-card,.results,.plan .box,.photo{box-shadow:none;break-inside:avoid}}
@media(max-width:880px){body{font-size:16px}.topbar{padding:14px 18px}.wrap{padding:0 18px}.hero{padding:92px 0 24px}.hero-grid{grid-template-columns:1fr;gap:34px}.results{padding:28px 22px}.kpi-grid{grid-template-columns:1fr}.case-grid{grid-template-columns:1fr;gap:30px}.photo{max-width:340px}.ba{grid-template-columns:1fr;gap:12px}.ba-arrow{transform:rotate(90deg)}.cols,.plan .grid2{grid-template-columns:1fr}.plan .box{padding:40px 24px}}
</style></head><body>
<div class="topbar"><div class="brand">EasyLife<b>.AI</b></div><div class="period-mini">Отчёт · ${esc(monthLabel)}</div></div>

<header class="hero"><div class="wrap hero-grid">
  <div>
    <span class="eyebrow">Отчёт о проделанной работе</span>
    <h1>${esc(fullName)} —<br>итоги за <span class="hl">${esc(monthLabel)}</span></h1>
    <p class="lead">Месяц системной работы над Instagram-аккаунтом. Весь контент — на AI-аватаре, без личных съёмок. Ниже — цифры из вашего реального профиля (Metricool).</p>
  </div>
  <div class="results">
    <span class="eyebrow">Итоги месяца</span>
    <div class="agg-row"><div class="n">${ru(reach)}</div><div class="l">охват за месяц<br>(уник. аккаунты)</div></div>
    <div class="agg-row"><div class="n">${ru(views)}</div><div class="l">просмотров<br>контента</div></div>
    <div class="agg-row"><div class="n">${pct(er).replace("%", "")}<span class="unit">&nbsp;%</span></div><div class="l">вовлечённость</div></div>
    <div class="divider"></div>
    <div class="foot">Данные из Metricool&nbsp;·&nbsp;${esc(monthLabel)}&nbsp;·&nbsp;${reels} Reels на AI</div>
  </div>
</div></header>

<div class="wrap"><div class="sec-head"><span class="eyebrow">Динамика месяц к месяцу</span><h2>Было → Стало</h2><p>Прошлый месяц против ${esc(monthLabel)}.</p></div></div>
<section class="kpi-band"><div class="wrap"><div class="kpi-grid">
  <div class="kpi-card"><div class="label">Reels выпущено</div><div class="ba-num">${prev?.reels_count != null ? `<span class="was">${prev.reels_count}</span><span class="arrow">→</span>` : ""}<span class="now">${reels}</span></div><div class="delta">${deltaPill(reels, prev?.reels_count)} объём контента</div></div>
  <div class="kpi-card"><div class="label">Охват за месяц</div><div class="ba-num">${prev?.reach != null ? `<span class="was">${compact(prev.reach)}</span><span class="arrow">→</span>` : ""}<span class="now">${compact(reach)}</span></div><div class="delta">${deltaPill(reach, prev?.reach)} уникальных аккаунтов</div></div>
  <div class="kpi-card"><div class="label">Взаимодействия</div><div class="ba-num">${prev?.interactions != null ? `<span class="was">${compact(prev.interactions)}</span><span class="arrow">→</span>` : ""}<span class="now">${compact(inter)}</span></div><div class="delta"><span class="pill">лайки+сохр.+комм.</span></div></div>
  <div class="kpi-card"><div class="label">Вовлечённость (ER)</div><div class="ba-num"><span class="now">${pct(er)}</span></div><div class="delta"><span class="pill">×3–5</span> к среднему по Instagram (1–3%)</div></div>
  ${kpiFollowers}
</div>${followersNote}</div></section>

<section class="case"><div class="wrap"><div class="case-grid">
  <div><div class="photo">${c.avatar_url ? `<img src="${esc(c.avatar_url)}" alt="${esc(fullName)}">` : `<div class="ph-label"><b>${esc(fullName)}</b><small>фото профиля</small></div>`}${handle ? `<div class="glow-tag">${esc(handle)}</div>` : ""}</div></div>
  <div>
    <div class="case-index">Аккаунт клиента</div>
    <span class="pill">${esc(c.niche || "Instagram")}</span>
    <div class="client-name">${esc(fullName)}</div>
    <p class="client-sub">${esc(c.niche || "")} · Весь контент — на AI-аватаре, без личных съёмок.</p>
    <div class="ba">
      <div class="ba-card before"><h4>Прошлый месяц</h4><ul><li>${prev?.reels_count ?? "—"} Reels</li><li>охват ${compact(prev?.reach)}</li><li>ER ${pct(prev?.engagement_rate)}</li></ul></div>
      <div class="ba-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>
      <div class="ba-card after"><h4>${esc(monthLabel)} с EasyLife</h4><ul><li><b>${reels} Reels</b> за месяц</li><li>охват <b>${compact(reach)}</b> · <b>${compact(views)}</b> просмотров</li><li>вовлечённость <b>${pct(er)}</b></li>${tops[0] ? `<li>топ-ролик собрал <b>${compact(tops[0].reach)}</b> охвата</li>` : ""}</ul></div>
    </div>
  </div>
</div></div></section>

${weeks.length ? `<div class="wrap"><div class="sec-head"><span class="eyebrow">Динамика</span><h2>Охват по неделям</h2></div></div>
<section style="padding:20px 0"><div class="wrap"><div class="panel"><div class="bars">
${weeks.map(w => `<div class="bar"><span class="top">${compact(w.reach)}</span><div class="col" style="height:${Math.max(8, Math.round((w.reach / maxW) * 100))}%"></div><span class="cap">${w.cap}</span></div>`).join("")}
</div></div></div></section>` : ""}

<div class="wrap"><div class="sec-head"><span class="eyebrow">Контент</span><h2>Что выпустили</h2></div></div>
<section style="padding:20px 0"><div class="wrap"><div class="cols">
  <div class="panel"><h3>Объём</h3>
    <div class="rowline"><span>Reels (видео)</span><span>${reels}</span></div>
    <div class="rowline"><span>Средний охват на Reels</span><span>${ru(avgReach)}</span></div>
    <div class="rowline"><span>Суммарные просмотры</span><span>${compact(views)}</span></div>
    <div class="rowline"><span>Всего единиц контента</span><span>${cur.content_units ?? all.length}</span></div>
  </div>
  <div class="panel"><h3>Топ-публикации месяца</h3>
    ${tops.length ? tops.map((t, i) => `<div class="rowline"><span class="theme">${medals[i]} ${esc(t.title.length > 44 ? t.title.slice(0, 42) + "…" : t.title) || "Публикация"}</span><span>${compact(t.reach)} охват</span></div>`).join("") : `<div class="rowline"><span>Данные по топ-постам появятся при следующем сборе</span><span>—</span></div>`}
  </div>
</div></div></section>

<section class="plan"><div class="wrap"><div class="box">
  <h2>Итог месяца и <span class="neon">план на следующий</span></h2>
  <div class="grid2">
    <div><div class="sub-h">Что сработало</div><div class="list">${a.narrative.worked.map((w, i) => `<div class="li"><span class="dot">${i + 1}</span><span>${esc(w)}</span></div>`).join("")}</div></div>
    <div><div class="sub-h">План на следующий месяц</div><div class="list">${a.narrative.plan.map(p => `<div class="li"><span class="dot">→</span><span>${esc(p)}</span></div>`).join("")}</div></div>
  </div>
</div></div></section>

<footer><div class="wrap"><b>EasyLife AI</b> — контент без съёмок на камеру · easylifeai.biz &nbsp;·&nbsp; Кристина &amp; Ярослав</div></footer>
</body></html>`;
}
