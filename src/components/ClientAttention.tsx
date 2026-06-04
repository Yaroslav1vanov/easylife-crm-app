"use client";
import { ClientMonth, Script } from "@/lib/database";
import { Target, Scissors, UserCheck, CheckCircle2, CalendarClock, AlertTriangle, type LucideIcon } from "lucide-react";

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

type Props = { currentM: ClientMonth | null; scripts: Script[]; todayIso: string };
type Item = { Icon: LucideIcon; color: string; text: string };

export default function ClientAttention({ currentM, scripts, todayIso }: Props) {
  const plan = currentM?.package || 0;
  const published = scripts.filter(s => s.video_status === "published").length;
  const review = scripts.filter(s => s.script_status === "review").length;
  const inMontage = scripts.filter(s => s.script_status === "approved" && s.video_status === "inProgress").length;
  const readyToPublish = scripts.filter(s => s.video_status === "ready").length;
  const leftToPlan = Math.max(0, plan - published);
  const daysToEnd = currentM ? daysBetween(todayIso, currentM.end_date) : null;
  const overdue = daysToEnd !== null && daysToEnd < 0 && published < plan;

  const items: Item[] = [];
  if (overdue) items.push({ Icon: AlertTriangle, color: "#ff5c7a", text: `Просрочка дедлайна на ${-daysToEnd!} дн. · сдано ${published}/${plan}` });
  if (review > 0) items.push({ Icon: UserCheck, color: "#42d4f4", text: `${review} ${plural(review, "сценарий", "сценария", "сценариев")} на согласовании` });
  if (inMontage > 0) items.push({ Icon: Scissors, color: "#ffae42", text: `${inMontage} ${plural(inMontage, "ролик", "ролика", "роликов")} в монтаже` });
  if (readyToPublish > 0) items.push({ Icon: CheckCircle2, color: "#34d399", text: `${readyToPublish} ${plural(readyToPublish, "ролик готов", "ролика готовы", "роликов готовы")} к публикации` });
  if (leftToPlan > 0) items.push({ Icon: Target, color: "#9d6bff", text: `До выполнения плана осталось ${leftToPlan} ${plural(leftToPlan, "ролик", "ролика", "роликов")}` });
  if (daysToEnd !== null && !overdue) items.push({ Icon: CalendarClock, color: daysToEnd <= 5 ? "#ffae42" : "#42d4f4", text: `До дедлайна ${daysToEnd} ${plural(daysToEnd, "день", "дня", "дней")}` });

  return (
    <div className="card" style={{ padding: 18, borderRadius: 16, fontFamily: "'Manrope', sans-serif", height: "100%" }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", marginBottom: 16 }}>Что требует внимания</h3>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--t3)", textAlign: "center", padding: "24px 0" }}>✅ Всё под контролем</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((it, i) => {
            const I = it.Icon;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: `${it.color}1f`, color: it.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${it.color}3a` }}>
                  <I size={13} strokeWidth={2} />
                </div>
                <span style={{ fontSize: 12.5, color: "var(--t1)", fontWeight: 600 }}>{it.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
