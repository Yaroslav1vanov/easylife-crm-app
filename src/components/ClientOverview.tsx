"use client";
import { useMemo, useState } from "react";
import { Client, Script, ClientMonth, TeamMember } from "@/lib/database";
import Avatar from "@/components/Avatar";
import AvatarUploader from "@/components/AvatarUploader";
import {
  Calendar as CalendarIcon, Package, ExternalLink, Edit2,
} from "lucide-react";

const RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function fmtDateShort(s: string | null | undefined) {
  if (!s) return "—";
  const [, mm, dd] = String(s).slice(0, 10).split("-");
  const m = parseInt(mm, 10), d = parseInt(dd, 10);
  if (!m || !d) return String(s);
  return `${d} ${RU_MONTHS_GEN[m - 1]}`;
}
function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

type Props = {
  client: Client;
  clientMonths: ClientMonth[];
  scripts: Script[];
  team: TeamMember[];
  activeMonth: number;
  todayIso: string;
  onEdit: () => void;
  onAvatarChange: (url: string | null) => Promise<void>;
  onUpdateTeam: (patch: { teamlead_id?: number | null; montager_id?: number | null }) => Promise<void>;
  onTogglePause: () => void;
};

export default function ClientOverview({ client: c, clientMonths, scripts, team, activeMonth, todayIso, onEdit, onAvatarChange, onUpdateTeam, onTogglePause }: Props) {
  const [editingTeam, setEditingTeam] = useState(false);

  const currentM = useMemo(() => {
    const sorted = [...clientMonths].sort((a, b) => a.month_number - b.month_number);
    return sorted.find(m => m.month_number === activeMonth) || sorted[sorted.length - 1] || null;
  }, [clientMonths, activeMonth]);

  const monthScripts = useMemo(() => currentM ? scripts.filter(s => s.month_number === currentM.month_number) : [], [scripts, currentM]);
  const plan = currentM?.package || 0;
  const ready = monthScripts.filter(s => s.video_status === "ready" || s.video_status === "published").length;
  const published = monthScripts.filter(s => s.video_status === "published").length;
  const overallPct = plan > 0 ? Math.round((published / plan) * 100) : 0;
  const complete = plan > 0 && published >= plan;
  const daysToEnd = currentM ? daysBetween(todayIso, currentM.end_date) : null;

  const teamlead = team.find(t => t.id === c.teamlead_id);
  const montager = team.find(t => t.id === c.montager_id);

  return (
    <div className="card" style={{
      fontFamily: "'Manrope', sans-serif",
      padding: 22,
      borderRadius: 18,
      marginBottom: 14,
      background: "linear-gradient(135deg, rgba(123,63,228,0.12), var(--grad-end))",
      border: "1px solid rgba(157,107,255,0.26)",
      position: "relative",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto auto", gap: 22, alignItems: "center" }} className="client-hero-grid">
        {/* Avatar */}
        <AvatarUploader currentUrl={c.avatar_url} name={`${c.name} ${c.surname || ""}`} pathPrefix="clients" entityId={c.id} size={78} onUploaded={onAvatarChange} />

        {/* Name + niche + socials */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 24, fontWeight: 800, color: "var(--t1)", letterSpacing: -0.6, lineHeight: 1.15 }}>
              {c.name} {c.surname || ""}
            </h1>
            <span style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(168,224,99,0.15)", color: "var(--gr)", fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" }}>
              {c.stage === "paused" ? "⏸ На паузе" : c.stage === "churned" ? "✕ Ушёл" : "● В работе"}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--t2)", fontWeight: 500, marginBottom: 10 }}>{c.niche || c.product || "—"}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["instagram", "tiktok", "youtube"] as const).map(key => {
              const url = c[key];
              const colors = { instagram: "#ec4899", tiktok: "#34d399", youtube: "#ef4444" };
              const labels = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };
              if (!url) return null;
              return (
                <a key={key} href={url.startsWith("http") ? url : `https://${url}`} target="_blank" rel="noopener noreferrer"
                  style={{ padding: "5px 11px", borderRadius: 7, background: `${colors[key]}18`, border: `1px solid ${colors[key]}44`, color: colors[key], fontSize: 11, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  {labels[key]} <ExternalLink size={9} />
                </a>
              );
            })}
          </div>
        </div>

        {/* Рабочий месяц */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(66,212,244,0.12)", color: "#42d4f4", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(66,212,244,0.3)" }}>
            <CalendarIcon size={16} strokeWidth={1.8} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>
              Рабочий месяц{currentM ? ` · M${currentM.month_number}` : ""}
            </div>
            <div style={{ fontSize: 13, color: "var(--t1)", fontWeight: 800, lineHeight: 1.2 }}>
              {currentM ? `сдать до ${fmtDateShort(currentM.end_date)}` : "—"}
            </div>
            <div style={{ fontSize: 10, color: complete ? "var(--gr)" : daysToEnd !== null && daysToEnd < 0 ? "var(--rd)" : daysToEnd !== null && daysToEnd <= 5 ? "var(--or)" : "var(--t3)", marginTop: 1, fontWeight: 600 }}>
              {complete ? "✓ пакет выполнен" : daysToEnd !== null ? (daysToEnd < 0 ? `просрочка ${-daysToEnd} дн.` : `осталось ${daysToEnd} дн.`) : "нет активного M"}
            </div>
          </div>
        </div>

        {/* Команда — кто работает с клиентом */}
        <div style={{ minWidth: 180 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Над клиентом работают</div>
            <button onClick={() => setEditingTeam(v => !v)} style={{ background: "transparent", border: "none", color: editingTeam ? "var(--cy)" : "var(--t3)", cursor: "pointer", display: "inline-flex", alignItems: "center", padding: 2 }}>
              <Edit2 size={11} strokeWidth={2} />
            </button>
          </div>
          {editingTeam ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <TeamSelect label="Тим Лид" value={c.teamlead_id}
                options={team.filter(t => t.member_type === "teamlead" || t.member_type === "admin")} fallback={team}
                onChange={async (v) => { await onUpdateTeam({ teamlead_id: v }); }} />
              <TeamSelect label="Монтажёр" value={c.montager_id}
                options={team.filter(t => t.member_type === "montager")} fallback={team}
                onChange={async (v) => { await onUpdateTeam({ montager_id: v }); }} />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <TeamRow tm={teamlead} role="Тим Лид" color="#9d6bff" />
              <TeamRow tm={montager} role="Монтажёр" color="#ffae42" />
            </div>
          )}
        </div>

        {/* Пакет */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(168,224,99,0.12)", color: "#a8e063", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(168,224,99,0.3)" }}>
            <Package size={16} strokeWidth={1.8} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Пакет</div>
            <div style={{ fontSize: 12, color: "var(--t1)", fontWeight: 700 }}>{plan} роликов / мес</div>
          </div>
        </div>

        {/* Stats box */}
        <div style={{ minWidth: 200, padding: "12px 16px", borderRadius: 12, background: "var(--inset)", border: "1px solid var(--brd)" }}>
          <div style={{ display: "flex", gap: 18, marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 800, color: "var(--t1)", lineHeight: 1 }}>{ready} <span style={{ fontSize: 13, color: "var(--t3)" }}>/ {plan}</span></div>
              <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600, marginTop: 3 }}>сделано</div>
            </div>
            <div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 800, color: "var(--gr)", lineHeight: 1 }}>{published} <span style={{ fontSize: 13, color: "var(--t3)" }}>/ {plan}</span></div>
              <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600, marginTop: 3 }}>опубликовано</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600 }}>Выполнение плана</span>
            <span style={{ fontSize: 12, color: "var(--pu)", fontWeight: 800 }}>{overallPct}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "var(--track)", overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, overallPct)}%`, height: "100%", background: "linear-gradient(90deg, var(--cy), var(--pu))", borderRadius: 3 }} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 6 }}>
        <button onClick={onTogglePause} style={{ padding: "6px 12px", borderRadius: 8, background: c.stage === "paused" ? "rgba(168,224,99,0.14)" : "rgba(245,196,81,0.14)", border: `1px solid ${c.stage === "paused" ? "rgba(168,224,99,0.4)" : "rgba(245,196,81,0.4)"}`, color: c.stage === "paused" ? "var(--gr)" : "var(--yl)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
          {c.stage === "paused" ? "▶ Снять с паузы" : "⏸ На паузу"}
        </button>
        <button onClick={onEdit} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(157,107,255,0.12)", border: "1px solid rgba(157,107,255,0.3)", color: "var(--pu)", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Edit2 size={11} strokeWidth={2} /> Редактировать
        </button>
      </div>

      <style jsx>{`
        @media (max-width: 1280px) {
          :global(.client-hero-grid) { grid-template-columns: auto 1fr !important; row-gap: 18px !important; }
          :global(.client-hero-grid) > :nth-child(n+3) { grid-column: 1 / -1; }
        }
      `}</style>
    </div>
  );
}

function TeamRow({ tm, role, color }: { tm?: TeamMember; role: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {tm ? <Avatar name={tm.name} src={tm.avatar_url} size={28} /> : (
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--track)", border: "1px dashed var(--brd)" }} />
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: tm ? "var(--t1)" : "var(--t3)", lineHeight: 1.1 }}>{tm ? tm.name : "не назначен"}</div>
        <div style={{ fontSize: 9, color: color, fontWeight: 600 }}>{role}</div>
      </div>
    </div>
  );
}

function TeamSelect({ label, value, options, fallback, onChange }: {
  label: string; value: number | null;
  options: TeamMember[]; fallback: TeamMember[];
  onChange: (v: number | null) => void;
}) {
  const list = options.length > 0 ? options : fallback;
  return (
    <div>
      <div style={{ fontSize: 8, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
        style={{ width: "100%", padding: "5px 8px", borderRadius: 7, background: "var(--bg)", border: "1px solid var(--cy)", color: "var(--t1)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
        <option value="">— не назначен —</option>
        {list.map(t => <option key={t.id} value={t.id}>{t.name}{t.role_title ? ` · ${t.role_title}` : ""}</option>)}
      </select>
    </div>
  );
}
