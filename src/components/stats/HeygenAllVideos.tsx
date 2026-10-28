"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import Avatar from "@/components/Avatar";
import { Film } from "lucide-react";

/* «Все видео HeyGen по клиентам» — только владелец. Включает и видео из CRM, и сделанные напрямую в вебе HeyGen.
   Кредиты — оценка по длительности и движку (HeyGen не отдаёт списание за видео). Нераспознанные — привязать руками. */

type Row = { key: string; name: string; avatar: string | null; videos: number; crm: number; web: number; seconds: number; credits: number; engines: Record<string, number> };
type Month = { clients: Row[]; total: { videos: number; crm: number; seconds: number; credits: number }; unmatched: { id: string; title: string; at: string; seconds: number }[] };
export type HeygenAll = { months: string[]; byMonth: Record<string, Month>; clientsList: { id: number; name: string }[] };

const MON = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const ymTitle = (ym: string) => `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const mins = (s: number) => (s < 60 ? `${s} с` : `${Math.round(s / 6) / 10} мин`);
const ENG: Record<string, string> = { avatar_vi: "VI", avatar_v: "V", avatar_iv: "IV", avatar_iii: "III", "?": "?" };

export default function HeygenAllVideos({ data, onChanged }: { data: HeygenAll; onChanged: () => void }) {
  const [ym, setYm] = useState(data.months[0] || "");
  const [busy, setBusy] = useState<string | null>(null);
  const M = data.byMonth[ym];
  const card: React.CSSProperties = { padding: 16, marginBottom: 14 };

  async function assign(id: string, clientId: string) {
    if (!clientId) return;
    setBusy(id);
    const { error } = await createClient().from("heygen_videos").update({ client_id: Number(clientId), match: "manual" }).eq("id", id);
    setBusy(null);
    if (error) alert(error.message); else onChanged();
  }

  return (
    <div className="v2-card" style={card}>
      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
        <Film size={15} /><b style={{ fontSize: 14 }}>Все видео HeyGen по клиентам</b>
        <span style={{ fontSize: 11, color: "var(--t3)" }}>включая сделанные напрямую в HeyGen · видите только вы</span>
        <div style={{ flex: 1 }} />
        {data.months.map((m) => (
          <button key={m} className={`v2-chip ${m === ym ? "cy" : "mut"}`} style={{ cursor: "pointer", border: 0 }} onClick={() => setYm(m)}>{ymTitle(m)}</button>
        ))}
      </div>
      {!M ? <div style={{ fontSize: 13, color: "var(--t3)", marginTop: 10 }}>Видео ещё не загружены из HeyGen.</div> : (<>
        <div style={{ fontSize: 13, color: "var(--t2)", marginTop: 8 }}>
          За {ymTitle(ym)}: <b>{M.total.videos}</b> видео ({M.total.crm} через CRM, {M.total.videos - M.total.crm} в вебе HeyGen) · {mins(M.total.seconds)} · ≈ <b>{M.total.credits}</b> кредитов
        </div>
        <div style={{ marginTop: 10, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ color: "var(--t3)", textAlign: "left" }}>
              <th style={{ padding: "4px 6px" }}>Клиент</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>≈ Кредиты</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>Видео</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>через CRM</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>в вебе</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>Длительность</th>
              <th style={{ padding: "4px 6px" }}>Движки</th>
            </tr></thead>
            <tbody>{M.clients.map((c) => (
              <tr key={c.key} style={{ borderTop: "1px solid var(--brd)", color: c.key === "none" ? "var(--or)" : undefined }}>
                <td style={{ padding: 6 }}><span className="flex items-center gap-2">{c.key !== "none" && <Avatar src={c.avatar} name={c.name} size={20} />} {c.name}</span></td>
                <td style={{ padding: 6, textAlign: "right", fontWeight: 800 }}>{c.credits}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{c.videos}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{c.crm || "—"}</td>
                <td style={{ padding: 6, textAlign: "right", color: c.web ? "var(--or)" : undefined }}>{c.web || "—"}</td>
                <td style={{ padding: 6, textAlign: "right", color: "var(--t3)" }}>{mins(c.seconds)}</td>
                <td style={{ padding: 6, color: "var(--t3)" }}>{Object.entries(c.engines).map(([e, n]) => `${ENG[e] || e}×${n}`).join(" ")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {M.unmatched.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--or)" }}>Не распознано ({M.unmatched.length}) — образ не из групп клиентов. Привяжите вручную:</div>
            <div style={{ display: "grid", gap: 4, marginTop: 6, maxHeight: 260, overflowY: "auto" }}>
              {M.unmatched.map((u) => (
                <div key={u.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                  <span style={{ color: "var(--t3)", width: 44 }}>{u.at.slice(8, 10)}.{u.at.slice(5, 7)}</span>
                  <a href={`https://app.heygen.com/videos/${u.id}`} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--t1)" }}>{u.title || "без названия"}</a>
                  <span style={{ color: "var(--t3)" }}>{mins(u.seconds)}</span>
                  <select disabled={busy === u.id} defaultValue="" onChange={(e) => assign(u.id, e.target.value)}
                    style={{ padding: "4px 6px", borderRadius: 7, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12 }}>
                    <option value="">клиент…</option>
                    {data.clientsList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 10 }}>
          Кредиты за видео HeyGen не отдаёт — оценка по длительности: Avatar VI ≈ 1 кр/с, Avatar V ≈ 0,83 кр/с (замеры 27–28.10). Голос (озвучка) в вебе тоже тратит кредиты (~1 кр за 16 с), здесь не учтён.
        </div>
      </>)}
    </div>
  );
}
