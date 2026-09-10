"use client";
import { useEffect, useState } from "react";
import { Client, Script, Publication } from "@/lib/database";
import Avatar from "@/components/Avatar";
import { DEFAULT_TZ, tzShort, nowInTz, utcToZonedInput, zonedInputToUtc, fmtInTz } from "@/lib/tz";
import { Camera, Play, Music2, AtSign, Wand2, X, ExternalLink, Rocket, RefreshCw, Trash2, Check, AlertTriangle, type LucideIcon } from "lucide-react";

/* ============================================================
   Карточка публикации (v2): три шага сверху вниз —
   ① ролик и обложка → ② когда и куда → ③ тексты → футер с отправкой.
   Отправка идемпотентна: повторное нажатие досылает только то, что не ушло,
   «Переотправить» удаляет старые посты в Metricool и создаёт заново.
   ============================================================ */

type Channel = { id: string; label: string; short: string; Icon: LucideIcon; limit: number };
export const CHANNELS: Channel[] = [
  { id: "ig", label: "Instagram", short: "IG", Icon: Camera, limit: 2200 },
  { id: "tt", label: "TikTok", short: "TT", Icon: Music2, limit: 2200 },
  { id: "yt", label: "YouTube Shorts", short: "YT", Icon: Play, limit: 5000 },
  { id: "threads", label: "Threads", short: "Threads", Icon: AtSign, limit: 500 },
];
export function parseIds(s: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  s.split(",").map(x => x.trim()).filter(Boolean).forEach((x, i) => { const m = x.match(/^([a-z]+):(.+)$/); if (m) out[m[1]] = m[2]; else out[`_${i}`] = x; });
  return out;
}
export type PublishOpts = { force?: boolean; allowPast?: boolean };
export type StatusItem = { ch: string; id: string; status: string | null; error: string | null; url: string | null };

const STATUS_META: Record<string, { l: string; cls: string }> = {
  adapting: { l: "Готовится", cls: "pu" }, review: { l: "На проверке", cls: "or" }, queued: { l: "Готово к отправке", cls: "pu" },
  scheduled: { l: "Запланировано", cls: "cy" }, published: { l: "Опубликовано", cls: "gr" }, error: { l: "Ошибка", cls: "rd" },
};

export default function PublicationModal({ pub, client, script, onClose, onUpdate, onRegenerate, onPublish, onCheckStatus }: {
  pub: Publication; client?: Client; script?: Script;
  onClose: () => void; onUpdate: (id: number, patch: Partial<Publication>) => void;
  onRegenerate: (id: number) => void;
  onPublish: (id: number, opts?: PublishOpts) => Promise<{ ok: boolean; code?: string; error?: string }>;
  onCheckStatus: (id: number) => Promise<{ items: StatusItem[]; allPublished: boolean } | null>;
}) {
  const [tab, setTab] = useState("ig");
  const [busy, setBusy] = useState(false);
  const [pubBusy, setPubBusy] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statuses, setStatuses] = useState<StatusItem[] | null>(null);
  const [previewErr, setPreviewErr] = useState(false);
  const [f, setF] = useState(pub);
  useEffect(() => { setF(pub); }, [pub.id, pub.ai_generated_at, pub.pub_status, pub.metricool_post_id]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const isCarousel = pub.content_type === "carousel";
  const allowedChannels = isCarousel ? ["ig", "threads"] : ["ig", "tt", "yt", "threads"];
  const tz = client?.timezone || DEFAULT_TZ;
  const service = client?.publisher === "uploadpost" ? "Upload-Post" : "Metricool";
  const ids = parseIds(f.metricool_post_id);
  const sentCount = Object.keys(ids).length;
  const isScheduled = f.pub_status === "scheduled";
  const isPublished = f.pub_status === "published";
  const locked = isPublished; // после публикации ничего не правим
  const pastBy = f.publish_at ? Math.round((Date.now() - Date.parse(f.publish_at)) / 60000) : 0;

  const save = (patch: Partial<Publication>) => { if (locked) return; setF(p => ({ ...p, ...patch })); onUpdate(pub.id, patch); };
  /** Вернуть опубликованный пост в «Готово к публикации», чтобы отправить заново.
   *  Сценарий в «Монтаже» не трогаем: ролик уже сделан и оплачен — переопубликация
   *  это правка поста в соцсетях, а не новый ролик, ЗП и счётчики не меняются. */
  const reopen = () => {
    if (!confirm("Вернуть пост на переопубликацию?\n\n• Карточка уйдёт в «Готово к публикации», можно поменять текст, время и сети.\n• Уже вышедший пост в соцсетях останется — удали его там вручную, если нужно.\n• В «Монтаже» ролик останется опубликованным, ЗП не пересчитается.")) return;
    const patch = { pub_status: "queued" as const, metricool_post_id: null, error_message: null };
    setF(p => ({ ...p, ...patch }));
    onUpdate(pub.id, patch as Partial<Publication>);
  };
  const channels = (f.target_channels?.length ? f.target_channels : client?.platforms?.length ? client.platforms : allowedChannels).filter(x => allowedChannels.includes(x));
  const toggleChan = (id: string) => {
    if (locked || isScheduled) return;
    const set = new Set(channels); set.has(id) ? set.delete(id) : set.add(id);
    save({ target_channels: CHANNELS.map(c => c.id).filter(x => set.has(x)) });
  };
  useEffect(() => { if (!channels.includes(tab)) setTab(channels[0] || "ig"); }, [channels.join(",")]);

  async function r2Upload(file: File, kind?: "image"): Promise<string | null> {
    const r = await fetch("/api/r2/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(kind ? { kind } : {}), filename: file.name, clientId: pub.client_id, scriptId: pub.script_id ?? pub.id }) });
    const j = await r.json();
    if (!r.ok) { alert("R2: " + (j?.error || "ошибка подписи")); return null; }
    const put = await fetch(j.uploadUrl, { method: "PUT", body: file, headers: file.type ? { "content-type": file.type } : {} });
    if (!put.ok) { alert(`Загрузка не удалась (${put.status}). Проверь CORS бакета.`); return null; }
    return j.publicUrl as string;
  }
  async function uploadVideo(file: File) { setUpBusy(true); try { const u = await r2Upload(file); if (u) { setPreviewErr(false); save({ video_url: u }); } } catch (e: any) { alert(String(e)); } setUpBusy(false); }
  async function uploadCover(file: File) { setUpBusy(true); try { const u = await r2Upload(file, "image"); if (u) save({ video_thumbnail_url: u }); } catch (e: any) { alert(String(e)); } setUpBusy(false); }
  async function uploadSlides(files: File[]) {
    setUpBusy(true);
    try { const urls: string[] = []; for (const file of files) { const u = await r2Upload(file, "image"); if (!u) break; urls.push(u); } if (urls.length) save({ media_urls: [...(f.media_urls || []), ...urls] }); }
    catch (e: any) { alert(String(e)); }
    setUpBusy(false);
  }
  const moveSlide = (i: number, d: -1 | 1) => { const a = [...(f.media_urls || [])]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save({ media_urls: a }); };

  async function publish(opts?: PublishOpts) {
    if (opts?.force && !confirm("Переотправить? Старые посты в Metricool будут удалены и созданы заново. Если что-то уже вышло в соцсети — оно останется опубликованным.")) return;
    setPubBusy(true);
    let res = await onPublish(pub.id, opts);
    if (!res.ok && res.code === "past" && confirm("Время публикации уже прошло. Metricool опубликует сразу после отправки. Продолжить?")) res = await onPublish(pub.id, { ...opts, allowPast: true });
    setPubBusy(false);
    if (res.ok) onClose();
  }
  async function checkStatus() { setStatusBusy(true); const r = await onCheckStatus(pub.id); setStatuses(r?.items || []); setStatusBusy(false); }

  const planIso = script?.pub_date ? zonedInputToUtc(`${script.pub_date}T${(client?.default_post_time || "12:00").slice(0, 5)}`, tz) : null;
  const chipFor = (st: string | null) => { const s = String(st || "").toUpperCase(); return s === "PUBLISHED" ? "gr" : s === "ERROR" || s === "DELETED" ? "rd" : s === "PENDING" || s === "SCHEDULED" ? "cy" : "mut"; };
  const meta = STATUS_META[f.pub_status] || { l: f.pub_status, cls: "mut" };
  const lbl = (t: string) => <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 6 }}>{t}</div>;
  const ta: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 9, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 };
  const Step = ({ n, title, children, right }: { n: number; title: string; children: React.ReactNode; right?: React.ReactNode }) => (
    <div className="v2-fg" style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: "var(--pud)", color: "var(--pu)", fontFamily: "'Unbounded', sans-serif", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>{title}</span>
        <span style={{ marginLeft: "auto" }}>{right}</span>
      </div>
      {children}
    </div>
  );

  return (
    <div onClick={onClose} className="v2" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--side)", border: "1px solid var(--v2-brd2)", borderRadius: 18, width: "100%", maxWidth: 860, display: "flex", flexDirection: "column", gap: 12, padding: "18px 18px 0", position: "relative" }}>
        {/* ---- шапка ---- */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {client && <Avatar name={`${client.name} ${client.surname || ""}`} src={client.avatar_url} size={40} />}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 15, fontWeight: 800, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client?.name} {client?.surname || ""}</div>
            <div style={{ fontSize: 12, color: "var(--t3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isCarousel ? "Карусель" : `${script?.order_num ? `#${script.order_num} · ` : ""}${script?.hook_text || script?.hook || "Без темы"}`}</div>
          </div>
          <span className={`v2-chip ${meta.cls}`}>{meta.l}</span>
          <button className="v2-iconbtn" onClick={onClose} aria-label="Закрыть"><X size={16} /></button>
        </div>

        {/* ---- ① ролик ---- */}
        <Step n={1} title={isCarousel ? "Слайды карусели" : "Ролик и обложка"} right={!isCarousel && f.video_url ? <a href={f.video_url} target="_blank" rel="noreferrer" className="v2-act ghost" style={{ height: 30 }}><ExternalLink size={12} /> открыть</a> : null}>
          {isCarousel ? (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {(f.media_urls || []).map((url, i) => (
                  <div key={url} style={{ position: "relative", width: 96, borderRadius: 10, overflow: "hidden", border: "1px solid var(--brd)", background: "var(--v2-inset)" }}>
                    <img src={url} alt={`слайд ${i + 1}`} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                    <span className="v2-chip mut" style={{ position: "absolute", top: 4, left: 4, padding: "1px 6px" }}>{i + 1}</span>
                    {!locked && <button onClick={() => save({ media_urls: (f.media_urls || []).filter((_, k) => k !== i) })} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 6, background: "rgba(255,92,122,.85)", border: 0, color: "#fff", cursor: "pointer" }}><Trash2 size={11} /></button>}
                    <div style={{ display: "flex" }}><button onClick={() => moveSlide(i, -1)} disabled={i === 0} style={{ flex: 1, background: "none", border: 0, color: "var(--t2)", cursor: "pointer", padding: 3 }}>‹</button><button onClick={() => moveSlide(i, 1)} disabled={i === (f.media_urls || []).length - 1} style={{ flex: 1, background: "none", border: 0, color: "var(--t2)", cursor: "pointer", padding: 3 }}>›</button></div>
                  </div>
                ))}
                {(f.media_urls || []).length === 0 && <div className="v2-empty" style={{ flex: 1 }}>Слайдов пока нет</div>}
              </div>
              {!locked && <label className="v2-act" style={{ cursor: "pointer" }}>{upBusy ? "Загружаю…" : "⬆ Добавить слайды"}<input type="file" accept="image/*" multiple disabled={upBusy} onChange={e => { const files = Array.from(e.target.files || []); if (files.length) uploadSlides(files); e.target.value = ""; }} style={{ display: "none" }} /></label>}
            </>
          ) : (
            <div className="pub-media">
              <div>
                {f.video_url && !previewErr
                  ? <video key={f.video_url} src={f.video_url} controls playsInline preload="metadata" onError={() => setPreviewErr(true)} style={{ width: "100%", maxHeight: 260, borderRadius: 10, background: "#000", display: "block" }} />
                  : <div className="v2-empty" style={{ padding: 20 }}>{f.video_url ? "Превью не грузится в этом браузере — файл на месте, открой по ссылке справа" : "Ролика ещё нет: загрузи файл или вставь прямую ссылку"}</div>}
                {!locked && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <input value={f.video_url || ""} onChange={e => setF(p => ({ ...p, video_url: e.target.value }))} onBlur={e => save({ video_url: e.target.value })} placeholder="прямая ссылка на mp4" style={{ ...ta, padding: "8px 10px", fontSize: 12 }} />
                    <label className="v2-act pri" style={{ cursor: "pointer", flexShrink: 0 }}>{upBusy ? "…" : "⬆ Файл"}<input type="file" accept="video/*" disabled={upBusy} onChange={e => { const file = e.target.files?.[0]; if (file) uploadVideo(file); e.target.value = ""; }} style={{ display: "none" }} /></label>
                  </div>
                )}
              </div>
              <div>
                {lbl("Обложка (необязательно)")}
                {f.video_thumbnail_url ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 96, height: 128, borderRadius: 10, overflow: "hidden", border: "1px solid var(--brd)", background: "var(--v2-inset)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--t3)", textAlign: "center" }}>
                      <img src={f.video_thumbnail_url} alt="обложка" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.parentElement as HTMLElement).textContent = "картинка есть, превью не грузится"; }} />
                    </div>
                    {!locked && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label className="v2-act ghost" style={{ cursor: "pointer" }}>Заменить<input type="file" accept="image/*" disabled={upBusy} onChange={e => { const file = e.target.files?.[0]; if (file) uploadCover(file); e.target.value = ""; }} style={{ display: "none" }} /></label>
                      <button className="v2-act ghost" style={{ color: "var(--rd)" }} onClick={() => save({ video_thumbnail_url: null })}><Trash2 size={12} /> Убрать</button>
                    </div>}
                  </div>
                ) : (
                  <>
                    <div className="v2-hint" style={{ marginBottom: 8 }}>Если не задать, соцсеть возьмёт первый кадр. Вертикальная 1080×1920.</div>
                    {!locked && <label className="v2-act ghost" style={{ cursor: "pointer" }}>{upBusy ? "…" : "⬆ Загрузить обложку"}<input type="file" accept="image/*" disabled={upBusy} onChange={e => { const file = e.target.files?.[0]; if (file) uploadCover(file); e.target.value = ""; }} style={{ display: "none" }} /></label>}
                  </>
                )}
              </div>
            </div>
          )}
        </Step>

        {/* ---- ② когда и куда ---- */}
        <Step n={2} title="Когда и куда">
          <div className="pub-when">
            <div>
              {lbl(`Время публикации · ${tzShort(tz)}`)}
              <input type="datetime-local" key={f.publish_at || "none"} defaultValue={utcToZonedInput(f.publish_at, tz)} disabled={locked || isScheduled}
                onBlur={e => save({ publish_at: e.target.value ? zonedInputToUtc(e.target.value, tz) : null })}
                style={{ ...ta, padding: "9px 10px", colorScheme: "dark", opacity: locked || isScheduled ? .6 : 1 }} />
              <div className="v2-hint" style={{ marginTop: 5 }}>сейчас у клиента {nowInTz(tz)}{f.publish_at ? ` · выйдет ${fmtInTz(f.publish_at, tz)}` : ""}</div>
              {f.publish_at && pastBy > 10 && !isPublished && <div className="v2-chip rd" style={{ marginTop: 6 }}><AlertTriangle size={11} /> время уже прошло{isScheduled ? "" : " — Metricool опубликует сразу"}</div>}
              {!locked && !isScheduled && planIso && planIso !== f.publish_at && (
                <button className="v2-act ghost" style={{ marginTop: 8, height: 30 }} onClick={() => save({ publish_at: planIso })}>По контент-плану: {fmtInTz(planIso, tz)}</button>
              )}
            </div>
            <div>
              {lbl("Соцсети")}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {CHANNELS.filter(c => allowedChannels.includes(c.id)).map(c => { const on = channels.includes(c.id); const sent = !!ids[c.id]; return (
                  <button key={c.id} onClick={() => toggleChan(c.id)} disabled={locked || isScheduled} className={`v2-chip ${on ? "pu" : "mut"}`} style={{ height: 34, padding: "0 12px", cursor: locked || isScheduled ? "default" : "pointer", opacity: on ? 1 : .6 }}>
                    {on ? <Check size={12} /> : null}<c.Icon size={13} /> {c.label}{sent ? " · ушло" : ""}
                  </button>
                ); })}
              </div>
              <div className="v2-hint" style={{ marginTop: 6 }}>{channels.length ? `Уйдёт в: ${channels.map(x => CHANNELS.find(c => c.id === x)?.short).join(" · ")}` : "Ни одна соцсеть не выбрана"}{isScheduled ? " · чтобы поменять, переотправь" : ""}</div>
            </div>
          </div>
        </Step>

        {/* ---- ③ тексты ---- */}
        <Step n={3} title="Тексты" right={!locked ? <button onClick={async () => { setBusy(true); await onRegenerate(pub.id); setBusy(false); }} disabled={busy} className="v2-act"><Wand2 size={13} /> {busy ? "Генерю…" : f.ai_generated_at ? "Сгенерить заново" : "Сгенерить под соцсети (AI)"}</button> : null}>
          {lbl(isCarousel ? "Основа подписи" : "Исходный текст (из сценария)")}
          <textarea key={`base-${f.ai_generated_at || ""}-${f.base_text ? 1 : 0}`} defaultValue={f.base_text || ""} onBlur={e => save({ base_text: e.target.value })} rows={5} disabled={locked} style={ta} placeholder="Основной текст — из него AI делает отдельные подписи под каждую сеть. Если пусто, при генерации подтянется из сценария." />
          <div className="v2-stabs" style={{ marginTop: 12 }}>
            {CHANNELS.filter(c => allowedChannels.includes(c.id)).map(c => { const on = channels.includes(c.id); const txt = c.id === "ig" ? f.caption_ig : c.id === "tt" ? f.caption_tt : c.id === "yt" ? f.yt_description : f.threads_post; const n = (txt || "").length; return (
              <button key={c.id} className={tab === c.id ? "on" : ""} onClick={() => setTab(c.id)} style={{ opacity: on ? 1 : .45 }}>
                <c.Icon size={13} /> {c.label}<span className="cnt" style={n > c.limit ? { color: "var(--rd)" } : undefined}>{on ? (n ? `${n}` : "пусто") : "выкл"}</span>
              </button>
            ); })}
          </div>
          {(() => {
            const c = CHANNELS.find(x => x.id === tab)!; const on = channels.includes(tab);
            const gk = `${tab}-${f.ai_generated_at || ""}`; // после генерации поля перемонтируются с новым текстом
            const counter = (n: number, lim: number) => <span style={{ fontSize: 11, color: n > lim ? "var(--rd)" : "var(--t3)", fontWeight: 700 }}>{n} / {lim}</span>;
            if (!on) return <div className="v2-hint">Эта соцсеть выключена для публикации. Включи её в шаге 2.</div>;
            if (tab === "yt") return (
              <div key={gk} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div><div style={{ display: "flex", justifyContent: "space-between" }}>{lbl("Заголовок YouTube")}{counter((f.yt_title || "").length, 100)}</div><input defaultValue={f.yt_title || ""} disabled={locked} onBlur={e => save({ yt_title: e.target.value })} style={{ ...ta, fontSize: 13 }} placeholder="Обязателен для YouTube" /></div>
                <div>{lbl("Описание")}<textarea defaultValue={f.yt_description || ""} disabled={locked} onBlur={e => save({ yt_description: e.target.value })} rows={4} style={ta} /></div>
                <div>{lbl("Теги через запятую")}<input defaultValue={(f.yt_tags || []).join(", ")} disabled={locked} onBlur={e => save({ yt_tags: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} style={{ ...ta, fontSize: 12 }} /></div>
              </div>
            );
            if (tab === "threads") return <div key={gk}><div style={{ display: "flex", justifyContent: "space-between" }}>{lbl("Пост Threads")}{counter((f.threads_post || "").length, 500)}</div><textarea defaultValue={f.threads_post || ""} disabled={locked} onBlur={e => save({ threads_post: e.target.value })} rows={5} style={ta} /></div>;
            const val = tab === "ig" ? f.caption_ig : f.caption_tt;
            return <div key={gk}><div style={{ display: "flex", justifyContent: "space-between" }}>{lbl(`Подпись ${c.label}`)}{counter((val || "").length, c.limit)}</div><textarea defaultValue={val || ""} disabled={locked} onBlur={e => save(tab === "ig" ? { caption_ig: e.target.value } : { caption_tt: e.target.value })} rows={6} style={ta} placeholder={`Если пусто — уйдёт исходный текст`} /></div>;
          })()}
        </Step>

        {/* ---- футер ---- */}
        <div style={{ position: "sticky", bottom: 0, background: "var(--side)", borderTop: "1px solid var(--brd)", margin: "0 -18px", padding: "12px 18px calc(14px + env(safe-area-inset-bottom))", borderRadius: "0 0 18px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          {f.error_message && <div className="v2-chip rd" style={{ whiteSpace: "normal", alignSelf: "flex-start", lineHeight: 1.4 }}><AlertTriangle size={12} /> {f.error_message}</div>}
          {sentCount > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 700 }}>В Metricool:</span>
              {(statuses || Object.entries(ids).map(([ch, id]) => ({ ch, id, status: null, error: null, url: null }))).map(s => (
                <span key={s.id} className={`v2-chip ${chipFor(s.status)}`} title={s.error || s.id}>
                  {CHANNELS.find(c => c.id === s.ch)?.short || s.ch}{s.status ? ` · ${String(s.status).toLowerCase()}` : ""}{s.url ? <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "inherit", marginLeft: 4 }}>↗</a> : null}
                </span>
              ))}
              <button className="v2-act ghost" style={{ height: 28 }} onClick={checkStatus} disabled={statusBusy}><RefreshCw size={12} className={statusBusy ? "spin" : ""} /> {statusBusy ? "Проверяю…" : "Проверить статус"}</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--t3)", flex: 1, minWidth: 120 }}>{isPublished ? "Опубликовано, правки закрыты" : isScheduled ? "Запланировано. Повторная отправка не создаст дубли" : f.ai_model ? `AI: ${f.ai_model}` : ""}</span>
            {isPublished ? (<>
                <span className="v2-act gr" style={{ cursor: "default" }}><Check size={14} /> Опубликовано</span>
                <button className="v2-act ghost" onClick={reopen} title="Вернуть в «Готово к публикации», чтобы отправить заново"><RefreshCw size={13} /> Переопубликовать</button>
              </>)
              : isScheduled ? (<>
                <span className="v2-act gr" style={{ cursor: "default" }}><Check size={14} /> Запланировано</span>
                <button className="v2-act ghost" onClick={() => publish({ force: true })} disabled={pubBusy}><RefreshCw size={13} /> {pubBusy ? "…" : "Переотправить"}</button>
              </>) : (<>
                {sentCount > 0 && <button className="v2-act ghost" onClick={() => publish({ force: true })} disabled={pubBusy}>Переотправить всё</button>}
                <button className="v2-act pri" onClick={() => publish()} disabled={pubBusy || !channels.length} style={{ height: 40 }}><Rocket size={14} /> {pubBusy ? "Отправляю…" : sentCount > 0 ? "Дослать недостающие" : `Опубликовать в ${service}`}</button>
              </>)}
          </div>
        </div>
      </div>
      <style>{`.pub-media{display:grid;grid-template-columns:1fr 200px;gap:14px}.pub-when{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:640px){.pub-media,.pub-when{grid-template-columns:1fr}}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
