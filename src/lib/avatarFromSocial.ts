import type { SupabaseClient } from "@supabase/supabase-js";

/** Берёт фото профиля по ссылке на соцсеть и перезаливает в наш Storage.
 *  Возвращает публичную ссылку или null, если соцсеть фото не отдала. */
export async function avatarFromSocial(sb: SupabaseClient, link: string, pathPrefix: string, entityId: number): Promise<string | null> {
  try {
    const resp = await fetch(`/api/social-avatar?u=${encodeURIComponent(link)}`);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (!blob.type.startsWith("image/") || blob.size > 5 * 1024 * 1024) return null;
    const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const path = `${pathPrefix}/${entityId}-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from("avatars").upload(path, blob, { upsert: true, cacheControl: "3600", contentType: blob.type });
    if (error) return null;
    const { data: { publicUrl } } = sb.storage.from("avatars").getPublicUrl(path);
    return `${publicUrl}?t=${Date.now()}`;
  } catch { return null; }
}

/** Пробует соцсети клиента по очереди (Instagram → TikTok → YouTube), первая удачная и есть аватар. */
export async function avatarFromClientSocials(sb: SupabaseClient, c: { id: number; instagram?: string | null; tiktok?: string | null; youtube?: string | null }): Promise<string | null> {
  for (const link of [c.instagram, c.tiktok, c.youtube]) {
    if (!link || !link.trim()) continue;
    const url = await avatarFromSocial(sb, link.trim(), "clients", c.id);
    if (url) return url;
  }
  return null;
}
