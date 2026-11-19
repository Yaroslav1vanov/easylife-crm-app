import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { createAdmin } from "@/lib/supabase-admin";
import { resolvePortal } from "@/lib/portal";
import { clientReels, type ClientReel } from "@/lib/clientReels";
import { utcToZonedInput } from "@/lib/tz";

/* Кабинет клиента: только его проект, только чтение, без входа в CRM.
   Вкладки: «Работа» (идеи → сценарии → монтаж → вышло), «План» (что и в какой день выходит),
   «Статистика» (месяцы, сети, каждый ролик). Стратегии, чата, настроек, команды, ЗП, внутренних
   пометок (рекомендация монтажёру, пробный ролик, референсы) здесь нет и в браузер они не уходят.
   В тексте нет названия агентства и наших сервисов. */

export const dynamic = "force-dynamic";

type SP = { tab?: string; m?: string; ym?: string };

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const sb = createAdmin();
  const cid = await resolvePortal(sb, params.token);
  let title = "Проект";
  if (cid) {
    const { data } = await sb.from("clients").select("name, surname").eq("id", cid).maybeSingle();
    if (data) title = `${[data.name, data.surname].filter(Boolean).join(" ")} · проект`;
  }
  return { title, description: "Сценарии, публикации и статистика проекта", robots: { index: false, follow: false } };
}

const RU_M = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const RU_MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const RU_WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const NET: Record<string, string> = { all: "Все сети", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook", threads: "Threads" };

const fmt = (v: number | null | undefined) => {
  if (v == null) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace(".0", "") + " млн";
  if (v >= 10_000) return Math.round(v / 1000) + " тыс";
  return Math.round(v).toLocaleString("ru-RU");
};
const pct = (cur: number | null, prev: number | null) => (cur == null || !prev ? null : Math.round(((cur - prev) / prev) * 100));
const ymLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${RU_M[m - 1]} ${y}`; };
const dShort = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${RU_MON[m - 1]}`;
};
const dLong = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${d} ${RU_MON[m - 1]}, ${RU_WD[wd]}`;
};
const addMonth = (ym: string, k: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const lastDay = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/* Статус сценария словами для клиента (без внутренних колонок доски). */
function stage(s: any): { label: string; tone: "mut" | "vio" | "amb" | "blu" | "grn" | "lim" } {
  if (s.video_status === "published") return { label: "Опубликован", tone: "lim" };
  if (s.video_status === "ready") return { label: "Готов к публикации", tone: "grn" };
  if (s.script_status === "approved" && s.video_status === "review") return { label: "Монтаж на проверке", tone: "amb" };
  if (s.script_status === "approved" && s.video_status === "inProgress") return { label: "В монтаже", tone: "blu" };
  if (s.script_status === "approved") return { label: "Сценарий согласован", tone: "vio" };
  if (s.script_status === "review") return { label: "Сценарий на согласовании", tone: "amb" };
  if (s.script_status === "inProgress") return { label: "Пишем сценарий", tone: "blu" };
  return { label: "Идея", tone: "mut" };
}
const titleOf = (s: any) => String(s.hook_text || s.hook || "").replace(/^Сценарий #\d+$/, "").trim() || `Ролик #${s.order_num || s.id}`;

const reelsCached = (c: any, ym: string) => unstable_cache(
  async () => {
    const from = `${ym}-01`, to = `${ym}-${String(lastDay(ym)).padStart(2, "0")}`;
    try { return await clientReels(createAdmin(), c, from, to); } catch { return [] as ClientReel[]; }
  },
  ["portal-reels", String(c.id), ym],
  { revalidate: 3600 },
)();

export default async function PortalPage({ params, searchParams }: { params: { token: string }; searchParams: SP }) {
  const sb = createAdmin();
  const cid = await resolvePortal(sb, params.token);
  if (!cid) notFound();

  const [{ data: c }, { data: monthsRaw }, { data: scriptsRaw }, { data: pubsRaw }, { data: statsRaw }] = await Promise.all([
    sb.from("clients").select("id, name, surname, metricool_blog_id, timezone, platforms, package").eq("id", cid).maybeSingle(),
    sb.from("client_months").select("month_number, start_date, end_date, package").eq("client_id", cid).order("month_number"),
    sb.from("scripts").select("id, month_number, order_num, hook, hook_text, body_text, cta, post_caption, script_status, video_status, pub_date, published_url, video_url, our_views, our_likes, our_comments, content_type")
      .eq("client_id", cid).order("order_num"),
    sb.from("publications").select("id, script_id, content_type, publish_at, pub_status").eq("client_id", cid).not("publish_at", "is", null),
    sb.from("client_monthly_stats").select("ym, network, posts_count, views, reach, likes, comments, saves, shares, followers_start, followers_end").eq("client_id", cid).order("ym"),
  ]);
  if (!c) notFound();

  const tz = c.timezone || "America/New_York";
  const today = utcToZonedInput(new Date().toISOString(), tz).slice(0, 10);
  const nowYm = today.slice(0, 7);
  const tab = searchParams.tab === "plan" || searchParams.tab === "stats" ? searchParams.tab : "work";
  const name = [c.name, c.surname].filter(Boolean).join(" ");
  const scripts = (scriptsRaw || []) as any[];
  const pubs = (pubsRaw || []) as any[];
  const months = (monthsRaw || []) as any[];
  const base = `/p/${params.token}`;
  const href = (q: Record<string, string | number | undefined>) =>
    base + "?" + Object.entries(q).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

  // общие цифры для шапки
  const published = scripts.filter(s => s.video_status === "published").length;

  return (
    <div className="pt">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="pt-hero">
        <div className="pt-wrap">
          <div className="pt-eyebrow"><i />ПРОЕКТ</div>
          <h1>{name}</h1>
          <p className="pt-sub">Сценарии, публикации и статистика в одном месте. Данные обновляются автоматически.</p>
          <div className="pt-kpis">
            <div><b>{published}</b><span>роликов вышло</span></div>
            <div><b>{scripts.filter(s => s.video_status !== "published" && s.script_status && s.script_status !== "notStarted").length}</b><span>в работе</span></div>
            <div><b>{months.length || "—"}</b><span>{months.length === 1 ? "месяц работы" : "месяцев работы"}</span></div>
          </div>
          <nav className="pt-tabs">
            <a className={tab === "work" ? "on" : ""} href={href({ tab: "work" })}>Работа</a>
            <a className={tab === "plan" ? "on" : ""} href={href({ tab: "plan" })}>План публикаций</a>
            <a className={tab === "stats" ? "on" : ""} href={href({ tab: "stats" })}>Статистика</a>
          </nav>
        </div>
      </header>

      <main className="pt-wrap pt-main">
        {tab === "work" && <WorkTab scripts={scripts} months={months} today={today} sel={searchParams.m} href={href} />}
        {tab === "plan" && <PlanTab scripts={scripts} pubs={pubs} tz={tz} ym={/^\d{4}-\d{2}$/.test(searchParams.ym || "") ? searchParams.ym! : nowYm} nowYm={nowYm} today={today} href={href} />}
        {tab === "stats" && <StatsTab c={c} rows={(statsRaw || []) as any[]} ymParam={searchParams.ym} nowYm={nowYm} href={href} />}
      </main>
      <footer className="pt-wrap pt-foot">Ссылка личная — не пересылайте её посторонним.</footer>
    </div>
  );
}

/* ---------------- Работа ---------------- */
function WorkTab({ scripts, months, today, sel, href }: { scripts: any[]; months: any[]; today: string; sel?: string; href: (q: any) => string }) {
  const nums = Array.from(new Set([...months.map(m => m.month_number), ...scripts.map(s => s.month_number)].filter(Boolean))).sort((a, b) => a - b);
  const cur = months.find(m => m.start_date <= today && today <= m.end_date)?.month_number ?? nums[nums.length - 1];
  const m = sel === "all" ? 0 : Number(sel) || cur || 0;
  const list = scripts.filter(s => !m || s.month_number === m);
  const mi = months.find(x => x.month_number === m);
  const cnt = (f: (s: any) => boolean) => list.filter(f).length;
  const groups = [
    { k: "idea", t: "Идеи", f: (s: any) => !s.script_status || s.script_status === "notStarted" },
    { k: "script", t: "Сценарии", f: (s: any) => ["inProgress", "review"].includes(s.script_status) },
    { k: "montage", t: "Монтаж", f: (s: any) => s.script_status === "approved" && !["ready", "published"].includes(s.video_status) },
    { k: "ready", t: "Готово к выходу", f: (s: any) => s.video_status === "ready" },
    { k: "pub", t: "Опубликовано", f: (s: any) => s.video_status === "published" },
  ];
  return (
    <>
      <div className="pt-chips">
        {nums.map(n => {
          const mm = months.find(x => x.month_number === n);
          return <a key={n} className={m === n ? "on" : ""} href={href({ tab: "work", m: n })}>Месяц {n}{mm ? ` · ${dShort(mm.start_date)} – ${dShort(mm.end_date)}` : ""}{n === cur ? " · сейчас" : ""}</a>;
        })}
        <a className={m === 0 ? "on" : ""} href={href({ tab: "work", m: "all" })}>Все месяцы</a>
      </div>

      <div className="pt-pipe">
        {groups.map(g => <div key={g.k}><b>{cnt(g.f)}</b><span>{g.t}</span></div>)}
      </div>
      {mi?.package ? <p className="pt-note">По пакету в этом месяце {mi.package} роликов · опубликовано {cnt(s => s.video_status === "published")}.</p> : null}

      {groups.map(g => {
        const items = list.filter(g.f).sort((a, b) => (a.pub_date || "9") < (b.pub_date || "9") ? -1 : (a.pub_date || "9") > (b.pub_date || "9") ? 1 : (a.order_num || 0) - (b.order_num || 0));
        if (!items.length) return null;
        return (
          <section key={g.k} className="pt-sec">
            <h2 className="pt-h2"><i />{g.t} <em>{items.length}</em></h2>
            <div className="pt-list">
              {items.map(s => <ScriptCard key={s.id} s={s} />)}
            </div>
          </section>
        );
      })}
      {!list.length && <div className="pt-empty">В этом месяце пока нет сценариев.</div>}
    </>
  );
}

function ScriptCard({ s }: { s: any }) {
  const st = stage(s);
  const showVideo = !!s.video_url && ["review", "ready", "published"].includes(s.video_status || "");
  const hasText = s.body_text || s.cta || s.post_caption || s.hook_text;
  return (
    <details className="pt-card">
      <summary>
        <span className="pt-num">#{s.order_num || "—"}</span>
        <span className="pt-title">{titleOf(s)}</span>
        <span className="pt-meta">
          {s.pub_date && <span className="pt-date">{dShort(s.pub_date)}</span>}
          {s.video_status === "published" && s.our_views != null && <span className="pt-views">{fmt(s.our_views)} просм.</span>}
          <span className={`pt-pill ${st.tone}`}>{st.label}</span>
        </span>
      </summary>
      <div className="pt-body">
        {s.hook_text && <Field t="Хук">{s.hook_text}</Field>}
        {s.body_text && <Field t="Текст сценария">{s.body_text}</Field>}
        {s.cta && <Field t="Призыв в конце">{s.cta}</Field>}
        {s.post_caption && <Field t="Описание к публикации">{s.post_caption}</Field>}
        {!hasText && <p className="pt-note">Текст сценария ещё пишется.</p>}
        {s.video_status === "published" && (s.our_views != null || s.our_likes != null) && (
          <div className="pt-mini">
            <span><b>{fmt(s.our_views)}</b> просмотров</span><span><b>{fmt(s.our_likes)}</b> лайков</span><span><b>{fmt(s.our_comments)}</b> комментариев</span>
          </div>
        )}
        <div className="pt-actions">
          {s.published_url && <a className="pt-btn" href={s.published_url} target="_blank" rel="noreferrer">Открыть публикацию ↗</a>}
        </div>
        {showVideo && <video className="pt-video" src={s.video_url} controls preload="none" playsInline />}
      </div>
    </details>
  );
}
const Field = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <div className="pt-field"><div className="pt-ft">{t}</div><div className="pt-fv">{children}</div></div>
);

/* ---------------- План ---------------- */
function PlanTab({ scripts, pubs, tz, ym, nowYm, today, href }: { scripts: any[]; pubs: any[]; tz: string; ym: string; nowYm: string; today: string; href: (q: any) => string }) {
  type Item = { day: string; time: string; title: string; kind: string; status: "pub" | "sched" | "plan" };
  const pubByScript = new Map(pubs.filter(p => p.script_id).map(p => [p.script_id, p]));
  const items: Item[] = [];
  for (const s of scripts) {
    const p = pubByScript.get(s.id);
    const at = p?.publish_at ? utcToZonedInput(p.publish_at, tz) : "";
    const day = (at || s.pub_date || "").slice(0, 10);
    if (!day.startsWith(ym)) continue;
    const status = s.video_status === "published" || p?.pub_status === "published" ? "pub" : p?.pub_status === "scheduled" ? "sched" : "plan";
    items.push({ day, time: at.slice(11, 16), title: titleOf(s), kind: s.content_type === "carousel" ? "Карусель" : "Ролик", status });
  }
  for (const p of pubs) {
    if (p.script_id && p.content_type !== "story") continue;
    const at = utcToZonedInput(p.publish_at, tz);
    if (!at.startsWith(ym)) continue;
    items.push({ day: at.slice(0, 10), time: at.slice(11, 16), title: p.content_type === "story" ? "Сторис" : p.content_type === "carousel" ? "Карусель" : "Публикация",
      kind: p.content_type === "story" ? "Сторис" : p.content_type === "carousel" ? "Карусель" : "Ролик",
      status: p.pub_status === "published" ? "pub" : p.pub_status === "scheduled" ? "sched" : "plan" });
  }
  items.sort((a, b) => (a.day + a.time < b.day + b.time ? -1 : 1));
  const byDay = new Map<string, Item[]>();
  for (const it of items) (byDay.get(it.day) || byDay.set(it.day, []).get(it.day)!).push(it);
  const n = (k: Item["status"]) => items.filter(i => i.status === k && i.kind !== "Сторис").length;
  const ST = { pub: ["Вышло", "lim"], sched: ["Запланировано", "vio"], plan: ["В плане", "mut"] } as const;

  // календарная сетка месяца (пн — первый день)
  const [y, mo] = ym.split("-").map(Number);
  const first = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: lastDay(ym) }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`)];

  return (
    <>
      <div className="pt-monthnav">
        <a href={href({ tab: "plan", ym: addMonth(ym, -1) })}>← {RU_M[Number(addMonth(ym, -1).slice(5)) - 1]}</a>
        <b>{ymLabel(ym)}</b>
        <a href={href({ tab: "plan", ym: addMonth(ym, 1) })}>{RU_M[Number(addMonth(ym, 1).slice(5)) - 1]} →</a>
      </div>
      <div className="pt-pipe three">
        <div><b>{n("pub")}</b><span>вышло</span></div>
        <div><b>{n("sched")}</b><span>запланировано</span></div>
        <div><b>{n("plan")}</b><span>в плане</span></div>
      </div>

      <div className="pt-cal">
        {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map(d => <div key={d} className="pt-wd">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="pt-cell empty" />;
          const list = byDay.get(d) || [];
          return (
            <div key={i} className={`pt-cell${d === today ? " today" : ""}${list.length ? " has" : ""}`}>
              <span className="pt-dn">{Number(d.slice(8))}</span>
              {list.slice(0, 3).map((it, j) => <span key={j} className={`pt-dot ${ST[it.status][1]}`} title={it.title} />)}
            </div>
          );
        })}
      </div>

      {items.length === 0 && <div className="pt-empty">В этом месяце публикаций нет{ym > nowYm ? " — план появится ближе к датам" : ""}.</div>}
      <div className="pt-days">
        {Array.from(byDay.entries()).map(([day, list]) => (
          <div key={day} className={`pt-day${day === today ? " today" : ""}`}>
            <div className="pt-dayh">{dLong(day)}{day === today ? " · сегодня" : ""}</div>
            {list.map((it, j) => (
              <div key={j} className="pt-row">
                <span className="pt-time">{it.time || "—"}</span>
                <span className="pt-kind">{it.kind}</span>
                <span className="pt-title">{it.title}</span>
                <span className={`pt-pill ${ST[it.status][1]}`}>{ST[it.status][0]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="pt-note">Время — по вашему часовому поясу.</p>
    </>
  );
}

/* ---------------- Статистика ---------------- */
async function StatsTab({ c, rows, ymParam, nowYm, href }: { c: any; rows: any[]; ymParam?: string; nowYm: string; href: (q: any) => string }) {
  const add = (a: number | null, b: number | null) => (a == null && b == null ? null : (a || 0) + (b || 0));
  const yms = Array.from(new Set(rows.map(r => r.ym))).sort();
  if (!yms.length) return <div className="pt-empty">Статистика появится после первого месяца публикаций.</div>;
  const agg = (ym: string, net = "all") => rows.filter(r => r.ym === ym && (net === "all" || r.network === net)).reduce((a, r) => ({
    posts: Math.max(a.posts || 0, r.posts_count || 0) || null,
    views: add(a.views, r.views), reach: add(a.reach, r.reach), likes: add(a.likes, r.likes), comments: add(a.comments, r.comments),
    saves: add(a.saves, r.saves), shares: add(a.shares, r.shares), fStart: add(a.fStart, r.followers_start), fEnd: add(a.fEnd, r.followers_end),
  }), { posts: null, views: null, reach: null, likes: null, comments: null, saves: null, shares: null, fStart: null, fEnd: null } as any);
  const ym = ymParam && yms.includes(ymParam) ? ymParam : yms[yms.length - 1];
  const i = yms.indexOf(ym);
  const cur = agg(ym), prev = i > 0 ? agg(yms[i - 1]) : null;
  const gain = (x: any) => (x && x.fEnd != null && x.fStart != null ? x.fEnd - x.fStart : null);
  const maxV = Math.max(1, ...yms.map(y => agg(y).views || 0));
  const nets = Array.from(new Set(rows.filter(r => r.ym === ym).map(r => r.network)));
  const reels = c.metricool_blog_id ? await reelsCached(c, ym) : [];
  const sorted = [...reels].sort((a, b) => b.views - a.views);
  const topCut = sorted.length >= 5 ? sorted[Math.min(4, sorted.length - 1)].views : Infinity;

  const Tile = ({ t, v, p, hint }: { t: string; v: number | null; p: number | null; hint?: string }) => (
    <div className="pt-tile">
      <div className="pt-tt">{t}</div>
      <div className="pt-tv">{fmt(v)}</div>
      <div className={`pt-tp ${p == null ? "" : p >= 0 ? "up" : "down"}`}>{p == null ? (hint || " ") : `${p >= 0 ? "▲" : "▼"} ${Math.abs(p)}% к прошлому месяцу`}</div>
    </div>
  );

  return (
    <>
      <div className="pt-chips">
        {yms.map(y => <a key={y} className={y === ym ? "on" : ""} href={href({ tab: "stats", ym: y })}>{ymLabel(y)}{y === nowYm ? " · идёт" : ""}</a>)}
      </div>
      {ym === nowYm && <p className="pt-note">Месяц ещё идёт — цифры на сегодня и будут расти.</p>}

      <div className="pt-tiles">
        <Tile t="Просмотры" v={cur.views} p={pct(cur.views, prev?.views ?? null)} />
        <Tile t="Охват" v={cur.reach} p={pct(cur.reach, prev?.reach ?? null)} />
        <Tile t="Новые подписчики" v={gain(cur)} p={null} hint={cur.fEnd != null ? `всего ${fmt(cur.fEnd)}` : undefined} />
        <Tile t="Роликов вышло" v={cur.posts} p={null} />
        <Tile t="Лайки" v={cur.likes} p={pct(cur.likes, prev?.likes ?? null)} />
        <Tile t="Комментарии" v={cur.comments} p={pct(cur.comments, prev?.comments ?? null)} />
        <Tile t="Сохранения" v={cur.saves} p={pct(cur.saves, prev?.saves ?? null)} />
        <Tile t="Репосты" v={cur.shares} p={pct(cur.shares, prev?.shares ?? null)} />
      </div>

      <section className="pt-sec">
        <h2 className="pt-h2"><i />Просмотры по месяцам</h2>
        <div className="pt-bars">
          {yms.map(y => { const v = agg(y).views || 0; return (
            <a key={y} href={href({ tab: "stats", ym: y })} className={`pt-bar${y === ym ? " on" : ""}`}>
              <span className="pt-bv">{fmt(v)}</span>
              <span className="pt-bf" style={{ height: `${Math.max(3, Math.round((v / maxV) * 100))}%` }} />
              <span className="pt-bl">{RU_M[Number(y.slice(5)) - 1].slice(0, 3)}</span>
            </a>
          ); })}
        </div>
      </section>

      {nets.length > 1 && (
        <section className="pt-sec">
          <h2 className="pt-h2"><i />По соцсетям · {ymLabel(ym)}</h2>
          <div className="pt-tablewrap"><table className="pt-table">
            <thead><tr><th>Сеть</th><th>Роликов</th><th>Просмотры</th><th>Лайки</th><th>Комментарии</th><th>Подписчики</th></tr></thead>
            <tbody>{nets.map(n => { const a = agg(ym, n); const g = gain(a); return (
              <tr key={n}><td>{NET[n] || n}</td><td>{fmt(a.posts)}</td><td>{fmt(a.views)}</td><td>{fmt(a.likes)}</td><td>{fmt(a.comments)}</td>
                <td>{a.fEnd != null ? `${fmt(a.fEnd)}${g ? ` (${g > 0 ? "+" : ""}${fmt(g)})` : ""}` : "—"}</td></tr>
            ); })}</tbody>
          </table></div>
        </section>
      )}

      <section className="pt-sec">
        <h2 className="pt-h2"><i />Каждый ролик · {ymLabel(ym)} <em>{reels.length}</em></h2>
        {!reels.length && <div className="pt-empty">За этот месяц роликов нет.</div>}
        {!!reels.length && (
          <div className="pt-tablewrap"><table className="pt-table reels">
            <thead><tr><th>Дата</th><th>Сеть</th><th>Ролик</th><th>Просмотры</th><th>Лайки</th><th>Комм.</th><th>Сохр.</th><th>Репосты</th><th>Досмотр</th></tr></thead>
            <tbody>{reels.map((r, k) => (
              <tr key={k} className={r.views >= topCut && r.views > 0 ? "top" : ""}>
                <td>{dShort(r.date)}</td>
                <td>{NET[r.net] || r.net}</td>
                <td className="pt-rt">{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : r.title}{r.views >= topCut && r.views > 0 && <span className="pt-top">топ</span>}</td>
                <td className="num">{fmt(r.views)}</td><td className="num">{fmt(r.likes)}</td><td className="num">{fmt(r.comments)}</td>
                <td className="num">{fmt(r.saves)}</td><td className="num">{fmt(r.shares)}</td>
                <td className="num">{r.retention != null ? `${Math.round(r.retention)}%` : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="pt-note">«Топ» — пять самых просматриваемых роликов месяца. Нажмите на название, чтобы открыть публикацию.</p>
      </section>
    </>
  );
}

const CSS = `
:root{--bg:#070526;--neon:#b6f500;--teal:#2ee6c8;--vio:#6b2cff;--paper:#f3f2ff;--paper2:#e9e6fb;--ink:#0c0938;--mut:#5b5880;--card:#fff;--brd:#dcd7f5;--disp:'Unbounded',sans-serif;--sans:'Manrope',system-ui,sans-serif}
html,body{background:var(--paper)!important;color:var(--ink)}
.pt{min-height:100vh;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:17px;line-height:1.5}
.pt *{box-sizing:border-box}
.pt a{color:inherit}
.pt-wrap{max-width:1100px;margin:0 auto;padding:0 16px}
.pt-hero{background:var(--bg);color:#f3f2ff;position:relative;overflow:hidden;padding:34px 0 0}
.pt-hero:before{content:"";position:absolute;inset:0;background:radial-gradient(420px 260px at 8% 0%,rgba(182,245,0,.18),transparent 70%),radial-gradient(420px 260px at 95% 10%,rgba(46,230,200,.16),transparent 70%),radial-gradient(520px 300px at 50% 120%,rgba(107,44,255,.28),transparent 70%);pointer-events:none}
.pt-hero .pt-wrap{position:relative}
.pt-eyebrow{display:flex;align-items:center;gap:10px;color:var(--teal);font-size:13px;font-weight:700;letter-spacing:.14em}
.pt-eyebrow i{display:block;width:28px;height:2px;background:var(--teal)}
.pt h1{font-family:var(--disp);font-weight:800;font-size:clamp(28px,5vw,44px);letter-spacing:-.01em;margin:10px 0 6px;line-height:1.1}
.pt-sub{color:#b9b6dc;margin:0 0 20px;font-size:17px}
.pt-kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:22px}
.pt-kpis div{background:#100c3d;border:1px solid rgba(182,245,0,.14);border-radius:16px;padding:12px 18px;min-width:130px}
.pt-kpis b{display:block;font-family:var(--disp);font-size:26px;color:var(--neon);text-shadow:0 0 30px rgba(182,245,0,.35)}
.pt-kpis span{font-size:14px;color:#b9b6dc}
.pt-tabs{display:flex;gap:4px;overflow-x:auto}
.pt-tabs a{padding:13px 18px;text-decoration:none;font-weight:700;font-size:16px;color:#b9b6dc;border-radius:14px 14px 0 0;white-space:nowrap}
.pt-tabs a.on{background:var(--paper);color:var(--ink)}
.pt-main{padding-top:22px;padding-bottom:30px}
.pt-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.pt-chips a{padding:8px 14px;border-radius:12px;border:1px solid var(--brd);background:var(--card);text-decoration:none;font-size:15px;font-weight:600;color:var(--mut)}
.pt-chips a.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.pt-pipe{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:10px}
.pt-pipe.three{grid-template-columns:repeat(3,1fr)}
.pt-pipe div{background:var(--card);border:1px solid var(--brd);border-radius:14px;padding:12px 14px;box-shadow:0 10px 30px -18px rgba(12,9,56,.25)}
.pt-pipe b{display:block;font-family:var(--disp);font-size:26px;color:var(--vio)}
.pt-pipe span{font-size:15px;color:var(--mut)}
.pt-note{color:var(--mut);font-size:15px;margin:8px 0 14px}
.pt-sec{margin-top:24px}
.pt-h2{display:flex;align-items:center;gap:10px;font-family:var(--disp);font-size:20px;font-weight:700;margin:0 0 12px}
.pt-h2 i{display:block;width:22px;height:2px;background:var(--vio)}
.pt-h2 em{font-style:normal;font-family:var(--sans);font-size:14px;font-weight:700;background:var(--paper2);color:var(--mut);padding:2px 9px;border-radius:9px}
.pt-list{display:flex;flex-direction:column;gap:8px}
.pt-card{background:var(--card);border:1px solid var(--brd);border-radius:14px;box-shadow:0 10px 30px -18px rgba(12,9,56,.25)}
.pt-card summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;padding:13px 16px;flex-wrap:wrap}
.pt-card summary::-webkit-details-marker{display:none}
.pt-card[open] summary{border-bottom:1px solid var(--brd)}
.pt-num{font-weight:800;color:var(--mut);font-size:14px;min-width:34px}
.pt-title{flex:1;min-width:200px;font-weight:700}
.pt-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pt-date{font-size:14px;color:var(--mut);font-weight:600}
.pt-views{font-size:14px;font-weight:800;color:var(--vio)}
.pt-pill{font-size:13px;font-weight:700;padding:4px 10px;border-radius:999px;white-space:nowrap}
.pt-pill.mut{background:var(--paper2);color:var(--mut)}
.pt-pill.vio{background:rgba(107,44,255,.12);color:var(--vio)}
.pt-pill.amb{background:#fff1d6;color:#8a5a00}
.pt-pill.blu{background:#ddf3ff;color:#075985}
.pt-pill.grn{background:#d9f7ec;color:#065f46}
.pt-pill.lim{background:var(--neon);color:#0b1200}
.pt-body{padding:14px 16px 16px}
.pt-field{margin-bottom:12px}
.pt-ft{font-size:13px;font-weight:800;letter-spacing:.06em;color:var(--vio);margin-bottom:3px}
.pt-fv{white-space:pre-wrap}
.pt-mini{display:flex;gap:16px;flex-wrap:wrap;margin:6px 0 10px;color:var(--mut)}
.pt-mini b{color:var(--ink);font-family:var(--disp)}
.pt-actions{display:flex;gap:8px;flex-wrap:wrap}
.pt-btn{display:inline-block;background:var(--neon);color:#0b1200!important;text-decoration:none;font-family:var(--disp);font-weight:700;font-size:14px;padding:10px 14px;border-radius:14px}
.pt-video{display:block;margin-top:12px;max-width:320px;width:100%;border-radius:12px;background:#000}
.pt-empty{background:var(--card);border:1px dashed var(--brd);border-radius:14px;padding:22px;color:var(--mut);text-align:center}
.pt-monthnav{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
.pt-monthnav a{text-decoration:none;font-weight:700;color:var(--vio);font-size:15px}
.pt-monthnav b{font-family:var(--disp);font-size:20px;text-transform:capitalize}
.pt-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin:16px 0}
.pt-wd{text-align:center;font-size:13px;font-weight:700;color:var(--mut)}
.pt-cell{min-height:54px;background:var(--card);border:1px solid var(--brd);border-radius:10px;padding:5px 6px;display:flex;flex-wrap:wrap;align-content:flex-start;gap:3px}
.pt-cell.empty{background:transparent;border:none}
.pt-cell.today{outline:2px solid var(--vio)}
.pt-dn{width:100%;font-size:13px;font-weight:700;color:var(--mut)}
.pt-cell.has .pt-dn{color:var(--ink)}
.pt-dot{width:10px;height:10px;border-radius:50%}
.pt-dot.lim{background:var(--neon);border:1px solid #8fbf00}
.pt-dot.vio{background:var(--vio)}
.pt-dot.mut{background:#c9c4ea}
.pt-days{display:flex;flex-direction:column;gap:10px}
.pt-day{background:var(--card);border:1px solid var(--brd);border-radius:14px;padding:10px 14px}
.pt-day.today{border-color:var(--vio)}
.pt-dayh{font-weight:800;margin-bottom:4px}
.pt-row{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--paper2);flex-wrap:wrap}
.pt-dayh + .pt-row{border-top:none}
.pt-time{font-weight:700;color:var(--mut);min-width:48px;font-size:15px}
.pt-kind{font-size:13px;font-weight:700;color:var(--mut);background:var(--paper);padding:2px 8px;border-radius:8px}
.pt-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.pt-tile{background:var(--card);border:1px solid var(--brd);border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px -18px rgba(12,9,56,.25)}
.pt-tt{font-size:14px;font-weight:700;color:var(--mut)}
.pt-tv{font-family:var(--disp);font-size:26px;font-weight:800;margin-top:4px}
.pt-tp{font-size:13px;font-weight:700;color:var(--mut);margin-top:4px;min-height:18px}
.pt-tp.up{color:#047857}.pt-tp.down{color:#b91c1c}
.pt-bars{display:flex;gap:8px;align-items:flex-end;height:200px;background:var(--card);border:1px solid var(--brd);border-radius:14px;padding:14px}
.pt-bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;text-decoration:none;gap:4px}
.pt-bf{width:100%;max-width:56px;background:#c9c4ea;border-radius:8px 8px 3px 3px}
.pt-bar.on .pt-bf{background:var(--vio)}
.pt-bv{font-size:12px;font-weight:700;color:var(--mut)}
.pt-bl{font-size:13px;font-weight:700;color:var(--mut)}
.pt-tablewrap{overflow-x:auto;background:var(--card);border:1px solid var(--brd);border-radius:14px}
.pt-table{width:100%;border-collapse:collapse;font-size:16px}
.pt-table th{background:var(--ink);color:#fff;text-align:left;font-weight:700;padding:10px 12px;font-size:14px;white-space:nowrap}
.pt-table td{padding:9px 12px;border-top:1px solid var(--brd);white-space:nowrap}
.pt-table tr:nth-child(even) td{background:var(--paper)}
.pt-table td.num{text-align:right;font-variant-numeric:tabular-nums}
.pt-table tr.top td{background:rgba(182,245,0,.22)}
.pt-rt{white-space:normal!important;min-width:240px;max-width:420px}
.pt-rt a{text-decoration:none;font-weight:600}
.pt-rt a:hover{text-decoration:underline}
.pt-top{margin-left:8px;background:var(--neon);color:#0b1200;font-size:12px;font-weight:800;padding:1px 7px;border-radius:7px}
.pt-foot{color:var(--mut);font-size:14px;padding-top:10px;padding-bottom:40px}
@media (max-width:760px){
  .pt-pipe{grid-template-columns:repeat(2,1fr)}
  .pt-pipe.three{grid-template-columns:repeat(3,1fr)}
  .pt-tiles{grid-template-columns:repeat(2,1fr)}
  .pt-cell{min-height:40px;padding:3px 4px}
  .pt-dot{width:7px;height:7px}
  .pt-title{min-width:0;flex-basis:100%}
  .pt-bv{display:none}
}
`;
