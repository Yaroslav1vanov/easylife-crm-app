"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Нижний лист на телефоне / центрированное окно на десктопе.
 *  Единый способ показать действия по объекту без перетаскивания. */
type Props = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  zIndex?: number;
};

export default function Sheet({ open, onClose, title, sub, children, width = 440, zIndex = 1000 }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="v2-sheet-bg" style={{ zIndex }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="v2-sheet" style={{ ["--sheet-w" as any]: `${width}px` }} role="dialog" aria-modal="true">
        <div className="v2-sheet-grab" />
        {(title || sub) && (
          <div className="v2-sheet-head">
            <div style={{ minWidth: 0, flex: 1 }}>
              {title && <h3>{title}</h3>}
              {sub && <div className="v2-sheet-sub">{sub}</div>}
            </div>
            <button className="v2-iconbtn" onClick={onClose} aria-label="Закрыть"><X size={16} /></button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Строка-действие внутри листа */
export function SheetOption({ color = "var(--pu)", label, hint, onClick, active, danger, disabled }: {
  color?: string; label: React.ReactNode; hint?: React.ReactNode; onClick?: () => void; active?: boolean; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button className={`v2-opt ${active ? "on" : ""}`} onClick={onClick} disabled={disabled}
      style={{ color: danger ? "var(--rd)" : undefined, opacity: disabled ? 0.45 : 1 }}>
      <i className="v2-dot" style={{ background: danger ? "var(--rd)" : color }} />
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {hint && <small>{hint}</small>}
    </button>
  );
}
