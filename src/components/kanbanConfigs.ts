import { FileText, Pen, UserCheck, CheckCircle2, Scissors, Send, Film, Archive } from "lucide-react";
import { KanbanColumn } from "@/components/KanbanBoard";

/** Сценарии: путь от идеи до утверждения */
export const SCRIPT_COLUMNS: KanbanColumn[] = [
  { id: "idea", label: "Идея", color: "#9d6bff", Icon: FileText,
    matches: (s) => s.script_status === "notStarted" && !s.hook_text && !s.body_text,
    patch: { script_status: "notStarted" } },
  { id: "writing", label: "Написание", color: "#42d4f4", Icon: Pen,
    matches: (s) => s.script_status === "inProgress" || (s.script_status === "notStarted" && (!!s.hook_text || !!s.body_text)),
    patch: { script_status: "inProgress" } },
  { id: "review", label: "На согласовании", color: "#ffae42", Icon: UserCheck,
    matches: (s) => s.script_status === "review",
    patch: { script_status: "review" } },
  { id: "approved", label: "Готовы к монтажу", color: "#a8e063", Icon: CheckCircle2,
    matches: (s) => s.script_status === "approved" && (s.video_status === "notStarted" || !s.video_status),
    patch: { script_status: "approved", video_status: "notStarted" } },
  { id: "in_montage_or_done", label: "В монтаже / опубл.", color: "#34a853", Icon: Archive,
    matches: (s) => s.script_status === "approved" && (s.video_status === "inProgress" || s.video_status === "ready" || s.video_status === "published"),
    patch: { script_status: "approved" } },
];

/** Монтаж: путь утверждённых сценариев через монтаж до публикации */
export const MONTAGE_COLUMNS: KanbanColumn[] = [
  { id: "to_shoot", label: "Снять / передать", color: "#9d6bff", Icon: Film,
    matches: (s) => s.script_status === "approved" && (s.video_status === "notStarted" || !s.video_status),
    patch: { script_status: "approved", video_status: "notStarted" } },
  { id: "in_montage", label: "В монтаже", color: "#ffae42", Icon: Scissors,
    matches: (s) => s.script_status === "approved" && s.video_status === "inProgress",
    patch: { script_status: "approved", video_status: "inProgress" } },
  { id: "ready", label: "Готово", color: "#42d4f4", Icon: CheckCircle2,
    matches: (s) => s.video_status === "ready",
    patch: { script_status: "approved", video_status: "ready" } },
  { id: "published", label: "Опубликовано", color: "#a8e063", Icon: Send,
    matches: (s) => s.video_status === "published",
    patch: { script_status: "approved", video_status: "published" } },
];

/** Опубликованные — одна колонка (для архивного просмотра) */
export const PUBLISHED_COLUMNS: KanbanColumn[] = [
  { id: "published", label: "Опубликовано", color: "#a8e063", Icon: Send,
    matches: (s) => s.video_status === "published",
    patch: { video_status: "published" } },
];
