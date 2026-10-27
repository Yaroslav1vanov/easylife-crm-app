"use client";
import { fileUrl } from "@/components/strategy/files";
import type { ClientAvatar } from "@/lib/avatar";

/* Выбор образа аватара картинками (картинки копирует из HeyGen кнопка «Обновить образы из HeyGen»).
   Без картинок — те же плашки с названием. */

export type GroupLook = { id: string; name: string; type?: string | null; preview_key?: string | null; engines?: string[]; status?: string | null };

export const lookOf = (av: ClientAvatar, id: string): GroupLook =>
  (av.group_looks || []).find((l) => l.id === id) || { id, name: av.look_names?.[id] || id.slice(0, 8) };

export function LookThumb({ look, active, star, onClick, size = 74, dim }: { look: GroupLook; active?: boolean; star?: boolean; onClick?: () => void; size?: number; dim?: boolean }) {
  const name = look.name && look.name !== "Photo Avatar" ? look.name : "";
  return (
    <button type="button" onClick={onClick} title={look.name || look.id}
      style={{ width: size, flexShrink: 0, padding: 0, border: 0, background: "none", cursor: onClick ? "pointer" : "default", textAlign: "left", opacity: dim ? 0.45 : 1 }}>
      <div style={{ position: "relative", width: size, height: Math.round(size * 1.33), borderRadius: 10, overflow: "hidden", background: "var(--v2-inset)",
        boxShadow: active ? "0 0 0 2px var(--cy)" : "0 0 0 1px var(--brd)" }}>
        {look.preview_key ? <img src={fileUrl(look.preview_key)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <div style={{ fontSize: 10.5, color: "var(--t3)", padding: 6 }}>{look.name || look.id.slice(0, 8)}</div>}
        {star && <span style={{ position: "absolute", top: 4, left: 4, fontSize: 10, fontWeight: 800, padding: "1px 5px", borderRadius: 6, background: "rgba(0,0,0,.65)", color: "#ffd166" }}>★ основной</span>}
        {active && <span style={{ position: "absolute", bottom: 4, right: 4, width: 18, height: 18, borderRadius: 9, background: "var(--cy)", color: "#000", fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>}
      </div>
      {name && <div style={{ fontSize: 10.5, color: "var(--t2)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>}
    </button>
  );
}

/** Выбор одного образа из разрешённых клиенту. */
export default function LookPicker({ avatar, value, onChange, size = 64 }: { avatar: ClientAvatar; value: string; onChange: (id: string) => void; size?: number }) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
      {avatar.look_ids.map((id) => (
        <LookThumb key={id} look={lookOf(avatar, id)} size={size} active={id === value} star={id === avatar.default_look_id} onClick={() => onChange(id)} />
      ))}
    </div>
  );
}
