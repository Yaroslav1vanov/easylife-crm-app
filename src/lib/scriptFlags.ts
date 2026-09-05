import type { Script } from "@/lib/database";

/** Пустой слот: карточка без текста (создана «Распределить по месяцу» или «+ слот»). */
export function isEmptySlot(s: Script): boolean {
  return !((s.hook_text || "").trim() || (s.body_text || "").trim() || (s.hook || "").trim().replace(/^Сценарий #\d+$/, ""));
}
/** Заглушка плана: пустой слот, который никто не брал в работу. Не задача и не просрочка —
 *  по договорённости просрочка считается только по взятым в работу сценариям. */
export function isPlaceholder(s: Script): boolean {
  return isEmptySlot(s) && (s.script_status === "notStarted" || !s.script_status) && (s.video_status === "notStarted" || !s.video_status);
}
