"use client";
import { useState } from "react";
import DocsSection from "./DocsSection";
import BrandSection from "./BrandSection";
import MediaSection from "./MediaSection";
import UnpackingSection from "./UnpackingSection";
import ForecastSection from "./ForecastSection";

/*
 * Вкладка «Стратегия» в карточке клиента: всё, чтобы команда и ИИ работали с клиентом в одном стиле.
 * Аудит и стратегию читают тимлиды, бренд-кит и медиатеку — инструменты производства и тени Системы.
 */

const PARTS = [
  { id: "audit", label: "Аудит" },
  { id: "unpacking", label: "Распаковка" },
  { id: "forecast", label: "Прогноз" },
  { id: "strategy", label: "Контент-стратегия" },
  { id: "brand", label: "Бренд" },
  { id: "media", label: "Медиатека" },
] as const;
type Part = (typeof PARTS)[number]["id"];

/** Распаковку и прогноз видят тимлид, ассистент и владелец; монтажёру они не нужны. */
const PLANNING: Part[] = ["unpacking", "forecast"];

export default function ClientStrategyTab({ clientId, clientName, canPlan = true }: { clientId: number; clientName: string; canPlan?: boolean }) {
  const parts = PARTS.filter((p) => canPlan || !PLANNING.includes(p.id));
  const [part, setPart] = useState<Part>(canPlan ? "audit" : "media");
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto mb-4" style={{ borderBottom: "1px solid var(--brd)" }}>
        {parts.map((p) => (
          <button key={p.id} onClick={() => setPart(p.id)} className="px-3 py-2 text-[12px] font-semibold shrink-0"
            style={{ background: "transparent", border: "none", cursor: "pointer",
              borderBottom: part === p.id ? "2px solid var(--cy)" : "2px solid transparent",
              color: part === p.id ? "var(--cy)" : "var(--t2)" }}>
            {p.label}
          </button>
        ))}
      </div>

      {part === "audit" && (
        <DocsSection clientId={clientId} kind="audit" mode="file"
          hint="Аудит Instagram клиента. Загружается готовым файлом и открывается как есть — его не правят." />
      )}
      {part === "unpacking" && canPlan && <UnpackingSection clientId={clientId} />}
      {part === "forecast" && canPlan && <ForecastSection clientId={clientId} />}
      {part === "strategy" && (
        <DocsSection clientId={clientId} kind="strategy" mode="text"
          hint="Живой рабочий документ: что говорим, кому и зачем. Каждое сохранение — новая версия, старые остаются в истории." />
      )}
      {part === "brand" && <BrandSection clientId={clientId} clientName={clientName} />}
      {part === "media" && <MediaSection clientId={clientId} />}
    </div>
  );
}
