"use client";
import { Layers } from "lucide-react";
import SoonPage from "@/components/SoonPage";

export default function ProductionPage() {
  return (
    <SoonPage
      Icon={Layers}
      accent="#9d6bff"
      title="Производство"
      description="Сквозной pipeline всех роликов: от плана и сценария до готового видео и публикации. Канбан-доска с фильтром по клиенту, монтажёру и месяцу."
    />
  );
}
