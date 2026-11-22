/** Полупрозрачный оттенок цвета для подложек и рамок.
 *  Понимает токены `var(--x)` (берёт тройку `--x-rgb` из стилей) и `#rrggbb`.
 *  Не использует color-mix(), поэтому работает и в старых браузерах (Safari до 16.2, Chrome до 111).
 *  alpha — от 0 до 1. */
export function tint(color: string, alpha: number): string {
  const c = String(color || "").trim();
  const v = /^var\(--([a-z0-9-]+)\)$/i.exec(c);
  if (v) return `rgba(var(--${v[1]}-rgb), ${alpha})`;
  const h = /^#([0-9a-f]{6})$/i.exec(c);
  if (h) return `rgba(${parseInt(h[1].slice(0, 2), 16)}, ${parseInt(h[1].slice(2, 4), 16)}, ${parseInt(h[1].slice(4, 6), 16)}, ${alpha})`;
  const h3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (h3) return `rgba(${parseInt(h3[1] + h3[1], 16)}, ${parseInt(h3[2] + h3[2], 16)}, ${parseInt(h3[3] + h3[3], 16)}, ${alpha})`;
  return `color-mix(in srgb, ${c} ${Math.round(alpha * 100)}%, transparent)`;
}
