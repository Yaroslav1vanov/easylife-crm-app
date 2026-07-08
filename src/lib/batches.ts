import { Client, Script } from "@/lib/database";

// ============================================================
// Недельные партии: клиенту сдаём готовые видео пачкой раз в
// неделю (delivery_day), партия = ролики с датой публикации на
// неделю от дня сдачи. Готовность — за BATCH_BUFFER_DAYS до сдачи.
// ============================================================

export const BATCH_BUFFER_DAYS = 3; // партия готова за 3 дня до сдачи (пн → к пт)

export const WEEKDAYS_RU = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
export const WEEKDAYS_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
export const wdName = (d: number | null | undefined) => (d && d >= 1 && d <= 7 ? WEEKDAYS_RU[d - 1] : "—");
export const wdShort = (d: number | null | undefined) => (d && d >= 1 && d <= 7 ? WEEKDAYS_SHORT[d - 1] : "—");

// Квота роликов в неделю: явная или авто из пакета (30/мес → 7, 20/мес → 5)
export function weeklyQuotaOf(c: Client): number {
  if (c.weekly_quota && c.weekly_quota > 0) return c.weekly_quota;
  return Math.max(1, Math.round((c.package || 0) / 4.3));
}

const pad2 = (n: number) => String(n).padStart(2, "0");
export function isoOfDate(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return isoOfDate(dt);
}
export function isoWeekday(iso: string): number { // 1=Пн … 7=Вс
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const wd = new Date(y, m - 1, d).getDay(); // 0=Вс
  return wd === 0 ? 7 : wd;
}

/** Ближайшая (включая сегодня) дата сдачи для дня недели deliveryDay. */
export function nextDeliveryIso(deliveryDay: number, todayIso: string): string {
  const shift = (deliveryDay - isoWeekday(todayIso) + 7) % 7;
  return addDays(todayIso, shift);
}

export type Batch = {
  client: Client;
  deliveryIso: string;   // день сдачи партии клиенту
  readyByIso: string;    // к какому дню всё должно быть готово (сдача − буфер)
  weekStart: string;     // покрываемая неделя публикаций [weekStart..weekEnd]
  weekEnd: string;
  quota: number;         // сколько роликов должно быть в партии
  planned: Script[];     // ролики с pub_date в этой неделе
  done: number;          // из них готово (ready/published)
};

/** Партия клиента на ближайшую сдачу. Партия покрывает публикации недели [сдача .. сдача+6]. */
export function batchFor(client: Client, scripts: Script[], todayIso: string): Batch | null {
  if (!client.delivery_day) return null;
  const deliveryIso = nextDeliveryIso(client.delivery_day, todayIso);
  const weekStart = deliveryIso, weekEnd = addDays(deliveryIso, 6);
  const planned = scripts.filter(s =>
    s.client_id === client.id && s.pub_date && s.pub_date >= weekStart && s.pub_date <= weekEnd
  ).sort((a, b) => (a.pub_date || "").localeCompare(b.pub_date || ""));
  const done = planned.filter(s => s.video_status === "ready" || s.video_status === "published").length;
  return {
    client, deliveryIso,
    readyByIso: addDays(deliveryIso, -BATCH_BUFFER_DAYS),
    weekStart, weekEnd,
    quota: weeklyQuotaOf(client),
    planned, done,
  };
}
