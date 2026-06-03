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
    <div style={{ padding: "20px 20px 60px", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button onClick={() => router.push(`/dashboard/clients/${clientId}`)}
          style={{ background: "none", border: "1px solid var(--brd)", color: "var(--t2)", padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          ← К карточке клиента
        </button>
        <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 700, letterSpacing: 0.8 }}>
          ОНБОРДИНГ · {fullName}
        </div>
      </div>

      <OnboardingChecklist
        clientId={clientId}
        clientName={fullName}
        clientCreatedAt={(client as any).created_at || new Date().toISOString()}
        clientStartDate={client.start_date}
        onComplete={() => {
          // После завершения возвращаемся к карточке
          router.push(`/dashboard/clients/${clientId}`);
        }}
      />
    </div>
  );
}
