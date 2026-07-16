// Часовые пояса клиентов и конвертация времени публикации.
// Время публикации задаётся ПО ПОЯСУ КЛИЕНТА (его аудитории), а не сотрудника.

export const DEFAULT_TZ = "America/New_York"; // US Eastern (Нью-Йорк, Майами)

export const CLIENT_TIMEZONES: { tz: string; label: string }[] = [
  { tz: "America/New_York", label: "US Eastern · Нью-Йорк, Майами" },
  { tz: "America/Chicago", label: "US Central · Чикаго, Хьюстон" },
  { tz: "America/Denver", label: "US Mountain · Денвер" },
  { tz: "America/Los_Angeles", label: "US Pacific · Лос-Анджелес" },
  { tz: "Europe/Kyiv", label: "Киев" },
  { tz: "Asia/Bangkok", label: "Бангкок" },
];

export function tzLabel(tz: string | null | undefined) {
  return CLIENT_TIMEZONES.find(t => t.tz === tz)?.label || tz || DEFAULT_TZ;
}
export function tzShort(tz: string | null | undefined) {
  return (tzLabel(tz).split("·")[0] || "").trim() || tz || "";
}

// Смещение пояса (wallclock − UTC) в мс на конкретный момент (учитывает DST).
function tzOffsetMs(tz: string, date: Date) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const g = (t: string) => Number(p.find(x => x.type === t)!.value);
  let h = g("hour"); if (h === 24) h = 0;
  const asUTC = Date.UTC(g("year"), g("month") - 1, g("day"), h, g("minute"), g("second"));
  return asUTC - date.getTime();
}

// «YYYY-MM-DDTHH:mm» (стенные часы в поясе клиента) → UTC ISO для хранения.
export function zonedInputToUtc(localStr: string, tz: string): string | null {
  if (!localStr) return null;
  const naive = Date.parse(`${localStr}:00Z`); // трактуем введённое как UTC…
  if (isNaN(naive)) return null;
  const off = tzOffsetMs(tz, new Date(naive)); // …и сдвигаем на смещение пояса
  return new Date(naive - off).toISOString();
}

// UTC ISO → «YYYY-MM-DDTHH:mm» в поясе клиента (для значения datetime-local).
export function utcToZonedInput(utcIso: string | null, tz: string): string {
  if (!utcIso) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(utcIso));
  const g = (t: string) => p.find(x => x.type === t)!.value;
  let h = g("hour"); if (h === "24") h = "00";
  return `${g("year")}-${g("month")}-${g("day")}T${h}:${g("minute")}`;
}

// США → 12-часовой формат (AM/PM), остальные пояса → 24 часа.
export function is12h(tz: string | null | undefined) { return !!tz && tz.startsWith("America/"); }
// «15:30» → «3:30 PM» (для американских клиентов).
function to12h(h: number, min: string): string {
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${min} ${suffix}`;
}

// Текущее время в поясе — для подсказки «сейчас там …». Для США — с AM/PM.
export function nowInTz(tz: string): string {
  if (is12h(tz)) return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date());
  return new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

// Красивый вывод момента публикации в поясе клиента: «1 июл, 09:00» (или «1 июл, 9:00 AM» для США).
const RU_MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
export function fmtInTz(utcIso: string | null, tz: string): string {
  if (!utcIso) return "—";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(utcIso));
  const g = (t: string) => p.find(x => x.type === t)!.value;
  let h = g("hour"); if (h === "24") h = "00";
  const date = `${Number(g("day"))} ${RU_MON[Number(g("month")) - 1]}`;
  return is12h(tz) ? `${date}, ${to12h(Number(h), g("minute"))}` : `${date}, ${h}:${g("minute")}`;
}
