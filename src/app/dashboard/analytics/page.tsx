"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client } from "@/lib/database";
import { getStore, setStore } from "@/lib/store";
import Avatar from "@/components/Avatar";
import { BarChart3, ExternalLink, Link2, Camera, Music2, Play, AtSign, type LucideIcon } from "lucide-react";

const PLAT: Record<string, { Icon: LucideIcon; color: string }> = {
  ig: { Icon: Camera, color: "#e1306c" },
  tt: { Icon: Music2, color: "#42d4f4" },
  yt: { Icon: Play, color: "#ff5c7a" },
  threads: { Icon: AtSign, color: "#a8e063" },
};

export default function AnalyticsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>(getStore().clients || []);
  const [loading, setLoading] = useState(!getStore().clients);

  useEffect(() => { (async () => {
    let cls = getStore().clients;
    if (!cls) { cls = await db.getClients(supabase); setStore({ clients: cls }); }
    setClients(cls); setLoading(false);
  })(); }, []);

  const active = useMemo(() => clients.filter(c => c.stage === "active"), [clients]);
  const linked = active.filter(c => (c as any).metricool_blog_id != null);
  const unlinked = active.filter(c => (c as any).metricool_blog_id == null);

  const card: React.CSSProperties = { background: "rgba(123,63,228,0.04)", border: "1px solid var(--brd)", borderRadius: 14, padding: 16, display: "flex", alignItems: "center", gap: 12 };

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Аналитика</h1>
        <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>Полная аналитика — в Metricool. Открывай дашборд нужного клиента в один клик.</p>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {linked.map(c => {
              const plats: string[] = (c as any).platforms?.length ? (c as any).platforms : [];
              return (
                <div key={c.id} style={card}>
                  <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={42} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name} {c.surname || ""}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                      {plats.map(p => { const P = PLAT[p]; return P ? <P.Icon key={p} size={12} style={{ color: P.color }} /> : null; })}
                      <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--t3)" }}>#{(c as any).metricool_blog_id}</span>
                    </div>
                  </div>
                  <a href={`/api/metricool/open?blogId=${(c as any).metricool_blog_id}`} target="_blank" rel="noreferrer"
                    style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, background: "linear-gradient(135deg, var(--cy), var(--pu))", color: "#fff", fontSize: 12, fontWeight: 800, textDecoration: "none" }}>
                    Открыть <ExternalLink size={13} />
                  </a>
                </div>
              );
            })}
          </div>

          {linked.length === 0 && (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--t3)", fontSize: 13 }}>
              <BarChart3 size={28} style={{ opacity: 0.4, marginBottom: 8 }} /><br />
              Ни у одного активного клиента не привязан бренд Metricool.
            </div>
          )}

          {unlinked.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Бренд не привязан ({unlinked.length})</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                {unlinked.map(c => (
                  <button key={c.id} onClick={() => router.push(`/dashboard/clients/${c.id}`)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: "var(--inset2)", border: "1px dashed var(--brd)", cursor: "pointer", textAlign: "left" }}>
                    <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={28} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name} {c.surname || ""}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--cy)" }}><Link2 size={12} /> привязать</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
