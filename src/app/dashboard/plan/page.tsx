"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, ClientMonth, Script, TeamMember, CalendarTarget } from "@/lib/database";
import Avatar from "@/components/Avatar";
import Sheet, { SheetOption } from "@/components/Sheet";
import ScriptModal, { fmtDateShort, addDaysIso, SCRIPT_LEAD, VIDEO_LEAD } from "@/components/ScriptModal";
import { spreadDates } from "@/components/PublicationScheduler";
import { useRole } from "@/components/RoleContext";
import { useIsMobile } from "@/lib/useMedia";
import { Wand2, Plus, ChevronLeft, ChevronRight } from "lucide-react";

/* ============================================================
   Контент-план клиента на контрактный месяц.
   Телефон: список по дням (agenda), дата через нижний лист.
   Десктоп: сетка недель + перетаскивание мышью, клик — тот же лист.
   ============================================================ */

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const RU_M = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const RU_MG = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const todayIsoLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const wdOf = (iso: string) => (new Date(iso + "T00:00:00").getDay() + 6) % 7;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const ymLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${RU_M[m - 1]} ${y}`; };

function computeCurrentMonth(months: ClientMonth[], todayIso: string): number {
  if (!months.length) return 1;
  const byDate = months.find(m => m.start_date <= todayIso && todayIso <= m.end_date);
  if (byDate) return byDate.month_number;
  const active = months.find(m => m.status === "active");
  if (active) return active.month_number;
  return [...months].sort((a, b) => b.month_number - a.month_number)[0].month_number;
}
type St = "pub" | "rdy" | "mon" | "scr" | "idea";
function stOf(s: Script): St {
  if (s.video_status === "published") return "pub";
  if (s.video_status === "ready") return "rdy";
  if (s.script_status === "approved" && (s.video_status === "inProgress" || s.video_status === "review")) return "mon";
  if (s.script_status === "approved") return "scr";
  if (s.script_status === "inProgress" || s.script_status === "review") return "scr";
  return "idea";
}
const ST_COLOR: Record<St, string> = { pub: "#a8e063", rdy: "#42d4f4", mon: "#ffae42", scr: "#9d6bff", idea: "#77658f" };
const ST_LABEL: Record<St, string> = { pub: "Опубликован", rdy: "Готов к публикации", mon: "В монтаже", scr: "Сценарий в работе", idea: "Идея / слот" };
const isEmptySlot = (s: Script) => !((s.hook_text || "").trim() || (s.body_text || "").trim() || (s.hook || "").trim().replace(/^Сценарий #\d+$/, ""));
const titleOf = (s: Script) => isEmptySlot(s) ? "слот без темы" : (s.hook_text || s.hook || `#${s.order_num}`);

function PlanInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClient();
  const role = useRole();
  const isMobile = useIsMobile();
  const todayIso = todayIsoLocal();
  const canEdit = role !== "montager";

  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [allMonths, setAllMonths] = useState<ClientMonth[]>([]);
  const [targets, setTargets] = useState<CalendarTarget[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<number | null>(sp.get("client") ? Number(sp.get("client")) : null);
  const [mNum, setMNum] = useState<number | null>(sp.get("m") ? Number(sp.get("m")) : null);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // листы
  const [slot, setSlot] = useState<Script | null>(null);
  const [pick, setPick] = useState<string>("");
  const [addDay, setAddDay] = useState<string | null>(null);
  const [distOpen, setDistOpen] = useState(false);
  const [distCount, setDistCount] = useState("");
  const [distWd, setDistWd] = useState<boolean[]>([true, true, true, true, true, true, true]);
  const [editing, setEditing] = useState<Script | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  useEffect(() => { (async () => {
    const [cls, tm, cm, tg] = await Promise.all([db.getClients(supabase), db.getTeam(supabase), db.getClientMonths(supabase), db.getCalendarTargets(supabase)]);
    const { data: { session } } = await supabase.auth.getSession();
    setMeId(session?.user?.id || null);
    setClients(cls); setTeam(tm); setAllMonths(cm?.data || []); setTargets(tg?.data || []);
    setLoading(false);
  })(); }, []);

  const me = useMemo(() => team.find(t => t.profile_id === meId) || null, [team, meId]);
  const isMine = (c: Client) => !me ? false : me.member_type === "montager" ? (c.montager_id === me.id || (c.extra_montager_ids || []).includes(me.id)) : c.teamlead_id === me.id;
  const clientList = useMemo(() => clients.filter(c => c.stage === "active").sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || a.name.localeCompare(b.name)), [clients, me]);

  useEffect(() => { if (!loading && clientId == null && clientList.length) setClientId(clientList[0].id); }, [loading, clientList, clientId]);
  const client = clients.find(c => c.id === clientId) || null;
  const months = useMemo(() => allMonths.filter(m => m.client_id === clientId && m.status !== "cancelled").sort((a, b) => a.month_number - b.month_number), [allMonths, clientId]);
  useEffect(() => { if (months.length && (mNum == null || !months.some(m => m.month_number === mNum))) setMNum(computeCurrentMonth(months, todayIso)); }, [months, mNum]);
  const month = months.find(m => m.month_number === mNum) || null;

  async function loadScripts() { if (clientId == null) return; setScripts(await db.getScripts(supabase, clientId)); }
  useEffect(() => { loadScripts(); }, [clientId]);
  useEffect(() => { if (client && month) router.replace(`/dashboard/plan?client=${client.id}&m=${month.month_number}`, { scroll: false }); }, [clientId, mNum]);

  const mScripts = useMemo(() => month ? scripts.filter(s => s.month_number === month.month_number) : [], [scripts, month]);
  const withDate = mScripts.filter(s => s.pub_date);
  const noDate = mScripts.filter(s => !s.pub_date).sort((a, b) => (a.order_num || 999) - (b.order_num || 999) || a.id - b.id);
  const byDate = useMemo(() => { const m: Record<string, Script[]> = {}; for (const s of withDate) (m[s.pub_date!] ||= []).push(s); return m; }, [withDate]);
  const published = mScripts.filter(s => s.video_status === "published").length;
  const inMontage = mScripts.filter(s => s.script_status === "approved" && s.video_status === "inProgress").length;
  const plan = month?.package || 0;
  const pct = plan ? Math.min(100, Math.round(published / plan * 100)) : 0;
  const daysLeft = month ? daysBetween(todayIso, month.end_date) : 0;
  const montager = team.find(t => t.id === client?.montager_id);

  // дни контрактного месяца + недели для сетки
  const days = useMemo(() => { if (!month) return [] as string[]; const out: string[] = []; for (let d = month.start_date; d <= month.end_date; d = addDaysIso(d, 1)) out.push(d); return out; }, [month]);
  const weeks = useMemo(() => {
    if (!month) return [] as string[][];
    const first = addDaysIso(month.start_date, -wdOf(month.start_date));
    const last = addDaysIso(month.end_date, 6 - wdOf(month.end_date));
    const cells: string[] = []; for (let d = first; d <= last; d = addDaysIso(d, 1)) cells.push(d);
    const out: string[][] = []; for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7)); return out;
  }, [month]);
  const inRange = (d: string) => !!month && d >= month.start_date && d <= month.end_date;
  // план по календарным месяцам внутри контрактного
  const calRows = useMemo(() => {
    if (!month) return [] as { ym: string; pub: number; target: number | null }[];
    const yms = Array.from(new Set(days.map(d => d.slice(0, 7))));
    return yms.map(ym => ({ ym, pub: withDate.filter(s => s.video_status === "published" && s.pub_date!.startsWith(ym)).length, target: targets.find(t => t.client_id === clientId && t.ym === ym)?.target ?? null }));
  }, [month, days, withDate, targets, clientId]);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 1800); }
  async function setDate(id: number, date: string | null, msg: string) {
    setBusy(true);
    const { error } = await db.updateScript(supabase, id, { pub_date: date });
    if (error) alert("Не сохранилось: " + error.message);
    await loadScripts(); setBusy(false); setSlot(null); setAddDay(null); flash(msg);
  }
  async function createSlot(date: string | null) {
    if (!client || !month) return;
    setBusy(true);
    const { data } = await db.createScript(supabase, client.id, month.month_number);
    if (data && date) await db.updateScript(supabase, (data as Script).id, { pub_date: date });
    await loadScripts(); setBusy(false); setAddDay(null); flash(date ? `Слот на ${fmtDateShort(date)}` : "Слот создан");
  }
  async function removeSlot(id: number) {
    if (!confirm("Удалить пустой слот?")) return;
    setBusy(true); await db.deleteScript(supabase, id); await loadScripts(); setBusy(false); setSlot(null); flash("Слот удалён");
  }
  async function distribute() {
    if (!client || !month) return;
    const n = parseInt(distCount || String(plan), 10);
    if (!n || n < 1) { alert("Сколько роликов расставить?"); return; }
    const dates = spreadDates(month.start_date, month.end_date, n, distWd);
    if (!dates.length) { alert("В выбранные дни недели не попал ни один день месяца"); return; }
    if (withDate.length && !confirm(`Расставить ${dates.length} дат заново? Даты у ${withDate.length} роликов будут перезаписаны.`)) return;
    setBusy(true);
    const ordered = [...mScripts].sort((a, b) => (a.order_num || 999) - (b.order_num || 999) || a.id - b.id);
    for (let i = 0; i < dates.length; i++) {
      const s = ordered[i];
      if (s) { if (s.pub_date !== dates[i]) await db.updateScript(supabase, s.id, { pub_date: dates[i] }); }
      else { const { data } = await db.createScript(supabase, client.id, month.month_number); if (data) await db.updateScript(supabase, (data as Script).id, { pub_date: dates[i] }); }
    }
    for (let i = dates.length; i < ordered.length; i++) if (ordered[i].pub_date) await db.updateScript(supabase, ordered[i].id, { pub_date: null });
    await loadScripts(); setBusy(false); setDistOpen(false); flash(`Расставлено ${dates.length} дат`);
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>;
  if (!client) return <div className="v2"><div className="v2-empty">Нет активных клиентов</div></div>;

  const SlotBtn = ({ s, compact }: { s: Script; compact?: boolean }) => {
    const st = stOf(s); const late = !!s.pub_date && s.video_status !== "published" && s.pub_date < todayIso;
    return (
      <button className={`v2-slot ${late ? "late" : ""}`} draggable={!isMobile && canEdit} title={titleOf(s)}
        onDragStart={() => setDragId(s.id)} onDragEnd={() => { setDragId(null); setDragOver(null); }}
        onClick={() => { setSlot(s); setPick(s.pub_date || ""); }}
        style={{ opacity: dragId === s.id ? 0.4 : 1 }}>
        <i className="v2-dot" style={{ background: ST_COLOR[st] }} />
        <span className="tx" style={compact ? { WebkitLineClamp: 2 } : undefined}>{titleOf(s)}</span>
        {s.order_num ? <span className="n">#{s.order_num}</span> : null}
      </button>
    );
  };

  // ---- лист выбора даты (общий для слота и добавления)
  const calGrid = (selected: string, onPick: (d: string) => void) => (
    <div className="v2-cal">
      {WD.map(w => <span key={w}>{w}</span>)}
      {weeks.flat().map(d => {
        const active = inRange(d); const has = !!byDate[d]?.length; const dd = Number(d.slice(8, 10));
        return <button key={d} disabled={!active} className={`${!active ? "o" : ""} ${d === selected ? "sel" : ""} ${d === todayIso ? "tod" : ""} ${has ? "has" : ""}`} onClick={() => onPick(d)}>{dd === 1 ? `${dd} ${RU_M[Number(d.slice(5, 7)) - 1].slice(0, 3)}` : dd}</button>;
      })}
    </div>
  );

  return (
    <div className="v2">
      <div className="v2-hdr">
        <div>
          <h1>Контент-план</h1>
          <p>{client.name} {client.surname || ""}{month ? ` · M${month.month_number} · ${fmtDateShort(month.start_date)} → ${fmtDateShort(month.end_date)}` : " · нет контрактного месяца"}</p>
        </div>
        {canEdit && month && <button className="v2-act pri" onClick={() => { setDistCount(String(plan || mScripts.length || 20)); setDistOpen(true); }}><Wand2 size={14} /> Распределить по месяцу</button>}
      </div>

      <div className="v2-chips">
        {clientList.map(c => (
          <button key={c.id} className={c.id === client.id ? "on" : ""} onClick={() => { setClientId(c.id); setMNum(null); }}>
            <Avatar name={`${c.name} ${c.surname || ""}`} src={c.avatar_url} size={22} />{c.name}{isMine(c) ? "" : ""}
          </button>
        ))}
      </div>

      {months.length > 1 && (
        <div className="v2-toolbar">
          <span className="v2-seg">
            {months.map(m => <button key={m.id} className={m.month_number === mNum ? "on" : ""} onClick={() => setMNum(m.month_number)}>M{m.month_number}{m.status === "closed" ? " ✓" : m.status === "active" ? " ●" : ""}</button>)}
          </span>
        </div>
      )}

      {month && (
        <div className="v2-monthcard">
          <div className="top">
            <div><h3>M{month.month_number} · {fmtDateShort(month.start_date)} → {fmtDateShort(month.end_date)}</h3>
              <div className="sub">{month.status === "closed" ? "месяц закрыт" : daysLeft < 0 ? `просрочка ${-daysLeft} дн.` : `осталось ${daysLeft} дн. · сдать до ${fmtDateShort(month.end_date)}`}</div></div>
            <span className={`v2-chip ${published >= plan && plan ? "gr" : daysLeft < 0 ? "rd" : "pu"}`}>{published >= plan && plan ? "выполнен" : `${pct}%`}</span>
          </div>
          <div className="v2-prog"><i style={{ width: `${pct}%` }} /></div>
          <div className="v2-kv"><span><b>{published}</b> / {plan} опубликовано</span>
            {calRows.map(r => <span key={r.ym}>{ymLabel(r.ym).split(" ")[0]} <b>{r.pub}</b>{r.target != null ? ` / ${r.target}` : ""}</span>)}</div>
          <div className="v2-split">
            <div>Без даты<b>{noDate.length} <em>роликов</em></b></div>
            <div>Ждут монтажа<b>{inMontage} <em>{montager ? `· ${montager.name}` : ""}</em></b></div>
          </div>
        </div>
      )}

      {!month ? <div className="v2-empty">У клиента нет контрактного месяца. Открой его на странице клиента.</div> : (
        <>
          <div className="v2-legend">
            {(["pub", "rdy", "mon", "scr", "idea"] as St[]).map(k => <span key={k}><i className="v2-dot" style={{ background: ST_COLOR[k] }} />{ST_LABEL[k].toLowerCase()}</span>)}
          </div>

          {isMobile ? (
            <div>
              {days.map(d => {
                const items = byDate[d] || []; const wd = WD[wdOf(d)]; const dd = Number(d.slice(8, 10));
                const isT = d === todayIso;
                return items.length ? (
                  <div key={d} className={`v2-day ${isT ? "today" : ""}`}><div className="dn">{wd}<b>{dd}</b></div><div style={{ minWidth: 0 }}>{items.map(s => <SlotBtn key={s.id} s={s} />)}</div></div>
                ) : (
                  <div key={d} className={`v2-day empty ${isT ? "today" : ""}`}><div className="dn">{wd}<b>{dd}</b></div>
                    {canEdit ? <button className="v2-slot" onClick={() => setAddDay(d)}>+ поставить ролик</button> : <div className="v2-slot" style={{ border: "1px dashed var(--brd)", background: "transparent", color: "var(--t3)", justifyContent: "center" }}>—</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              {weeks.map((w, i) => (
                <div key={i} className="v2-week">
                  {w.map(d => {
                    const active = inRange(d); const items = byDate[d] || []; const dd = Number(d.slice(8, 10));
                    return (
                      <div key={d} className={`v2-wd ${!active ? "out" : ""} ${d === todayIso ? "today" : ""} ${dragOver === d ? "over" : ""}`}
                        onDragOver={e => { if (active && canEdit) { e.preventDefault(); setDragOver(d); } }}
                        onDragLeave={() => { if (dragOver === d) setDragOver(null); }}
                        onDrop={e => { e.preventDefault(); setDragOver(null); if (active && dragId) setDate(dragId, d, `Перенесено на ${fmtDateShort(d)}`); setDragId(null); }}>
                        <div className="dh"><span>{WD[wdOf(d)]}{dd === 1 ? ` · ${RU_M[Number(d.slice(5, 7)) - 1].slice(0, 3)}` : ""}</span><b>{dd}</b></div>
                        {items.map(s => <SlotBtn key={s.id} s={s} compact />)}
                        {active && canEdit && <button className="add" onClick={() => setAddDay(d)}><Plus size={11} /></button>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {noDate.length > 0 && (
            <div className="v2-sec" style={{ marginTop: 14 }}>
              <div className="v2-sec-h or">Без даты<span className="cnt">{noDate.length}</span><span style={{ marginLeft: "auto", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>{isMobile ? "нажми, чтобы поставить дату" : "перетащи в день или нажми"}</span></div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {noDate.map(s => (
                  <button key={s.id} className="v2-chip mut" draggable={!isMobile && canEdit} onDragStart={() => setDragId(s.id)} onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    onClick={() => { setSlot(s); setPick(""); }} style={{ cursor: "pointer", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", height: 32 }}>
                    <i className="v2-dot" style={{ background: ST_COLOR[stOf(s)] }} />{titleOf(s)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {canEdit && <button className="v2-act ghost" style={{ width: "100%", marginTop: 12 }} onClick={() => createSlot(null)} disabled={busy}>+ Добавить сценарий без даты</button>}
        </>
      )}

      {/* ---- лист ролика: дата, статус, действия ---- */}
      <Sheet open={!!slot} onClose={() => setSlot(null)}
        title={slot ? titleOf(slot) : ""}
        sub={slot ? <><span className="v2-chip" style={{ background: `${ST_COLOR[stOf(slot)]}22`, color: ST_COLOR[stOf(slot)], marginRight: 6 }}>{ST_LABEL[stOf(slot)]}</span>{slot.pub_date ? `публикация ${fmtDateShort(slot.pub_date)} · сценарий к ${fmtDateShort(addDaysIso(slot.pub_date, -SCRIPT_LEAD))} · видео к ${fmtDateShort(addDaysIso(slot.pub_date, -VIDEO_LEAD))}` : "без даты публикации"}</> : ""}>
        {slot && (
          <>
            {canEdit && slot.video_status !== "published" && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .5, color: "var(--t3)" }}>Дата публикации</div>
                {calGrid(pick, setPick)}
              </>
            )}
            <div className="v2-opts">
              <SheetOption color="#9d6bff" label="Открыть сценарий" hint="текст, реф, файл" onClick={() => { setEditing(slot); setSlot(null); }} />
              {canEdit && slot.pub_date && slot.video_status !== "published" && <SheetOption color="#77658f" label="Снять дату" hint="уйдёт в «без даты»" onClick={() => setDate(slot.id, null, "Дата снята")} disabled={busy} />}
              {canEdit && isEmptySlot(slot) && slot.script_status === "notStarted" && slot.video_status === "notStarted" && <SheetOption danger label="Удалить пустой слот" onClick={() => removeSlot(slot.id)} disabled={busy} />}
            </div>
            {canEdit && slot.video_status !== "published" && (
              <div className="v2-btns">
                <button className="v2-act ghost" onClick={() => setSlot(null)}>Отмена</button>
                <button className="v2-act pri" disabled={!pick || pick === slot.pub_date || busy} onClick={() => setDate(slot.id, pick, `Перенесено на ${fmtDateShort(pick)}`)}>{pick && pick !== slot.pub_date ? `Поставить на ${fmtDateShort(pick)}` : "Выбери день"}</button>
              </div>
            )}
          </>
        )}
      </Sheet>

      {/* ---- лист «поставить ролик на день» ---- */}
      <Sheet open={!!addDay} onClose={() => setAddDay(null)} title={addDay ? `Поставить ролик на ${fmtDateShort(addDay)}` : ""} sub={noDate.length ? "Выбери из роликов без даты или создай новый слот" : "Роликов без даты нет — создам новый слот"}>
        {addDay && (
          <div className="v2-opts" style={{ maxHeight: "50vh", overflowY: "auto" }}>
            {noDate.map(s => <SheetOption key={s.id} color={ST_COLOR[stOf(s)]} label={titleOf(s)} hint={s.order_num ? `#${s.order_num}` : ""} onClick={() => setDate(s.id, addDay, `Поставлен на ${fmtDateShort(addDay)}`)} disabled={busy} />)}
            <SheetOption active color="#a8e063" label={busy ? "…" : "+ Создать новый слот"} hint="сценарий напишется позже" onClick={() => createSlot(addDay)} disabled={busy} />
          </div>
        )}
      </Sheet>

      {/* ---- лист распределения ---- */}
      <Sheet open={distOpen} onClose={() => setDistOpen(false)} title="Распределить по месяцу" sub={month ? `${fmtDateShort(month.start_date)} → ${fmtDateShort(month.end_date)} · сначала даты получают уже написанные сценарии по номеру, потом добавляются пустые слоты` : ""}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
          <div><div className="v2-fg h4" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--t3)", marginBottom: 4 }}>Сколько роликов</div>
            <input type="number" min={1} max={200} value={distCount} onChange={e => setDistCount(e.target.value)} style={{ width: 84, padding: "9px 10px", borderRadius: 9, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 15, fontWeight: 700, textAlign: "center" }} /></div>
          <div><div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--t3)", marginBottom: 4 }}>В какие дни</div>
            <div style={{ display: "flex", gap: 4 }}>{WD.map((w, i) => <button key={w} onClick={() => setDistWd(a => a.map((v, j) => j === i ? !v : v))} style={{ width: 36, height: 36, borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: distWd[i] ? "var(--pud)" : "var(--inp)", border: `1px solid ${distWd[i] ? "var(--pu)" : "var(--brd)"}`, color: distWd[i] ? "var(--pu)" : "var(--t3)" }}>{w}</button>)}</div></div>
        </div>
        <div className="v2-btns"><button className="v2-act ghost" onClick={() => setDistOpen(false)}>Отмена</button><button className="v2-act pri" disabled={busy} onClick={distribute}><Wand2 size={14} /> {busy ? "Расставляю…" : "Расставить"}</button></div>
      </Sheet>

      {editing && (
        <ScriptModal script={editing} client={client}
          onClose={() => { setEditing(null); loadScripts(); }}
          onUpdate={async (id, patch) => { await db.updateScript(supabase, id, patch); setEditing(e => e && e.id === id ? { ...e, ...patch } : e); }}
          onDelete={canEdit ? async (id) => { await db.deleteScript(supabase, id); setEditing(null); loadScripts(); } : undefined}
          canEdit={canEdit} canEditReadyAt={role === "owner" || role === "admin"}
          monthOptions={months.map(m => m.month_number)} />
      )}
      {toast && <div className="v2-toast">{toast}</div>}
    </div>
  );
}

export default function PlanPage() {
  return <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Загрузка…</div>}><PlanInner /></Suspense>;
}
