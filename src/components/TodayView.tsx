"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, ClientMonth, Script, TeamMember, OnboardingProgress } from "@/lib/database";
import Avatar from "@/components/Avatar";
import Sheet, { SheetOption } from "@/components/Sheet";
import ScriptModal, { VIDEO_LEAD, SCRIPT_LEAD, addDaysIso, fmtDateShort } from "@/components/ScriptModal";
import { batchFor, wdName, BATCH_BUFFER_DAYS } from "@/lib/batches";
import { useIsMobile } from "@/lib/useMedia";
import { isPlaceholder } from "@/lib/scriptFlags";
import { Package, Rocket } from "lucide-react";

/* ============================================================
   «Сегодня» — один экран на роль. Строка = одно действие.
   Тимлид: написать / отправить клиенту / ждём клиента / опубликовать.
   Монтажёр: взять в монтаж / загрузить ролик / сдать.
   Владелец (viewAll): всё то же по всем клиентам, с исполнителем.
   ============================================================ */

type Kind = "tl_write" | "tl_send" | "tl_wait" | "tl_publish" | "mg_montage" | "mg_upload";
type Task = { s: Script; c: Client; kind: Kind; due: string; who?: TeamMember | null };

const META: Record<Kind, { t: string; c: string; hint: string; primary: string; patch: Partial<Script> | null }> = {
  tl_write:   { t: "Написать сценарий",      c: "#9d6bff", hint: "ещё не начат",                      primary: "Взять в работу",     patch: { script_status: "inProgress" } },
  tl_send:    { t: "Отправить клиенту",      c: "#42d4f4", hint: "написан, ждёт отправки",            primary: "Отправлено клиенту", patch: { script_status: "review" } },
  tl_wait:    { t: "Ждём согласования",      c: "#ffae42", hint: "у клиента, если тянет — напомнить", primary: "Клиент согласовал",  patch: { script_status: "approved" } },
  tl_publish: { t: "Опубликовать",           c: "#a8e063", hint: "монтажёр сдал ролик",              primary: "Опубликовано",       patch: { video_status: "published" } },
  mg_montage: { t: "Смонтировать",           c: "#ffae42", hint: "сценарий согласован",              primary: "Взять в монтаж",     patch: { video_status: "inProgress" } },
  mg_upload:  { t: "Загрузить готовый ролик", c: "#42d4f4", hint: "в монтаже, файла ещё нет",         primary: "Открыть и загрузить", patch: null },
};

function daysDiff(a: string, b: string) { return Math.round((Date.parse(a) - Date.parse(b)) / 86400000); }
function dueLabel(due: string, todayIso: string) {
  const d = daysDiff(due, todayIso);
  if (d < 0) return { txt: `${-d} дн назад`, cls: "rd" };
  if (d === 0) return { txt: "сегодня", cls: "or" };
  if (d === 1) return { txt: "завтра", cls: "or" };
  return { txt: fmtDateShort(due), cls: "mut" };
}

type Props = {
  role: string;
  member: TeamMember | null;     // чьи задачи (null + viewAll → все)
  viewAll: boolean;
  clients: Client[];
  clientMonths: ClientMonth[];
  scripts: Script[];
  team: TeamMember[];
  onbProgresses: OnboardingProgress[];
  todayIso: string;
  onReload: () => Promise<void>;
  headerExtra?: React.ReactNode;
};

export default function TodayView({ role, member, viewAll, clients, clientMonths, scripts, team, onbProgresses, todayIso, onReload, headerExtra }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState<Task | null>(null);
  const [editing, setEditing] = useState<Script | null>(null);
  const [dateMode, setDateMode] = useState(false);
  const [dateVal, setDateVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showLater, setShowLater] = useState(false);

  const isMg = member?.member_type === "montager";
  const canEdit = role !== "montager";

  const v = useMemo(() => {
    const active = clients.filter(c => c.stage === "active");
    const mine = viewAll ? active : active.filter(c => isMg
      ? (c.montager_id === member!.id || (c.extra_montager_ids || []).includes(member!.id))
      : c.teamlead_id === member!.id);
    const byId = Object.fromEntries(mine.map(c => [c.id, c])) as Record<number, Client>;
    const tm = (id: number | null | undefined) => team.find(t => t.id === id) || null;

    const tasks: Task[] = [];
    // пустые слоты плана с прошедшей датой — не задачи, а «передвинь дату»
    const staleByClient: Record<number, { c: Client; n: number; m: number }> = {};
    for (const s of scripts) {
      const c = byId[s.client_id]; if (!c || !s.pub_date) continue;
      if (isPlaceholder(s)) {
        if (s.pub_date < todayIso) { const b = (staleByClient[c.id] ||= { c, n: 0, m: s.month_number }); b.n++; b.m = Math.max(b.m, s.month_number); }
        continue;
      }
      const wantTl = viewAll || !isMg;
      const wantMg = viewAll || isMg;
      if (wantTl) {
        if (s.video_status === "ready") tasks.push({ s, c, kind: "tl_publish", due: s.pub_date, who: tm(c.teamlead_id) });
        else if (s.script_status !== "approved") {
          const kind: Kind = s.script_status === "review" ? "tl_wait" : s.script_status === "inProgress" ? "tl_send" : "tl_write";
          tasks.push({ s, c, kind, due: addDaysIso(s.pub_date, -SCRIPT_LEAD), who: tm(c.teamlead_id) });
        }
      }
      if (wantMg && s.script_status === "approved" && !["ready", "published"].includes(s.video_status)) {
        const kind: Kind = s.video_status === "inProgress" && !s.video_url ? "mg_upload" : "mg_montage";
        tasks.push({ s, c, kind, due: addDaysIso(s.pub_date, -VIDEO_LEAD), who: tm(c.montager_id) });
      }
    }
    tasks.sort((a, b) => a.due.localeCompare(b.due));
    const weekEnd = addDaysIso(todayIso, 7);
    const overdue = tasks.filter(t => t.due < todayIso);
    const today = tasks.filter(t => t.due === todayIso);
    const week = tasks.filter(t => t.due > todayIso && t.due <= weekEnd);
    const later = tasks.filter(t => t.due > weekEnd);

    // ждём клиента: сценарии на согласовании, по клиентам
    const waiting = mine.map(c => ({ c, n: scripts.filter(s => s.client_id === c.id && s.script_status === "review").length })).filter(x => x.n > 0);

    const onboarding = mine.map(c => {
      const pr = onbProgresses.find(o => o.client_id === c.id);
      if (!pr || pr.pending_tasks === 0) return null;
      const start = c.onboarding_start || c.start_date || null;
      const day = start ? Math.max(1, daysDiff(todayIso, start) + 1) : null;
      const left = c.onboarding_deadline ? daysDiff(c.onboarding_deadline, todayIso) : null;
      return { c, pr, day, left };
    }).filter(Boolean) as { c: Client; pr: OnboardingProgress; day: number | null; left: number | null }[];
    onboarding.sort((a, b) => (a.left ?? 999) - (b.left ?? 999));

    const batches = (isMg || viewAll) ? mine.map(c => batchFor(c, scripts, todayIso)).filter(Boolean).sort((a, b) => a!.deliveryIso.localeCompare(b!.deliveryIso)) : [];

    const stale = Object.values(staleByClient).sort((a, b) => b.n - a.n);
    return { mine, tasks, overdue, today, week, later, waiting, onboarding, batches, stale };
  }, [clients, scripts, team, member, viewAll, isMg, todayIso, onbProgresses]);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 1800); }

  async function run(patch: Partial<Script>, msg: string) {
    if (!open) return;
    setBusy(true);
    const s = open.s;
    if (patch.video_status === "ready" && !s.video_url) { setBusy(false); setEditing(s); setOpen(null); alert("Сначала загрузи готовый ролик в карточку."); return; }
    const res = await db.updateScript(supabase, s.id, patch);
    if (res?.error) alert("Не сохранилось: " + res.error.message);
    else if (patch.video_status === "ready") { try { await db.ensurePublicationForScript(supabase, { ...s, ...patch }, open.c); } catch {} }
    setBusy(false); setOpen(null); setDateMode(false);
    flash(msg);
    await onReload();
  }

  const Row = ({ t }: { t: Task }) => {
    const m = META[t.kind]; const d = dueLabel(t.due, todayIso);
    const late = t.due < todayIso;
    const title = t.s.hook_text || t.s.hook || (t.s.order_num ? `Сценарий #${t.s.order_num}` : "без темы");
    return (
      <button className={`v2-row ${late ? "late" : ""} ${!isMobile ? "wide" : ""}`} onClick={() => { setOpen(t); setDateMode(false); setDateVal(t.s.pub_date || ""); }}>
        <Avatar name={`${t.c.name} ${t.c.surname || ""}`} src={t.c.avatar_url} size={32} />
        <div>
          <div className="t"><span style={{ color: m.c }}>{m.t}</span> · <span style={{ color: "var(--t2)" }}>{t.c.name} {t.c.surname || ""}</span></div>
          {isMobile && <div className="s">{title}</div>}
        </div>
        {!isMobile && <div className="s">{title}{viewAll && t.who ? <span style={{ color: "var(--t3)" }}> · {t.who.name}</span> : ""}</div>}
        <span className={`v2-chip ${d.cls}`}>{d.txt}</span>
        {!isMobile && <span className={`v2-act ${t.kind === "tl_publish" || t.kind === "mg_montage" ? "gr" : ""}`} style={{ height: 32 }}>{t.kind === "mg_montage" && t.s.video_status === "inProgress" ? "Сдать" : m.primary}</span>}
      </button>
    );
  };
  const Section = ({ cls, title, list, extra }: { cls?: string; title: string; list: Task[]; extra?: React.ReactNode }) => list.length ? (
    <div className="v2-sec">
      <div className={`v2-sec-h ${cls || ""}`}>{title}<span className="cnt">{list.length}</span>{extra}</div>
      <div className="v2-list">{list.map(t => <Row key={`${t.kind}-${t.s.id}`} t={t} />)}</div>
    </div>
  ) : null;

  const name = member ? member.name.split(" ")[0] : "команда";
  const hour = new Date().getHours();
  const greet = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const dateRu = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  const primaryFor = (t: Task) => {
    const m = META[t.kind];
    if (t.kind === "mg_montage" && t.s.video_status === "inProgress") return { label: "Сдать ролик", patch: { video_status: "ready" } as Partial<Script>, hint: "уйдёт тимлиду на публикацию" };
    return { label: m.primary, patch: m.patch, hint: m.hint };
  };

  return (
    <div className="v2">
      <div className="v2-hdr">
        <div>
          <h1>{greet}, {name}</h1>
          <p>{dateRu} · {v.mine.length} {v.mine.length === 1 ? "клиент" : v.mine.length < 5 ? "клиента" : "клиентов"}{v.waiting.length ? ` · ${v.waiting.reduce((s, x) => s + x.n, 0)} на согласовании у клиентов` : ""}</p>
        </div>
        {headerExtra}
      </div>

      <div className="v2-stat">
        <div className="rd"><b>{v.overdue.length}</b><span>просрочено</span></div>
        <div className="or"><b>{v.today.length}</b><span>сегодня</span></div>
        <div className="pu"><b>{v.overdue.length + v.today.length + v.week.length}</b><span>на неделе</span></div>
      </div>

      {v.batches.length > 0 && (
        <div className="v2-sec">
          <div className="v2-sec-h"><Package size={14} style={{ color: "var(--or)" }} /> Партии к сдаче<span className="cnt">{v.batches.length}</span><span style={{ marginLeft: "auto", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>готовность за {BATCH_BUFFER_DAYS} дня</span></div>
          <div className="v2-list">
            {v.batches.map(b => { const left = b!.quota - b!.done; const hot = b!.readyByIso <= todayIso && left > 0; return (
              <button key={b!.client.id} className={`v2-row ${hot ? "late" : ""}`} onClick={() => router.push(`/dashboard/plan?client=${b!.client.id}`)}>
                <Avatar name={b!.client.name} src={b!.client.avatar_url} size={32} />
                <div><div className="t">{b!.client.name} {b!.client.surname || ""}</div><div className="s">сдать <b>{wdName(b!.client.delivery_day)}</b> · {fmtDateShort(b!.deliveryIso)} · готово {b!.done} из {b!.quota}</div></div>
                <span className={`v2-chip ${hot ? "rd" : left > 0 ? "or" : "gr"}`}>{left > 0 ? `осталось ${left}` : "✓"}</span>
              </button>
            ); })}
          </div>
        </div>
      )}

      <Section cls="rd" title="Просрочено" list={v.overdue} />
      <Section cls="or" title="Сегодня" list={v.today} />
      <Section title="Эта неделя" list={v.week} />
      {v.later.length > 0 && (
        <div className="v2-sec">
          {showLater ? <Section title="Позже" list={v.later} /> : (
            <button className="v2-act ghost" style={{ width: "100%" }} onClick={() => setShowLater(true)}>Показать ещё {v.later.length} позже недели</button>
          )}
        </div>
      )}
      {!isMg && v.stale.length > 0 && (
        <div className="v2-sec">
          <div className="v2-sec-h">Пустые слоты с прошедшей датой<span className="cnt">{v.stale.reduce((s, x) => s + x.n, 0)}</span><span style={{ marginLeft: "auto", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>не просрочка · передвинь или удали в контент-плане</span></div>
          <div className="v2-list">
            {v.stale.map(({ c, n, m }) => (
              <button key={c.id} className="v2-row" onClick={() => router.push(`/dashboard/plan?client=${c.id}&m=${m}`)}>
                <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={32} />
                <div><div className="t">{c.name} {c.surname || ""}</div><div className="s">{n} {n === 1 ? "слот" : n < 5 ? "слота" : "слотов"} без сценария с датой в прошлом · M{m}</div></div>
                <span className="v2-chip mut">Контент-план →</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {v.tasks.length === 0 && <div className="v2-empty">✓ Задач с датами нет. Поставь даты в контент-плане — они появятся здесь.</div>}

      {!isMg && v.waiting.length > 0 && (
        <div className="v2-sec">
          <div className="v2-sec-h">Ждём клиента<span className="cnt">{v.waiting.length}</span></div>
          <div className="v2-list">
            {v.waiting.map(({ c, n }) => (
              <button key={c.id} className="v2-row" onClick={() => router.push(`/dashboard/clients/${c.id}`)}>
                <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={32} />
                <div><div className="t">{c.name} {c.surname || ""}</div><div className="s">{n} {n === 1 ? "сценарий" : n < 5 ? "сценария" : "сценариев"} на согласовании</div></div>
                <span className="v2-chip or">напомнить</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {v.onboarding.length > 0 && (
        <div className="v2-sec">
          <div className="v2-sec-h"><Rocket size={14} style={{ color: "var(--or)" }} /> Онбординг<span className="cnt">{v.onboarding.length}</span></div>
          <div className="v2-list">
            {v.onboarding.map(({ c, pr, day, left }) => (
              <button key={c.id} className={`v2-row ${left != null && left < 0 ? "late" : ""}`} onClick={() => router.push(`/dashboard/clients/${c.id}/onboarding`)}>
                <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={32} />
                <div><div className="t">{c.name} {c.surname || ""}</div><div className="s">{day ? `день ${day} из 10 · ` : ""}задач {pr.done_tasks}/{pr.total_tasks - pr.skipped_tasks}{pr.overdue_tasks ? ` · ⚠ ${pr.overdue_tasks} просрочено` : ""}</div></div>
                <span className={`v2-chip ${left == null ? "mut" : left < 0 ? "rd" : left <= 2 ? "or" : "gr"}`}>{pr.progress_pct}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- лист действий по задаче ---- */}
      <Sheet open={!!open} onClose={() => setOpen(null)}
        title={open ? META[open.kind].t : ""}
        sub={open ? <>{open.c.name} {open.c.surname || ""} · M{open.s.month_number}{open.s.order_num ? ` · #${open.s.order_num}` : ""} · публикация {fmtDateShort(open.s.pub_date)}<br />{open.s.hook_text || open.s.hook || "без темы"}</> : ""}>
        {open && (() => {
          const p = primaryFor(open);
          return (
            <div className="v2-opts">
              {p.patch
                ? <SheetOption active color={META[open.kind].c} label={busy ? "…" : p.label} hint={p.hint} onClick={() => run(p.patch!, p.label)} disabled={busy || (!canEdit && open.kind.startsWith("tl_"))} />
                : <SheetOption active color={META[open.kind].c} label={p.label} hint="файл ролика" onClick={() => { setEditing(open.s); setOpen(null); }} />}
              {open.kind === "tl_wait" && <SheetOption color="#42d4f4" label="Вернуть в работу" hint="клиент просит правки" onClick={() => run({ script_status: "inProgress" }, "Вернули в работу")} disabled={busy} />}
              <SheetOption color="#9d6bff" label="Открыть сценарий" hint="текст, реф, файл" onClick={() => { setEditing(open.s); setOpen(null); }} />
              {canEdit && (dateMode ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 2px" }}>
                  <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} style={{ flex: 1, padding: "9px 10px", borderRadius: 9, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, colorScheme: "dark" }} />
                  <button className="v2-act pri" disabled={!dateVal || busy} onClick={() => run({ pub_date: dateVal }, `Перенесено на ${fmtDateShort(dateVal)}`)}>Перенести</button>
                </div>
              ) : (
                <SheetOption color="#ffae42" label="Перенести дату публикации" hint={fmtDateShort(open.s.pub_date)} onClick={() => setDateMode(true)} />
              ))}
              {canEdit && open.kind.startsWith("tl_") && open.kind !== "tl_publish" && (
                <SheetOption color="#77658f" label="Вернуть в идею" hint="снимет дату" onClick={() => run({ script_status: "notStarted", pub_date: null }, "Вернули в идею")} disabled={busy} />
              )}
              <SheetOption color="#42d4f4" label={`Открыть клиента`} hint={`${open.c.name}`} onClick={() => router.push(`/dashboard/clients/${open.c.id}`)} />
            </div>
          );
        })()}
      </Sheet>

      {editing && (
        <ScriptModal script={editing} client={clients.find(c => c.id === editing.client_id)}
          onClose={() => { setEditing(null); onReload(); }}
          onUpdate={async (id, patch) => { await db.updateScript(supabase, id, patch); setEditing(e => e && e.id === id ? { ...e, ...patch } : e); }}
          canEdit={canEdit} canEditReadyAt={role === "owner" || role === "admin"}
          monthOptions={clientMonths.filter(m => m.client_id === editing.client_id && m.status !== "cancelled").map(m => m.month_number).sort((a, b) => a - b)} />
      )}
      {toast && <div className="v2-toast">{toast}</div>}
    </div>
  );
}
