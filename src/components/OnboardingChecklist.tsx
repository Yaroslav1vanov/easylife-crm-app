"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import db, { ChecklistTask, OnboardingTemplateRow, OnboardingProgress } from "@/lib/database";
import { useIsOwner } from "@/components/RoleContext";

interface Props {
  clientId: number;
  clientName: string;
  clientCreatedAt: string;
  clientStartDate?: string | null;
  clientNiche?: string | null;
  onComplete?: () => void;
}

type StageGroup = {
  stageId: number;
  stageTitle: string;
  dayLabel: string;
  tasks: ChecklistTask[];
};

export default function OnboardingChecklist({ clientId, clientName, clientCreatedAt, clientStartDate, clientNiche, onComplete }: Props) {
  const [tasks, setTasks] = useState<ChecklistTask[]>([]);
  const [template, setTemplate] = useState<OnboardingTemplateRow[]>([]);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set([1])); // stage 1 раскрыт по умолчанию
  const [openGuide, setOpenGuide] = useState<number | null>(null);   // id задачи с раскрытой инструкцией
  const [copied, setCopied] = useState<number | null>(null);
  const isOwner = useIsOwner();                              // править регламент может только владелец
  const [editTpl, setEditTpl] = useState<number | null>(null);  // id строки шаблона в режиме правки
  const [draftInstr, setDraftInstr] = useState("");
  const [draftMsg, setDraftMsg] = useState("");
  const [saving, setSaving] = useState(false);
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

  /** Подставляет в шаблон то, что CRM уже знает о клиенте. Остальные {{…}} остаются — их заполняет тимлид. */
  function fillTemplate(text: string): string {
    return text
      .replace(/\{\{\s*(Имя клиента|Имя|Клиент)\s*\}\}/gi, clientName)
      .replace(/\{\{\s*Ниша клиента\s*\}\}/gi, clientNiche || "{{Ниша клиента}}");
  }
  function copyMessage(taskId: number, text: string) {
    navigator.clipboard.writeText(fillTemplate(text));
    setCopied(taskId); setTimeout(() => setCopied(null), 1800);
  }

  async function saveTemplate(tplId: number) {
    setSaving(true);
    const r = await fetch("/api/onboarding/template", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: tplId, instruction: draftInstr, client_message: draftMsg }),
    });
    const j = await r.json();
    setSaving(false);
    if (!r.ok) { alert(j?.error || "не сохранилось"); return; }
    setTemplate(arr => arr.map(x => x.id === tplId ? { ...x, instruction: j.row.instruction, client_message: j.row.client_message } : x));
    setEditTpl(null);
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
                    const tpl = template.find(x => x.task_num === num);
                    const hasGuide = !!((tpl?.instruction || "").trim() || (tpl?.client_message || "").trim()) || (isOwner && !!tpl);
                    const guideOpen = openGuide === t.id;
                    return (
                      <div key={t.id} style={{ borderBottom: "1px solid var(--brd)" }}>
                      <div style={{
                        padding: "12px 20px",
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

                        {hasGuide && (
                          <button onClick={() => setOpenGuide(guideOpen ? null : t.id)}
                            title="Как делать + готовый текст клиенту"
                            style={{ padding: "4px 9px", borderRadius: 6, border: `1px solid ${guideOpen ? "var(--yl)" : "var(--brd)"}`,
                              background: guideOpen ? "rgba(245,196,81,0.14)" : "transparent", color: guideOpen ? "var(--yl)" : "var(--t2)",
                              fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                            {((tpl?.instruction || "").trim() || (tpl?.client_message || "").trim()) ? "📖 Как делать" : "✏️ Добавить инструкцию"}
                          </button>
                        )}

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

                      {guideOpen && tpl && editTpl === tpl.id && (
                        <div style={{ padding: "0 20px 16px 72px", display: "flex", flexDirection: "column", gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 9.5, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>Как делать</div>
                            <textarea value={draftInstr} onChange={e => setDraftInstr(e.target.value)} rows={7}
                              placeholder="Пошагово: что сделать, где, на что обратить внимание"
                              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12.5, lineHeight: 1.6, fontFamily: "inherit", resize: "vertical", outline: "none" }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 9.5, fontWeight: 800, color: "var(--cy)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>Сообщение клиенту</div>
                            <textarea value={draftMsg} onChange={e => setDraftMsg(e.target.value)} rows={9}
                              placeholder="Готовый текст, который тимлид скопирует и отправит. Подставляются {{Имя клиента}} и {{Ниша клиента}}, остальные {{…}} тимлид заполнит руками"
                              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--inp)", border: "1px solid rgba(66,212,244,0.3)", color: "var(--t1)", fontSize: 12.5, lineHeight: 1.6, fontFamily: "inherit", resize: "vertical", outline: "none" }} />
                            <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 5 }}>
                              Плейсхолдеры: <code>{"{{Имя клиента}}"}</code> и <code>{"{{Ниша клиента}}"}</code> подставятся сами. Любые другие в фигурных скобках — например <code>{"{{Дата}}"}</code> — подсветятся жёлтым как «заполнить руками».
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => saveTemplate(tpl.id)} disabled={saving}
                              style={{ padding: "8px 16px", borderRadius: 9, background: "linear-gradient(135deg, var(--gr), #6db541)", border: "none", color: "#0a0118", fontSize: 12, fontWeight: 800, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
                              {saving ? "Сохраняю…" : "✓ Сохранить"}
                            </button>
                            <button onClick={() => setEditTpl(null)}
                              style={{ padding: "8px 14px", borderRadius: 9, background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              Отмена
                            </button>
                            <div style={{ flex: 1 }} />
                            <span style={{ fontSize: 10, color: "var(--t3)", alignSelf: "center" }}>Регламент общий — изменится у всех клиентов</span>
                          </div>
                        </div>
                      )}

                      {guideOpen && tpl && editTpl !== tpl.id && (
                        <div style={{ padding: "0 20px 16px 72px", display: "flex", flexDirection: "column", gap: 10 }}>
                          {isOwner && (
                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                              <button onClick={() => { setDraftInstr(tpl.instruction || ""); setDraftMsg(tpl.client_message || ""); setEditTpl(tpl.id); }}
                                style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--brd)", background: "transparent", color: "var(--t2)", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>
                                ✏️ Редактировать регламент
                              </button>
                            </div>
                          )}
                          {!((tpl.instruction || "").trim() || (tpl.client_message || "").trim()) && (
                            <div style={{ fontSize: 12, color: "var(--t3)", fontStyle: "italic" }}>Инструкции пока нет — нажми «Редактировать регламент» и опиши, как делать этот шаг.</div>
                          )}
                          {(tpl.instruction || "").trim() && (
                            <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--inset)", border: "1px solid var(--brd)" }}>
                              <div style={{ fontSize: 9.5, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Как делать</div>
                              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--t2)", whiteSpace: "pre-wrap" }}>{tpl.instruction}</div>
                            </div>
                          )}
                          {(tpl.client_message || "").trim() && (
                            <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(66,212,244,0.06)", border: "1px solid rgba(66,212,244,0.28)" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
                                <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--cy)", textTransform: "uppercase", letterSpacing: 0.6 }}>Сообщение клиенту</span>
                                <button onClick={() => copyMessage(t.id, tpl.client_message || "")}
                                  style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--cy)", background: copied === t.id ? "rgba(168,224,99,0.16)" : "rgba(66,212,244,0.12)",
                                    color: copied === t.id ? "var(--gr)" : "var(--cy)", fontSize: 10.5, fontWeight: 800, cursor: "pointer" }}>
                                  {copied === t.id ? "✓ Скопировано" : "⧉ Копировать"}
                                </button>
                              </div>
                              <div style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--t1)", whiteSpace: "pre-wrap" }}>
                                {fillTemplate(tpl.client_message || "").split(/(\{\{[^}]+\}\})/g).map((part, i) =>
                                  part.startsWith("{{")
                                    ? <mark key={i} style={{ background: "rgba(245,196,81,0.22)", color: "var(--yl)", padding: "0 3px", borderRadius: 3, fontWeight: 700 }}>{part}</mark>
                                    : <span key={i}>{part}</span>
                                )}
                              </div>
                              <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 7 }}>Жёлтым подсвечено то, что нужно заполнить руками перед отправкой</div>
                            </div>
                          )}
                        </div>
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
