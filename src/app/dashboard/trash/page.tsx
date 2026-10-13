"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { type Client } from "@/lib/database";
import ClientPicker from "@/components/ClientPicker";
import { RotateCcw, Trash2 } from "lucide-react";

/* Корзина: удалённые сценарии за 30 дней. Вернуть = сценарий с тем же номером, публикацией,
   видео и всеми ссылками встаёт на место. Пустые слоты плана сюда не попадают. */
type Item = { id: number; script_id: number; client_id: number | null; deleted_at: string; deleted_by: string; title: string;
  month_number: number | null; pub_date: string | null; script_status: string | null; video_status: string | null; has_video: boolean; has_pub: boolean };

const VIDEO: Record<string, string> = { published: "опубликован", ready: "готов", inProgress: "в монтаже", notStarted: "" };
const dt = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function TrashPage() {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => { db.getClients(supabase).then(list => setClients(list || [])); }, []);
  async function load() {
    setErr("");
    const r = await fetch(`/api/scripts/trash${clientId ? `?clientId=${clientId}` : ""}`).then(r => r.json()).catch(() => ({ error: "сеть" }));
    if (r.error) { setErr(r.error); setItems([]); } else setItems(r.items);
  }
  useEffect(() => { load(); }, [clientId]);

  async function restore(it: Item) {
    setBusy(it.id);
    const r = await fetch("/api/scripts/trash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id }) }).then(r => r.json()).catch(() => ({ error: "сеть" }));
    setBusy(null);
    if (r.error) { alert(`Не получилось вернуть: ${r.error}`); return; }
    setItems(list => (list || []).filter(x => x.id !== it.id));
  }

  const nameOf = useMemo(() => new Map(clients.map(c => [c.id, `${c.name} ${c.surname || ""}`.trim()])), [clients]);
  const withTrash = useMemo(() => clients.filter(c => !items || clientId || items.some(i => i.client_id === c.id)), [clients, items, clientId]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "8px 0 40px" }}>
      <div className="flex items-center gap-3" style={{ marginBottom: 6 }}>
        <Trash2 size={20} style={{ color: "var(--t2)" }} />
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Корзина</h1>
      </div>
      <p style={{ fontSize: 13, color: "var(--t3)", marginBottom: 14 }}>
        Удалённые сценарии хранятся 30 дней. «Вернуть» ставит сценарий на прежнее место — с текстом, датой, статусами, видео и публикацией. Пустые слоты плана сюда не попадают.
      </p>
      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 4 }}>
        <ClientPicker clients={withTrash} value={clientId} onChange={setClientId} />
        {clientId && <button onClick={() => setClientId(null)} className="v2-chip mut" style={{ cursor: "pointer", height: 32, padding: "0 12px", marginBottom: 14 }}>Все клиенты</button>}
      </div>
      {err && <div style={{ color: "var(--rd)", fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {!items ? <div style={{ color: "var(--t3)", fontSize: 13 }}>Загружаю…</div>
        : !items.length ? <div className="v2-card" style={{ padding: 20, color: "var(--t3)", fontSize: 13 }}>Корзина пуста.</div>
        : (
          <div className="v2-card" style={{ padding: 0, overflow: "hidden" }}>
            {items.map(it => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderBottom: "1px solid var(--brd)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 2 }}>
                    {[it.client_id ? nameOf.get(it.client_id) || `клиент ${it.client_id}` : null,
                      it.month_number ? `М${it.month_number}` : null,
                      it.pub_date ? `выход ${it.pub_date.slice(8, 10)}.${it.pub_date.slice(5, 7)}` : null,
                      VIDEO[it.video_status || ""] || null,
                      it.has_pub ? "с публикацией" : null].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>удалил(а) {it.deleted_by} · {dt(it.deleted_at)}</div>
                </div>
                <button onClick={() => restore(it)} disabled={busy === it.id}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, background: "rgba(168,224,99,0.12)", border: "1px solid rgba(168,224,99,0.45)", color: "var(--gr)", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                  <RotateCcw size={13} /> {busy === it.id ? "…" : "Вернуть"}
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
