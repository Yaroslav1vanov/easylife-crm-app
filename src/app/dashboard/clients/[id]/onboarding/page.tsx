"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client } from "@/lib/database";
import OnboardingChecklist from "@/components/OnboardingChecklist";

export default function ClientOnboardingPage() {
  const { id } = useParams();
  const clientId = parseInt(id as string);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const c = await db.getClient(supabase, clientId);
      setClient(c);
      setLoading(false);
    })();
  }, [clientId]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;
  if (!client) return <div style={{ padding: 40, color: "var(--rd)" }}>Клиент не найден</div>;

  const fullName = `${client.name} ${client.surname || ""}`.trim();

  return (
    <div style={{ paddingBottom: 60, maxWidth: 1080, margin: "0 auto" }}>
      <div className="page-head">
        <div>
          <h1>Онбординг</h1>
          <p>{fullName}</p>
        </div>
        <button className="btn-ghost" onClick={() => router.push(`/dashboard/clients/${clientId}`)}>← К карточке клиента</button>
      </div>

      <OnboardingChecklist
        clientId={clientId}
        clientName={fullName}
        clientCreatedAt={(client as any).created_at || new Date().toISOString()}
        clientStartDate={(client as any).onboarding_start || client.start_date}
        clientNiche={client.niche}
        onComplete={() => {
          // После завершения возвращаемся к карточке
          router.push(`/dashboard/clients/${clientId}`);
        }}
      />
    </div>
  );
}
