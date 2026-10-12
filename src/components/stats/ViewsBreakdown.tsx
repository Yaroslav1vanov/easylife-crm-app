"use client";
import { useEffect, useState } from "react";

/* «Кто смотрит» — просмотры аккаунта Instagram за 7/30/90 дней:
   от подписчиков или от новых людей (рост аккаунта идёт за счёт новых), и что смотрят — рилсы, сторис, посты. */
type Row = { day: string; followers_views: number | null; nonfollowers_views: number | null; reels_views: number | null; stories_views: number | null; posts_views: number | null };
const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 1e6 ? 0 : 1).replace(".0", "")} тыс.` : Math.round(n).toLocaleString("ru-RU"));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default function ViewsBreakdown({ clientId }: { clientId: number }) {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setBusy(true);
    fetch(`/api/clients/${clientId}/breakdown?days=${days}`).then(r => r.json()).then(j => setRows(j.rows || [])).catch(() => setRows([])).finally(() => setBusy(false));
  }, [clientId, days]);

  const sum = (k: keyof Row) => (rows || []).reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const fol = sum("followers_views"), non = sum("nonfollowers_views"), reels = sum("reels_views"), stories = sum("stories_views"), posts = sum("posts_views");
  const who = fol + non, what = reels + stories + posts;
  const max = Math.max(1, ...(rows || []).map(r => (r.followers_views || 0) + (r.nonfollowers_views || 0)));

  return (
    <div className="v2-card" style={{ padding: 14, marginBottom: 14 }}>
      <div className="flex items-center gap-2 flex-wrap">
        <b style={{ fontSize: 13.5 }}>Кто смотрит · Instagram</b>
        <span style={{ fontSize: 12, color: "var(--t3)" }}>все просмотры аккаунта: от подписчиков или новых людей, и что смотрят</span>
        <div style={{ flex: 1 }} />
        {[7, 30, 90].map(d => <button key={d} onClick={() => setDays(d)} className={`v2-chip ${days === d ? "pu" : "mut"}`} style={{ cursor: "pointer", height: 28, padding: "0 10px" }}>{d} дн.</button>)}
      </div>
      {busy && !rows ? <div style={{ fontSize: 12.5, color: "var(--t3)", marginTop: 10 }}>Загружаю…</div>
        : !who && !what ? <div style={{ fontSize: 12.5, color: "var(--t3)", marginTop: 10 }}>Нет данных: Instagram не подключён к бренду аналитики или просмотров за период нет.</div>
        : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginTop: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>От новых людей</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--gr)" }}>{pct(non, who)}%</div>
                <div style={{ fontSize: 11.5, color: "var(--t3)" }}>{fmt(non)} не подписаны · {fmt(fol)} подписчики</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>Что смотрят</div>
                <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginTop: 8, background: "var(--track)" }}>
                  <div style={{ width: `${pct(reels, what)}%`, background: "var(--pu)" }} />
                  <div style={{ width: `${pct(stories, what)}%`, background: "var(--cy)" }} />
                  <div style={{ width: `${pct(posts, what)}%`, background: "var(--or)" }} />
                </div>
                <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 6 }}>
                  <span style={{ color: "var(--pu)" }}>■</span> рилсы {pct(reels, what)}% · <span style={{ color: "var(--cy)" }}>■</span> сторис {pct(stories, what)}% · <span style={{ color: "var(--or)" }}>■</span> посты {pct(posts, what)}%
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90, marginTop: 12 }} title="по дням: зелёное — новые люди, фиолетовое — подписчики">
              {(rows || []).map(r => {
                const f = r.followers_views || 0, n = r.nonfollowers_views || 0;
                return (
                  <div key={r.day} title={`${r.day.slice(8, 10)}.${r.day.slice(5, 7)}: новые ${fmt(n)}, подписчики ${fmt(f)}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                    <div style={{ height: `${(n / max) * 100}%`, background: "var(--gr)", opacity: 0.85, borderRadius: "2px 2px 0 0" }} />
                    <div style={{ height: `${(f / max) * 100}%`, background: "var(--pu)", opacity: 0.85 }} />
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4 }}>по дням: <span style={{ color: "var(--gr)" }}>■</span> новые люди · <span style={{ color: "var(--pu)" }}>■</span> подписчики</div>
          </>
        )}
    </div>
  );
}
