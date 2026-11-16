/** Тип ролика: «Основной» (в счёт пакета, в ЗП) или «Пробный» (тест сверх пакета: в пакет и ЗП не идёт,
 *  в отчётах считается отдельно). null/undefined = основной (колонка scripts.is_trial, по умолчанию false).
 *  НЕ путать с publications.ig_trial — это режим публикации «Пробный рилс» в Instagram, основной ролик тоже может так выйти. */
export function isTrial(s: { is_trial?: boolean | null } | null | undefined): boolean {
  return !!s?.is_trial;
}
export function isMain(s: { is_trial?: boolean | null } | null | undefined): boolean {
  return !s?.is_trial;
}
