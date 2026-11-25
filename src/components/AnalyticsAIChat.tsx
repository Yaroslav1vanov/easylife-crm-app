"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import ClientChatTab, { ANALYTICS_FLAG_KEY } from "@/components/chat/ClientChatTab";

/* Вкладка «Аналитика» → «Чат с ИИ»: обсуждение цифр клиента. Тот же чат «📊 Аналитика», что во вкладке «Чат·ИИ»,
   только рядом с цифрами и с готовыми вопросами. ИИ получает ANALYTICS.md: ролики за 90 дней с пролистываниями,
   средним просмотром и удержанием, нормы аккаунта, аудиторию ChatPlace и тексты наших сценариев к роликам. */

const QUICK = [
  "Какие хуки работают у этого клиента, а какие нет? Сравни первые фразы лучших и худших роликов",
  "На какой фразе уходят зрители в роликах за последние 2 недели? Что общего у этих мест?",
  "Почему ролики за последнюю неделю набрали меньше нормы аккаунта?",
  "Сравни наши сценарии с референсами: где мы потеряли то, что держало зрителя у оригинала?",
  "Кто смотрит аккаунт (страны, пол, возраст) и совпадает ли это с теми, кому клиент продаёт?",
  "Сделай 3 хука для следующего ролика на основе того, что уже залетело",
  "Что показать клиенту на созвоне в конце месяца: 3 главные цифры и вывод",
];

export default function AnalyticsAIChat({ clientId, aiEnabled, draft }: { clientId: number; aiEnabled: boolean; draft?: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [q, setQ] = useState<string | undefined>(draft);
  useEffect(() => { if (draft) setQ(draft); }, [draft]);
  useEffect(() => {
    createClient().from("app_settings").select("value").eq("key", ANALYTICS_FLAG_KEY).maybeSingle()
      .then(({ data }) => setOn(data?.value === "on"));
  }, []);

  if (on === null) return null;
  if (!on) return <div className="v2-card" style={{ padding: 18, color: "var(--t2)", fontSize: 13 }}>Чат по аналитике включится после миграции <code>MIGRATION_2026-11-25_chat_analytics.sql</code>.</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 16, alignItems: "start" }} className="an-ai">
      <style>{`@media (max-width: 900px) { .an-ai { grid-template-columns: 1fr !important; } }`}</style>
      <ClientChatTab clientId={clientId} aiEnabled={aiEnabled} threadsOnly={["analytics"]} initialThread="analytics" draft={q} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: .6 }}>Быстрые вопросы</div>
        {QUICK.map(t => (
          <button key={t} onClick={() => setQ(t + " ")} className="v2-card"
            style={{ textAlign: "left", padding: "10px 12px", fontSize: 12.5, lineHeight: 1.4, color: "var(--t1)", cursor: "pointer", border: "1px solid var(--brd)", fontFamily: "inherit" }}>{t}</button>
        ))}
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: .6, marginTop: 10 }}>Как это работает</div>
        <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.5 }}>
          ИИ видит ролики за 90 дней: просмотры, сколько пролистали в первые секунды, сколько в среднем смотрят, сохранения и репосты, а рядом текст нашего сценария и референса.
          По темпу речи он находит фразу, на которой уходят. Точный график удержания по секундам Instagram отдаёт только в приложении: можно прислать в чат скриншот графика из статистики ролика, ИИ его прочитает.
          У любого ролика в таблице «Обзора» есть кнопка «обсудить».
        </div>
      </div>
    </div>
  );
}
