"use client";
import { BarChart3 } from "lucide-react";
import SoonPage from "@/components/SoonPage";

export default function AnalyticsPage() {
  return (
    <SoonPage
      Icon={BarChart3}
      accent="#a8e063"
      title="Аналитика"
      description="MRR-динамика, churn, retention, средняя длительность контракта, P&L по клиентам и месяцам. Графики по агентству целиком."
    />
  );
}
