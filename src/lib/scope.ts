import type { Client, TeamMember } from "@/lib/database";

/** Видит ли роль всех клиентов агентства (владелец, админ, ассистент). */
export function seesAllClients(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "assistant";
}

/**
 * Клиенты, которые сотрудник должен видеть в рабочих разделах.
 * Тимлид — только свои, монтажёр — свои + те, к кому открыт доступ.
 * Пока не определили, кто вошёл, чужое не показываем.
 */
export function myClients(role: string | null | undefined, me: TeamMember | null, clients: Client[]): Client[] {
  if (seesAllClients(role)) return clients;
  if (!me) return [];
  if (role === "teamlead") return clients.filter(c => c.teamlead_id === me.id);
  if (role === "montager") return clients.filter(c => c.montager_id === me.id || (c.extra_montager_ids || []).includes(me.id));
  return clients;
}
