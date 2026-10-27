import type { SupabaseClient } from "@supabase/supabase-js";

/* Аватар HeyGen клиента (ТЗ «аватары HeyGen в CRM»).
   Генерации тратят общие кредиты агентства, поэтому:
   - генерировать могут только тимлид и монтажёр этого клиента и владелец;
   - каждая озвучка/видео = одна задача = одна генерация, без автоповторов;
   - видео в месяц ограничены лимитом клиента, сверх — только владелец. */

export type ClientAvatar = {
  client_id: number; heygen_group_id: string; look_ids: string[]; default_look_id: string | null;
  look_names: Record<string, string>; voice_id: string | null; voice_model: string; engine: string;
  aspect: string; resolution: string; monthly_limit: number | null;
  language: "ru" | "uk" | "en"; voice_speed: number; trim_silence: boolean;
};
export type AvatarGen = {
  id: number; client_id: number; kind: "voice" | "video" | "avatar"; status: "queued" | "working" | "done" | "error";
  message_id: number | null; script_id: number | null; look_id: string | null; text: string | null;
  seconds: number | null; credits_before: number | null; credits_after: number | null; is_redo: boolean;
  requested_name: string | null; error: string | null; created_at: string; finished_at: string | null; result_key: string | null;
};

export const ENGINES: { id: string; label: string }[] = [
  { id: "avatar_v", label: "Avatar V (лучший в API)" },
  { id: "avatar_iv", label: "Avatar IV" },
  { id: "avatar_iii", label: "Avatar III" },
  { id: "avatar_vi", label: "Avatar VI (когда HeyGen откроет в API)" },
];

/** Видео в месяц: свой лимит клиента, иначе по пакету (30 роликов → 40 видео, 20 → 28; запас на переделки ~1/3). */
export function videoLimit(av: Pick<ClientAvatar, "monthly_limit"> | null, pkg: number | null | undefined): number {
  if (av?.monthly_limit) return av.monthly_limit;
  const p = Number(pkg) || 30;
  return Math.ceil(p * 4 / 3);
}

export const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();

/** Траты клиента за календарный месяц: озвучки, видео, переделки, кредиты. Ошибки в лимит не идут. */
export function monthUsage(gens: AvatarGen[]) {
  const ok = gens.filter((g) => g.status !== "error");
  const spent = gens.reduce((s, g) => s + (g.credits_before != null && g.credits_after != null ? Math.max(0, g.credits_before - g.credits_after) : 0), 0);
  return {
    voices: ok.filter((g) => g.kind === "voice").length,
    videos: ok.filter((g) => g.kind === "video").length,
    redos: ok.filter((g) => g.is_redo).length,
    errors: gens.filter((g) => g.status === "error").length,
    credits: Math.round(spent * 10) / 10,
    seconds: Math.round(ok.reduce((s, g) => s + (Number(g.seconds) || 0), 0)),
  };
}

/** Может ли сотрудник тратить кредиты на этого клиента. */
export function canGenerate(role: string | null | undefined, myTeamId: number | null | undefined, client: { teamlead_id?: number | null; montager_id?: number | null }) {
  if (role === "owner" || role === "admin") return true;
  return !!myTeamId && (client.teamlead_id === myTeamId || client.montager_id === myTeamId);
}

export async function loadAvatar(sb: SupabaseClient, clientId: number): Promise<ClientAvatar | null> {
  const { data } = await sb.from("client_avatars").select("*").eq("client_id", clientId).maybeSingle();
  return (data as ClientAvatar) || null;
}

/** Словарь произношения → текст для ИИ («как написано → как озвучивать»). */
export function dictionaryText(rows: { written: string; spoken: string; note?: string | null }[]) {
  if (!rows.length) return "Словарь произношения пуст.";
  return rows.map((r) => `- ${r.written} → ${r.spoken}${r.note ? ` (${r.note})` : ""}`).join("\n");
}

/** Грубая оценка до генерации: ~14 знаков в секунду речи; голос ≈ 1 кредит за 15–20 с (замер 27.10), видео — замерим на пилоте. */
export function estimate(text: string, speed = 1) {
  const clean = text.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  const sec = Math.max(1, Math.round(clean.length / 14 / (speed || 1)));
  return { seconds: sec, voiceCredits: Math.max(1, Math.ceil(sec / 16)) };
}
