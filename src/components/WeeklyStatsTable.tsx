"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { RefreshCw, FileDown, ExternalLink } from "lucide-react";

/* Итоги по неделям за всё время работы клиента (client_weekly_stats).
   Заполняет /api/stats/collect-week, ежедневный крон добирает прошлые недели. */

type W = {
  week_start: string; week_end: string; reels_count: number | null; our_videos: number | null;
  views: number | null; reach: number | null; likes: number | null; comments: number | null;
  saves: number | null; shares: number | null; er: number | null; avg_retention: number | null;
  followers_end: number | null; followers_gained: number | null; followers_lost: number | null;
  top_post: any | null;
};

const RU_GEN = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const label = (a: string, b: string) => `${+a.slice(8, 10)}–${+b.slice(8, 10)} ${RU_GEN[+b.slice(5, 7) - 1]}`;
const fmt = (v: number | null | undefined) => {
  if (v == null) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace(".0", "") + " млн";
  if (v >= 10_000) return Math.round(v / 1000) + " тыс";
  return v.toLocaleString("ru-RU");
};
const pct = (cur: number | null, prev: number | null | undefined) => (cur == null || !prev ? null : Math.round(((cur - prev) / prev) * 100));

export default function WeeklyStatsTable({ clientId }: { clientId: number }) {
  const supabase = createClient();
  const [rows, setRows] = useState<W[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "last" | "all">("");
  const [missing, setMissing] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("client_weekly_stats").select("*")
      .eq("client_id", clientId).order("week_start");
    if (error && /does not exist|schema cache/i.test(error.message)) setMissing(true);
    setRows((data || []) as W[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [clientId]);

  async function collect(mode: "last" | "all") {
    setBusy(mode);
    try {
      const q = mode === "all" ? "all=1" : "weeks=8";
      const r = await fetch(`/api/stats/collect-week?clientId=${clientId}&${q}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) alert(j?.error || "не удалось собрать недели");
      await load();
    } catch (e: any) { alert(String(e)); }
    setBusy("");
  }

  const maxViews = useMemo(() => Math.max(1, ...rows.map(r => r.views || 0)), [rows]);
  const totals = useMemo(() => rows.reduce((a, r) => ({
    reels: a.reels + (r.reels_count || 0), views: a.views + (r.views || 0), reach: a.reach + (r.reach || 0),
    likes: a.likes + (r.likes || 0), comments: a.comments + (r.comments || 0),
    saves: a.saves + (r.saves || 0), shares: a.shares + (r.shares || 0),
    gained: a.gained + (r.followers_gained || 0), lost: a.lost + (r.followers_lost || 0),
  }), { reels: 0, views: 0, reach: 0, likes: 0, comments: 0, saves: 0, shares: 0, gained: 0, lost: 0 }), [rows]);

  if (loading) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>По неделям · за всё время</div>
        <div style={{ flex: 1 }} />
        <button onClick={() => collect("last")} disabled={!!busy} className="v2-act" style={{ height: 30 }}>
          <RefreshCw size={12} className={busy === "last" ? "spin" : ""} /> Последние 8 недель
        </button>
        <button onClick={() => collect("all")} disabled={!!busy} className="v2-act ghost" style={{ height: 30 }}>
          {busy === "all" ? "Собираю…" : "Собрать за всё время"}
        </button>
        <a href={`/api/clients/${clientId}/report-all`} target="_blank" rel="noreferrer" className="v2-act gr" style={{ height: 30 }}>
          <FileDown size={12} /> Отчёт клиенту за всё время
        </a>
      </div>

      {missing ? (
        <div className="card" style={{ padding: 16, borderRadius: 14, fontSize: 13, color: "var(--t2)" }}>
          Нужно прогнать миграцию <code>MIGRATION_2026-09-21_client_weekly_stats.sql</code> в Supabase.
        </div>
      ) : !rows.length ? (
        <div className="card" style={{ padding: 16, borderRadius: 14, fontSize: 13, color: "var(--t2)" }}>
          Недель пока нет. Нажми «Собрать за всё время» — CRM посчитает каждую неделю с первой публикации.
        </div>
      ) : (<>
        <div className="card" style={{ padding: 14, borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 92 }}>
            {rows.slice(-26).map(r => (
              <div key={r.week_start} title={`${label(r.week_start, r.week_end)} · ${fmt(r.views)} просмотров`}
                style={{ flex: 1, minWidth: 6, height: Math.max(3, Math.round(((r.views || 0) / maxViews) * 80)), borderRadius: "4px 4px 1px 1px", background: "linear-gradient(180deg, var(--cy), var(--pu))", opacity: .85 }} />
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 8 }}>
            просмотры по неделям · всего за {rows.length} нед.: {fmt(totals.views)} просмотров, {fmt(totals.reels)} роликов, подписчиков +{fmt(totals.gained - totals.lost)}
          </div>
        </div>

        <div className="card" style={{ padding: 0, borderRadius: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860, fontSize: 12.5 }}>
            <thead><tr style={{ color: "var(--t3)", fontSize: 10, textTransform: "uppercase", letterSpacing: .4 }}>
              {["Неделя", "Роликов", "Просмотры", "Охват", "Лайки", "Комм.", "Сохр.", "Репосты", "ER", "Подписчики"].map(h => (
                <th key={h} style={{ textAlign: h === "Неделя" ? "left" : "right", padding: "10px 11px", fontWeight: 800 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[...rows].reverse().map((r, k, arr) => {
                const p = arr[k + 1];
                const d = pct(r.views, p?.views);
                const net = (r.followers_gained || 0) - (r.followers_lost || 0);
                return (
                  <tr key={r.week_start} style={{ borderTop: "1px solid var(--brd)" }}>
                    <td style={{ padding: "9px 11px", fontWeight: 700, color: "var(--t1)", whiteSpace: "nowrap" }}>{label(r.week_start, r.week_end)}</td>
                    <td style={{ padding: "9px 11px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmt(r.reels_count)}{r.our_videos ? <span style={{ fontSize: 10.5, color: "var(--t3)" }}> · наших {r.our_videos}</span> : null}
                    </td>
                    <td style={{ padding: "9px 11px", textAlign: "right", fontWeight: 700, color: "var(--t1)" }}>
                      {fmt(r.views)}{d != null && <span style={{ marginLeft: 6, fontSize: 10.5, color: d >= 0 ? "var(--gr)" : "var(--rd)" }}>{d >= 0 ? "+" : ""}{d}%</span>}
                    </td>
                    <td style={{ padding: "9px 11px", textAlign: "right" }}>{fmt(r.reach)}</td>
                    <td style={{ padding: "9px 11px", textAlign: "right" }}>{fmt(r.likes)}</td>
                    <td style={{ padding: "9px 11px", textAlign: "right" }}>{fmt(r.comments)}</td>
                    <td style={{ padding: "9px 11px", textAlign: "right" }}>{fmt(r.saves)}</td>
                    <td style={{ padding: "9px 11px", textAlign: "right" }}>{fmt(r.shares)}</td>
                    <td style={{ padding: "9px 11px", textAlign: "right" }}>{r.er != null ? `${String(r.er).replace(".", ",")}%` : "—"}</td>
                    <td style={{ padding: "9px 11px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {r.followers_end != null ? fmt(r.followers_end) : "—"}
                      {r.followers_gained != null ? <span style={{ marginLeft: 6, fontSize: 10.5, color: net >= 0 ? "var(--gr)" : "var(--rd)" }}>{net >= 0 ? "+" : ""}{fmt(net)}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--t3)", lineHeight: 1.6 }}>
          Неделя — с понедельника по воскресенье. ER — лайки, комментарии, сохранения и репосты делим на охват.
          Прирост подписчиков — из метрик аккаунта Metricool (пришло минус ушло).
        </div>
      </>)}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
