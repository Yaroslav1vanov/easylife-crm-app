// Недельный отчёт клиенту (HTML, самодостаточный файл — картинки зашиты в base64).
// Дизайн — неон EasyLife. Язык: ru (по умолчанию) или en.

export type WeekReel = {
  date: string; net: string; views: number; reach: number | null; likes: number | null;
  comments: number | null; saved: number | null; shares: number | null;
  ret: number | null; skip: number | null; dur: number | null;
  url: string | null; title: string; img: string | null; x: number; ageDays: number;
  ourTitle?: string | null;              // как ролик называется у нас в контент-плане
};
export type PlanItem = { date: string; title: string; type: string; why: string | null };
export type WeekTotals = { n: number; views: number; reach: number; likes: number; comments: number; saved: number; shares: number; ret: number | null };
export type WeeklyArgs = {
  client: { name: string; surname?: string | null; avatar_url?: string | null; instagram?: string | null };
  avatar: string | null;                 // base64 или url
  from: string; to: string; prevFrom: string; prevTo: string;
  cur: WeekTotals; prev: WeekTotals;
  reels: WeekReel[];                     // ролики недели (без тестовых)
  excluded: { views: number }[];         // тестовые/нерасходившиеся — только сноской
  norm: number;                          // обычный уровень аккаунта (медиана последних 30)
  ourVideos: number | null;              // сколько роликов недели сделали мы (по CRM)
  month: { published: number; package: number; from: string; to: string } | null;
  followers: { value: number; delta: number | null } | null;
  account: {
    ready: boolean; views: number; reach: number; likes: number; comments: number; saved: number; shares: number;
    older: number; olderViews: number; newInWeek: number; baseDate: string | null; endDate: string | null;
  } | null;                              // прирост за неделю по ВСЕМ роликам (наши ежедневные снимки)
  nextWeek: PlanItem[];                  // что выходит на следующей неделе (контент-план CRM)
  narrative: { headline: string; lead: string; hit: string[]; cards: { tone: "g" | "y" | "r"; title: string; text: string }[]; plan: string[] };
  lang: "ru" | "en";
  generatedAt: string;
};

const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m] as string));
const RU_M = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const EN_M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const T = {
  ru: {
    report: "Недельный отчёт", views: "Просмотры", reels: "Роликов", reach: "Охват", likes: "Лайки",
    comments: "Комментарии", saves: "Сохранения", shares: "Репосты", followers: "Подписчики",
    was: "прошлая неделя", noCompare: "нет сравнения", hit: "Разбор лучшего ролика недели",
    best: "Лучший на неделе", viewsWord: "просмотров", published: "опубликован", sec: "сек",
    ofNorm: "к обычному уровню", retention: "досмотр", avgWeek: "в среднем по неделе",
    savedBy: "сохранили", sharedBy: "переслали", commentsCnt: "комментариев", skipped: "пролистали сразу",
    openIg: "Открыть ролик →", quality: "Как смотрят", qualitySub: "насколько контент цепляет",
    watchRate: "Досматривают ролик", saveRate: "Сохраняют", everyNth: "каждый", viewer: "-й зритель",
    shareRate: "Пересылают друзьям", shareHint: "самый сильный сигнал для охвата",
    allReels: "Все ролики недели", normIs: "обычный уровень аккаунта", noCaption: "без подписи",
    still: "ещё набирает", days: "дн.", plan: "Контент-план месяца", planDone: "Опубликовано в этом месяце",
    of: "из", left: "осталось", planLeft: "роликов", conclusions: "Выводы недели",
    nextWeek: "План на следующую неделю", ours: "из них наших",
    sources: (d: string) => `Данные — Metricool на ${d}. Неделя — с понедельника по воскресенье. «Обычный уровень аккаунта» — медиана просмотров последних 30 роликов. Досмотр — средняя доля ролика, которую смотрит зритель. Ролики последних двух-трёх дней ещё набирают просмотры.`,
    excluded: (n: number, v: string) => `Не учитываем ${n} ${n === 1 ? "ролик" : "ролика"}, которые почти не показывались в ленте (${v} просмотров).`,
    mln: " млн", tys: " тыс",
    accTitle: "Весь аккаунт за неделю", accSub: "включая ролики, выпущенные раньше — они продолжают набирать",
    accNew: "новых роликов за неделю", accOld: "старых роликов продолжали набирать",
    accOldViews: "просмотров принесли старые ролики",
    planNext: "Что выходит на следующей неделе", planNextSub: "из контент-плана — темы уже отобраны",
    why: "почему взяли", reel: "Рилс", carousel: "Карусель", story: "Сторис",
    noPlanNext: "План на следующую неделю ещё собирается — пришлём отдельно.",
    accSoon: "Этот блок появится в следующем отчёте: мы начали снимать цифры по каждому ролику ежедневно, и для сравнения нужны две точки — начало и конец недели.",
  },
  en: {
    report: "Weekly report", views: "Views", reels: "Videos", reach: "Reach", likes: "Likes",
    comments: "Comments", saves: "Saves", shares: "Shares", followers: "Followers",
    was: "previous week", noCompare: "no comparison", hit: "Best video of the week",
    best: "Top this week", viewsWord: "views", published: "published", sec: "sec",
    ofNorm: "of the account's usual level", retention: "watch-through", avgWeek: "week average",
    savedBy: "saved it", sharedBy: "shared it", commentsCnt: "comments", skipped: "skipped instantly",
    openIg: "Open on Instagram →", quality: "How it is watched", qualitySub: "how well the content holds attention",
    watchRate: "Watch-through rate", saveRate: "Save rate", everyNth: "every", viewer: "th viewer",
    shareRate: "Shared with friends", shareHint: "the strongest signal for reach",
    allReels: "All videos of the week", normIs: "account's usual level", noCaption: "no caption",
    still: "still gaining", days: "d", plan: "Monthly content plan", planDone: "Published this month",
    of: "of", left: "left", planLeft: "videos", conclusions: "Takeaways",
    nextWeek: "Plan for next week", ours: "produced by us",
    sources: (d: string) => `Data — Metricool as of ${d}. Week runs Monday to Sunday. "Usual level" is the median views of the last 30 videos. Watch-through is the average share of the video a viewer watches. Videos posted in the last two or three days are still gaining views.`,
    excluded: (n: number, v: string) => `${n} ${n === 1 ? "video" : "videos"} excluded — they were barely shown in the feed (${v} views).`,
    mln: "M", tys: "K",
    accTitle: "Whole account this week", accSub: "including older videos — they keep gaining views",
    accNew: "videos published this week", accOld: "older videos kept gaining",
    accOldViews: "views came from older videos",
    planNext: "Coming next week", planNextSub: "from the content plan — topics are already selected",
    why: "why we picked it", reel: "Reel", carousel: "Carousel", story: "Story",
    noPlanNext: "Next week's plan is still being finalised, we will send it separately.",
    accSoon: "This block appears in the next report: we just started taking daily snapshots per video, and a comparison needs two points — the start and the end of the week.",
  },
};

export function buildWeeklyHtml(a: WeeklyArgs): string {
  const t = T[a.lang];
  const isRu = a.lang === "ru";
  const n = (v: number | null | undefined) => {
    if (v == null) return "—";
    if (v >= 1_000_000) return (isRu ? (v / 1e6).toFixed(1).replace(".", ",").replace(",0", "") : (v / 1e6).toFixed(1).replace(".0", "")) + t.mln;
    if (v >= 10_000) return Math.round(v / 1000) + t.tys;
    return v.toLocaleString(isRu ? "ru-RU" : "en-US").replace(/,/g, isRu ? " " : ",");
  };
  const dm = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  const long = (s: string) => {
    const d = +s.slice(8, 10), m = +s.slice(5, 7) - 1;
    return isRu ? `${d} ${RU_M[m]}` : `${EN_M[m]} ${d}`;
  };
  const fx = (x: number) => (isRu ? String(x).replace(".", ",") : String(x));
  const delta = (cur: number, prev: number) => {
    if (!prev) return `<div class="d">${t.noCompare}</div>`;
    const p = Math.round(((cur - prev) / prev) * 100);
    return `<div class="d ${p >= 0 ? "up" : "down"}">${p >= 0 ? "+" : "−"}${Math.abs(p)}% · ${t.was}: ${n(prev)}</div>`;
  };
  const kpi = (label: string, cur: number, prev: number, big = false) =>
    `<div class="kpi${big ? " big" : ""}"><div class="l">${label}</div><div class="v">${n(cur)}</div>${delta(cur, prev)}</div>`;
  const tag = (x: number) =>
    x >= 1.5 ? `<span class="tag hit">×${fx(Math.round(x * 10) / 10)} ${t.ofNorm}</span>`
      : x >= 0.7 ? `<span class="tag norm">×${fx(Math.round(x * 10) / 10)}</span>`
      : `<span class="tag low">×${fx(Math.round(x * 100) / 100)}</span>`;

  const top = a.reels.length ? a.reels.reduce((m, r) => (r.views > m.views ? r : m), a.reels[0]) : null;
  const rows = [...a.reels].sort((x, y) => y.views - x.views).map(r => {
    const caption = r.title.trim() && !/^@/.test(r.title.trim()) ? esc(r.title.slice(0, 80)) : "";
    const title = r.ourTitle ? esc(r.ourTitle.slice(0, 90)) : caption || `<span class="muted">${t.noCaption}</span>`;
    const young = r.ageDays <= 3 ? `<span class="tag young">${t.still} · ${r.ageDays} ${t.days}</span>` : "";
    return `<tr>
      <td class="th">${r.img ? `<img src="${r.img}" alt="">` : `<div class="noimg"></div>`}</td>
      <td><div class="rt">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noreferrer">${title}</a>` : title}</div>
          <div class="muted small">${dm(r.date)}${r.dur ? ` · ${r.dur} ${t.sec}` : ""}${r.net !== "instagram" ? ` · ${r.net}` : ""} ${young}</div></td>
      <td class="num strong">${n(r.views)}<div>${tag(r.x)}</div></td>
      <td class="num">${r.ret != null ? `<div class="bar"><i style="width:${Math.min(100, r.ret)}%"></i></div><span class="small">${r.ret}%</span>` : "—"}</td>
      <td class="num">${n(r.saved)}</td><td class="num">${n(r.shares)}</td><td class="num">${n(r.comments)}</td></tr>`;
  }).join("");

  const saveRate = a.cur.views ? Math.round((a.cur.saved / a.cur.views) * 1000) / 10 : 0;
  const perSaver = a.cur.saved ? Math.round(a.cur.views / a.cur.saved) : 0;
  const planPct = a.month && a.month.package ? Math.min(100, Math.round((a.month.published / a.month.package) * 100)) : 0;

  return `<!doctype html><html lang="${a.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(a.client.name)} ${esc(a.client.surname || "")} · ${t.report} ${dm(a.from)}–${dm(a.to)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#070526;--card:#100c3d;--card2:#140f4a;--neon:#b6f500;--teal:#2ee6c8;--red:#ff5c7a;--amber:#ffc73a;--muted:#8583ad;--muted2:#56547e;--white:#f3f2ff;--line:rgba(182,245,0,.14)}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--white);font-family:'Manrope',system-ui,sans-serif;font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(700px 500px at 8% -5%,rgba(182,245,0,.10),transparent 60%),radial-gradient(800px 600px at 96% 8%,rgba(46,230,200,.10),transparent 55%),radial-gradient(700px 700px at 50% 120%,rgba(125,80,255,.13),transparent 60%)}
.wrap{position:relative;max-width:900px;margin:0 auto;padding:36px 22px 70px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:34px;flex-wrap:wrap}
.brand{font-weight:800;font-size:14px}.brand b{color:var(--neon)}
.pill{font-size:12px;color:var(--muted);border:1px solid var(--line);padding:6px 13px;border-radius:999px;white-space:nowrap}
.client{display:flex;align-items:center;gap:14px;margin-bottom:18px}
.client img{width:54px;height:54px;border-radius:50%;object-fit:cover;border:2px solid var(--line)}
.client .nm{font-weight:800;font-size:17px}.client .hd{color:var(--muted);font-size:13px}
h1{font-family:'Unbounded',sans-serif;font-size:clamp(23px,4.4vw,36px);line-height:1.14;font-weight:800;margin-bottom:12px}
h1 span{color:var(--neon)}
h2{font-family:'Unbounded',sans-serif;font-size:19px;font-weight:700;margin:46px 0 16px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
h2 small{font-family:'Manrope';font-size:13px;color:var(--muted);font-weight:500}
.sub{color:#c9c7e6;font-size:15.5px;max-width:730px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-top:26px}
@media(max-width:720px){.grid{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 15px}
.kpi.big{grid-column:span 2;background:linear-gradient(135deg,rgba(182,245,0,.10),rgba(46,230,200,.07));border-color:rgba(182,245,0,.3)}
.kpi .l{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}
.kpi .v{font-family:'Unbounded',sans-serif;font-size:24px;font-weight:800;line-height:1}
.kpi.big .v{font-size:36px;color:var(--neon)}
.kpi .d{font-size:12.5px;margin-top:8px;color:var(--muted)}.kpi .d.up{color:var(--teal)}.kpi .d.down{color:var(--red)}
.note{margin-top:14px;background:rgba(255,199,58,.07);border:1px solid rgba(255,199,58,.28);border-radius:12px;padding:12px 15px;font-size:13.5px;color:#e6dcb8}
.hit{display:grid;grid-template-columns:150px 1fr;gap:20px;background:var(--card);border:1px solid rgba(182,245,0,.32);border-radius:18px;padding:18px}
@media(max-width:600px){.hit{grid-template-columns:1fr}}
.hit img{width:150px;aspect-ratio:9/16;object-fit:cover;border-radius:12px;display:block}
.hit .badge{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--bg);background:var(--neon);padding:4px 10px;border-radius:6px;margin-bottom:12px}
.hit .big{font-family:'Unbounded',sans-serif;font-size:34px;font-weight:800;color:var(--neon);line-height:1}
.hit .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}
@media(max-width:600px){.hit .stats{grid-template-columns:repeat(2,1fr)}}
.hit .stats div{background:var(--card2);border-radius:10px;padding:10px}
.hit .stats b{display:block;font-family:'Unbounded',sans-serif;font-size:16px}.hit .stats span{font-size:11px;color:var(--muted)}
.why{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:12px}@media(max-width:640px){.why{grid-template-columns:1fr}}
.q{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}@media(max-width:720px){.q{grid-template-columns:1fr}}
.q .kpi .v{color:var(--teal)}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:16px;background:var(--card)}
table{width:100%;border-collapse:collapse;font-size:14px;min-width:700px}
th,td{padding:11px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:middle}
th{color:var(--muted);font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.1em}
tr:last-child td{border-bottom:0}
td.num{white-space:nowrap;font-variant-numeric:tabular-nums}
td.th img,.noimg{width:40px;height:62px;object-fit:cover;border-radius:7px;display:block;background:var(--card2)}
.rt{max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.strong{font-weight:800}.small{font-size:12px}.muted{color:var(--muted)}
.tag{display:inline-block;font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:6px;margin-top:4px}
.tag.hit{background:rgba(182,245,0,.16);color:var(--neon)}.tag.norm{background:rgba(46,230,200,.13);color:var(--teal)}
.tag.low{background:rgba(255,199,58,.13);color:var(--amber)}
.tag.young{background:rgba(255,199,58,.13);color:var(--amber);margin-left:6px}
.bar{width:58px;height:6px;border-radius:4px;background:rgba(255,255,255,.08);display:inline-block;vertical-align:middle;margin-right:7px;overflow:hidden}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--teal),var(--neon))}
a{color:var(--white);text-decoration:none}a:hover{color:var(--neon)}
.pkg{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px}
.pkg .row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;gap:10px}
.pkg .v{font-family:'Unbounded',sans-serif;font-weight:800;font-size:22px}
.track{height:10px;border-radius:6px;background:rgba(255,255,255,.08);overflow:hidden}.track i{display:block;height:100%;background:linear-gradient(90deg,var(--teal),var(--neon))}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin-bottom:11px}
.card h3{font-size:15.5px;font-weight:800;margin-bottom:7px;display:flex;gap:10px;align-items:center}
.card p{color:#c9c7e6;font-size:14.5px}
.dot{width:10px;height:10px;border-radius:50%;flex:none}
.dot.g{background:var(--neon);box-shadow:0 0 10px var(--neon)}.dot.y{background:var(--amber);box-shadow:0 0 10px var(--amber)}.dot.r{background:var(--red);box-shadow:0 0 10px var(--red)}
.plan{list-style:none;counter-reset:k;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:6px 20px}
.plan li{counter-increment:k;display:flex;gap:14px;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:14.5px}
.plan li:last-child{border-bottom:0}
.plan li::before{content:counter(k);font-family:'Unbounded',sans-serif;font-weight:800;color:var(--neon);flex:none;width:20px}
.foot{margin-top:46px;color:var(--muted2);font-size:12px;line-height:1.7}
.excl{margin-top:10px;font-size:12.5px;color:var(--muted)}
.plan-tbl{min-width:560px}.plan-tbl td{vertical-align:top}.plan-tbl td:nth-child(2){max-width:330px}
@media print{body{background:#070526;-webkit-print-color-adjust:exact;print-color-adjust:exact}body::before{display:none}.wrap{padding:20px}h2{break-after:avoid}.card,.kpi,.hit,tr{break-inside:avoid}}
</style></head><body><div class="wrap">

<div class="top"><div class="brand">Easy<b>Life</b> AI</div><div class="pill">${t.report} · ${long(a.from)} — ${long(a.to)}</div></div>

<div class="client">${a.avatar ? `<img src="${a.avatar}" alt="">` : ""}<div><div class="nm">${esc(a.client.name)} ${esc(a.client.surname || "")}</div><div class="hd">${esc(a.client.instagram ? handleOf(a.client.instagram) : "")}</div></div></div>
<h1>${a.narrative.headline}</h1>
<p class="sub">${a.narrative.lead}</p>

<div class="grid">
  ${kpi(t.views, a.cur.views, a.prev.views, true)}
  <div class="kpi"><div class="l">${t.reels}</div><div class="v">${a.cur.n}</div><div class="d ${a.cur.n >= a.prev.n ? "up" : "down"}">${t.was}: ${a.prev.n}${a.ourVideos != null ? ` · ${t.ours}: ${a.ourVideos}` : ""}</div></div>
  ${kpi(t.reach, a.cur.reach, a.prev.reach)}
  ${kpi(t.likes, a.cur.likes, a.prev.likes)}
  ${kpi(t.comments, a.cur.comments, a.prev.comments)}
  ${kpi(t.saves, a.cur.saved, a.prev.saved)}
  ${kpi(t.shares, a.cur.shares, a.prev.shares)}
  ${a.followers ? `<div class="kpi"><div class="l">${t.followers}</div><div class="v">${n(a.followers.value)}</div>${a.followers.delta != null ? `<div class="d ${a.followers.delta >= 0 ? "up" : "down"}">${a.followers.delta >= 0 ? "+" : "−"}${n(Math.abs(a.followers.delta))}</div>` : ""}</div>` : ""}
</div>
${a.excluded.length ? `<p class="excl">${t.excluded(a.excluded.length, a.excluded.map(x => x.views).join(", "))}</p>` : ""}

<h2>${t.accTitle} <small>${t.accSub}</small></h2>
${a.account?.ready ? `
<div class="grid">
  <div class="kpi big"><div class="l">${t.views}</div><div class="v">${n(a.account.views)}</div><div class="d">${t.accOldViews}: ${n(a.account.olderViews)}</div></div>
  <div class="kpi"><div class="l">${t.reach}</div><div class="v">${n(a.account.reach)}</div></div>
  <div class="kpi"><div class="l">${t.likes}</div><div class="v">${n(a.account.likes)}</div></div>
  <div class="kpi"><div class="l">${t.comments}</div><div class="v">${n(a.account.comments)}</div></div>
  <div class="kpi"><div class="l">${t.saves}</div><div class="v">${n(a.account.saved)}</div></div>
  <div class="kpi"><div class="l">${t.shares}</div><div class="v">${n(a.account.shares)}</div></div>
  <div class="kpi"><div class="l">${t.reels}</div><div class="v">${a.account.newInWeek}</div><div class="d">${t.accNew} · ${a.account.older} ${t.accOld}</div></div>
</div>` : `<div class="note">${t.accSoon}</div>`}

${top ? `
<h2>${t.hit}</h2>
<div class="hit">
  ${top.img ? `<img src="${top.img}" alt="">` : ""}
  <div>
    <div class="badge">${top.x >= 1.5 ? `×${fx(Math.round(top.x * 10) / 10)} ${t.ofNorm}` : t.best}</div>
    <div class="big">${n(top.views)}</div>
    <div class="muted small" style="margin-top:6px">${t.viewsWord} · ${t.published} ${dm(top.date)}${top.dur ? ` · ${top.dur} ${t.sec}` : ""}</div>
    <div class="stats">
      ${top.ret != null ? `<div><b>${top.ret}%</b><span>${t.retention} · ${t.avgWeek} ${a.cur.ret ?? "—"}%</span></div>` : ""}
      <div><b>${n(top.saved)}</b><span>${t.savedBy}</span></div>
      <div><b>${n(top.shares)}</b><span>${t.sharedBy}</span></div>
      <div><b>${n(top.comments)}</b><span>${t.commentsCnt}</span></div>
    </div>
    ${top.url ? `<p style="margin-top:14px"><a href="${esc(top.url)}" target="_blank" rel="noreferrer" style="color:var(--teal)">${t.openIg}</a></p>` : ""}
  </div>
</div>
${a.narrative.hit.length ? `<div class="why">${a.narrative.hit.map(x => `<div class="card"><h3><span class="dot g"></span>${esc(firstPart(x))}</h3><p>${esc(restPart(x))}</p></div>`).join("")}</div>` : ""}
` : ""}

<h2>${t.quality} <small>${t.qualitySub}</small></h2>
<div class="q">
  <div class="kpi"><div class="l">${t.watchRate}</div><div class="v">${a.cur.ret ?? "—"}%</div>${a.prev.ret != null ? `<div class="d ${(a.cur.ret ?? 0) >= a.prev.ret ? "up" : "down"}">${t.was}: ${a.prev.ret}%</div>` : ""}</div>
  <div class="kpi"><div class="l">${t.saveRate}</div><div class="v">${fx(saveRate)}%</div>${perSaver ? `<div class="d">${t.everyNth} ${perSaver}${t.viewer}</div>` : ""}</div>
  <div class="kpi"><div class="l">${t.shareRate}</div><div class="v">${n(a.cur.shares)}</div><div class="d">${t.shareHint}</div></div>
</div>

<h2>${t.allReels} <small>${t.normIs} — ${n(Math.round(a.norm))} ${t.viewsWord}</small></h2>
<div class="tbl"><table>
<thead><tr><th></th><th>${t.reels}</th><th>${t.views}</th><th>${t.retention}</th><th>${t.saves}</th><th>${t.shares}</th><th>${t.comments}</th></tr></thead>
<tbody>${rows || `<tr><td colspan="7" class="muted" style="padding:20px;text-align:center">—</td></tr>`}</tbody></table></div>

<h2>${t.planNext} <small>${t.planNextSub}</small></h2>
${a.nextWeek.length ? `<div class="tbl"><table class="plan-tbl">
<thead><tr><th>${isRu ? "Дата" : "Date"}</th><th>${isRu ? "Ролик" : "Video"}</th><th>${t.why}</th></tr></thead>
<tbody>${a.nextWeek.map(x => `<tr>
  <td class="num strong">${dm(x.date)}</td>
  <td>${esc(x.title)}<div class="muted small">${(t as any)[x.type] || x.type}</div></td>
  <td class="muted">${x.why ? esc(x.why) : "—"}</td></tr>`).join("")}</tbody></table></div>`
: `<div class="note">${t.noPlanNext}</div>`}

${a.month ? `
<h2>${t.plan}</h2>
<div class="pkg">
  <div class="row"><span class="muted">${t.planDone}</span><span class="v">${a.month.published} ${t.of} ${a.month.package}</span></div>
  <div class="track"><i style="width:${planPct}%"></i></div>
  <div class="muted small" style="margin-top:10px">${long(a.month.from)} — ${long(a.month.to)} · ${t.left} ${Math.max(0, a.month.package - a.month.published)} ${t.planLeft}</div>
</div>` : ""}

${a.narrative.cards.length ? `<h2>${t.conclusions}</h2>
${a.narrative.cards.map(c => `<div class="card"><h3><span class="dot ${c.tone}"></span>${esc(c.title)}</h3><p>${esc(c.text)}</p></div>`).join("")}` : ""}

${a.narrative.plan.length ? `<h2>${t.nextWeek}</h2>
<ol class="plan">${a.narrative.plan.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}

<p class="foot">${t.sources(dm(a.generatedAt))}<br>EasyLife AI · easylifeai.biz</p>
</div></body></html>`;
}

function handleOf(url: string): string {
  const m = String(url).match(/instagram\.com\/([^/?#]+)/i);
  return m ? `@${m[1]} · Instagram` : "";
}
function firstPart(s: string): string {
  const i = s.indexOf(" — ");
  return i > 0 ? s.slice(0, i) : s.split(".")[0] || s;
}
function restPart(s: string): string {
  const i = s.indexOf(" — ");
  if (i > 0) return s.slice(i + 3);
  const j = s.indexOf(".");
  return j > 0 ? s.slice(j + 1).trim() : "";
}
