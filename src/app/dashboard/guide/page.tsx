"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/RoleContext";
import {
  Scissors, FileText, Flame, Send, Rocket, LayoutDashboard, CalendarDays, Clock,
  CheckCircle2, Upload, Wand2, Package, Eye, ArrowRight, type LucideIcon,
} from "lucide-react";

/* ---------- строительные блоки ---------- */
function Chip({ children, color = "var(--pu)" }: { children: React.ReactNode; color?: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, background: `${color}1f`, color, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;
}
function Step({ n, title, children, color }: { n: number; title: React.ReactNode; children?: React.ReactNode; color: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, background: `${color}1f`, color, fontFamily: "'Unbounded', sans-serif", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t1)", lineHeight: 1.5 }}>{title}</div>
        {children && <div style={{ fontSize: 12.5, color: "var(--t2)", lineHeight: 1.6, marginTop: 3 }}>{children}</div>}
      </div>
    </div>
  );
}
function GuideCard({ Icon, color, title, subtitle, tldr, steps, note, cta, onCta }: {
  Icon: LucideIcon; color: string; title: string; subtitle: string; tldr: string[];
  steps: React.ReactNode; note?: React.ReactNode; cta?: string; onCta?: () => void;
}) {
  return (
    <div style={{ background: "rgba(123,63,228,0.04)", border: "1px solid var(--brd)", borderRadius: 18, padding: 22, borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <span style={{ width: 42, height: 42, borderRadius: 12, background: `${color}1f`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={21} style={{ color }} /></span>
        <div>
          <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--t1)" }}>{title}</h2>
          <div style={{ fontSize: 12, color: "var(--t3)" }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0 18px" }}>
        {tldr.map((t, i) => <span key={i} style={{ fontSize: 11, fontWeight: 700, color: "var(--t2)", background: "var(--inset2)", border: "1px solid var(--track)", borderRadius: 999, padding: "5px 11px" }}>{t}</span>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{steps}</div>
      {note && <div style={{ marginTop: 18, padding: "11px 14px", borderRadius: 11, background: `${color}0f`, border: `1px solid ${color}33`, fontSize: 12, color: "var(--t2)", lineHeight: 1.6 }}>{note}</div>}
      {cta && <button onClick={onCta} style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 11, background: `linear-gradient(135deg, ${color}, var(--pu))`, color: "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{cta} <ArrowRight size={14} /></button>}
    </div>
  );
}

/* ---------- гайды ---------- */
function MontagerGuide({ go }: { go: (p: string) => void }) {
  const c = "#ffae42";
  return (
    <GuideCard Icon={Scissors} color={c} title="Гайд монтажёра" subtitle="Твоя задача — выдавать готовые видео партиями, на неделю вперёд"
      tldr={["Видишь: Дашборд · Монтаж · Референсы", "Работаешь наперёд", "Даты и тексты — не трогаешь"]}
      steps={<>
        <Step n={1} title={<>Утром открой <Chip color="#42d4f4"><LayoutDashboard size={12} /> Дашборд</Chip> → блок «Мои дедлайны»</>} color={c}>
          Тут — что горит именно у тебя: какие видео и к какому числу. Один взгляд — понятен весь день.
        </Step>
        <Step n={2} title={<>Открой <Chip color={c}><Scissors size={12} /> Монтаж</Chip> → блок <Chip color={c}><Package size={12} /> «Партии на неделю»</Chip></>} color={c}>
          По каждому твоему клиенту: сколько видео и <b>к какому дню</b> сдать пачкой. Нажми <Chip>Мои</Chip> — увидишь только своих. Важно: партия должна быть <b>готова за 3 дня до дня сдачи</b> — это запас на перемонтаж.
        </Step>
        <Step n={3} title={<>Бери сценарии из колонки «Согласовано» → монтируй</>} color={c}>
          Открой карточку — там сценарий (хук / основной текст / призыв), референс-исходник и транскрибация. Делай видео по нему.
        </Step>
        <Step n={4} title={<>Сдал видео → жми <Chip color="#a8e063"><CheckCircle2 size={12} /> ✓ Сдать</Chip> прямо на карточке</>} color={c}>
          Один клик — видео уходит в «Готово», дата сдачи проставляется сама (по ней считается твоя работа). Не нужно тащить карточку мышкой.
        </Step>
      </>}
      note={<><b>Что нельзя:</b> менять даты публикации и тексты сценария (они только для чтения) — это зона тимлида. Ты видишь только своих клиентов.</>}
      cta="Открыть мой Монтаж" onCta={() => go("/dashboard/montage")}
    />
  );
}

function TeamleadGuide({ go }: { go: (p: string) => void }) {
  const c = "#9d6bff";
  return (
    <GuideCard Icon={FileText} color={c} title="Гайд тимлида" subtitle="Твоя задача — держать контент готовым наперёд, чтобы монтаж не простаивал"
      tldr={["Работаешь на 1–2 недели вперёд", "Свой день проверки у каждого клиента", "Референс → Сценарий → Публикация"]}
      steps={<>
        <Step n={1} title={<><Chip color="#e1306c"><Flame size={12} /> Референсы</Chip> — набираешь залётные ролики (в день проверки клиента)</>} color={c}>
          Выбери клиента → вставь ссылку на TikTok/IG-ролик → CRM сама подтянет просмотры, комменты и транскрибацию. Жми <Chip color="#ffae42">🔥 Оценить</Chip> (разбор вирусности), отбери лучшие и перетащи в «Утверждены» → из рефа <b>создаётся сценарий</b>.
        </Step>
        <Step n={2} title={<><Chip color={c}><FileText size={12} /> Сценарии</Chip> — доводишь до ума</>} color={c}>
          Открой сценарий → <Chip color="#42d4f4"><Wand2 size={12} /> Адаптировать под клиента</Chip> (AI напишет хук/тело/призыв в тоне клиента, сохранив «рычаг» референса). Поправь, при нужде — «↻ Переделать». Веди по колонкам: <b>Идея → Взято в работу → На согласовании → Согласовано</b>. Держи запас минимум на 10 дней.
        </Step>
        <Step n={3} title={<><Chip color="#42d4f4"><Send size={12} /> Публикации</Chip> — расставляешь план месяца</>} color={c}>
          Выбери клиента → жми <Chip>+</Chip> на нужных днях → 🎬 Рилз или 🖼 Карусель (пустые слоты-даты = скелет плана). Потом перетаскивай готовые сценарии из пула на слоты — дата закрепляется за роликом.
        </Step>
        <Step n={4} title={<>Следи за днями проверки и дедлайнами</>} color={c}>
          У каждого клиента задан «день проверки» — в этот день приносишь Ярославу пачку рефов+сценариев. Дни у клиентов разные, чтобы не сваливать всё в один день.
        </Step>
      </>}
      note={<><b>Главный принцип:</b> не по одному ролику в день, а <b>пачками наперёд</b>. Чем дальше вперёд утверждён контент — тем спокойнее работает монтаж и тем меньше авралов.</>}
      cta="Открыть Референсы" onCta={() => go("/dashboard/references")}
    />
  );
}

function PublishGuide({ go }: { go: (p: string) => void }) {
  const c = "#42d4f4";
  return (
    <GuideCard Icon={Rocket} color={c} title="Публикация видео (Metricool)" subtitle="Как залить готовое видео и отправить на автопубликацию"
      tldr={["Раздел Metricool", "Видео → тексты → дата → публикация", "Время — по поясу клиента"]}
      steps={<>
        <Step n={1} title={<>Открой <Chip color={c}><Rocket size={12} /> Metricool</Chip> → карточку с готовым видео</>} color={c}>
          Сюда автоматически попадают ролики, помеченные «Готово к публикации».
        </Step>
        <Step n={2} title={<>Залей файл: <Chip color={c}><Upload size={12} /> ⬆ Файл</Chip></>} color={c}>
          Видео уходит в хранилище, откуда Metricool его заберёт. Или вставь прямую ссылку на файл.
        </Step>
        <Step n={3} title={<>Тексты: <Chip color="#9d6bff"><Wand2 size={12} /> Сгенерить тексты под соцсети</Chip></>} color={c}>
          AI напишет подписи под IG / TikTok / YouTube / Threads в тоне клиента. Пройдись по вкладкам, поправь при нужде.
        </Step>
        <Step n={4} title={<>Поставь дату и время <Chip color="#ffae42"><Clock size={12} /> по поясу клиента</Chip></>} color={c}>
          Время задаётся в часовом поясе аудитории клиента (напр. US Eastern) — под полем видно «сейчас у клиента …». Ставь час, когда пост должен выйти для его аудитории.
        </Step>
        <Step n={5} title={<>Утверди → <Chip color={c}><Rocket size={12} /> Опубликовать в Metricool</Chip></>} color={c}>
          Пост уходит в расписание — Metricool сам опубликует в нужное время. Статус карточки станет «Запланировано», после выхода — «Опубликовано».
        </Step>
      </>}
      note={<>Кнопка <Chip>Мои бренды</Chip> — список подключённых аккаунтов и их blogId. Если Metricool вернёт ошибку по сети (напр. приватность TikTok) — пришли текст, поправим за минуту.</>}
      cta="Открыть Metricool" onCta={() => go("/dashboard/metricool")}
    />
  );
}

/* ---------- страница ---------- */
export default function GuidePage() {
  const role = useRole();
  const router = useRouter();
  const go = (p: string) => router.push(p);

  const isMontager = role === "montager";
  const isTeamlead = role === "teamlead";
  const isAdmin = role === "admin" || role === "owner";

  // Админ/владелец видит все три через табы; остальные — свой + публикацию
  const tabs = [
    { id: "montager", label: "Монтажёр", Icon: Scissors, node: <MontagerGuide go={go} /> },
    { id: "teamlead", label: "Тимлид", Icon: FileText, node: <TeamleadGuide go={go} /> },
    { id: "publish", label: "Публикация", Icon: Rocket, node: <PublishGuide go={go} /> },
  ];
  const [tab, setTab] = useState(isMontager ? "montager" : isTeamlead ? "teamlead" : "montager");

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif", maxWidth: 820 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>📖 Гайд по CRM</h1>
        <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>Как работать в системе — по шагам. Гайд живой: показывает реальные разделы, кнопки кликабельны.</p>
      </div>

      {isAdmin ? (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 10, border: `1px solid ${tab === t.id ? "var(--pu)" : "var(--brd)"}`, background: tab === t.id ? "rgba(157,107,255,0.15)" : "transparent", color: tab === t.id ? "var(--pu)" : "var(--t2)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                <t.Icon size={14} /> {t.label}
              </button>
            ))}
          </div>
          {tabs.find(t => t.id === tab)?.node}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {isMontager && <MontagerGuide go={go} />}
          {isTeamlead && <TeamleadGuide go={go} />}
          {/* Публикацию видит каждый — пока не решено, кто заливает */}
          <PublishGuide go={go} />
        </div>
      )}
    </div>
  );
}
