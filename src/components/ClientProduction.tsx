"use client";
import { ClientMonth, Script } from "@/lib/database";
import { Pen, Scissors, Send } from "lucide-react";

const RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function fmtDateShort(s: string | null | undefined) {
  if (!s) return "—";
  const [, mm, dd] = String(s).slice(0, 10).split("-");
  const m = parseInt(mm, 10), d = parseInt(dd, 10);
  if (!m || !d) return String(s);
  return `${d} ${RU_MONTHS_GEN[m - 1]}`;
}

type Props = { currentM: ClientMonth | null; scripts: Script[] };

export default function ClientProduction({ currentM, scripts }: Props) {
  const plan = currentM?.package || 0;
  const pct = (n: number) => plan > 0 ? Math.round((n / plan) * 100) : 0;

  // Сценарии
  const scrApproved = scripts.filter(s => s.script_status === "approved").length;
  const scrInProgress = scripts.filter(s => s.script_status === "inProgress").length;
  const scrReview = scripts.filter(s => s.script_status === "review").length;
  // Монтаж (только утверждённые сценарии идут в монтаж)
  const mntReady = scripts.filter(s => s.video_status === "ready").length;
  const mntInProgress = scripts.filter(s => s.script_status === "approved" && s.video_status === "inProgress").length;
  // Публикация
  const pubPublished = scripts.filter(s => s.video_status === "published").length;
  const pubReady = scripts.filter(s => s.video_status === "ready").length;

  const blocks = [
    {
      title: "Сценарии", Icon: Pen, color: "#9d6bff", barPct: pct(scrApproved),
      stats: [
        { v: scrApproved, l: "готовы" },
        { v: scrInProgress, l: "в работе" },
        { v: scrReview, l: "на согласовании" },
      ],
    },
    {
      title: "Монтаж", Icon: Scissors, color: "#ffae42", barPct: pct(mntReady + pubPublished),
      stats: [
        { v: mntReady, l: "готовы" },
        { v: mntInProgress, l: "в работе" },
      ],
    },
    {
      title: "Публикация", Icon: Send, color: "#34d399", barPct: pct(pubPublished),
      stats: [
        { v: pubPublished, l: "опубликовано" },
        { v: pubReady, l: "готовы к публикации" },
      ],
    },
  ];

  return (
    <div className="card" style={{ padding: 18, borderRadius: 16, marginBottom: 14, fontFamily: "'Manrope', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)" }}>Производство</h3>
        {currentM && <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600 }}>M{currentM.month_number}: {fmtDateShort(currentM.start_date)} → {fmtDateShort(currentM.end_date)}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }} className="prod-grid">
        {blocks.map(b => {
          const I = b.Icon;
          return (
            <div key={b.title} style={{ padding: 16, borderRadius: 14, background: "rgba(0,0,0,0.22)", border: "1px solid var(--brd)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: `${b.color}22`, color: b.color, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${b.color}44` }}>
                  <I size={15} strokeWidth={1.8} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)" }}>{b.title}</span>
              </div>
              <div style={{ display: "flex", gap: 22, marginBottom: 16 }}>
                {b.stats.map((s, i) => (
                  <div key={i}>
                    <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 26, fontWeight: 800, color: s.v > 0 ? "var(--t1)" : "var(--t3)", lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600, marginTop: 5 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, b.barPct)}%`, height: "100%", background: b.color, borderRadius: 3 }} />
              </div>
            </div>
          );
        })}
      </div>
      <style jsx>{`
        @media (max-width: 900px) {
          :global(.prod-grid) { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
