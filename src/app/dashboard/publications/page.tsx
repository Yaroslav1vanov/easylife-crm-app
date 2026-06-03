"use client";
import { Send } from "lucide-react";
import SoonPage from "@/components/SoonPage";

export default function PublicationsPage() {
  return (
    <SoonPage
      Icon={Send}
      accent="#42d4f4"
      title="Публикации"
      description="Лента всего опубликованного контента: даты, охваты, прирост подписчиков по клиентам. Интеграция с Metricool."
    />
  );
}
