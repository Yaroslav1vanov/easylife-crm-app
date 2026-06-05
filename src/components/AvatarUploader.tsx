"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import Avatar from "@/components/Avatar";
import { Upload, X, Link as LinkIcon } from "lucide-react";

type Props = {
  /** Текущий URL аватара */
  currentUrl: string | null | undefined;
  /** Имя для генерации инициалов */
  name: string;
  /** Префикс пути в bucket: "clients" или "team" */
  pathPrefix: string;
  /** ID сущности для имени файла (число или uuid) */
  entityId: string | number;
  /** Размер кружка */
  size?: number;
  /** Колбэк когда URL поменялся */
  onUploaded: (url: string | null) => Promise<void> | void;
  /** Только просмотр (без редактирования) */
  readonly?: boolean;
};

export default function AvatarUploader({ currentUrl, name, pathPrefix, entityId, size = 80, onUploaded, readonly }: Props) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState(currentUrl || "");

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Только изображения");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Файл больше 5 МБ");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${pathPrefix}/${entityId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      // Добавим cache-buster чтобы старая картинка обновилась сразу
      const finalUrl = `${publicUrl}?t=${Date.now()}`;
      await onUploaded(finalUrl);
    } catch (e: any) {
      setError(e?.message || "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Удалить аватар?")) return;
    await onUploaded(null);
  }

  async function handleSaveUrl() {
    const u = urlInput.trim();
    if (!u) {
      await onUploaded(null);
      setShowUrlInput(false);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      // Сервер сам вытянет картинку (резолвит IG/TikTok профиль → фото) и вернёт байты.
      const resp = await fetch(`/api/social-avatar?u=${encodeURIComponent(u)}`);
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({} as any));
        const map: Record<string, string> = {
          bad_url: "Не похоже на ссылку — Instagram по ссылке не тянется, загрузи файлом",
          fetch_failed: "Не удалось получить фото (Instagram блокирует) — загрузи файлом",
          not_image: "По ссылке не картинка",
          timeout: "Соцсеть не ответила вовремя",
        };
        throw new Error(map[j?.error] || "Не удалось подтянуть фото — загрузи файлом");
      }
      const blob = await resp.blob();
      const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      const file = new File([blob], `${entityId}.${ext}`, { type: blob.type || "image/jpeg" });
      await handleFile(file); // перезаливаем в наш Storage
      setShowUrlInput(false);
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setUploading(false);
    }
  }

  if (readonly) {
    return <Avatar name={name} src={currentUrl} size={size} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative" }}>
        <Avatar name={name} src={currentUrl} size={size} />
        {uploading && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: "#fff", fontWeight: 700,
          }}>
            …
          </div>
        )}
        {/* HOVER controls */}
        <div className="avatar-controls" style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 4, opacity: 0, transition: "opacity .15s",
          cursor: "pointer",
        }}
          onClick={() => fileRef.current?.click()}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
        >
          <Upload size={Math.max(14, size * 0.22)} strokeWidth={2} style={{ color: "#fff" }} />
          <span style={{ fontSize: Math.max(8, size * 0.1), fontWeight: 700, color: "#fff" }}>Загрузить</span>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />

      {!showUrlInput && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{
            padding: "5px 9px", borderRadius: 7, fontSize: 10, fontWeight: 700,
            background: "rgba(157,107,255,0.12)", border: "1px solid var(--brd)",
            color: "var(--pu)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <Upload size={10} strokeWidth={2} /> Файл
          </button>
          <button onClick={() => setShowUrlInput(true)} disabled={uploading} style={{
            padding: "5px 9px", borderRadius: 7, fontSize: 10, fontWeight: 700,
            background: "transparent", border: "1px solid var(--brd)",
            color: "var(--t2)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <LinkIcon size={10} strokeWidth={2} /> Из соцсети
          </button>
          {currentUrl && (
            <button onClick={handleRemove} disabled={uploading} style={{
              padding: "5px 9px", borderRadius: 7, fontSize: 10, fontWeight: 700,
              background: "transparent", border: "1px solid var(--brd)",
              color: "var(--rd)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
            }}>
              <X size={10} strokeWidth={2} /> Удалить
            </button>
          )}
        </div>
      )}

      {showUrlInput && (
        <div style={{ display: "flex", gap: 4, width: "100%", maxWidth: 240 }}>
          <input
            autoFocus
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="tiktok.com/@user, x.com/user или прямая ссылка на фото"
            style={{
              flex: 1, padding: "6px 8px", borderRadius: 6, fontSize: 10,
              background: "var(--inset)", border: "1px solid var(--brd)", color: "var(--t1)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveUrl();
              if (e.key === "Escape") setShowUrlInput(false);
            }}
          />
          <button onClick={handleSaveUrl} style={{
            padding: "5px 9px", borderRadius: 6, fontSize: 10, fontWeight: 700,
            background: "var(--pu)", border: "none", color: "#fff", cursor: "pointer",
          }}>OK</button>
          <button onClick={() => setShowUrlInput(false)} style={{
            padding: "5px 8px", borderRadius: 6, fontSize: 10,
            background: "transparent", border: "1px solid var(--brd)", color: "var(--t3)", cursor: "pointer",
          }}>✕</button>
        </div>
      )}

      {error && <div style={{ fontSize: 10, color: "var(--rd)", textAlign: "center" }}>{error}</div>}
    </div>
  );
}
