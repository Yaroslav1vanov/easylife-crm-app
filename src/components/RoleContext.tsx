"use client";
import { createContext, useContext } from "react";

// Роль текущего пользователя (из profiles.role), проброшенная из серверного layout.
// Используется для ограничения UI (что видит/может монтажёр и т.п.).
export type Role = "admin" | "owner" | "assistant" | "teamlead" | "montager" | string;

const RoleCtx = createContext<Role>("montager");

export function RoleProvider({ role, children }: { role: Role; children: React.ReactNode }) {
  return <RoleCtx.Provider value={role}>{children}</RoleCtx.Provider>;
}
export function useRole(): Role {
  return useContext(RoleCtx);
}
export function useIsMontager(): boolean {
  return useContext(RoleCtx) === "montager";
}
// Дату сдачи монтажа (ready_at) может править ТОЛЬКО владелец/админ —
// монтажёр и тимлид её видят, но не меняют (чтобы даты не «переставляли» задним числом).
export function useCanEditReadyAt(): boolean {
  const r = useContext(RoleCtx);
  return r === "owner" || r === "admin";
}
// Разделы, доступные роли (для сайдбара и гварда маршрутов).
export const ALLOWED_SECTIONS: Record<string, string[] | "all"> = {
  montager: ["dashboard", "montage", "references", "guide"],
};
/** Разделы только для владельца — деньги команды. Остальные роли их не видят вообще. */
export const OWNER_ONLY_SECTIONS = ["payroll"];
export function isOwner(role: Role): boolean {
  return role === "owner" || role === "admin";
}
export function useIsOwner(): boolean {
  return isOwner(useRole());
}
/** Кто видит общую картину по ВСЕМ клиентам (а не только свои задачи):
 *  владелец/админ и ассистент — он следит за пропусками и работает с тимлидами.
 *  Деньги (ЗП) ассистенту всё равно закрыты — они в OWNER_ONLY_SECTIONS. */
export function seesOverview(role: Role): boolean {
  return isOwner(role) || role === "assistant";
}
export function useSeesOverview(): boolean {
  return seesOverview(useRole());
}
export function sectionAllowed(role: Role, sectionId: string): boolean {
  if (OWNER_ONLY_SECTIONS.includes(sectionId)) return isOwner(role);
  const allow = ALLOWED_SECTIONS[role];
  if (!allow || allow === "all") return true;
  return allow.includes(sectionId);
}
