// Дни рождения: сколько дней до ближайшего повторения даты и как её показать.
export type BirthdayPerson = {
  kind: "client" | "team";
  id: number;
  name: string;
  role?: string | null;
  avatarUrl?: string | null;
  date: string;        // исходная дата рождения
  inDays: number;      // сколько дней до ближайшего ДР (0 = сегодня)
  turns: number | null;// сколько исполняется, если известен год
  when: string;        // «12 сентября»
};

const RU = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** Дней до ближайшего дня рождения (учитывает переход через Новый год). */
export function daysUntil(birthday: string, todayIso: string): number {
  const [, bm, bd] = birthday.split("-").map(Number);
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const today = Date.UTC(ty, tm - 1, td);
  let next = Date.UTC(ty, bm - 1, bd);
  if (next < today) next = Date.UTC(ty + 1, bm - 1, bd);
  return Math.round((next - today) / 86400000);
}

export function fmtBirthday(birthday: string): string {
  const [, m, d] = birthday.split("-").map(Number);
  return `${d} ${RU[m - 1]}`;
}

/** Сколько исполнится в ближайший ДР. null — если год рождения не указан (стоит 1900 и раньше). */
export function turnsAge(birthday: string, todayIso: string): number | null {
  const by = Number(birthday.slice(0, 4));
  if (!by || by < 1920) return null;
  const [ty] = todayIso.split("-").map(Number);
  const passed = daysUntil(birthday, todayIso) === 0;
  const nextYear = Number(birthday.slice(5, 7)) < Number(todayIso.slice(5, 7)) ||
    (birthday.slice(5, 7) === todayIso.slice(5, 7) && Number(birthday.slice(8, 10)) < Number(todayIso.slice(8, 10)));
  return (ty + (nextYear && !passed ? 1 : 0)) - by;
}

/** Собирает ближайшие дни рождения на horizon дней вперёд, отсортированные по близости. */
export function upcomingBirthdays(
  people: { kind: "client" | "team"; id: number; name: string; role?: string | null; avatarUrl?: string | null; birthday?: string | null }[],
  todayIso: string,
  horizon = 30,
): BirthdayPerson[] {
  const out: BirthdayPerson[] = [];
  for (const p of people) {
    const b = (p.birthday || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) continue;
    const inDays = daysUntil(b, todayIso);
    if (inDays > horizon) continue;
    out.push({
      kind: p.kind, id: p.id, name: p.name, role: p.role ?? null, avatarUrl: p.avatarUrl ?? null,
      date: b, inDays, turns: turnsAge(b, todayIso), when: fmtBirthday(b),
    });
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

export function daysLabel(n: number): string {
  if (n === 0) return "сегодня 🎉";
  if (n === 1) return "завтра";
  const t = n % 10, h = n % 100;
  const word = t === 1 && h !== 11 ? "день" : t >= 2 && t <= 4 && (h < 12 || h > 14) ? "дня" : "дней";
  return `через ${n} ${word}`;
}
