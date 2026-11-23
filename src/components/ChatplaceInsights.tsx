"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { AlertTriangle } from "lucide-react";

/* Статистика Instagram из ChatPlace (официальный API Instagram через бота клиента) — то, чего нет в Metricool:
   путь от просмотров до заявки, кто смотрит по странам, досмотр и пролистывания по роликам, воронки.
   Данные — последний снимок client_chatplace_insights (пишется кнопкой «Обновить» и каждый день в 05:00 UTC). */

type Snap = { day: string; availability: string | null; summary: any; videos: any[] | null; funnels: any[] | null };

const COUNTRY: Record<string, string> = {
  US: "США", RU: "Россия", KZ: "Казахстан", UA: "Украина", UZ: "Узбекистан", KG: "Киргизия", BY: "Беларусь", AM: "Армения",
  TJ: "Таджикистан", PL: "Польша", DE: "Германия", GE: "Грузия", AZ: "Азербайджан", MD: "Молдова", IL: "Израиль", CA: "Канада",
  GB: "Великобритания", TR: "Турция", AE: "ОАЭ", TH: "Таиланд", ID: "Индонезия", ES: "Испания", IT: "Италия", FR: "Франция",
  LT: "Литва", LV: "Латвия", EE: "Эстония", CZ: "Чехия", MX: "Мексика", BR: "Бразилия", IN: "Индия",
};
const fmt = (v: number | null | undefined) => (v == null ? "—" : v >= 1e6 ? `${(v / 1e6).toFixed(2).replace(".", ",")} млн` : v >= 1e4 ? `${Math.round(v / 1e3)} тыс.` : v.toLocaleString("ru-RU"));
const pc = (a: number | null | undefined, b: number | null | undefined, digits = 1) => (a == null || !b ? null : `${((a / b) * 100).toFixed(digits).replace(".", ",")}%`);
const dd = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/** Слова из призывов в описаниях роликов: «Напишите FACTO», «напишите в комментариях TOTAL». */
function ctaWords(captions: string[]): string[] {
  const out = new Set<string>();
  for (const c of captions) for (const m of Array.from(c.matchAll(/(?:[Нн]апишите|[Пп]ишите)[^.!?\n]{0,40}?([A-ZА-ЯЁ]{3,})/g))) out.add(m[1]);
  return Array.from(out);
}

export default function ChatplaceInsights({ clientId, version = 0 }: { clientId: number; version?: number }) {
  const supabase = createClient();
  const [snap, setSnap] = useState<Snap | null | undefined>(undefined);
  useEffect(() => {
    supabase.from("client_chatplace_insights").select("day, availability, summary, videos, funnels")
      .eq("client_id", clientId).order("day", { ascending: false }).limit(1).maybeSingle()
      .then(({ data, error }) => setSnap(error ? null : (data as Snap | null)));
  }, [clientId, version]);

  if (snap === undefined) return null;
  if (!snap) return <div className="st-soon"><b>Скоро:</b> визиты в профиль, переходы на сайт, страны зрителей и кодовые слова. Появятся здесь после подключения ChatPlace к аккаунту клиента.</div>;
  if (snap.availability !== "available" || !snap.summary) return (
    <div className="st-soon"><b>ChatPlace подключён, но статистики нет:</b> Instagram не выдал разрешение на статистику ({snap.availability || "нет ответа"}).
      Нужно переподключить аккаунт клиента в ChatPlace с полными правами. Снимок от {dd(snap.day)}.</div>
  );

  const m = snap.summary.metrics || {}, br = snap.summary.breakdowns || {};
  const funnels = (snap.funnels || []);
  const active = funnels.filter(f => f.active);
  const activeWords = new Set(active.flatMap(f => (f.words || []).map((w: string) => w.toUpperCase())));
  const since = new Date(new Date(snap.day).getTime() - 30 * 864e5).toISOString().slice(0, 10);
  const reels = (snap.videos || []).filter(v => v.type === "reels" && v.date && v.date >= since).sort((a, b) => (a.date < b.date ? 1 : -1));
  const missing = ctaWords(reels.map(v => v.caption || "")).filter(w => !activeWords.has(w));
  const countries: { label: string; share: number }[] = br.countries || [];
  const us = countries.find(c => c.label === "US")?.share ?? 0;
  const ages: { label: string; share: number }[] = br.ages || [];
  const men = (br.genders || []).find((g: any) => g.label === "M")?.share;
  const nonFol = (br.viewerTypesViews || br.viewerTypes || []).find((g: any) => g.label === "non_followers")?.share;
  const funnelIn = active.reduce((s, f) => s + (f.total || 0), 0);

  const steps = [
    { l: "Просмотры", v: m.views, p: null as string | null, h: "все просмотры аккаунта за 30 дней" },
    { l: "Охват, человек", v: m.reach, p: pc(m.reach, m.views, 0), h: "от просмотров" },
    { l: "Визиты в профиль", v: m.profileViews, p: pc(m.profileViews, m.reach, 2), h: "от охвата" },
    { l: "Переходы на сайт", v: m.websiteClicks, p: pc(m.websiteClicks, m.profileViews), h: "от визитов в профиль" },
    { l: "Вошли в воронки", v: funnelIn, p: null, h: active.length ? `активные: ${active.map(f => (f.words || [])[0]).filter(Boolean).join(", ")} · за всё время` : "активных воронок нет" },
  ];

  return (<>
    <div className="panel cp-blk">
      <h3>От просмотров до заявок <span className="st-h3sub">30 дней · по {dd(m && snap.summary.dataThrough || snap.day)}</span></h3>
      <div className="sub">Процент — доля от предыдущего шага. Источник: статистика Instagram аккаунта.</div>
      <div className="cp-steps">
        {steps.map(s => (
          <div key={s.l} className="cp-step">
            <div className="l">{s.l}</div>
            <div className="n">{fmt(s.v)}</div>
            <div className="h">{s.p ? <b>{s.p}</b> : null}{s.p ? " " : ""}{s.h}</div>
          </div>
        ))}
      </div>
      <div className="cp-row">
        <span>Подписчики: <b>{fmt(m.followers)}</b>{m.followersDelta != null ? <> ({m.followersDelta >= 0 ? "+" : ""}{m.followersDelta} за 30 дн.)</> : null}</span>
        {m.follows != null && <span>подписались <b>{fmt(m.follows)}</b> · отписались <b>{fmt(m.unfollows)}</b></span>}
        {nonFol != null && <span>от неподписанных <b>{Math.round(nonFol * 100)}%</b> просмотров</span>}
        {m.profileLinksTaps != null && <span>нажатия на кнопки связи <b>{m.profileLinksTaps}</b></span>}
      </div>
      {missing.length > 0 && (
        <div className="cp-warn"><AlertTriangle size={15} /> В роликах призыв написать <b>{missing.join(", ")}</b>, но активной воронки на это слово нет — людям никто не ответит.</div>
      )}
    </div>

    <div className="st-two">
      <div className="panel cp-blk">
        <h3>Кто смотрит · страны</h3>
        <div className="sub">Доля зрителей аккаунта за 30 дней</div>
        <div className="cp-bars">
          {countries.slice(0, 6).map(c => (
            <div key={c.label} className="cp-bar"><span>{COUNTRY[c.label] || c.label}</span><i><em style={{ width: `${Math.max(2, c.share * 100)}%` }} /></i><b>{Math.round(c.share * 100)}%</b></div>
          ))}
        </div>
        {countries.length > 0 && us < 0.3 && (
          <div className="cp-warn"><AlertTriangle size={15} /> {us ? <>Зрителей из США всего {(us * 100).toFixed(1).replace(".", ",")}%.</> : <>США нет даже в первой десятке стран зрителей.</>} Если клиент продаёт в США — темы и хуки привязываем к его рынку: город, цены в долларах, местные проблемы.</div>
        )}
        <div className="cp-row">
          {ages.slice(0, 2).map(a => <span key={a.label}>{a.label}: <b>{Math.round(a.share * 100)}%</b></span>)}
          {men != null && <span>мужчин <b>{Math.round(men * 100)}%</b></span>}
        </div>
      </div>

      <div className="panel cp-blk">
        <h3>Воронки по кодовым словам</h3>
        <div className="sub">Сколько людей зашло в каждую воронку за всё время</div>
        {funnels.length ? (
          <div className="tw"><table className="cp-tbl">
            <thead><tr><th>Воронка</th><th>Слова</th><th className="r">Вошли</th><th>Последний вход</th></tr></thead>
            <tbody>{[...funnels].sort((a, b) => Number(b.active) - Number(a.active) || b.total - a.total).map(f => (
              <tr key={f.id} className={f.active ? "" : "off"}>
                <td>{f.name}{!f.active && <span className="cp-off"> выкл.</span>}</td>
                <td>{(f.words || []).slice(0, 4).join(", ") || "—"}</td>
                <td className="r">{f.total}</td>
                <td>{f.last_run ? dd(f.last_run) : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="sub" style={{ marginTop: 12 }}>Воронок у бота нет.</div>}
      </div>
    </div>


    <style dangerouslySetInnerHTML={{ __html: `
.cp-blk h3 .st-h3sub{font-family:var(--sans);font-size:13px;font-weight:600;color:var(--t3)}
.cp-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:14px}
.cp-step{background:var(--inset);border:1px solid var(--brd);border-radius:14px;padding:12px 14px;min-width:0}
.cp-step .l{font-size:13px;color:var(--t2);font-weight:600}
.cp-step .n{font-family:var(--disp);font-size:22px;font-weight:700;color:var(--t1);margin-top:4px}
.cp-step .h{font-size:12.5px;color:var(--t3);margin-top:4px;line-height:1.35}
.cp-step .h b{color:var(--pu)}
.cp-row{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:12px;font-size:13.5px;color:var(--t2)}
.cp-row b{color:var(--t1)}
.cp-warn{display:flex;gap:8px;align-items:flex-start;margin-top:12px;padding:10px 12px;border-radius:12px;font-size:13.5px;line-height:1.45;color:var(--t1);background:rgba(var(--or-rgb),.12);border:1px solid rgba(var(--or-rgb),.35)}
.cp-warn svg{flex:none;margin-top:2px;color:var(--or)}
.cp-bars{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.cp-bar{display:grid;grid-template-columns:110px minmax(0,1fr) 44px;align-items:center;gap:10px;font-size:13.5px;color:var(--t2)}
.cp-bar i{height:10px;border-radius:6px;background:var(--track);overflow:hidden}
.cp-bar em{display:block;height:100%;border-radius:6px;background:var(--pu)}
.cp-bar b{text-align:right;color:var(--t1)}
.cp-tbl{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:12px}
.cp-tbl th{text-align:left;font-size:12px;color:var(--t3);font-weight:700;padding:6px 8px;border-bottom:1px solid var(--brd);white-space:nowrap}
.cp-tbl td{padding:8px;border-bottom:1px solid var(--brd);color:var(--t1);vertical-align:top}
.cp-tbl .r{text-align:right;white-space:nowrap}
.cp-tbl td.cap{max-width:420px}
.cp-tbl td.cap a{color:var(--t1);text-decoration:none;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cp-tbl td.cap a:hover{color:var(--pu)}
.cp-tbl td.bad{color:var(--rd);font-weight:700}
.cp-tbl tr.off td{color:var(--t3)}
.cp-off{font-size:12px;color:var(--t3)}
@media (max-width:1100px){.cp-steps{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:620px){.cp-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.cp-bar{grid-template-columns:90px minmax(0,1fr) 40px}.cp-tbl td.cap{min-width:200px}}
` }} />
  </>);
}
