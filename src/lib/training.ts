// Видеоуроки по CRM для команды (раздел «Обучение»).
// Ролики собраны в Remotion (~/easylife-montage/studio, композиции CrmR1…CrmR11) и лежат в R2: videos/guide/.
// Пересобрали ролик — загрузите новый файл и поменяйте url здесь.

export type Lesson = {
  n: number;
  title: string;
  about: string;
  url: string;
  dur: string;          // длительность, мм:сс
  forMontager: boolean; // показывать монтажёру
};

const R2 = "https://pub-f893f423888444c196b01aa9fa948a86.r2.dev/videos/guide";

export const LESSONS: Lesson[] = [
  { n: 1, title: "Карточка клиента", about: "С чего начать: шапка, вкладки и онбординг нового клиента.", url: `${R2}/crm-r1-ne43dl.mp4`, dur: "1:52", forMontager: true },
  { n: 2, title: "Настройки", about: "Что заполнить на старте: команда, соцсети, Metricool, ChatPlace, часовой пояс.", url: `${R2}/crm-r2-deeg2j.mp4`, dur: "2:28", forMontager: false },
  { n: 3, title: "Работа", about: "Главная вкладка на каждый день: контрактные месяцы, счётчики, доска сценариев.", url: `${R2}/crm-r3-juisq7.mp4`, dur: "1:27", forMontager: false },
  { n: 4, title: "План", about: "Календарь публикаций на месяц и перенос роликов.", url: `${R2}/crm-r4-1xyctu.mp4`, dur: "0:44", forMontager: false },
  { n: 5, title: "Аналитика", about: "Цифры клиента: плитки, путь до заявок, таблица по месяцам, план / факт.", url: `${R2}/crm-r5-lqrv82.mp4`, dur: "1:37", forMontager: false },
  { n: 6, title: "Чат с ИИ", about: "Как ставить задачи ИИ: монтаж, правки, сторис, аватар, уникализация сценария.", url: `${R2}/crm-r6-8bqmh0.mp4`, dur: "2:13", forMontager: true },
  { n: 7, title: "«Сегодня» и «Задачи»", about: "С чего начинать рабочий день и задачи по клиентам, которые CRM ставит сама.", url: `${R2}/crm-r7-krbz8i.mp4`, dur: "1:52", forMontager: true },
  { n: 8, title: "Референсы и транскрибация", about: "Референсы через Телеграм-группу, перенос в сценарии, как снять текст с ролика.", url: `${R2}/crm-r8-4o0li2.mp4`, dur: "2:02", forMontager: true },
  { n: 9, title: "Монтаж", about: "Как монтажёр берёт ролик, загружает файл и сдаёт его.", url: `${R2}/crm-r9-it5zoc.mp4`, dur: "1:25", forMontager: true },
  { n: 10, title: "Публикации", about: "План выхода, отправка в Metricool с текстами от ИИ и общий календарь.", url: `${R2}/crm-r10-nlwnqh.mp4`, dur: "1:31", forMontager: false },
  { n: 11, title: "Моя ЗП", about: "Из чего складывается доход монтажёра и тимлида.", url: `${R2}/crm-r11-da7d4y.mp4`, dur: "0:59", forMontager: true },
];
