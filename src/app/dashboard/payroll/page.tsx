"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useIsOwner } from "@/components/RoleContext";
import { ymLabelRu, ymShift, ratesFor, NEW_MOTIVATION_FROM, type PayrollResult, type PayrollPerson, type PayrollRow } from "@/lib/payroll";
import Tour, { TourButton, type TourStep } from "@/components/Tour";
import { ChevronLeft, ChevronRight, AlertTriangle, Scissors, UserCog, Wallet, RefreshCw, ChevronDown } from "lucide-react";

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

export default function PayrollPage() {
  const isOwner = useIsOwner();
  const router = useRouter();
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<PayrollResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Сохранить ручную правку строки и перечитать расчёт
  async function saveAdj(rowId: string, patch: Record<string, any>) {
    setSaving(true);
    try {
      const r = await fetch("/api/payroll", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ym, row_id: rowId, ...patch }),
      });
      const j = await r.json();
      if (!r.ok) alert("Не сохранилось: " + (j?.error || "ошибка"));
      else await load(ym);
    } catch (e: any) { alert(String(e)); }
    setSaving(false);
  }

  useEffect(() => { load(ym); }, [ym]);

  async function load(m: string) {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/payroll?ym=${m}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setErr(j?.error || "ошибка"); setData(null); }
      else setData(j);
    } catch (e: any) { setErr(String(e)); }
    setLoading(false);
  }

  const editors = useMemo(() => (data?.people || []).filter(p => p.type === "editor"), [data]);
  const leads = useMemo(() => (data?.people || []).filter(p => p.type === "teamlead"), [data]);

  const TOUR: TourStep[] = [
    { title: "ЗП команды", text: "Раздел видишь только ты. Тут CRM считает зарплату по ФАКТУ работы за месяц — из тех же карточек, что ведёт команда. Финмонитор берёт отсюда готовые суммы." },
    { target: "pr-total", title: "Итог за месяц", text: "Сколько всего к выплате: отдельно монтажёрам (за смонтированные ролики) и тимлидам (за публикации + бонусы)." },
    { target: "pr-issues", title: "Проблемы данных — смотри сюда первым", text: "Ролики без даты сдачи или без даты публикации искажают расчёт: они уезжают не в тот месяц или выпадают совсем. Почини их — и цифры сойдутся." },
    { target: "pr-people", title: "Разбивка по людям", text: "Клик по сотруднику раскрывает, из чего сложилась сумма: по каждому клиенту — сколько роликов и какие бонусы." },
  ];

  if (!isOwner) {
    return (
      <div style={{ padding: 60, textAlign: "center", fontFamily: "'Manrope', sans-serif" }}>
        <Wallet size={40} style={{ color: "var(--t3)", marginBottom: 14 }} />
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--t1)", marginBottom: 6 }}>Раздел доступен только владельцу</div>
        <div style={{ fontSize: 13, color: "var(--t3)" }}>Здесь зарплаты команды — доступ закрыт.</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: -0.5, display: "flex", alignItems: "center", gap: 10 }}>
            ЗП команды
            <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 9px", borderRadius: 6, background: "rgba(255,92,122,0.14)", border: "1px solid rgba(255,92,122,0.35)", color: "#ff5c7a", letterSpacing: 0.5, textTransform: "uppercase", fontFamily: "'Manrope', sans-serif" }}>только владелец</span>
          </h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>Считается по факту работы · монтаж по дате сдачи, публикации по дате выхода</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <TourButton onClick={() => setTourOpen(true)} />
          <button onClick={() => load(ym)} disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 13px", borderRadius: 10, background: "rgba(66,212,244,0.1)", border: "1px solid var(--brd)", color: "var(--cy)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <RefreshCw size={13} className={loading ? "pr-spin" : ""} /> Обновить
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, background: "rgba(123,63,228,0.08)", border: "1px solid var(--brd)" }}>
            <button onClick={() => setYm(s => ymShift(s, -1))} style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", display: "flex" }}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", minWidth: 104, textAlign: "center" }}>{ymLabelRu(ym)}</span>
            <button onClick={() => setYm(s => ymShift(s, 1))} style={{ background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", display: "flex" }}><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {err && (
        <div style={{ padding: 18, borderRadius: 12, background: "rgba(255,92,122,0.08)", border: "1px solid rgba(255,92,122,0.35)", color: "var(--t1)", fontSize: 13, marginBottom: 16 }}>
          Не удалось загрузить: {err}
        </div>
      )}

      {loading && !data ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--t2)" }}>Считаю…</div>
      ) : data ? (
        <>
          {/* ИТОГИ */}
          <div data-tour="pr-total" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }} className="pr-kpi">
            <KPI label="Всего к выплате" value={money(data.total)} color="#9d6bff" big />
            <KPI label="Монтажёрам · за монтаж" value={money(data.totalEditors)} color="#ffae42" />
            <KPI label="Тимлидам · публикации + бонусы" value={money(data.totalTeamleads)} color="#42d4f4" />
          </div>

          {/* Миграция правок не прогнана — редактирование не сохранится */}
          {(data as any).adjustmentsReady === false && (
            <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(255,174,66,0.08)", border: "1px solid rgba(255,174,66,0.4)", fontSize: 12, color: "var(--t1)", marginBottom: 16, lineHeight: 1.6 }}>
              ⚠ Ручные правки пока <b>не сохраняются</b>: не создана таблица. Прогони{" "}
              <code style={{ background: "var(--inset)", padding: "1px 6px", borderRadius: 5 }}>MIGRATION_2026-07-27_payroll_adjustments.sql</code>{" "}
              в Supabase → SQL Editor → Run. Расчёт при этом работает.
            </div>
          )}

          {/* ПРОБЛЕМЫ ДАННЫХ */}
          <div data-tour="pr-issues" style={{ marginBottom: 16 }}>
            {data.issues.length === 0 ? (
              <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(168,224,99,0.08)", border: "1px solid rgba(168,224,99,0.3)", fontSize: 12, color: "var(--gr)", fontWeight: 700 }}>
                ✓ Данные чистые — расчёт точный
              </div>
            ) : (
              <div style={{ borderRadius: 12, background: "rgba(255,174,66,0.07)", border: "1px solid rgba(255,174,66,0.35)", overflow: "hidden" }}>
                <button onClick={() => setIssuesOpen(v => !v)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <AlertTriangle size={16} style={{ color: "var(--or)", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>
                    Проблемы данных: {data.issues.length}
                    <span style={{ fontWeight: 600, color: "var(--t3)", marginLeft: 8, fontSize: 11 }}>искажают расчёт — стоит починить</span>
                  </span>
                  <ChevronDown size={15} style={{ marginLeft: "auto", color: "var(--t3)", transform: issuesOpen ? "none" : "rotate(-90deg)", transition: ".15s" }} />
                </button>
                {issuesOpen && (
                  <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {data.issues.slice(0, 60).map((is, i) => (
                      <button key={i} onClick={() => router.push(`/dashboard/clients/${is.clientId}`)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 9, background: "var(--inset2)", border: "1px solid var(--track)", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, padding: "3px 7px", borderRadius: 5, background: is.kind === "no_ready_at" ? "rgba(255,174,66,0.16)" : "rgba(255,92,122,0.16)", color: is.kind === "no_ready_at" ? "var(--or)" : "#ff5c7a" }}>
                          {is.kind === "no_ready_at" ? "нет даты сдачи" : "нет даты публикации"}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)", flexShrink: 0 }}>{is.clientName}</span>
                        <span style={{ fontSize: 11, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{is.title}</span>
                      </button>
                    ))}
                    {data.issues.length > 60 && <span style={{ fontSize: 10, color: "var(--t3)" }}>…и ещё {data.issues.length - 60}</span>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ЛЮДИ */}
          <div data-tour="pr-people" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="pr-cols">
            <PersonColumn title="Монтажёры" Icon={Scissors} color="#ffae42" people={editors} openKey={openPerson} setOpenKey={setOpenPerson} onSave={saveAdj} saving={saving} />
            <PersonColumn title="Тимлиды" Icon={UserCog} color="#42d4f4" people={leads} openKey={openPerson} setOpenKey={setOpenPerson} onSave={saveAdj} saving={saving} />
          </div>

          {/* СТАВКИ */}
          <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "var(--inset)", border: "1px solid var(--brd)", fontSize: 11, color: "var(--t3)", lineHeight: 1.7 }}>
            <b style={{ color: "var(--t2)" }}>Ставки {ym >= NEW_MOTIVATION_FROM ? "(новая мотивация, с августа 2026)" : "(старая схема, до августа 2026)"}:</b>{" "}
            монтаж ${ratesFor(ym).editor_per_video}/ролик (по дате сдачи)
            {ratesFor(ym).editor_per_avatar > 0 && ` + $${ratesFor(ym).editor_per_avatar}/аватар`}
            {ratesFor(ym).editor_bonus_ontime > 0 && ` + бонусы монтажёру: в срок $${ratesFor(ym).editor_bonus_ontime}, продление $${ratesFor(ym).editor_bonus_renewal}`} ·
            публикация ${ratesFor(ym).tl_per_video_20}{ratesFor(ym).tl_per_video_20 !== ratesFor(ym).tl_per_video_other ? ` (пакет 20) / $${ratesFor(ym).tl_per_video_other} (пакет 30+)` : " за ролик (сценарий + контроль + публикация)"}
            {ratesFor(ym).scripts_per_video > 0 && ` · сценарии $${ratesFor(ym).scripts_per_video}/ролик с M2`} ·
            бонусы тимлиду: в срок ${ratesFor(ym).bonus_ontime}, онбординг ${ratesFor(ym).bonus_onboarding}, продление ${ratesFor(ym).bonus_renewal}.
            <br />Доп. работы (аватары, обложки, интервью) и заморозка выплаченных месяцев — по-прежнему в финмониторе.
          </div>
        </>
      ) : null}

      <Tour steps={TOUR} open={tourOpen} onClose={() => setTourOpen(false)} />
      <style>{`
        .pr-spin{animation:prspin 1s linear infinite}@keyframes prspin{to{transform:rotate(360deg)}}
        @media (max-width: 1000px){ .pr-cols{grid-template-columns:1fr !important} .pr-kpi{grid-template-columns:1fr !important} }
      `}</style>
    </div>
  );
}

function KPI({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div className="card" style={{ padding: 16, borderRadius: 14, borderColor: `${color}44`, background: `${color}0d` }}>
      <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: big ? 28 : 22, fontWeight: 800, color: "var(--t1)", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600, marginTop: 5 }}>{label}</div>
    </div>
  );
}

function PersonColumn({ title, Icon, color, people, openKey, setOpenKey, onSave, saving }: {
  title: string; Icon: any; color: string; people: PayrollPerson[];
  openKey: string | null; setOpenKey: (k: string | null) => void;
  onSave: (rowId: string, patch: Record<string, any>) => Promise<void>; saving: boolean;
}) {
  const sum = people.reduce((s, p) => s + p.total, 0);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, background: `${color}1f` }}>
          <Icon size={14} style={{ color }} />
        </span>
        <h2 style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</h2>
        <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 800, color }}>{money(sum)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {people.length === 0 && <div className="card" style={{ padding: 20, borderRadius: 12, textAlign: "center", color: "var(--t3)", fontSize: 12 }}>Нет начислений</div>}
        {people.map(p => {
          const key = `${p.type}:${p.id ?? p.name}`;
          const open = openKey === key;
          return (
            <div key={key} className="card" style={{ padding: 0, borderRadius: 12, overflow: "hidden" }}>
              <button onClick={() => setOpenKey(open ? null : key)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>{p.name}</span>
                <span style={{ fontSize: 10, color: "var(--t3)" }}>{p.rows.length} клиент.</span>
                <span style={{ marginLeft: "auto", fontFamily: "'Unbounded', sans-serif", fontSize: 15, fontWeight: 800, color }}>{money(p.total)}</span>
                <ChevronDown size={14} style={{ color: "var(--t3)", transform: open ? "none" : "rotate(-90deg)", transition: ".15s" }} />
              </button>
              {open && (
                <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {p.rows.sort((a, b) => b.amount - a.amount).map(({ row, amount }) => (
                    <RowLine key={row.id} row={row} amount={amount} type={p.type} color={color}
                      saving={saving} onSave={(patch) => onSave(row.id, patch)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RowLine({ row, amount, type, color, onSave, saving }: {
  row: PayrollRow; amount: number; type: "editor" | "teamlead"; color: string;
  onSave: (patch: Record<string, any>) => Promise<void>; saving: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const isEditor = type === "editor";
  const fixed = isEditor ? row.fixedEditor : row.fixedTl;

  const parts: string[] = [];
  if (isEditor) {
    if (row.fixedEditor) parts.push("сумма задана вручную");
    else {
      parts.push(`${row.done} смонтировано = $${row.editorBase}`);
      if (row.editorAvatars > 0) parts.push(`🧑‍🎨 ${row.done} аватаров $${row.editorAvatars}`);
      if (row.editorBonusOnTime > 0) parts.push(`✓ в срок $${row.editorBonusOnTime}`);
      if (row.editorBonusRenewal > 0) parts.push(`↻ продление $${row.editorBonusRenewal}`);
    }
    if (row.ahead > 0) parts.push(`↗ ${row.ahead} наперёд`);
    if (row.montNoDate > 0) parts.push(`⚠ ${row.montNoDate} без даты сдачи`);
  } else if (row.fixedTl) {
    parts.push("сумма задана вручную");
  } else {
    if (row.tlBase > 0) parts.push(`${row.published} опубл = $${row.tlBase}`);
    if (row.tlScripts > 0) parts.push(`сценарии $${row.tlScripts}`);
    if (row.bonusOnTime > 0) parts.push(`✓ в срок $${row.bonusOnTime}`);
    if (row.bonusOnboarding > 0) parts.push(`🚀 онбординг $${row.bonusOnboarding}`);
    if (row.bonusRenewal > 0) parts.push(`↻ продление M${row.renewalFrom}→M${row.renewalTo} $${row.bonusRenewal}`);
  }

  const numBox: React.CSSProperties = { width: 62, padding: "5px 8px", borderRadius: 7, background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12, fontWeight: 700, outline: "none" };
  const chip = (on: boolean, label: string, onClick: () => void) => (
    <button onClick={onClick} disabled={saving}
      style={{ padding: "4px 9px", borderRadius: 7, fontSize: 10, fontWeight: 800, cursor: "pointer",
        border: `1px solid ${on ? "var(--gr)" : "var(--brd)"}`, background: on ? "rgba(168,224,99,0.14)" : "transparent", color: on ? "var(--gr)" : "var(--t3)" }}>
      {on ? "✓ " : ""}{label}
    </button>
  );

  return (
    <div style={{ borderRadius: 9, background: "var(--inset2)", border: `1px solid ${row.edited ? "rgba(157,107,255,0.5)" : "var(--track)"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.clientName} <span style={{ color: "var(--t3)", fontFamily: "monospace", fontWeight: 600 }}>· M{row.m}</span>
            {row.edited && <span title={row.note || "Есть ручная правка"} style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 5, background: "rgba(157,107,255,0.16)", color: "var(--pu)" }}>правлено</span>}
          </div>
          <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>{parts.join(" · ") || "—"}</div>
        </div>
        <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color }}>{money(amount)}</span>
        <button onClick={() => setEdit(v => !v)} title="Поправить вручную"
          style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, background: edit ? "rgba(157,107,255,0.16)" : "transparent", border: "1px solid var(--brd)", color: edit ? "var(--pu)" : "var(--t3)", cursor: "pointer", fontSize: 11 }}>✎</button>
      </div>

      {edit && (
        <div style={{ padding: "0 11px 10px", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px dashed var(--brd)", marginTop: 2, paddingTop: 10 }}>
          {/* счётчик */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, minWidth: 92 }}>{isEditor ? "Смонтировано" : "Опубликовано"}</span>
            <input type="number" min={0} defaultValue={isEditor ? row.done : row.published} disabled={saving || fixed}
              key={`${row.id}-${isEditor ? row.done : row.published}`}
              onBlur={e => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                const auto = isEditor ? row.autoDone : row.autoPublished;
                if (v === (isEditor ? row.done : row.published)) return;
                onSave({ [isEditor ? "done" : "published"]: v === auto ? null : v });
              }}
              style={{ ...numBox, opacity: fixed ? 0.4 : 1 }} />
            <span style={{ fontSize: 9, color: "var(--t3)" }}>автомат: {isEditor ? row.autoDone : row.autoPublished}</span>
          </div>

          {/* бонусы — только у тимлида */}
          {!isEditor && !fixed && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, minWidth: 92 }}>Бонусы</span>
              {chip(row.onTime, "в срок", () => onSave({ on_time: row.onTime === row.autoOnTime ? !row.onTime : null }))}
              {chip(row.onboarding, "онбординг", () => onSave({ onboarding: row.onboarding === row.autoOnboarding ? !row.onboarding : null }))}
              {chip(row.renewal, "продление", () => onSave({ renewal: row.renewal === row.autoRenewal ? !row.renewal : null }))}
            </div>
          )}

          {/* фиксированная сумма */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, minWidth: 92 }}>Или сумма, $</span>
            <input type="number" min={0} step="0.01" placeholder="по ставке" disabled={saving}
              key={`${row.id}-fixed-${fixed ? amount : "auto"}`}
              defaultValue={fixed ? amount : ""}
              onBlur={e => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                onSave({ [isEditor ? "editor_amount" : "tl_amount"]: v });
              }}
              style={{ ...numBox, width: 88, borderColor: fixed ? "var(--pu)" : "var(--brd)" }} />
            <span style={{ fontSize: 9, color: "var(--t3)" }}>задашь — расчёт по ставке для этой строки не применяется</span>
          </div>

          {row.edited && (
            <button onClick={() => onSave({ done: null, published: null, on_time: null, onboarding: null, renewal: null, editor_amount: null, tl_amount: null })} disabled={saving}
              style={{ alignSelf: "flex-start", padding: "5px 11px", borderRadius: 7, background: "transparent", border: "1px solid rgba(255,92,122,0.4)", color: "var(--rd)", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>
              ↺ Вернуть на автомат
            </button>
          )}
        </div>
      )}
    </div>
  );
}
