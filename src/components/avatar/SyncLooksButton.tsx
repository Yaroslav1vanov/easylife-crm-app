"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { ClientAvatar } from "@/lib/avatar";
import { RefreshCw, Loader2 } from "lucide-react";

/* «Обновить образы из HeyGen»: ставит задачу исполнителю и сам ждёт, пока список образов обновится
   (looks_synced_at сменится), — новые образы появляются без перезагрузки страницы. */
export default function SyncLooksButton({ clientId, onSynced, small }: { clientId: number; onSynced: (a: ClientAvatar) => void; small?: boolean }) {
  const [state, setState] = useState<"idle" | "wait" | "done" | "err">("idle");
  const [note, setNote] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function run() {
    setState("wait"); setNote("забираем образы из HeyGen… 1–3 минуты");
    const r = await fetch("/api/avatar/sync-looks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setState("err"); setNote(j.error || `ошибка ${r.status}`); return; }
    const before = j.syncedAt || null;
    const sb = createClient();
    const started = Date.now();
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const { data } = await sb.from("client_avatars").select("*").eq("client_id", clientId).maybeSingle();
      if (data && data.looks_synced_at && data.looks_synced_at !== before) {
        clearInterval(timer.current!); timer.current = null;
        onSynced(data as ClientAvatar);
        setState("done"); setNote(`готово: ${(data.group_looks || []).length} образов`);
      } else if (Date.now() - started > 6 * 60e3) {
        clearInterval(timer.current!); timer.current = null;
        setState("err"); setNote("HeyGen долго не отвечает — посмотрите чат «Аватар» или нажмите ещё раз");
      }
    }, 5000);
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button className="v2-act ghost" style={{ height: small ? 28 : 30, fontSize: 12 }} disabled={state === "wait"} onClick={run}
        title="Забрать все образы группы аватара из HeyGen с картинками. Только просмотр, кредиты не тратятся">
        {state === "wait" ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} Обновить образы из HeyGen
      </button>
      {note && <span style={{ fontSize: 11.5, color: state === "err" ? "var(--rd)" : state === "done" ? "#a8e063" : "var(--t3)" }}>{note}</span>}
    </span>
  );
}
