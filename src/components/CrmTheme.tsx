"use client";
import { useEffect, useState } from "react";

/* Тема CRM: светлая (по умолчанию) или тёмная. Хранится в браузере сотрудника.
   Свой ключ и свой атрибут (data-crm-theme), чтобы не задевать кабинет клиента:
   у него остаётся старый ключ «theme» и атрибут data-theme. */
export type CrmTheme = "light" | "dark";
export const CRM_THEME_KEY = "crm-theme";
const EVENT = "crm-theme-change";

export function readCrmTheme(): CrmTheme {
  try { return localStorage.getItem(CRM_THEME_KEY) === "dark" ? "dark" : "light"; } catch { return "light"; }
}
export function applyCrmTheme(t: CrmTheme) {
  const el = document.documentElement;
  if (t === "dark") el.setAttribute("data-crm-theme", "dark"); else el.removeAttribute("data-crm-theme");
}
export function setCrmTheme(t: CrmTheme) {
  try { localStorage.setItem(CRM_THEME_KEY, t); } catch {}
  applyCrmTheme(t);
  window.dispatchEvent(new Event(EVENT));
}

/** Текущая тема и переключатель. До монтирования — «light», чтобы разметка сервера совпадала. */
export function useCrmTheme(): { theme: CrmTheme; toggle: () => void } {
  const [theme, setTheme] = useState<CrmTheme>("light");
  useEffect(() => {
    const sync = () => { const t = readCrmTheme(); setTheme(t); applyCrmTheme(t); };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);   // тему сменили в другой вкладке
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return { theme, toggle: () => setCrmTheme(theme === "dark" ? "light" : "dark") };
}

/** Ставит тему до первой отрисовки, чтобы тёмная не мигала светлой при загрузке. */
export const CRM_THEME_BOOT = `try{if(localStorage.getItem("${CRM_THEME_KEY}")==="dark")document.documentElement.setAttribute("data-crm-theme","dark")}catch(e){}`;
