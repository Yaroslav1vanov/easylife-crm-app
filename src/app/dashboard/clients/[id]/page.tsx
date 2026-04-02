"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, Script, ChecklistTask, TeamMember } from "@/lib/database";

export default function ClientDetailPage() {
  const { id } = useParams();
  const clientId = parseInt(id as string);
  const [client, setClient] = useState<Client | null>(null);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [checklist, setChecklist] = useState<ChecklistTask[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tab, setTab] = useState("scripts");
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [editSocial, setEditSocial] = useState<string | null>(null);
  const [socialUrl, setSocialUrl] = useState("");
  const [expandedScript, setExpandedScript] = useState<number | null>(null);
  const [viewMonth, setViewMonth] = useState(1);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { load(); }, [clientId]);

  async function load() {
    const [c, s, ch, tm] = await Promise.all([
      db.getClient(supabase, clientId),
      db.getScripts(supabase, clientId),
      db.getChecklist(supabase, clientId),
      db.getTeam(supabase),
    ]);
    setClient(c); setScripts(s); setChecklist(ch); setTeam(tm); setLoading(false);
  }

  async function updateClientField(field: string, value: any) {
    await db.updateClient(supabase, clientId, { [field]: value } as any);
    load();
  }

  async function updateScript(scriptId: number, updates: Partial<Script>) {
    await db.updateScript(supabase, scriptId, updates);
    load();
  }

  async function toggleTask(taskId: number, current: string) {
    await db.updateTask(supabase, taskId, { status: current === "done" ? "todo" : "done" });
    load();
  }

  async function updateTaskField(taskId: number, field: string, value: any) {
    await db.updateTask(supabase, taskId, { [field]: value } as any);
    load();
  }

  async function addNewMonth() {
    await db.addMonthScripts(supabase, clientId);
    load();
  }

  async function saveEdit() {
    await db.updateClient(supabase, clientId, editData);
    setEditing(false); load();
  }

  if (loading) return <div style={{ color: "var(--t2)", padding: 40, textAlign: "center" }}>Загрузка...</div>;
  if (!client) return <div style={{ color: "var(--rd)", padding: 40 }}>Клиент не найден</div>;

  const c = client;
  const pub = scripts.filter(s => s.video_status === "published").length;
  const ready = scripts.filter(s => s.video_status === "ready").length;
  const editVids = scripts.filter(s => s.video_status === "inProgress" && s.script_status === "approved").length;
  const scrApp = scripts.filter(s => s.script_status === "approved").length;
  const doneTasks = checklist.filter(t => t.status === "done").length;
  const pct = checklist.length > 0 ? Math.round(doneTasks / checklist.length * 100) : 0;
  const months = Array.from(new Set(scripts.map(s => s.month_number))).sort();
  const monthScripts = scripts.filter(s => s.month_number === viewMonth);

  const scStatuses = [{ value: "notStarted", label: "Не начато" }, { value: "inProgress", label: "В работе" }, { value: "review", label: "На утверждение" }, { value: "approved", label: "Утверждён" }];
  const viStatuses = [{ value: "notStarted", label: "—" }, { value: "inProgress", label: "В работе" }, { value: "review", label: "На утверждение" }, { value: "ready", label: "Готово" }, { value: "published", label: "Опубликовано" }];
  const scColor = (s: string) => s === "approved" ? "var(--gr)" : s === "review" ? "var(--yl)" : s === "inProgress" ? "var(--or)" : "var(--t3)";
  const viColor = (s: string) => s === "published" ? "var(--gr)" : s === "ready" ? "var(--cy)" : s === "review" ? "var(--yl)" : s === "inProgress" ? "var(--or)" : "var(--t3)";

  const tabs = [
    { id: "scripts", label: `Сценарии (${scrApp}/${scripts.length})` },
    { id: "videos", label: `Ролики (${pub}/${scripts.length})` },
    { id: "plan", label: `Чеклист (${pct}%)` },
  ];

  const daysDiff = (d: string) => Math.round((new Date().getTime() - new Date(d).getTime()) / 86400000);

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-xs" style={{ color: "var(--cy)", background: "none", border: "none", cursor: "pointer" }}>← Назад</button>
        <button onClick={async () => { if (confirm("Удалить клиента? Все данные будут потеряны.")) { await db.deleteClient(supabase, clientId); router.push("/dashboard/clients"); } }}
          className="px-3 py-1 rounded-lg text-[10px] font-semibold"
          style={{ color: "var(--rd)", border: "1px solid var(--rd)", background: "transparent", cursor: "pointer" }}>
          🗑 Удалить
        </button>
      </div>

      {/* Hero Card */}
      <div className="card mb-3" style={{ padding: "20px", borderRadius: 18, background: "linear-gradient(135deg, var(--card), var(--bg2))" }}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-extrabold shrink-0"
            style={{ background: c.avatar_url ? `url(${c.avatar_url}) center/cover` : "linear-gradient(135deg, var(--pud), var(--cyd))", color: "var(--pu)", border: "2px solid var(--brd)" }}>
            {!c.avatar_url && <>{c.name[0]}{(c.surname || "")[0] || ""}</>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex gap-1.5 flex-wrap mb-1">
              <span className="badge" style={{ background: "var(--cyd)", color: "var(--cy)" }}>{c.niche || "—"}</span>
              <span className="badge" style={{ background: "var(--pud)", color: "var(--pu)" }}>{c.stage}</span>
            </div>
            <div className="text-xl font-extrabold" style={{ color: "var(--t1)" }}>{c.name} {c.surname}</div>
            <div className="flex gap-2 mt-1 flex-wrap text-[10px]" style={{ color: "var(--t2)" }}>
              <span>монт. <b style={{ color: "var(--or)" }}>{c.montager?.name || "—"}</b></span>
              <span>TL <b style={{ color: "var(--pu)" }}>{c.teamlead?.name || "—"}</b></span>
              <span>📦 {c.package} рилсов</span>
            </div>
          </div>
          {/* Socials */}
          <div className="flex gap-1.5 flex-wrap">
            {(["instagram", "tiktok", "youtube"] as const).map(key => {
              const url = c[key];
              const labels = { instagram: "📷 Instagram", tiktok: "🎵 TikTok", youtube: "▶️ YouTube" };
              const colors = { instagram: "var(--pk)", tiktok: "var(--t1)", youtube: "var(--rd)" };
              if (editSocial === key) {
                return (
                  <div key={key} className="flex items-center gap-1 rounded-lg px-2" style={{ border: "1px solid var(--cy)", background: "var(--inp)" }}>
                    <input autoFocus value={socialUrl} onChange={e => setSocialUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && socialUrl) { updateClientField(key, socialUrl); setEditSocial(null); setSocialUrl(""); } if (e.key === "Escape") { setEditSocial(null); setSocialUrl(""); } }}
                      placeholder={`Ссылка...`} className="text-[10px] py-1 bg-transparent outline-none w-36" style={{ color: "var(--t1)", border: "none" }} />
                    <button onClick={() => { if (socialUrl) updateClientField(key, socialUrl); setEditSocial(null); setSocialUrl(""); }}
                      className="text-[9px] px-2 py-0.5 rounded font-semibold" style={{ background: "var(--gr)", color: "#fff", border: "none", cursor: "pointer" }}>✓</button>
                  </div>
                );
              }
              if (url) {
                return <a key={key} href={url.startsWith("http") ? url : `https://${url}`} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg text-[10px] font-semibold" style={{ border: `1px solid ${colors[key]}50`, background: `${colors[key]}12`, color: colors[key], textDecoration: "none" }}>{labels[key]} ↗</a>;
              }
              return <button key={key} onClick={() => { setEditSocial(key); setSocialUrl(""); }}
                className="px-3 py-1.5 rounded-lg text-[10px]" style={{ border: "1px solid var(--brd)", color: "var(--t3)", background: "transparent", cursor: "pointer" }}>{labels[key]} +</button>;
            })}
          </div>
        </div>
      </div>

      {/* Circular Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {[{ v: pub, m: scripts.length, l: "РОЛИКИ", c: "var(--pu)" }, { v: editVids, m: Math.max(1, scripts.length - pub), l: "МОНТАЖ", c: "var(--or)" }, { v: scrApp, m: scripts.length, l: "СЦЕНАРИИ", c: "var(--gr)" }, { v: pct, m: 100, l: "ЧЕКЛИСТ", c: "var(--cy)", suf: "%" }].map((s, i) => {
          const r = 35; const circ = 2 * Math.PI * r; const pctV = s.m > 0 ? s.v / s.m : 0;
          return (
            <div key={i} className="card text-center flex flex-col items-center" style={{ padding: 14 }}>
              <svg width="80" height="80" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="40" cy="40" r={r} fill="none" stroke="var(--brd)" strokeWidth="5" />
                <circle cx="40" cy="40" r={r} fill="none" stroke={s.c} strokeWidth="5" strokeDasharray={circ} strokeDashoffset={circ - pctV * circ} strokeLinecap="round" />
              </svg>
              <div className="relative -mt-[58px] mb-4 flex flex-col items-center justify-center h-[50px]">
                <span className="text-lg font-bold font-mono" style={{ color: "var(--t1)" }}>{s.v}{s.suf || ""}</span>
                {!s.suf && <span className="text-[7px]" style={{ color: "var(--t3)" }}>из {s.m}</span>}
              </div>
              <div className="text-[9px] font-bold tracking-wider" style={{ color: "var(--t1)" }}>{s.l}</div>
            </div>
          );
        })}
      </div>

      {/* Client Card */}
      <div className="card mb-3">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[10px] font-bold tracking-wider" style={{ color: "var(--t1)" }}>КАРТОЧКА КЛИЕНТА</span>
          {!editing ? (
            <button onClick={() => { setEditData({ name: c.name, surname: c.surname, niche: c.niche, phone: c.phone, product: c.product, avg_check: c.avg_check, package: c.package }); setEditing(true); }}
              className="text-[9px] px-3 py-1 rounded-lg font-semibold" style={{ border: "1px solid var(--cy)", color: "var(--cy)", background: "transparent", cursor: "pointer" }}>✏️ Редактировать</button>
          ) : (
            <div className="flex gap-1">
              <button onClick={saveEdit} className="text-[9px] px-3 py-1 rounded-lg font-semibold" style={{ background: "var(--gr)", color: "#fff", border: "none", cursor: "pointer" }}>Сохранить</button>
              <button onClick={() => setEditing(false)} className="text-[9px] px-3 py-1 rounded-lg" style={{ border: "1px solid var(--brd)", color: "var(--t2)", background: "transparent", cursor: "pointer" }}>Отмена</button>
            </div>
          )}
        </div>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {[["ИМЯ", "name"], ["ФАМИЛИЯ", "surname"], ["НИША", "niche"], ["ТЕЛЕФОН", "phone"], ["ПРОДУКТ", "product"], ["СР. ЧЕК", "avg_check"]].map(([l, k]) => (
              <div key={k}><label className="block text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>{l}</label>
                <input value={editData[k] || ""} onChange={e => setEditData((p: any) => ({ ...p, [k]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} /></div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[["ИМЯ", `${c.name} ${c.surname || ""}`], ["НИША", c.niche], ["ТЕЛЕФОН", c.phone], ["ПРОДУКТ", c.product], ["СР. ЧЕК", c.avg_check], ["ПАКЕТ", `${c.package} роликов`], ["МОНТАЖЁР", c.montager?.name || "—"], ["TEAM LEAD", c.teamlead?.name || "—"], ["СТАРТ", c.start_date], ["ПУБЛИКАЦИЯ", c.pub_date || "—"], ["ЭТАП", c.stage], ["ПРИОРИТЕТ", c.priority]].map(([l, v], i) => (
              <div key={i}><div className="text-[8px] font-semibold tracking-wider" style={{ color: "var(--cy)" }}>{l}</div><div className="text-[11px] font-medium" style={{ color: "var(--t1)" }}>{v}</div></div>
            ))}
          </div>
        )}
      </div>

      {/* Deadlines */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
        {[{ l: "ПЕРВАЯ ПУБЛИКАЦИЯ", k: "first_pub_date" as const }, { l: "ДЕДЛАЙН СЦЕНАРИЕВ", k: "scripts_deadline" as const }, { l: "ДЕДЛАЙН РОЛИКОВ", k: "videos_deadline" as const }].map(dd => {
          const val = c[dd.k]; const days = val ? daysDiff(val) : 0; const over = days > 0 && val;
          return (
            <div key={dd.k} className="card" style={{ padding: 10, borderColor: over ? "rgba(239,68,68,0.3)" : "var(--brd)" }}>
              <div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>{dd.l}</div>
              <input type="date" value={val || ""} onChange={e => updateClientField(dd.k, e.target.value)}
                className="text-sm font-bold font-mono bg-transparent border-none outline-none cursor-pointer" style={{ color: over ? "var(--rd)" : "var(--gr)" }} />
              {val && <div className="text-[9px] mt-1" style={{ color: over ? "var(--rd)" : "var(--gr)" }}>{over ? `+${days} дн.` : `${Math.abs(days)} дн.`}</div>}
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b mb-3 overflow-x-auto" style={{ borderColor: "var(--brd)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-[11px] font-semibold shrink-0"
            style={{ background: "transparent", border: "none", borderBottom: tab === t.id ? "2px solid var(--cy)" : "2px solid transparent", color: tab === t.id ? "var(--cy)" : "var(--t2)", cursor: "pointer" }}>{t.label}</button>
        ))}
      </div>

      {/* Month selector (for scripts/videos) */}
      {(tab === "scripts" || tab === "videos") && (
        <div className="flex gap-1 mb-3 flex-wrap items-center">
          {months.map(m => (
            <button key={m} onClick={() => setViewMonth(m)} className="px-3 py-1 rounded-lg text-[10px] font-semibold"
              style={{ border: `1px solid ${viewMonth === m ? "var(--cy)" : "var(--brd)"}`, background: viewMonth === m ? "var(--cyd)" : "transparent", color: viewMonth === m ? "var(--cy)" : "var(--t2)", cursor: "pointer" }}>
              Месяц {m}
            </button>
          ))}
          <button onClick={addNewMonth} className="px-3 py-1 rounded-lg text-[10px] font-medium"
            style={{ border: "1px dashed var(--cy)", color: "var(--cy)", background: "transparent", cursor: "pointer" }}>+ Новый месяц</button>
        </div>
      )}

      {/* Scripts tab */}
      {(tab === "scripts" || tab === "videos") && monthScripts.map(s => {
        const isExpanded = expandedScript === s.id;
        const showVid = tab === "videos";
        return (
          <div key={s.id} className="card mb-1" style={{ padding: 0 }}>
            <div onClick={() => setExpandedScript(isExpanded ? null : s.id)} className="flex items-center gap-2 px-3 py-2 cursor-pointer">
              <span className="text-[10px] font-mono w-5" style={{ color: "var(--t3)" }}>{s.order_num}</span>
              <span className="text-xs font-semibold flex-1" style={{ color: s.script_status === "notStarted" && !s.hook_text ? "var(--t3)" : "var(--t1)" }}>{s.hook_text || s.hook}</span>
              <span className="badge" style={{ background: `${scColor(s.script_status)}18`, color: scColor(s.script_status) }}>{scStatuses.find(x => x.value === s.script_status)?.label}</span>
              {showVid && s.script_status === "approved" && <span className="badge" style={{ background: `${viColor(s.video_status)}18`, color: viColor(s.video_status) }}>{viStatuses.find(x => x.value === s.video_status)?.label}</span>}
              <span style={{ color: "var(--t3)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
            </div>
            {isExpanded && (
              <div className="px-3 pb-3 border-t" style={{ borderColor: "var(--brd)" }}>
                <div className="flex gap-3 py-2 flex-wrap">
                  <div><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--cy)" }}>СТАТУС СЦЕНАРИЯ</div>
                    <select value={s.script_status} onChange={e => updateScript(s.id, { script_status: e.target.value })}
                      className="text-[10px] px-2 py-1 rounded outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                      {scStatuses.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select></div>
                  {showVid && s.script_status === "approved" && (
                    <div><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--pu)" }}>СТАТУС РОЛИКА</div>
                      <select value={s.video_status} onChange={e => updateScript(s.id, { video_status: e.target.value })}
                        className="text-[10px] px-2 py-1 rounded outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                        {viStatuses.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select></div>
                  )}
                  {s.video_status === "published" && (
                    <div><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--gr)" }}>ДАТА ПУБЛИКАЦИИ</div>
                      <input type="date" value={s.pub_date || ""} onChange={e => updateScript(s.id, { pub_date: e.target.value })}
                        className="text-[10px] px-2 py-1 rounded outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} /></div>
                  )}
                </div>
                <div className="mb-2"><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--or)" }}>🎬 РЕФЕРЕНС</div>
                  <input value={s.ref_url} onChange={e => updateScript(s.id, { ref_url: e.target.value })} placeholder="https://instagram.com/reel/..."
                    className="w-full px-2 py-1.5 rounded text-xs outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} /></div>
                <div className="mb-2"><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--gr)" }}>📝 ТРАНСКРИБАЦИЯ</div>
                  <textarea value={s.transcription} onChange={e => updateScript(s.id, { transcription: e.target.value })} placeholder="Текст с референса..." rows={2}
                    className="w-full px-2 py-1.5 rounded text-xs outline-none resize-y" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontFamily: "inherit" }} /></div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--or)" }}>🎣 ХУК</div>
                    <textarea value={s.hook_text} onChange={e => updateScript(s.id, { hook_text: e.target.value })} placeholder="Крючок..." rows={2}
                      className="w-full px-2 py-1.5 rounded text-xs outline-none resize-y" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontFamily: "inherit" }} /></div>
                  <div><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--pu)" }}>📄 ОСНОВНОЙ ТЕКСТ</div>
                    <textarea value={s.body_text} onChange={e => updateScript(s.id, { body_text: e.target.value })} placeholder="Основной контент..." rows={2}
                      className="w-full px-2 py-1.5 rounded text-xs outline-none resize-y" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontFamily: "inherit" }} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--pk)" }}>📢 ПРИЗЫВ</div>
                    <textarea value={s.cta} onChange={e => updateScript(s.id, { cta: e.target.value })} placeholder="CTA..." rows={2}
                      className="w-full px-2 py-1.5 rounded text-xs outline-none resize-y" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontFamily: "inherit" }} /></div>
                  <div><div className="text-[8px] font-semibold tracking-wider mb-1" style={{ color: "var(--yl)" }}>✏️ ОПИСАНИЕ</div>
                    <textarea value={s.description} onChange={e => updateScript(s.id, { description: e.target.value })} placeholder="Описание..." rows={2}
                      className="w-full px-2 py-1.5 rounded text-xs outline-none resize-y" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontFamily: "inherit" }} /></div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Checklist tab */}
      {tab === "plan" && (
        <div>
          <div className="flex gap-2 mb-3">
            <button onClick={async () => { for (const t of checklist.filter(x => x.status !== "done")) { await db.updateTask(supabase, t.id, { status: "done" }); } load(); }}
              className="px-3 py-1.5 rounded-lg text-[10px] font-semibold"
              style={{ background: "var(--grd)", color: "var(--gr)", border: "1px solid var(--gr)", cursor: "pointer" }}>
              ✓ Отметить все
            </button>
            <button onClick={async () => { for (const t of checklist.filter(x => x.status === "done")) { await db.updateTask(supabase, t.id, { status: "todo" }); } load(); }}
              className="px-3 py-1.5 rounded-lg text-[10px]"
              style={{ color: "var(--t3)", border: "1px solid var(--brd)", background: "transparent", cursor: "pointer" }}>
              Сбросить все
            </button>
          </div>
          {checklist.map((t, i) => {
            const prevPhase = i > 0 ? checklist[i - 1].phase : "";
            const showPhase = t.phase !== prevPhase;
            const over = t.status !== "done" && t.deadline && daysDiff(t.deadline) > 0;
            return (
              <div key={t.id}>
                {showPhase && <div className="text-[9px] font-bold tracking-wider mt-3 mb-1" style={{ color: "var(--cy)" }}>{t.phase}</div>}
                <div className="flex items-center gap-2 py-1 px-1">
                  <button onClick={() => toggleTask(t.id, t.status)} className="w-4 h-4 rounded shrink-0 flex items-center justify-center"
                    style={{ border: `2px solid ${t.status === "done" ? "var(--gr)" : "var(--brd)"}`, background: t.status === "done" ? "var(--grd)" : "transparent", cursor: "pointer" }}>
                    {t.status === "done" && <span style={{ color: "var(--gr)", fontSize: 10 }}>✓</span>}
                  </button>
                  <span className="flex-1 text-[10px]" style={{ color: t.status === "done" ? "var(--t3)" : "var(--t1)", textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.task_name}</span>
                  <select value={t.responsible_id || ""} onChange={e => updateTaskField(t.id, "responsible_id", parseInt(e.target.value) || null)}
                    className="text-[8px] px-1 py-0.5 rounded outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t2)", maxWidth: 80 }}>
                    <option value="">—</option>
                    {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <input type="date" value={t.deadline || ""} onChange={e => updateTaskField(t.id, "deadline", e.target.value)}
                    className="text-[9px] font-mono bg-transparent border-none outline-none cursor-pointer" style={{ color: over ? "var(--rd)" : "var(--t3)", width: 95 }} />
                  {over && <span className="badge" style={{ background: "rgba(239,68,68,0.15)", color: "var(--rd)" }}>-{daysDiff(t.deadline!)}д</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
