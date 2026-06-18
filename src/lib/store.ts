// Простой кэш в памяти на время жизни вкладки (stale-while-revalidate).
// Цель: переходы между разделами показывают уже загруженные данные мгновенно,
// а в фоне идёт тихое обновление. Сбрасывается при перезагрузке страницы.
import type { Client, Script, ClientMonth, TeamMember } from "@/lib/database";

type Store = {
  clients?: Client[];
  team?: TeamMember[];
  scripts?: Script[];
  clientMonths?: ClientMonth[];
};

const store: Store = {};

export function getStore(): Store {
  return store;
}

export function setStore(patch: Store) {
  Object.assign(store, patch);
}

// Точечно обновить один сценарий в кэше (после редактирования/перетаскивания),
// чтобы возврат на другую страницу показал свежие данные.
export function patchScriptInStore(id: number, patch: Partial<Script>) {
  if (!store.scripts) return;
  store.scripts = store.scripts.map(s => (s.id === id ? { ...s, ...patch } : s));
}
