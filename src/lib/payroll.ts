import { Client, ClientMonth, Script, TeamMember } from "@/lib/database";

// ============================================================
// РАСЧЁТ ЗП ПО ФАКТУ РАБОТЫ (источник правды — CRM).
// Финмонитор берёт отсюда готовые суммы и не пересчитывает сам.
//
// Монтажёру платим по дате СДАЧИ монтажа (ready_at),
// тимлиду — по дате ПУБЛИКАЦИИ (pub_date).
// Один ролик легально попадает монтажёру в один месяц, тимлиду — в другой.
// ============================================================

export const PAYROLL_RATES = {
  editor_per_video: 10,   // монтажёр за смонтированный ролик
  tl_per_video_20: 7.5,   // тимлид за публикацию, если пакет 20
  tl_per_video_other: 5,  // тимлид за публикацию, остальные пакеты
  scripts_per_video: 2,   // сценарии — только с M2
  bonus_ontime: 50,       // пакет закрыт полностью в этом месяце
  bonus_onboarding: 100,  // старт M1
  bonus_renewal: 100,     // пакет закрыт + клиент оплатил следующий месяц
};

export function tlRateFor(pkg: number) {
  return pkg === 20 ? PAYROLL_RATES.tl_per_video_20 : PAYROLL_RATES.tl_per_video_other;
}

/** Границы календарного месяца «YYYY-MM» → ['YYYY-MM-01', 'YYYY-MM-31'] */
export function ymRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const p2 = (n: number) => String(n).padStart(2, "0");
  return { start: `${ym}-01`, end: `${ym}-${p2(last)}`, y, m, last };
}

export function ymLabelRu(ym: string) {
  const RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  const [y, m] = ym.split("-").map(Number);
  return `${RU[m - 1]} ${y}`;
}

export function ymShift(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Строка расчёта: клиент × контрактный месяц */
export type PayrollRow = {
  id: string;
  clientId: number;
  clientName: string;
  m: number;              // контрактный месяц
  pkg: number;
  tl: string;             // имя тимлида
  tlId: number | null;
  editor: string;         // имя монтажёра
  editorId: number | null;
  done: number;           // смонтировано В ЭТОМ месяце (за это платим монтажёру)
  published: number;      // опубликовано В ЭТОМ месяце (за это платим тимлиду)
  cumMont: number;        // всего смонтировано по пакету
  cumPub: number;         // всего опубликовано по пакету
  pubBefore: number;      // опубликовано до этого месяца
  ahead: number;          // смонтировано наперёд (публикация позже)
  montNoDate: number;     // смонтировано, но без даты сдачи — отнесли по публикации
  onTime: boolean;        // пакет закрыт полностью именно в этом месяце
  onboarding: boolean;
  renewal: boolean;
  renewalFrom?: number;
  renewalTo?: number;
  // суммы
  editorPay: number;
  tlBase: number;
  tlScripts: number;
  bonusOnTime: number;
  bonusOnboarding: number;
  bonusRenewal: number;
  tlTotal: number;
  total: number;
};

/** Проблема в данных, которая искажает расчёт */
export type PayrollIssue = {
  kind: "no_ready_at" | "no_pub_date";
  scriptId: number;
  clientId: number;
  clientName: string;
  title: string;
  hint: string;
};

export type PayrollPerson = {
  id: number | null;
  name: string;
  type: "editor" | "teamlead";
  total: number;
  rows: { row: PayrollRow; amount: number }[];
};

export type PayrollResult = {
  ym: string;
  rows: PayrollRow[];
  people: PayrollPerson[];
  totalEditors: number;
  totalTeamleads: number;
  total: number;
  issues: PayrollIssue[];
};

type Input = {
  clients: Client[];
  clientMonths: ClientMonth[];
  scripts: Script[];
  team: TeamMember[];
};

const d10 = (s?: string | null) => (s || "").slice(0, 10);

export function computePayroll(ym: string, { clients, clientMonths, scripts, team }: Input): PayrollResult {
  const { start: ms, end: me } = ymRange(ym);
  const inMonth = (s?: string | null) => { const d = d10(s); return !!d && d >= ms && d <= me; };

  const teamById: Record<number, TeamMember> = Object.fromEntries(team.map(t => [t.id, t]));
  const clientById: Record<number, Client> = Object.fromEntries(clients.map(c => [c.id, c]));
  const cmMap: Record<string, ClientMonth> = {};
  for (const cm of clientMonths) cmMap[`${cm.client_id}_${cm.month_number}`] = cm;

  // Считаем по (клиент × контрактный месяц)
  type Stat = { pubM: number; montM: number; pubCum: number; montCum: number; pubBefore: number; ahead: number; montNoDate: number };
  const stat: Record<string, Stat> = {};
  const issues: PayrollIssue[] = [];

  for (const s of scripts) {
    const key = `${s.client_id}_${s.month_number || 1}`;
    const st = (stat[key] ||= { pubM: 0, montM: 0, pubCum: 0, montCum: 0, pubBefore: 0, ahead: 0, montNoDate: 0 });
    const pd = d10(s.pub_date), rd = d10(s.ready_at);
    const cName = clientById[s.client_id] ? `${clientById[s.client_id].name} ${clientById[s.client_id].surname || ""}`.trim() : `#${s.client_id}`;
    const title = s.hook_text || s.hook || `Сценарий #${s.order_num || "—"}`;

    if (s.video_status === "published") {
      st.pubCum++;
      if (pd >= ms && pd <= me) st.pubM++;
      else if (pd && pd < ms) st.pubBefore++;
      if (!pd) {
        issues.push({ kind: "no_pub_date", scriptId: s.id, clientId: s.client_id, clientName: cName, title,
          hint: "Опубликовано, но не задана дата публикации — ролик не попадёт в ЗП тимлида." });
      }
    }
    // смонтировано = сценарий согласован и ролик в производстве/готов/опубликован
    if (s.script_status === "approved" && ["inProgress", "ready", "published"].includes(s.video_status)) {
      st.montCum++;
      const montDate = rd || pd;   // без даты сдачи — вынужденно относим по публикации
      if (montDate >= ms && montDate <= me) {
        st.montM++;
        if (!pd || pd > me) st.ahead++;
        if (!rd) {
          st.montNoDate++;
          issues.push({ kind: "no_ready_at", scriptId: s.id, clientId: s.client_id, clientName: cName, title,
            hint: "Нет даты сдачи монтажа — месяц определён по публикации, монтажёру может уйти не в тот месяц." });
        }
      }
    }
  }

  // Какие (клиент × месяц) показываем
  const keys = new Set<string>();
  for (const cm of clientMonths) {
    if (["planned", "cancelled"].includes(cm.status)) continue;
    if (!(cm.start_date <= me && cm.end_date >= ms)) continue;
    const k = `${cm.client_id}_${cm.month_number}`;
    const st = stat[k];
    const workHere = !!st && (st.pubM > 0 || st.montM > 0);
    const renewalEvent = cm.month_number >= 2 && inMonth(cm.start_date);           // продление платим и без роликов
    const onboardWithVideos = cm.month_number === 1 && inMonth(cm.start_date) && !!st && (st.montCum > 0 || st.pubCum > 0);
    if (workHere || renewalEvent || onboardWithVideos) keys.add(k);
  }
  for (const k of Object.keys(stat)) if (stat[k].pubM > 0 || stat[k].montM > 0) keys.add(k);

  const rows: PayrollRow[] = [];
  for (const k of Array.from(keys)) {
    const [cidS, mS] = k.split("_");
    const cid = Number(cidS), m = Number(mS);
    const c = clientById[cid], cm = cmMap[k];
    if (!c || !cm) continue;
    if (["planned", "cancelled"].includes(cm.status)) continue;

    const st = stat[k] || { pubM: 0, montM: 0, pubCum: 0, montCum: 0, pubBefore: 0, ahead: 0, montNoDate: 0 };
    const hadWork = st.pubM > 0 || st.montM > 0;
    // ушедших/на паузе показываем только если в этом месяце реально была работа
    if (["paused", "churned"].includes(c.stage) && !hadWork) continue;

    const pkg = cm.package || 0;
    const clientName = `${c.name} ${c.surname || ""}`.trim();

    // Бонусы. Дедуп естественный: событие привязано к дате, значит попадает ровно в один календарный месяц.
    const onboarding = m === 1 && inMonth(cm.start_date);
    const onTime = pkg > 0 && st.pubBefore < pkg && (st.pubBefore + st.pubM) >= pkg;   // пакет закрыт ИМЕННО тут
    const nextCm = cmMap[`${cid}_${m + 1}`];
    const hasNext = !!nextCm && !["planned", "cancelled"].includes(nextCm.status);
    const renewal = onTime && hasNext;

    const editorPay = st.montM * PAYROLL_RATES.editor_per_video;
    const tlBase = st.pubM * tlRateFor(pkg);
    const tlScripts = m >= 2 ? st.pubM * PAYROLL_RATES.scripts_per_video : 0;   // в M1 сценарии не платятся
    const bonusOnTime = onTime ? PAYROLL_RATES.bonus_ontime : 0;
    const bonusOnboarding = onboarding ? PAYROLL_RATES.bonus_onboarding : 0;
    const bonusRenewal = renewal ? PAYROLL_RATES.bonus_renewal : 0;
    const tlTotal = tlBase + tlScripts + bonusOnTime + bonusOnboarding + bonusRenewal;

    rows.push({
      id: `crm-${cid}-${m}`, clientId: cid, clientName, m, pkg,
      tl: teamById[c.teamlead_id as number]?.name || "—", tlId: c.teamlead_id ?? null,
      editor: teamById[c.montager_id as number]?.name || "—", editorId: c.montager_id ?? null,
      done: st.montM, published: st.pubM, cumMont: st.montCum, cumPub: st.pubCum,
      pubBefore: st.pubBefore, ahead: st.ahead, montNoDate: st.montNoDate,
      onTime, onboarding, renewal,
      renewalFrom: renewal ? m : undefined, renewalTo: renewal ? m + 1 : undefined,
      editorPay, tlBase, tlScripts, bonusOnTime, bonusOnboarding, bonusRenewal,
      tlTotal, total: editorPay + tlTotal,
    });
  }

  rows.sort((a, b) => b.total - a.total || a.clientName.localeCompare(b.clientName) || a.m - b.m);

  // Свод по людям
  const pmap = new Map<string, PayrollPerson>();
  const push = (id: number | null, name: string, type: "editor" | "teamlead", row: PayrollRow, amount: number) => {
    if (amount <= 0) return;
    const key = `${type}:${id ?? name}`;
    const p = pmap.get(key) || { id, name, type, total: 0, rows: [] };
    p.total += amount; p.rows.push({ row, amount });
    pmap.set(key, p);
  };
  for (const r of rows) {
    push(r.editorId, r.editor, "editor", r, r.editorPay);
    push(r.tlId, r.tl, "teamlead", r, r.tlTotal);
  }
  const people = Array.from(pmap.values()).sort((a, b) => b.total - a.total);
  const totalEditors = people.filter(p => p.type === "editor").reduce((s, p) => s + p.total, 0);
  const totalTeamleads = people.filter(p => p.type === "teamlead").reduce((s, p) => s + p.total, 0);

  return { ym, rows, people, totalEditors, totalTeamleads, total: totalEditors + totalTeamleads, issues };
}
