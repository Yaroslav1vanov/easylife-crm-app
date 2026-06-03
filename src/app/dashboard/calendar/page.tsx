"use client";
import { Calendar } from "lucide-react";
import SoonPage from "@/components/SoonPage";

export default function CalendarPage() {
  return (
    <SoonPage
      Icon={Calendar}
      accent="#ffae42"
      title="Календарь"
      description="Единый календарь публикаций, дедлайнов сценариев и съёмок по всем клиентам. Перетаскивание дат, цветовая разметка по клиенту."
    />
  );
}
