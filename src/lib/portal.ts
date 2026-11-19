import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/* Кабинет клиента — страница /p/<секрет> только с его проектом, без входа в CRM.

   Почему не логин в CRM: вошедший пользователь по правилам базы может читать все таблицы
   (интерфейс прячет чужое, но через браузер достать можно). Поэтому клиенту не даём сессию вообще:
   страницу собирает сервер служебным ключом строго по одному клиенту и отдаёт готовый HTML.

   Секрет хранится в app_settings: key = "portal:<id клиента>", value = секрет.
   Перевыпуск = новый секрет (старая ссылка перестаёт открываться), отключение = удалить строку. */

const key = (clientId: number) => `portal:${clientId}`;

export async function getPortalToken(sb: SupabaseClient, clientId: number): Promise<string | null> {
  const { data } = await sb.from("app_settings").select("value").eq("key", key(clientId)).maybeSingle();
  return (data?.value as string) || null;
}

export async function issuePortalToken(sb: SupabaseClient, clientId: number): Promise<string> {
  const token = randomBytes(18).toString("base64url");   // 24 символа, подобрать нельзя
  const { error } = await sb.from("app_settings").upsert({ key: key(clientId), value: token, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return token;
}

export async function revokePortalToken(sb: SupabaseClient, clientId: number): Promise<void> {
  const { error } = await sb.from("app_settings").delete().eq("key", key(clientId));
  if (error) throw new Error(error.message);
}

/** Секрет из ссылки → id клиента (или null, если ссылка отключена/неверная). */
export async function resolvePortal(sb: SupabaseClient, token: string): Promise<number | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data } = await sb.from("app_settings").select("key, value").like("key", "portal:%").eq("value", token).limit(1);
  const row = data?.[0];
  if (!row || row.value !== token) return null;
  const id = Number(String(row.key).slice("portal:".length));
  return Number.isFinite(id) && id > 0 ? id : null;
}
