"use client";
import { createContext, useContext } from "react";

// Роль текущего пользователя (из profiles.role), проброшенная из серверного layout.
// Используется для ограничения UI (что видит/может монтажёр и т.п.).
export type Role = "admin" | "owner" | "teamlead" | "montager" | string;

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
  montager: ["dashboard", "montage", "references"],
};
export function sectionAllowed(role: Role, sectionId: string): boolean {
  const allow = ALLOWED_SECTIONS[role];
  if (!allow || allow === "all") return true;
  return allow.includes(sectionId);
}
