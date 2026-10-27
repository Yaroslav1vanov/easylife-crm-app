"use client";
import { useState } from "react";
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

/** Выбор образа: выбранный — крупно, «Сменить образ ▾» раскрывает все разрешённые клиенту образы большими карточками. */
export default function LookPicker({ avatar, value, onChange, readOnly }: { avatar: ClientAvatar; value: string; onChange: (id: string) => void; size?: number; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"all" | "digital_twin" | "photo_avatar">("all");
  const others = (avatar.group_looks || []).filter((l) => !avatar.look_ids.includes(l.id));   // вся группа клиента, кроме основных
  const cur = lookOf(avatar, value || avatar.default_look_id || avatar.look_ids[0]);
  const title = (l: GroupLook) => (l.name && l.name !== "Photo Avatar" ? l.name : "Образ без названия");
  if (readOnly) return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {avatar.look_ids.map((id) => <LookCard key={id} width={110} look={lookOf(avatar, id)} main={id === avatar.default_look_id} title={title(lookOf(avatar, id))} />)}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <LookThumb look={cur} size={64} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>{title(cur)}{cur.id === avatar.default_look_id ? " · основной" : ""}</div>
          <button type="button" className="v2-act ghost" style={{ height: 28, fontSize: 12, marginTop: 5 }} onClick={() => setOpen(!open)}>
            {open ? "Свернуть ▴" : `Сменить образ ▾ (${avatar.look_ids.length + others.length})`}
          </button>
        </div>
      </div>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 12, background: "var(--v2-inset)", border: "1px solid var(--brd)", maxHeight: 640, overflowY: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--t2)" }}>★ Основные</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {avatar.look_ids.map((id) => {
              const l = lookOf(avatar, id);
              return <LookCard key={id} look={l} title={title(l)} main={id === avatar.default_look_id} active={id === cur.id}
                onClick={() => { onChange(id); setOpen(false); }} />;
            })}
          </div>
          {others.length > 0 && (<>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--t2)" }}>Все образы ({others.length})</span>
              {([["all", "все"], ["digital_twin", "видео-двойники"], ["photo_avatar", "фото"]] as const).map(([k, l]) => (
                <button key={k} type="button" className={`v2-chip ${kind === k ? "cy" : "mut"}`} style={{ cursor: "pointer", border: 0 }} onClick={() => setKind(k)}>{l}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {others.filter((l) => kind === "all" || l.type === kind).map((l) => (
                <LookCard key={l.id} look={l} width={120} title={title(l)} active={l.id === cur.id} onClick={() => { onChange(l.id); setOpen(false); }} />
              ))}
            </div>
          </>)}
        </div>
      )}
    </div>
  );
}

/** Большая карточка образа: картинка 3:4 и название. */
export function LookCard({ look, title, main, active, onClick, width = 150, dim }: { look: GroupLook; title: string; main?: boolean; active?: boolean; onClick?: () => void; width?: number; dim?: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{ width, padding: 0, border: 0, background: "none", cursor: onClick ? "pointer" : "default", textAlign: "left", opacity: dim ? 0.4 : 1 }}>
      <div style={{ position: "relative", width, height: Math.round(width * 4 / 3), borderRadius: 12, overflow: "hidden", background: "var(--card)",
        boxShadow: active ? "0 0 0 3px var(--cy)" : "0 0 0 1px var(--brd)" }}>
        {look.preview_key ? <img src={fileUrl(look.preview_key)} alt={title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 10, fontSize: 11.5, color: "var(--t3)" }}>нет картинки — «Обновить образы из HeyGen» в Настройках</div>}
        {main && <span style={{ position: "absolute", top: 6, left: 6, fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 7, background: "rgba(0,0,0,.7)", color: "#ffd166" }}>★ основной</span>}
        {active && <span style={{ position: "absolute", bottom: 6, right: 6, width: 24, height: 24, borderRadius: 12, background: "var(--cy)", color: "#000", fontSize: 14, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", marginTop: 5, lineHeight: 1.3 }}>{title}</div>
    </button>
  );
}
