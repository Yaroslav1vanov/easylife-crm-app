"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { ChecklistTask, OnboardingTemplateRow, OnboardingProgress } from "@/lib/database";

interface Props {
  clientId: number;
  clientName: string;
  clientCreatedAt: string;
  clientStartDate?: string | null;
  onComplete?: () => void;
}

type StageGroup = {
  stageId: number;
  stageTitle: string;
  dayLabel: string;
  tasks: ChecklistTask[];
};

export default function OnboardingChecklist({ clientId, clientName, clientCreatedAt, clientStartDate, onComplete }: Props) {
  const [tasks, setTasks] = useState<ChecklistTask[]>([]);
  const [template, setTemplate] = useState<OnboardingTemplateRow[]>([]);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set([1])); // stage 1 раскрыт по умолчанию
  const supabase = createClient();

  useEffect(() => { load(); }, [clientId]);

  async function load() {
    const [t, tpl, p] = await Promise.all([
      db.getOnboardingTasks(supabase, clientId),
      db.getOnboardingTemplate(supabase),
      db.getOnboardingProgress(supabase, clientId),
    ]);
    setTasks(t);
    setTemplate(tpl);
    setProgress(p);
    setLoading(false);
  }

  async function setStatus(task: ChecklistTask, status: "pending" | "done" | "skipped") {
    // Оптимистично обновляем UI
    setTasks(prev => prev.map(x => x.id === task.id ? { ...x, status } : x));
    await db.setOnboardingTaskStatus(supabase, task.id, status);
    // Перезагружаем прогресс
    const p = await db.getOnboardingProgress(supabase, clientId);
    setProgress(p);
  }

  async function completeAll() {
    if (!confirm("Завершить онбординг и начать производство? Незакрытые задачи станут «не нужно» (skipped), а рабочий месяц станет активным — отсчёт «сдать до» пойдёт с сегодня (+30 дней).")) return;
    await db.completeOnboarding(supabase, clientId);
    // Переводим онбординг-месяц в производство: старт сегодня, дедлайн +30 дней.
    const today = new Date();
    const end = new Date(today.getTime() + 30 * 86400000);
    await db.startProductionForClient(supabase, clientId, { start: today.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
    await load();
    onComplete?.();
  }

  // Расчёт прошедших дней
  const startDateStr = clientStartDate || clientCreatedAt;
  const startDate = startDateStr ? new Date(startDateStr) : new Date();
  const today = new Date();
  const daysPassed = Math.floor((today.getTime() - startDate.getTime()) / 86400000) + 1;
  const totalDays = 10;
  const dayPct = Math.min(100, Math.round(daysPassed / totalDays * 100));

  // Группируем задачи по этапам
  const stages: StageGroup[] = [];
  if (template.length > 0) {
    const seen = new Set<number>();
    template.forEach(t => {
      if (seen.has(t.stage_id)) return;
      seen.add(t.stage_id);
      const dayLabel = t.day_start === t.day_end ? `День ${t.day_start}` : `День ${t.day_start}–${t.day_end}`;
      const stageTasks = tasks.filter(x => x.template_stage_id === t.stage_id).sort((a, b) => a.task_order - b.task_order);
      stages.push({ stageId: t.stage_id, stageTitle: t.stage_title, dayLabel, tasks: stageTasks });
    });
    stages.sort((a, b) => a.stageId - b.stageId);
  }

  function toggleStage(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function expandAll() { setExpanded(new Set(stages.map(s => s.stageId))); }
  function collapseAll() { setExpanded(new Set()); }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка онбординга…</div>;

  if (tasks.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>
        Онбординг-задачи не созданы для этого клиента.
      </div>
    );
  }

  const total = progress?.total_tasks || tasks.length;
  const done = progress?.done_tasks || 0;
  const skipped = progress?.skipped_tasks || 0;
  const pending = progress?.pending_tasks || 0;
  const overdue = progress?.overdue_tasks || 0;
  const pct = progress?.progress_pct ?? 0;
  const isCompleted = pending === 0;

  return (
    <div className="onboarding-checklist">
      {/* Hero */}
      <div style={{ marginBottom: 24, padding: "28px 28px 24px", borderRadius: 20, background: "linear-gradient(135deg, rgba(245,196,81,0.08), rgba(168,224,99,0.05))", border: "1px solid rgba(245,196,81,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--yl)" }}>🚀 Онбординг — 10 дней до первой публикации</span>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, marginBottom: 6, color: "var(--t1)" }}>
          {clientName}
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", color: "var(--t2)", fontSize: 13, marginBottom: 18 }}>
          <span>📅 День <b style={{ color: "var(--yl)" }}>{Math.max(1, daysPassed)}</b> из {totalDays}</span>
          <span>✅ Сделано <b style={{ color: "var(--gr)" }}>{done}</b> / нужно <b>{total - skipped}</b></span>
          {skipped > 0 && <span>⏭ Не нужно <b style={{ color: "var(--t3)" }}>{skipped}</b></span>}
          {overdue > 0 && <span style={{ color: "var(--rd)" }}>⚠ Просрочено <b>{overdue}</b></span>}
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <div style={{ flex: 1, height: 12, borderRadius: 8, background: "var(--track)", overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "linear-gradient(90deg, var(--gr), var(--yl))", borderRadius: 8, transition: "width .3s" }} />
          </div>
          <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 800, color: "var(--gr)", minWidth: 50 }}>{pct}%</span>
        </div>

        {/* Day timeline */}
        <div style={{ display: "flex", gap: 4, marginTop: 16 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(d => {
            const isPast = d < daysPassed;
            const isToday = d === daysPassed;
            return (
              <div key={d} style={{
                flex: 1, padding: "6px 4px", borderRadius: 6, textAlign: "center",
                fontSize: 10, fontWeight: 700,
                background: isToday ? "rgba(245,196,81,0.2)" : isPast ? "rgba(168,224,99,0.1)" : "var(--track)",
                color: isToday ? "var(--yl)" : isPast ? "var(--gr)" : "var(--t3)",
                border: isToday ? "1px solid var(--yl)" : "1px solid var(--brd)",
              }}>День {d}</div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={expandAll} style={{ padding: "6px 12px", borderRadius: 8, background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>↕ Развернуть всё</button>
          <button onClick={collapseAll} style={{ padding: "6px 12px", borderRadius: 8, background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>↑ Свернуть всё</button>
        </div>
        {!isCompleted && (
          <button onClick={completeAll}
            style={{ padding: "8px 16px", borderRadius: 10, background: "linear-gradient(135deg, var(--gr), #6db541)", border: "none", color: "#0a0118", fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 0.3 }}>
            ✓ Завершить онбординг ({pending} pending → skipped)
          </button>
        )}
        {isCompleted && (
          <span style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(168,224,99,0.15)", border: "1px solid var(--gr)", color: "var(--gr)", fontSize: 12, fontWeight: 800 }}>
            ✓ Онбординг завершён
          </span>
        )}
      </div>

      {/* Stages */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {stages.map(stage => {
          const stageDone = stage.tasks.filter(t => t.status === "done").length;
          const stageSkipped = stage.tasks.filter(t => t.status === "skipped").length;
          const stagePending = stage.tasks.filter(t => t.status === "pending").length;
          const stageNeeded = stage.tasks.length - stageSkipped;
          const stagePct = stageNeeded === 0 ? 100 : Math.round(stageDone / stageNeeded * 100);
          const stageColor = stagePct === 100 ? "var(--gr)" : stagePct > 0 ? "var(--yl)" : "var(--t3)";
          const isExpanded = expanded.has(stage.stageId);

          return (
            <div key={stage.stageId} style={{ borderRadius: 16, border: `1px solid ${stagePct === 100 ? "rgba(168,224,99,0.3)" : "var(--brd)"}`, background: "var(--card)", overflow: "hidden" }}>
              <button onClick={() => toggleStage(stage.stageId)} style={{ width: "100%", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "var(--t1)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
                  <div style={{ minWidth: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: `${stageColor}22`, color: stageColor, fontWeight: 800, fontSize: 14 }}>
                    {stage.stageId}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t1)", marginBottom: 2 }}>{stage.stageTitle}</div>
                    <div style={{ fontSize: 11, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.8 }}>{stage.dayLabel} · {stageDone}/{stageNeeded} {stageSkipped > 0 ? `(${stageSkipped} пропущено)` : ""}</div>
                  </div>
                  <div style={{ minWidth: 60, height: 6, borderRadius: 4, background: "var(--track)", overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", inset: 0, width: `${stagePct}%`, background: stageColor, borderRadius: 4 }} />
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: stageColor, minWidth: 40 }}>{stagePct}%</span>
                </div>
                <span style={{ marginLeft: 12, fontSize: 14, color: "var(--t3)", transition: ".2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
              </button>

              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--brd)", padding: "4px 0" }}>
                  {stage.tasks.map(t => {
                    const num = t.template_task_num || "";
                    const isOverdue = t.status === "pending" && t.deadline && new Date(t.deadline) < new Date();
                    return (
                      <div key={t.id} style={{
                        padding: "12px 20px",
                        borderBottom: "1px solid var(--brd)",
                        display: "flex", alignItems: "center", gap: 14,
                        opacity: t.status === "skipped" ? 0.45 : 1,
                      }}>
                        {/* Чекбокс с 3 состояниями */}
                        <button onClick={() => {
                          const next = t.status === "pending" ? "done" : t.status === "done" ? "skipped" : "pending";
                          setStatus(t, next as any);
                        }} style={{
                          minWidth: 22, height: 22, borderRadius: 6,
                          border: `2px solid ${t.status === "done" ? "var(--gr)" : t.status === "skipped" ? "var(--t3)" : "var(--brd)"}`,
                          background: t.status === "done" ? "var(--gr)" : t.status === "skipped" ? "var(--t3)" : "transparent",
                          color: "#0a0118", fontWeight: 800, fontSize: 14,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer",
                        }} title={t.status === "pending" ? "Клик → ✓ сделано" : t.status === "done" ? "Клик → ⏭ не нужно" : "Клик → ☐ pending"}>
                          {t.status === "done" ? "✓" : t.status === "skipped" ? "⏭" : ""}
                        </button>

                        <span style={{ minWidth: 36, fontSize: 11, fontFamily: "monospace", color: "var(--t3)", fontWeight: 700 }}>{num}</span>

                        <div style={{ flex: 1, fontSize: 13.5, fontWeight: 500, color: t.status === "done" ? "var(--t2)" : "var(--t1)", textDecoration: t.status === "skipped" ? "line-through" : "none" }}>
                          {t.task_name}
                        </div>

                        {/* Статус-чипы */}
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => setStatus(t, "pending")} title="Не сделано"
                            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--brd)", background: t.status === "pending" ? "var(--cardH)" : "transparent", color: t.status === "pending" ? "var(--t1)" : "var(--t3)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>☐</button>
                          <button onClick={() => setStatus(t, "done")} title="Сделано"
                            style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${t.status === "done" ? "var(--gr)" : "var(--brd)"}`, background: t.status === "done" ? "rgba(168,224,99,0.15)" : "transparent", color: t.status === "done" ? "var(--gr)" : "var(--t3)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>✓</button>
                          <button onClick={() => setStatus(t, "skipped")} title="Не нужно для этого клиента"
                            style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${t.status === "skipped" ? "var(--t3)" : "var(--brd)"}`, background: t.status === "skipped" ? "rgba(119,101,143,0.15)" : "transparent", color: t.status === "skipped" ? "var(--t2)" : "var(--t3)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>⏭</button>
                        </div>

                        {/* Дедлайн */}
                        {t.deadline && (
                          <span style={{ minWidth: 80, fontSize: 10, color: isOverdue ? "var(--rd)" : "var(--t3)", fontFamily: "monospace", textAlign: "right" }}>
                            до {new Date(t.deadline).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                            {isOverdue && " ⚠"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
