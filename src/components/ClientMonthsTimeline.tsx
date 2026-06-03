"use client";
import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { ClientMonth, Script } from "@/lib/database";
import { Check, RotateCcw, PlusCircle, CalendarCheck, Edit2 } from "lucide-react";

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
  clientId: number;
  clientName: string;
  clientMonths: ClientMonth[];
  scripts: Script[];
  activeMonth: number;
  onActivateMonth: (m: number) => void;
  onChange: () => Promise<void> | void;
  todayIso: string;
};

export default function ClientMonthsTimeline({ clientId, clientName, clientMonths, scripts, activeMonth, onActivateMonth, onChange, todayIso }: Props) {
  const supabase = createClient();
  const [busy, setBusy] = useState<number | null>(null);
  const [editingDate, setEditingDate] = useState<{ cmId: number; field: "start_date" | "end_date" } | null>(null);
  const [editDateValue, setEditDateValue] = useState("");
  const [editingPkg, setEditingPkg] = useState<number | null>(null);
  const [editPkgValue, setEditPkgValue] = useState("");
  const [renewModal, setRenewModal] = useState<{ nextN: number; start_date: string; end_date: string; pkg: string; prevStatus: string } | null>(null);

  const sortedMonths = useMemo(() => [...clientMonths].sort((a, b) => a.month_number - b.month_number), [clientMonths]);
  const totalPlan = sortedMonths.reduce((s, m) => s + (m.package || 0), 0);
  const totalPublished = scripts.filter(s => s.video_status === "published").length;

  async function updateField(cmId: number, patch: Partial<ClientMonth>) {
    setBusy(cmId);
    const { error } = await db.updateClientMonth(supabase, cmId, patch);
    if (error) alert("Ошибка: " + (error.message || error));
    await onChange();
    setBusy(null);
  }

  async function closeMonth(cmId: number) {
    setBusy(cmId);
    const { error } = await db.closeClientMonth(supabase, cmId);
    if (error) alert("Ошибка: " + (error.message || error));
    await onChange();
    setBusy(null);
  }

  async function reopenMonth(cmId: number) {
    setBusy(cmId);
    const { error } = await db.reopenClientMonth(supabase, cmId);
    if (error) alert("Ошибка: " + (error.message || error));
    await onChange();
    setBusy(null);
  }

  function startRenew(lastM: ClientMonth) {
    const start = new Date(lastM.end_date); start.setDate(start.getDate() + 1);
    const end = new Date(start); end.setDate(end.getDate() + 30);
    setRenewModal({
      nextN: lastM.month_number + 1,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      pkg: String(lastM.package || 20),
      prevStatus: lastM.status,
    });
  }

  async function confirmRenew() {
    if (!renewModal) return;
    setBusy(-1);
    const pkg = parseInt(renewModal.pkg, 10);
    if (!pkg || pkg < 1) { alert("Укажи пакет"); setBusy(null); return; }
    const status: ClientMonth["status"] = renewModal.prevStatus === "closed" ? "active" : "planned";
    const { error } = await db.upsertClientMonth(supabase, {
      client_id: clientId,
      month_number: renewModal.nextN,
      start_date: renewModal.start_date,
      end_date: renewModal.end_date,
      package: pkg,
      status,
    });
    if (error) { alert("Ошибка: " + (error.message || error)); setBusy(null); return; }
    setRenewModal(null);
    await onChange();
    setBusy(null);
  }

  const statusBadge = (status: string, daysToEnd: number) => {
    if (status === "closed") return { l: "✓ Закрыт", c: "var(--gr)", bg: "rgba(168,224,99,0.12)" };
    if (status === "onboarding") return { l: "🧩 Онбординг", c: "var(--cy)", bg: "rgba(66,212,244,0.12)" };
    if (status === "planned") return { l: "🕓 Запланирован", c: "var(--pu)", bg: "rgba(157,107,255,0.12)" };
    if (status === "cancelled") return { l: "— Отменён", c: "var(--t3)", bg: "rgba(255,255,255,0.04)" };
    if (daysToEnd < 0) return { l: "🔴 Просрочка", c: "var(--rd)", bg: "rgba(255,92,122,0.12)" };
    if (daysToEnd <= 5) return { l: "⏰ Заканчивается", c: "var(--or)", bg: "rgba(255,174,66,0.12)" };
    return { l: "🟢 Активен", c: "var(--gr)", bg: "rgba(168,224,99,0.12)" };
  };

  const lastM = sortedMonths[sortedMonths.length - 1];
  const hasNextM = lastM ? sortedMonths.some(m => m.month_number === lastM.month_number + 1) : false;

  return (
    <div className="card" style={{ padding: 16, borderRadius: 16, marginBottom: 14, fontFamily: "'Manrope', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarCheck size={16} style={{ color: "var(--pu)" }} strokeWidth={1.8} />
          Контрактные месяцы
          <span style={{ marginLeft: 4, padding: "2px 7px", borderRadius: 6, background: "rgba(157,107,255,0.15)", color: "var(--pu)", fontSize: 10, fontWeight: 700 }}>{sortedMonths.length}</span>
        </h3>
        <div style={{ fontSize: 11, color: "var(--t2)", fontWeight: 600 }}>
          Всего по контракту: <span style={{ color: "var(--t1)", fontFamily: "monospace", fontWeight: 800 }}>{totalPublished} / {totalPlan}</span>
        </div>
      </div>

      {/* Timeline rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sortedMonths.map((m, i) => {
          const list = scripts.filter(s => s.month_number === m.month_number);
          const published = list.filter(s => s.video_status === "published").length;
          const plan = m.package || 0;
          const pct = plan > 0 ? Math.round((published / plan) * 100) : 0;
          const daysToEnd = daysBetween(todayIso, m.end_date);
          const badge = statusBadge(m.status, daysToEnd);
          const barColor = pct >= 80 ? "var(--gr)" : pct >= 40 ? "var(--cy)" : pct > 0 ? "var(--or)" : "var(--rd)";
          const isActive = activeMonth === m.month_number;
          const isLast = i === sortedMonths.length - 1;
          const nextM = sortedMonths.find(x => x.month_number === m.month_number + 1);
          return (
            <div key={m.id}
              onClick={() => onActivateMonth(m.month_number)}
              style={{
                padding: 14,
                borderRadius: 12,
                background: isActive ? "rgba(157,107,255,0.08)" : "rgba(0,0,0,0.22)",
                border: `1px solid ${isActive ? "var(--pu)" : "var(--brd)"}`,
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto auto",
                gap: 14,
                alignItems: "center",
                cursor: "pointer",
                transition: "border-color .12s, background .12s",
              }}>
              {/* M badge */}
              <div style={{
                minWidth: 48, height: 48, borderRadius: 12,
                background: `${badge.c}22`,
                color: badge.c,
                fontFamily: "'Unbounded', sans-serif",
                fontSize: 18, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${badge.c}55`,
              }}>M{m.month_number}</div>

              {/* Period + pkg */}
              <div onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ padding: "3px 8px", borderRadius: 6, background: badge.bg, color: badge.c, fontSize: 10, fontWeight: 700 }}>{badge.l}</span>
                  <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>
                    {daysToEnd < 0 ? `просрочка ${-daysToEnd} дн.` : `осталось ${daysToEnd} дн.`}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--t1)", fontWeight: 600, flexWrap: "wrap" }}>
                  {/* start_date editable */}
                  {editingDate?.cmId === m.id && editingDate?.field === "start_date" ? (
                    <input
                      autoFocus type="date" value={editDateValue}
                      onChange={(e) => setEditDateValue(e.target.value)}
                      onBlur={() => { if (editDateValue && editDateValue !== m.start_date) updateField(m.id, { start_date: editDateValue }); setEditingDate(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingDate(null); }}
                      style={{ padding: "3px 6px", borderRadius: 5, background: "var(--bg)", border: "1px solid var(--cy)", color: "var(--t1)", fontSize: 12 }}
                    />
                  ) : (
                    <span title="Клик — изменить дату начала"
                      onClick={() => { setEditDateValue(m.start_date); setEditingDate({ cmId: m.id, field: "start_date" }); }}
                      style={{ borderBottom: "1px dashed var(--t3)", cursor: "pointer" }}>{fmtDateShort(m.start_date)}</span>
                  )}
                  <span style={{ color: "var(--t3)" }}>→</span>
                  {editingDate?.cmId === m.id && editingDate?.field === "end_date" ? (
                    <input
                      autoFocus type="date" value={editDateValue}
                      onChange={(e) => setEditDateValue(e.target.value)}
                      onBlur={() => { if (editDateValue && editDateValue !== m.end_date) updateField(m.id, { end_date: editDateValue }); setEditingDate(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingDate(null); }}
                      style={{ padding: "3px 6px", borderRadius: 5, background: "var(--bg)", border: "1px solid var(--cy)", color: "var(--t1)", fontSize: 12 }}
                    />
                  ) : (
                    <span title="Клик — изменить дедлайн"
                      onClick={() => { setEditDateValue(m.end_date); setEditingDate({ cmId: m.id, field: "end_date" }); }}
                      style={{ borderBottom: "1px dashed var(--or)", cursor: "pointer", color: "var(--or)" }}>{fmtDateShort(m.end_date)}</span>
                  )}
                  <Edit2 size={10} style={{ color: "var(--t3)", opacity: 0.6 }} />
                </div>
              </div>

              {/* Progress */}
              <div onClick={(e) => e.stopPropagation()} style={{ minWidth: 140 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--t1)", fontWeight: 700 }}>
                    📤 {published} /{" "}
                    {editingPkg === m.id ? (
                      <input
                        autoFocus type="number" min={1} max={999} value={editPkgValue}
                        onChange={(e) => setEditPkgValue(e.target.value)}
                        onBlur={() => {
                          const n = parseInt(editPkgValue, 10);
                          if (!Number.isNaN(n) && n >= 1 && n !== plan) updateField(m.id, { package: n });
                          else setEditingPkg(null);
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingPkg(null); }}
                        style={{ width: 50, padding: "1px 4px", borderRadius: 4, background: "var(--bg)", border: "1px solid var(--cy)", color: "var(--t1)", fontSize: 11, fontFamily: "monospace", textAlign: "center" }}
                      />
                    ) : (
                      <span onClick={() => { setEditPkgValue(String(plan)); setEditingPkg(m.id); }}
                        title="Клик — изменить план"
                        style={{ cursor: "pointer", borderBottom: "1px dashed var(--t3)" }}>{plan}</span>
                    )}
                  </span>
                  <span style={{ fontSize: 10, color: barColor, fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3 }} />
                </div>
              </div>

              {/* Actions */}
              <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {(m.status === "active" || m.status === "onboarding") && (
                  <button onClick={() => closeMonth(m.id)} disabled={busy === m.id}
                    style={{ padding: "5px 9px", borderRadius: 7, background: "rgba(168,224,99,0.12)", border: "1px solid var(--gr)", color: "var(--gr)", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Check size={10} strokeWidth={2.4} /> Закрыть
                  </button>
                )}
                {m.status === "closed" && (
                  <button onClick={() => reopenMonth(m.id)} disabled={busy === m.id}
                    style={{ padding: "5px 9px", borderRadius: 7, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <RotateCcw size={10} strokeWidth={2.4} /> Открыть
                  </button>
                )}
              </div>

              {/* Active marker */}
              <div style={{ minWidth: 60, textAlign: "right" }}>
                {isActive ? (
                  <span style={{ fontSize: 9, fontWeight: 700, color: "var(--pu)", textTransform: "uppercase", letterSpacing: 0.5 }}>← в фокусе</span>
                ) : (
                  <span style={{ fontSize: 9, color: "var(--t3)" }}>Кликни →</span>
                )}
              </div>
            </div>
          );
        })}

        {/* + M(n+1) button */}
        {lastM && !hasNextM && (
          <button onClick={() => startRenew(lastM)}
            style={{
              padding: "12px",
              borderRadius: 12,
              background: "linear-gradient(135deg, rgba(66,212,244,0.08), rgba(157,107,255,0.08))",
              border: "1px dashed var(--pu)",
              color: "var(--pu)",
              cursor: "pointer",
              fontSize: 12, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            <PlusCircle size={14} strokeWidth={2} />
            Открыть M{lastM.month_number + 1} — продлить контракт
          </button>
        )}
      </div>

      {/* Renew Modal */}
      {renewModal && (
        <div onClick={() => setRenewModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420 }}>
            <h3 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>Открыть M{renewModal.nextN}</h3>
            <p style={{ fontSize: 11, color: "var(--t3)", marginBottom: 18 }}>{clientName}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Начало</label>
                <input type="date" value={renewModal.start_date} onChange={(e) => setRenewModal({ ...renewModal, start_date: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Окончание</label>
                <input type="date" value={renewModal.end_date} onChange={(e) => setRenewModal({ ...renewModal, end_date: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12 }} />
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Пакет (роликов в месяц)</label>
              <input type="number" min={1} max={999} value={renewModal.pkg} onChange={(e) => setRenewModal({ ...renewModal, pkg: e.target.value })}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 14, fontWeight: 700 }} />
            </div>
            <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 16, padding: 10, borderRadius: 8, background: "rgba(157,107,255,0.06)", border: "1px solid var(--brd)" }}>
              {renewModal.prevStatus === "closed"
                ? "Прошлый месяц закрыт → новый станет сразу active"
                : "Прошлый месяц ещё active → новый создастся как planned. Когда прошлый закроешь — этот станет active."}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setRenewModal(null)} style={{ padding: "8px 14px", borderRadius: 8, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Отмена</button>
              <button onClick={confirmRenew} disabled={busy === -1}
                style={{ padding: "8px 18px", borderRadius: 8, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                {busy === -1 ? "..." : `Открыть M${renewModal.nextN}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
