"use client";
import { useState } from "react";
import { useRole, isOwner } from "@/components/RoleContext";
import { Wallet, TrendingUp } from "lucide-react";

/* Мотивация: как считается ЗП. Монтажёр видит только свою схему, тимлид — только свою. */

const S = `
.mot .badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--gr);border:1px solid rgba(168,224,99,0.35);border-radius:100px;padding:6px 14px;margin-bottom:16px}
.mot h1{font-family:'Unbounded',sans-serif;font-weight:800;font-size:clamp(26px,4.4vw,40px);line-height:1.05;letter-spacing:-0.7px;color:var(--t1)}
.mot h1 .g{color:var(--gr)}
.mot .lead{color:var(--t2);font-size:15px;margin-top:13px;max-width:620px;line-height:1.6}
.mot .sec{font-family:'Unbounded',sans-serif;font-weight:700;font-size:11.5px;letter-spacing:1.5px;text-transform:uppercase;color:var(--t3);margin:42px 0 16px}
.mot .hero{background:linear-gradient(135deg,rgba(168,224,99,0.13),rgba(123,63,228,0.09));border:1px solid rgba(168,224,99,0.32);border-radius:22px;padding:30px 28px;display:flex;align-items:center;gap:28px;flex-wrap:wrap}
.mot .hero .num{font-family:'Unbounded',sans-serif;font-weight:800;font-size:clamp(46px,8vw,74px);line-height:.9;color:var(--gr)}
.mot .hero .txt{flex:1;min-width:230px}
.mot .hero .t1{font-family:'Unbounded',sans-serif;font-weight:700;font-size:18px;margin-bottom:7px;color:var(--t1)}
.mot .hero .t2{color:var(--t2);font-size:14px;line-height:1.6}
.mot .grid{display:grid;gap:14px}
.mot .g3{grid-template-columns:repeat(3,1fr)}
.mot .g2{grid-template-columns:repeat(2,1fr)}
.mot .c{background:rgba(123,63,228,0.07);border:1px solid var(--brd);border-radius:16px;padding:22px}
.mot .c .k{font-family:'Unbounded',sans-serif;font-weight:800;font-size:28px;color:var(--gr);line-height:1}
.mot .c .k.p{color:var(--pu)}
.mot .c .n{font-weight:700;font-size:14.5px;margin:11px 0 5px;color:var(--t1)}
.mot .c .d{color:var(--t2);font-size:13px;line-height:1.6}
.mot .calc{background:rgba(123,63,228,0.04);border:1px solid var(--brd);border-radius:18px;padding:24px}
.mot .calc h3{font-family:'Unbounded',sans-serif;font-weight:700;font-size:15.5px;margin-bottom:3px;color:var(--t1)}
.mot .calc .sub{color:var(--t3);font-size:12px;margin-bottom:16px}
.mot .line{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--brd);font-size:14px}
.mot .line:last-of-type{border-bottom:none}
.mot .line .l{color:var(--t2)}
.mot .line .v{font-family:'Unbounded',sans-serif;font-weight:700;font-size:14.5px;color:var(--gr)}
.mot .total{display:flex;justify-content:space-between;align-items:center;margin-top:13px;padding-top:15px;border-top:2px solid var(--brd)}
.mot .total .l{font-weight:800;font-size:14.5px;color:var(--t1)}
.mot .total .v{font-family:'Unbounded',sans-serif;font-weight:800;font-size:26px;color:var(--gr)}
.mot .lev{display:flex;gap:15px;padding:17px 0;border-bottom:1px solid var(--brd)}
.mot .lev:last-child{border-bottom:none}
.mot .lev .ic{width:36px;height:36px;flex-shrink:0;border-radius:10px;background:rgba(123,63,228,0.18);display:flex;align-items:center;justify-content:center;font-size:16px}
.mot .lev .t{font-weight:700;font-size:14.5px;margin-bottom:4px;color:var(--t1)}
.mot .lev .t span{color:var(--gr)}
.mot .lev .d{color:var(--t2);font-size:13px;line-height:1.6}
.mot .note{background:rgba(255,174,66,0.07);border:1px solid rgba(255,174,66,0.28);border-radius:15px;padding:19px 21px;margin-bottom:11px}
.mot .note .t{font-weight:800;font-size:13.5px;color:var(--or);margin-bottom:5px}
.mot .note .d{color:var(--t2);font-size:13px;line-height:1.6}
.mot .note.ok{background:rgba(168,224,99,0.06);border-color:rgba(168,224,99,0.28)}
.mot .note.ok .t{color:var(--gr)}
.mot .pay{margin-top:38px;background:rgba(123,63,228,0.07);border:1px solid var(--brd);border-radius:16px;padding:20px 22px;display:flex;align-items:center;gap:13px;flex-wrap:wrap}
.mot .pay .t{font-weight:700;font-size:14.5px;color:var(--t1)}
.mot .pay .d{color:var(--t2);font-size:13px;margin-top:3px}
.mot b.w{color:var(--t1)}
@media(max-width:760px){.mot .g3,.mot .g2{grid-template-columns:1fr}.mot .hero{padding:24px 20px;gap:16px}.mot .sec{margin:32px 0 13px}}
`;

function Montager() {
  return (
    <div className="mot">
      <div className="badge">EasyLife AI · Система мотивации</div>
      <h1>Монтажёр <span className="g">проекта</span></h1>
      <p className="lead">Как складывается твой доход и как его растить. Считается по каждому клиенту отдельно — сколько ведёшь, столько раз и начисляется.</p>

      <div className="sec">Основа дохода</div>
      <div className="hero">
        <div className="num">$10</div>
        <div className="txt">
          <div className="t1">за каждый смонтированный ролик</div>
          <div className="t2">Ролик сдан и принят — он оплачен. Отправлен на переделку — считается один раз, когда принят финально.</div>
        </div>
      </div>

      <div className="sec">Плюс к ставке</div>
      <div className="grid g3">
        <div className="c"><div className="k">+$50</div><div className="n">Всё вовремя</div>
          <div className="d">Весь объём по клиенту сдан и опубликован в клиентский месяц — 30 из 30. Недовёл пакет до конца — бонуса нет.</div></div>
        <div className="c"><div className="k">+$50</div><div className="n">Клиент продлился</div>
          <div className="d">Пакет закрыт полностью <b className="w">и</b> клиент оплатил следующий месяц. Контент сработал — значит заработал и ты.</div></div>
        <div className="c"><div className="k p">+$1</div><div className="n">Аватар к ролику</div>
          <div className="d">С каждым роликом создаёшь аватара под него. Мы обучим — это несложно и занимает пару минут. Оплачивается сверх ставки за монтаж.</div></div>
      </div>

      <div className="note ok" style={{ marginTop: 15 }}>
        <div className="t">Ты и тимлид — в одной лодке</div>
        <div className="d">Бонус за закрытый пакет одинаковый у монтажёра и у тимлида, и условие одно на двоих. Тимлид не закроет месяц, если ролики не сданы, — значит зависим друг от друга и тянем в одну сторону.</div>
      </div>

      <div className="sec">Сколько выходит за одного клиента</div>
      <div className="grid g2">
        <div className="calc">
          <h3>Пакет 30 роликов</h3><div className="sub">основной пакет — примерно 7 из 10 клиентов</div>
          <div className="line"><span className="l">30 роликов × $10</span><span className="v">$300</span></div>
          <div className="line"><span className="l">30 аватаров × $1</span><span className="v">+$30</span></div>
          <div className="line"><span className="l">Бонус «всё вовремя»</span><span className="v">+$50</span></div>
          <div className="line"><span className="l">Бонус за продление</span><span className="v">+$50</span></div>
          <div className="total"><span className="l">Итого за клиента</span><span className="v">$430</span></div>
        </div>
        <div className="calc">
          <h3>Пакет 20 роликов</h3><div className="sub">меньший пакет</div>
          <div className="line"><span className="l">20 роликов × $10</span><span className="v">$200</span></div>
          <div className="line"><span className="l">20 аватаров × $1</span><span className="v">+$20</span></div>
          <div className="line"><span className="l">Бонус «всё вовремя»</span><span className="v">+$50</span></div>
          <div className="line"><span className="l">Бонус за продление</span><span className="v">+$50</span></div>
          <div className="total"><span className="l">Итого за клиента</span><span className="v">$320</span></div>
        </div>
      </div>

      <div className="c" style={{ marginTop: 20 }}>
        <div className="d" style={{ fontSize: 14 }}>
          <b className="w">Реальный расклад.</b> Ведёшь <b style={{ color: "var(--gr)" }}>3 клиентов</b> на 30 роликов — это 90 роликов и 90 аватаров за месяц.
          Все пакеты закрыл вовремя и все три продлились: 3 × $430 = <b style={{ color: "var(--gr)", fontFamily: "'Unbounded', sans-serif", fontSize: 18 }}>$1 290</b>.
          Взял четвёртого — <b style={{ color: "var(--gr)", fontFamily: "'Unbounded', sans-serif", fontSize: 18 }}>$1 720</b>.
          <div style={{ marginTop: 9, color: "var(--t3)", fontSize: 12.5 }}>
            Только аватары дают +$90 к месяцу на трёх клиентах — по $30 с каждого пакета на 30 роликов и по $20 с пакета на 20.
            А если пакет не закрыт или клиент ушёл, остаётся голая ставка: 90 × $11 = $990. Разница почти в $300 — это и есть цена дисциплины.
          </div>
        </div>
      </div>

      <div className="sec">Как заработать больше</div>
      <div className="c" style={{ padding: "6px 22px" }}>
        <div className="lev"><div className="ic">🎬</div><div><div className="t">Больше клиентов и объёма</div>
          <div className="d">Ставка линейная: каждый ролик — это $10, без потолка. Готов брать больше клиентов — доход растёт пропорционально.</div></div></div>
        <div className="lev"><div className="ic">✅</div><div><div className="t">Закрывать пакет полностью <span>+$50</span></div>
          <div className="d">Бонус даётся не за «почти», а за весь объём: 28 из 30 — это ноль. Довёл клиента до конца месяца — забрал $50 с каждого.</div></div></div>
        <div className="lev"><div className="ic">🧑‍🎨</div><div><div className="t">Делать аватаров самому <span>+$1 за ролик</span></div>
          <div className="d">Мы обучим — это пара минут на ролик. На пакете 30 это +$30, на четырёх клиентах уже +$120 за месяц. Отдельная оплата поверх монтажа, ничего не вычитается.</div></div></div>
        <div className="lev"><div className="ic">⚡</div><div><div className="t">Сдавать заранее, а не в день публикации</div>
          <div className="d">Сейчас ролики часто приходят впритык — тимлид публикует в тот же день, и любой сбой срывает весь месяц. Чем раньше сдаёшь, тем выше шанс закрыть пакет и забрать бонус — себе и тимлиду.</div></div></div>
        <div className="lev"><div className="ic">🔁</div><div><div className="t">Удерживать клиента <span>+$50</span></div>
          <div className="d">Клиент остаётся, когда ролики реально досматривают. Монтаж, который держит внимание, — это твой второй бонус и повод, чтобы клиент кормил тебя и в следующем месяце.</div></div></div>
        <div className="lev"><div className="ic">✂️</div><div><div className="t">Меньше переделок</div>
          <div className="d">Ролик, принятый с первого раза, — это твоё сэкономленное время. Переделка оплачивается один раз: чем чище сдаёшь, тем выше твой реальный заработок в час.</div></div></div>
      </div>

      <div className="sec">Особые случаи</div>
      <div className="note">
        <div className="t">Переделки</div>
        <div className="d">Ролик оплачивается один раз — за финально принятую версию. Правки по вине монтажёра отдельно не оплачиваются.</div>
      </div>

      <div className="pay">
        <span style={{ fontSize: 21 }}>💸</span>
        <div><div className="t">Выплата — в первые 10 дней следующего месяца</div>
          <div className="d">Зарплата за август выплачивается в начале сентября.</div></div>
      </div>
    </div>
  );
}

function Teamlead() {
  return (
    <div className="mot">
      <div className="badge">EasyLife AI · Система мотивации</div>
      <h1>Тимлид <span className="g">проекта</span></h1>
      <p className="lead">Как складывается твой доход и как его растить. Всё считается по каждому клиенту отдельно — сколько клиентов ведёшь, столько раз и начисляется.</p>

      <div className="sec">Что входит в работу</div>
      <div className="c" style={{ padding: "6px 22px" }}>
        <div className="lev"><div className="ic">🔍</div><div><div className="t">Анализ ниши и аудитории клиента</div>
          <div className="d">Кто покупает, какие у людей боли и возражения, что делают конкуренты, какие темы уже работают в нише. С этого начинается каждый новый клиент.</div></div></div>
        <div className="lev"><div className="ic">🧭</div><div><div className="t">Контент-стратегия</div>
          <div className="d">Что снимаем и зачем: рубрики, форматы, тон голоса эксперта, соотношение охватных и продающих роликов, путь зрителя от ролика до заявки.</div></div></div>
        <div className="lev"><div className="ic">🔥</div><div><div className="t">Референсы</div>
          <div className="d">Поиск залетевших роликов в нише клиента и разбор — почему залетели: хук, структура, тема. Из них рождаются сценарии.</div></div></div>
        <div className="lev"><div className="ic">✍️</div><div><div className="t">Сценарии</div>
          <div className="d">Хук, основная часть, призыв — в тоне голоса клиента. Это ежедневная работа и главный навык на позиции.</div></div></div>
        <div className="lev"><div className="ic">📅</div><div><div className="t">Контент-план и задачи монтажёру</div>
          <div className="d">План публикаций на месяц, постановка задач в CRM, контроль дедлайнов, приёмка готовых роликов.</div></div></div>
        <div className="lev"><div className="ic">🚀</div><div><div className="t">Публикации</div>
          <div className="d">Тексты под Instagram, TikTok, YouTube Shorts и Threads, выгрузка и расписание — время выхода по поясу аудитории клиента.</div></div></div>
        <div className="lev"><div className="ic">🤝</div><div><div className="t">Клиент</div>
          <div className="d">Согласования, ответы на вопросы, отчёт по результатам за месяц и работа на продление.</div></div></div>
      </div>

      <div className="sec">Основа дохода</div>
      <div className="hero">
        <div className="num">$9</div>
        <div className="txt">
          <div className="t1">за каждый опубликованный ролик</div>
          <div className="t2">Одна ставка за всё: написал сценарий → проконтролировал монтаж → опубликовал. Ролик вышел — он оплачен. Не вышел — не оплачен.</div>
        </div>
      </div>

      <div className="sec">Плюс бонусы</div>
      <div className="grid g3">
        <div className="c"><div className="k">+$50</div><div className="n">Пакет закрыт в срок</div>
          <div className="d">Весь объём по клиенту опубликован — 30 из 30 — и уложились в клиентский месяц. Недовёл пакет до конца — бонуса нет.</div></div>
        <div className="c"><div className="k">+$100</div><div className="n">Онбординг</div>
          <div className="d">Только за 1-й месяц нового клиента: запуск аватара, настройка, первые публикации.</div></div>
        <div className="c"><div className="k">+$100</div><div className="n">Продление</div>
          <div className="d">Два условия вместе: пакет закрыт полностью <b className="w">и</b> клиент оплатил следующий месяц. Не закрыл объём — продление не начисляется.</div></div>
      </div>

      <div className="note ok" style={{ marginTop: 15 }}>
        <div className="t">Главное условие обоих бонусов</div>
        <div className="d">И «в срок», и «продление» считаются только от <b className="w">полностью закрытого пакета</b>. Пока объём не доведён до конца — бонусы не начисляются, идёт только ставка за опубликованные ролики.</div>
      </div>

      <div className="sec">Сколько выходит за одного клиента</div>
      <div className="grid g2">
        <div className="calc">
          <h3>Пакет 30 роликов</h3><div className="sub">2-й месяц и далее, всё в срок, клиент продлил</div>
          <div className="line"><span className="l">30 роликов × $9</span><span className="v">$270</span></div>
          <div className="line"><span className="l">Бонус за закрытый пакет</span><span className="v">+$50</span></div>
          <div className="line"><span className="l">Бонус за продление</span><span className="v">+$100</span></div>
          <div className="total"><span className="l">Итого за клиента</span><span className="v">$420</span></div>
        </div>
        <div className="calc">
          <h3>Пакет 20 роликов</h3><div className="sub">2-й месяц и далее, всё в срок, клиент продлил</div>
          <div className="line"><span className="l">20 роликов × $9</span><span className="v">$180</span></div>
          <div className="line"><span className="l">Бонус за закрытый пакет</span><span className="v">+$50</span></div>
          <div className="line"><span className="l">Бонус за продление</span><span className="v">+$100</span></div>
          <div className="total"><span className="l">Итого за клиента</span><span className="v">$330</span></div>
        </div>
      </div>

      <div className="sec">Как растёт доход</div>
      <p className="lead" style={{ marginTop: -4, marginBottom: 16 }}>Клиентов мы отдаём по мере того, как они заходят в работу — один сразу, следующий через неделю-две, дальше по мере продаж. Оплата идёт за фактически опубликованные ролики, поэтому первый месяц всегда меньше полного.</p>
      <div className="grid g3">
        <div className="c"><div className="k p">~$700</div><div className="n">Первый месяц · клиенты заходят по очереди</div>
          <div className="d">Первый стартует сразу, второй примерно через неделю, третий ещё через неделю. У второго и третьего к концу месяца выйдет только часть роликов — за них и платим. Бонусы за закрытый пакет придут в следующем месяце, когда их месяц завершится.</div></div>
        <div className="c"><div className="k p">~$1 260</div><div className="n">Второй месяц · те же три клиента</div>
          <div className="d">Все трое работают полный месяц, пакеты закрываются, идут продления. Три клиента по 30 роликов — это 3 × $420.</div></div>
        <div className="c"><div className="k">$1 680 — $2 100</div><div className="n">Дальше · четыре-пять клиентов</div>
          <div className="d">Новых клиентов отдаём по мере их захода и по мере того, как ты держишь качество и сроки на текущих.</div></div>
      </div>

      <div className="note" style={{ marginTop: 15 }}>
        <div className="t">Важно понимать про первый месяц</div>
        <div className="d">Три клиента <b className="w">не означают $1 260 сразу</b>. Они заходят в разные недели, и в первый месяц ты получаешь за то, что реально вышло: примерно <b className="w">$600−800</b>. Полная сумма по этим же клиентам приходит со второго месяца, когда все работают полный цикл.</div>
      </div>
      <div className="note">
        <div className="t">Честно про потолок</div>
        <div className="d">Шесть клиентов на 30 роликов — это <b className="w">180 роликов в месяц</b>, около 9 сценариев в рабочий день плюс контроль монтажа и публикации. Такой объём тянут единицы, это верхняя граница ($2 520), а не норма. Планируй свой доход от четырёх-пяти клиентов.</div>
      </div>
      <div className="c" style={{ marginTop: 11 }}>
        <div className="d" style={{ fontSize: 14 }}><b className="w">Скорость роста — за тобой.</b> Мы не держим искусственных сроков: следующего клиента отдаём, когда текущие пакеты закрываются полностью и в срок.</div>
      </div>

      <div className="sec">Как заработать больше</div>
      <div className="c" style={{ padding: "6px 22px" }}>
        <div className="lev"><div className="ic">📈</div><div><div className="t">Больше клиентов под ведением</div>
          <div className="d">Каждый клиент — это отдельная ставка и свой набор бонусов. Берёшь больше — зарабатываешь больше.</div></div></div>
        <div className="lev"><div className="ic">🎬</div><div><div className="t">Полный объём</div>
          <div className="d">Платим за опубликованный ролик. Довёл все 30 — получил за 30. Недоделал — недополучил. Здесь всё честно и линейно.</div></div></div>
        <div className="lev"><div className="ic">⏱</div><div><div className="t">Закрывать пакет полностью <span>+$50</span></div>
          <div className="d">Бонус даётся не за «почти», а за весь объём: 28 из 30 — это ноль. Довёл до конца и уложился в месяц — забрал $50 с каждого клиента.</div></div></div>
        <div className="lev"><div className="ic">🔁</div><div><div className="t">Продления <span>+$100</span> — главный рычаг</div>
          <div className="d">Начисляется, когда пакет закрыт полностью и клиент оплатил дальше. Клиент остаётся тогда, когда контент работает: сильные сценарии → результат у клиента → он продлевает → ты снова зарабатываешь на нём весь следующий месяц. Это единственное, что зависит не от количества работы, а от её качества.</div></div></div>
      </div>

      <div className="sec">Особые случаи</div>
      <div className="note">
        <div className="t">Доп-аккаунт клиента</div>
        <div className="d">Второй аккаунт того же клиента (например Instagram при основном TikTok): только <b className="w">$9 за ролик</b>, без бонусов. Бонусы за срок, онбординг и продление начисляются один раз — по основному аккаунту.</div>
      </div>

      <div className="pay">
        <span style={{ fontSize: 21 }}>💸</span>
        <div><div className="t">Выплата — в первые 10 дней следующего месяца</div>
          <div className="d">Зарплата за август выплачивается в начале сентября.</div></div>
      </div>
    </div>
  );
}

export default function MotivationPage() {
  const role = useRole();
  const owner = isOwner(role);
  // Владельцу показываем обе схемы — остальным только их собственную
  const [tab, setTab] = useState<"teamlead" | "montager">("teamlead");
  const view = owner ? tab : role === "montager" ? "montager" : "teamlead";

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif", maxWidth: 940 }}>
      <style>{S}</style>
      {owner && (
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {([["teamlead", "Тимлид", TrendingUp], ["montager", "Монтажёр", Wallet]] as const).map(([v, l, Ic]) => (
            <button key={v} onClick={() => setTab(v)}
              style={{ padding: "8px 15px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                background: tab === v ? "linear-gradient(135deg, var(--cy), var(--pu))" : "var(--inp)",
                border: "1px solid var(--brd)", color: tab === v ? "#fff" : "var(--t2)",
                display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Ic size={13} /> {l}
            </button>
          ))}
        </div>
      )}
      {view === "montager" ? <Montager /> : <Teamlead />}
    </div>
  );
}
