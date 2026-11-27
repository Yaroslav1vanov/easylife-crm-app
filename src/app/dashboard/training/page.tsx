"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { tint } from "@/lib/tint";
import { useRole } from "@/components/RoleContext";
import { LESSONS, type Lesson } from "@/lib/training";
import { CheckCircle2, PlayCircle, ArrowRight, RotateCcw } from "lucide-react";

// Обучение по CRM: видеоуроки по порядку. Просмотренные отмечаются сами (досмотрел до конца),
// отметки хранятся в браузере сотрудника.
const KEY = "crm-training-watched";

function loadWatched(): number[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function saveWatched(v: number[]) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* приватный режим — просто без отметок */ }
}

export default function TrainingPage() {
  const role = useRole();
  const isMontager = role === "montager";
  const isOwnerLike = role === "owner" || role === "admin";
  const [track, setTrack] = useState<"all" | "montager">(isMontager ? "montager" : "all");
  useEffect(() => { if (isMontager) setTrack("montager"); }, [isMontager]);

  const lessons: Lesson[] = useMemo(() => track === "montager" ? LESSONS.filter(l => l.forMontager) : LESSONS, [track]);
  const [watched, setWatched] = useState<number[]>([]);
  const [cur, setCur] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { setWatched(loadWatched()); }, []);
  // первым открываем первый непросмотренный урок
  useEffect(() => {
    if (cur != null && lessons.some(l => l.n === cur)) return;
    const next = lessons.find(l => !watched.includes(l.n)) ?? lessons[0];
    setCur(next?.n ?? null);
  }, [lessons, watched, cur]);

  const lesson = lessons.find(l => l.n === cur) ?? lessons[0];
  const idx = lessons.findIndex(l => l.n === lesson?.n);
  const nextLesson = idx >= 0 ? lessons[idx + 1] : undefined;
  const done = lessons.filter(l => watched.includes(l.n)).length;

  const mark = (n: number, on = true) => {
    const v = on ? Array.from(new Set([...watched, n])) : watched.filter(x => x !== n);
    setWatched(v); saveWatched(v);
  };
  const open = (n: number) => { setCur(n); if (typeof window !== "undefined" && window.innerWidth < 900) window.scrollTo({ top: 0, behavior: "smooth" }); };
  // «просмотрено» — когда досмотрели почти до конца
  const onTime = () => {
    const v = videoRef.current; if (!v || !lesson || !v.duration) return;
    if (v.currentTime / v.duration > 0.9 && !watched.includes(lesson.n)) mark(lesson.n);
  };

  if (!lesson) return null;
  const C = "var(--cy)";

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif", maxWidth: 1180 }}>
      <div className="page-head ph-col">
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>🎓 Обучение по CRM</h1>
        <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>
          Короткие видеоуроки. Смотрите по порядку: каждый следующий опирается на предыдущий. Что-то забыли — откройте урок ещё раз.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: "1 1 260px", minWidth: 220 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "var(--t2)", marginBottom: 6 }}>
            <span>Пройдено {done} из {lessons.length}</span>
            {done === lessons.length && <span style={{ color: "var(--gr)" }}>✓ курс пройден</span>}
          </div>
          <div style={{ height: 6, borderRadius: 99, background: "var(--track)", overflow: "hidden" }}>
            <div style={{ width: `${(done / lessons.length) * 100}%`, height: "100%", background: C, transition: "width .3s" }} />
          </div>
        </div>
        {!isMontager && (
          <div style={{ display: "flex", gap: 6 }}>
            {([["all", isOwnerLike ? "Все уроки (тимлид)" : "Все уроки"], ["montager", "Курс монтажёра"]] as const).map(([id, label]) => (
              <button key={id} onClick={() => { setTrack(id); setCur(null); }}
                style={{ padding: "8px 13px", borderRadius: 10, border: `1px solid ${track === id ? "var(--pu)" : "var(--brd)"}`, background: track === id ? "rgba(var(--pu-rgb),0.15)" : "transparent", color: track === id ? "var(--pu)" : "var(--t2)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* плеер первым в разметке: на телефоне он сверху, на компьютере справа (row-reverse) */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", flexDirection: "row-reverse" }}>
        {/* плеер */}
        <div style={{ flex: "3 1 520px", minWidth: 0, background: "rgba(var(--vi-rgb),0.04)", border: "1px solid var(--brd)", borderRadius: 18, padding: 16 }}>
          <video key={lesson.url} ref={videoRef} src={lesson.url} controls playsInline preload="metadata" onTimeUpdate={onTime}
            style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 12, background: "#000", display: "block" }} />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C, letterSpacing: 0.5 }}>УРОК {idx + 1} ИЗ {lessons.length}</div>
              <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--t1)", margin: "4px 0 6px" }}>{lesson.title}</h2>
              <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.55 }}>{lesson.about}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {watched.includes(lesson.n) ? (
                <button onClick={() => mark(lesson.n, false)} title="Снять отметку"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 13px", borderRadius: 10, border: "1px solid var(--brd)", background: "transparent", color: "var(--t2)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  <RotateCcw size={13} /> Просмотрено
                </button>
              ) : (
                <button onClick={() => mark(lesson.n)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 13px", borderRadius: 10, border: "1px solid var(--brd)", background: "transparent", color: "var(--t2)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  <CheckCircle2 size={13} /> Отметить просмотренным
                </button>
              )}
              {nextLesson && (
                <button onClick={() => open(nextLesson.n)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 10, background: "var(--btn-grad)", color: "var(--btn-fg)", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  Следующий урок <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
        {/* список уроков */}
        <div style={{ flex: "1 1 300px", maxWidth: 380, minWidth: 260, display: "flex", flexDirection: "column", gap: 6 }}>
          {lessons.map((l, i) => {
            const active = l.n === lesson.n, seen = watched.includes(l.n);
            return (
              <button key={l.n} onClick={() => open(l.n)}
                style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                  border: `1px solid ${active ? tint(C, 0.55) : "var(--brd)"}`, background: active ? tint(C, 0.1) : "rgba(var(--vi-rgb),0.04)" }}>
                <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Unbounded', sans-serif", fontSize: 12, fontWeight: 800,
                  background: seen ? "rgba(var(--gr-rgb),0.15)" : tint(C, 0.12), color: seen ? "var(--gr)" : C }}>
                  {seen ? <CheckCircle2 size={15} /> : i + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--t1)", lineHeight: 1.35 }}>{l.title}</span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--t3)", marginTop: 2 }}>{l.dur}{seen ? " · просмотрено" : ""}</span>
                </span>
                {active && <PlayCircle size={16} style={{ color: C, flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
