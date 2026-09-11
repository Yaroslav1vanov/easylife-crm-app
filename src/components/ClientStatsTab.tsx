"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { RefreshCw, TrendingUp, TrendingDown, ExternalLink } from "lucide-react";

/* Вкладка «Статистика» в карточке клиента: помесячные итоги из client_monthly_stats,
   сравнение с прошлым месяцем, график просмотров, лучшие ролики месяца. */

type Row = {
  ym: string; network: string; posts_count: number | null; reels_count: number | null;
  views: number | null; reach: number | null; likes: number | null; comments: number | null;
  saves: number | null; shares: number | null; avg_watch_sec: number | null;
  followers_start: number | null; followers_end: number | null; top_posts: any[] | null; collected_at: string;
};

const NET_LABEL: Record<string, string> = { all: "Все сети", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook" };
const RU_M = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const ymLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${RU_M[m - 1]} ${y}`; };
const ymShort = (ym: string) => RU_M[Number(ym.slice(5, 7)) - 1].slice(0, 3);
const fmt = (v: number | null | undefined) => {
  if (v == null) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace(".0", "") + " млн";
  if (v >= 10_000) return Math.round(v / 1000) + " тыс";
  return v.toLocaleString("ru-RU");
};
const pct = (cur: number | null, prev: number | null) => (cur == null || !prev ? null : Math.round(((cur - prev) / prev) * 100));
const curYm = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

export default function ClientStatsTab({ clientId, hasMetricool }: { clientId: number; hasMetricool: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [net, setNet] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("client_monthly_stats").select("*").eq("client_id", clientId).order("ym");
    setRows((data || []) as Row[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [clientId]);

  async function refresh() {
    setBusy(true);
    // текущий месяц «на сегодня» и прошлый — их цифры ещё меняются
    const d = new Date(); const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const pYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    for (const ym of [pYm, curYm()]) {
      try { await fetch(`/api/stats/collect?ym=${ym}&clientId=${clientId}`, { cache: "no-store" }); } catch {}
    }
    await load(); setBusy(false);
  }

  const nets = useMemo(() => ["all", ...Array.from(new Set(rows.map(r => r.network)))], [rows]);

  // по месяцам: одна сеть или сумма всех
  const months = useMemo(() => {
    const by: Record<string, Row[]> = {};
    for (const r of rows) if (net === "all" || r.network === net) (by[r.ym] ||= []).push(r);
    const add = (a: number | null, b: number | null) => (a == null && b == null ? null : (a || 0) + (b || 0));
    return Object.keys(by).sort().map(ym => {
      const list = by[ym];
      const agg = list.reduce((acc, r) => ({
        posts: add(acc.posts, r.posts_count), views: add(acc.views, r.views), reach: add(acc.reach, r.reach),
        likes: add(acc.likes, r.likes), comments: add(acc.comments, r.comments), saves: add(acc.saves, r.saves), shares: add(acc.shares, r.shares),
        fStart: add(acc.fStart, r.followers_start), fEnd: add(acc.fEnd, r.followers_end),
      }), { posts: null, views: null, reach: null, likes: null, comments: null, saves: null, shares: null, fStart: null, fEnd: null } as any);
      const top = list.flatMap(r => (r.top_posts || []).map(p => ({ ...p, network: r.network })))
        .sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
      return { ym, ...agg, top, partial: ym === curYm() };
    });
  }, [rows, net]);

  useEffect(() => { if (months.length && (!sel || !months.find(m => m.ym === sel))) setSel(months[months.length - 1].ym); }, [months]);

  if (loading) return <div style={{ padding: 30, color: "var(--t3)", textAlign: "center" }}>Загрузка…</div>;
  if (!hasMetricool) return (
    <div className="card" style={{ padding: 22, borderRadius: 14, color: "var(--t2)", fontSize: 13 }}>
      Клиент не привязан к Metricool — статистику собирать не из чего. Привяжи бренд во вкладке «Настройки».
    </div>
  );

  const i = months.findIndex(m => m.ym === sel);
  const cur = months[i], prev = i > 0 ? months[i - 1] : null;
  const maxViews = Math.max(1, ...months.map(m => m.views || 0));

  const Tile = ({ label, v, p, hint }: { label: string; v: number | null; p: number | null; hint?: string }) => (
    <div style={{ padding: "13px 14px", borderRadius: 12, background: "var(--inset)", border: "1px solid var(--brd)" }}>
      <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 800, color: "var(--t1)", marginTop: 5, lineHeight: 1.1 }}>{fmt(v)}</div>
      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, display: "flex", alignItems: "center", gap: 4,
        color: p == null ? "var(--t3)" : p >= 0 ? "var(--gr)" : "var(--rd)" }}>
        {p == null ? (hint || "нет сравнения") : <>{p >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{p >= 0 ? "+" : ""}{p}% к прошлому</>}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {nets.map(n => (
          <button key={n} onClick={() => setNet(n)} className={`v2-chip ${net === n ? "pu" : "mut"}`} style={{ height: 32, padding: "0 12px", cursor: "pointer" }}>{NET_LABEL[n] || n}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={refresh} disabled={busy} className="v2-act" style={{ height: 32 }}>
          <RefreshCw size={13} className={busy ? "spin" : ""} /> {busy ? "Собираю…" : "Обновить"}
        </button>
      </div>

      {!months.length ? (
        <div className="card" style={{ padding: 22, borderRadius: 14, color: "var(--t2)", fontSize: 13, lineHeight: 1.6 }}>
          Статистики пока нет. Нажми «Обновить» — CRM соберёт текущий и прошлый месяц из Metricool.
        </div>
      ) : (<>
        {/* график просмотров по месяцам */}
        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)", marginBottom: 12 }}>Просмотры по месяцам · клик по столбцу — детали</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 150 }}>
            {months.map(m => {
              const h = Math.max(4, Math.round(((m.views || 0) / maxViews) * 120));
              const on = m.ym === sel;
              return (
                <button key={m.ym} onClick={() => setSel(m.ym)} style={{ flex: 1, minWidth: 34, maxWidth: 90, background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: on ? "var(--t1)" : "var(--t3)" }}>{fmt(m.views)}</span>
                  <div style={{ width: "100%", height: h, borderRadius: "6px 6px 2px 2px",
                    background: on ? "linear-gradient(180deg, var(--cy), var(--pu))" : "rgba(157,107,255,0.28)",
                    opacity: m.partial ? 0.55 : 1, outline: m.partial ? "1px dashed var(--pu)" : "none" }} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: on ? "var(--pu)" : "var(--t3)" }}>{ymShort(m.ym)}{m.partial ? "*" : ""}</span>
                </button>
              );
            })}
          </div>
          {months.some(m => m.partial) && <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 8 }}>* текущий месяц — на сегодня, ещё идёт</div>}
        </div>

        {cur && (<>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>
            {ymLabel(cur.ym)}{cur.partial ? " · на сегодня" : ""}
            {prev && <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600 }}> · сравнение с {ymLabel(prev.ym)}</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            <Tile label="Роликов" v={cur.posts} p={pct(cur.posts, prev?.posts)} />
            <Tile label="Просмотры" v={cur.views} p={pct(cur.views, prev?.views)} />
            <Tile label="Охват" v={cur.reach} p={pct(cur.reach, prev?.reach)} />
            <Tile label="Лайки" v={cur.likes} p={pct(cur.likes, prev?.likes)} />
            <Tile label="Комментарии" v={cur.comments} p={pct(cur.comments, prev?.comments)} />
            <Tile label="Сохранения" v={cur.saves} p={pct(cur.saves, prev?.saves)} />
            <Tile label="Репосты" v={cur.shares} p={pct(cur.shares, prev?.shares)} />
            <Tile label="Подписчики" v={cur.fEnd} p={cur.fStart && cur.fEnd ? Math.round(((cur.fEnd - cur.fStart) / cur.fStart) * 1000) / 10 : null}
              hint={cur.fEnd == null ? "история с сентября" : "за месяц"} />
          </div>

          {cur.top?.length > 0 && (
            <div className="card" style={{ padding: 16, borderRadius: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)", marginBottom: 10 }}>Лучшие ролики — {ymLabel(cur.ym)}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {cur.top.map((p: any, k: number) => (
                  <a key={k} href={p.url || "#"} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 11, padding: 9, borderRadius: 10, background: "var(--inset)", border: "1px solid var(--brd)", textDecoration: "none" }}>
                    <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 15, fontWeight: 800, color: k === 0 ? "var(--yl)" : "var(--t3)", width: 18, textAlign: "center" }}>{k + 1}</span>
                    {p.image ? <img src={p.image} alt="" style={{ width: 40, height: 52, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "var(--track)" }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} /> : null}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title || "без подписи"}</div>
                      <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 2 }}>
                        {NET_LABEL[p.network] || p.network} · ❤ {fmt(p.likes)} · 💬 {fmt(p.comments)}{p.saves != null ? ` · 🔖 ${fmt(p.saves)}` : ""}{p.shares != null ? ` · ↗ ${fmt(p.shares)}` : ""}
                      </div>
                    </div>
                    <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 14, fontWeight: 800, color: "var(--t1)", whiteSpace: "nowrap" }}>{fmt(p.views)}</span>
                    <ExternalLink size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
                  </a>
                ))}
              </div>
            </div>
          )}
        </>)}

        {/* таблица всех месяцев */}
        <div className="card" style={{ padding: 0, borderRadius: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720, fontSize: 12.5 }}>
            <thead><tr style={{ color: "var(--t3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>
              {["Месяц", "Роликов", "Просмотры", "Охват", "Лайки", "Комм.", "Сохр.", "Репосты", "Подписчики"].map(h => <th key={h} style={{ textAlign: h === "Месяц" ? "left" : "right", padding: "11px 12px", fontWeight: 800 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {[...months].reverse().map((m, k, arr) => {
                const p = arr[k + 1];
                const d = pct(m.views, p?.views);
                return (
                  <tr key={m.ym} onClick={() => setSel(m.ym)} style={{ borderTop: "1px solid var(--brd)", cursor: "pointer", background: m.ym === sel ? "rgba(157,107,255,0.08)" : "transparent" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--t1)" }}>{ymLabel(m.ym)}{m.partial ? " *" : ""}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(m.posts)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "var(--t1)" }}>
                      {fmt(m.views)}{d != null && <span style={{ marginLeft: 6, fontSize: 10.5, color: d >= 0 ? "var(--gr)" : "var(--rd)" }}>{d >= 0 ? "+" : ""}{d}%</span>}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(m.reach)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(m.likes)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(m.comments)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(m.saves)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(m.shares)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{m.fEnd != null ? `${fmt(m.fEnd)}${m.fStart != null ? ` (${m.fEnd - m.fStart >= 0 ? "+" : ""}${fmt(m.fEnd - m.fStart)})` : ""}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--t3)", lineHeight: 1.6 }}>
          Данные — из Metricool, с момента подключения бренда. Подписчики — из ежедневных снимков CRM, история по ним с сентября 2026. Прошлый месяц собирается автоматически 1-го числа.
        </div>
      </>)}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
