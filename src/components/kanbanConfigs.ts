import { Lightbulb, Pen, UserCheck, CheckCircle2, Scissors, Send, Clapperboard, Eye } from "lucide-react";
import { KanbanColumn } from "@/components/KanbanBoard";

/** Сценарии: Идея → Взято в работу → На согласовании → Согласовано.
 *  При попадании в «Согласовано» (script_status=approved) карточка автоматически
 *  появляется в доске «Монтаж» (она фильтрует по script_status==='approved'). */
export const SCRIPT_COLUMNS: KanbanColumn[] = [
  { id: "idea", label: "Идея", color: "var(--pu)", Icon: Lightbulb,
    matches: (s) => s.script_status === "notStarted" || !s.script_status,
    patch: { script_status: "notStarted" } },
  { id: "writing", label: "Взято в работу", color: "var(--cy)", Icon: Pen,
    matches: (s) => s.script_status === "inProgress",
    patch: { script_status: "inProgress" } },
  { id: "review", label: "На согласовании", color: "var(--or)", Icon: UserCheck,
    matches: (s) => s.script_status === "review",
    patch: { script_status: "review" } },
  { id: "approved", label: "Согласовано", color: "var(--gr)", Icon: CheckCircle2,
    matches: (s) => s.script_status === "approved",
    patch: { script_status: "approved" } },
];

/** Монтаж: Согласовано → Взято в монтаж → Готово / на согласовании → Готово к публикации → Опубликовано.
 *  Доска получает только сценарии с script_status==='approved'. */
export const MONTAGE_COLUMNS: KanbanColumn[] = [
  { id: "approved", label: "Согласовано", color: "var(--pu)", Icon: CheckCircle2,
    matches: (s) => s.script_status === "approved" && (s.video_status === "notStarted" || !s.video_status),
    patch: { script_status: "approved", video_status: "notStarted" } },
  { id: "in_montage", label: "Взято в монтаж", color: "var(--cy)", Icon: Scissors,
    matches: (s) => s.script_status === "approved" && s.video_status === "inProgress",
    patch: { script_status: "approved", video_status: "inProgress" } },
  { id: "review", label: "Готово / на согласовании", color: "var(--or)", Icon: Eye,
    matches: (s) => s.script_status === "approved" && s.video_status === "review",
    patch: { script_status: "approved", video_status: "review" } },
  { id: "ready", label: "Готово к публикации", color: "var(--em)", Icon: Clapperboard,
    matches: (s) => s.video_status === "ready",
    patch: { script_status: "approved", video_status: "ready" } },
  { id: "published", label: "Опубликовано", color: "var(--gr)", Icon: Send,
    matches: (s) => s.video_status === "published",
    patch: { script_status: "approved", video_status: "published" } },
];

/** Опубликованные — одна колонка (для просмотра + ссылки на готовое видео) */
export const PUBLISHED_COLUMNS: KanbanColumn[] = [
  { id: "published", label: "Опубликовано", color: "var(--gr)", Icon: Send,
    matches: (s) => s.video_status === "published",
    patch: { video_status: "published" } },
];
