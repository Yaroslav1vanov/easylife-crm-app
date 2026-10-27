"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { ENGINES, videoLimit, type ClientAvatar } from "@/lib/avatar";
import { Plus, Trash2, Check, RefreshCw, Loader2 } from "lucide-react";
import LookPicker, { LookCard } from "./LookPicker";

/* «Настройки» → «Аватар HeyGen». Какой аватар закреплён за клиентом: исполнитель генерирует только
   из этих луков и этим голосом (проверка кодом на сервере). Менять привязку может только владелец,
   словарь произношения дополняют все, удаляет только владелец. */

const sel: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 13, outline: "none", maxWidth: "100%" };
type Look = { id: string; name: string };
type Dict = { id: number; written: string; spoken: string; note: string | null };

export default function AvatarSettings({ clientId, avatar, isOwner, clientPackage, onSaved }: {
  clientId: number; avatar: ClientAvatar | null; isOwner: boolean; clientPackage?: number | null; onSaved: (a: ClientAvatar | null) => void;
}) {
  const supabase = createClient();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [dict, setDict] = useState<Dict[]>([]);
  const [nw, setNw] = useState({ written: "", spoken: "" });
  const [syncing, setSyncing] = useState(false);
  const groupLooks = avatar?.group_looks || [];
  async function syncLooks() {
    setSyncing(true);
    const r = await fetch("/api/avatar/sync-looks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId }) });
    const j = await r.json().catch(() => ({}));
    setSyncing(false);
    alert(r.ok ? "Задача ушла в чат «Аватар»: ИИ заберёт образы с картинками (1–3 минуты, кредиты не тратятся). Потом обновите страницу." : j.error || `ошибка ${r.status}`);
  }

  async function loadDict() {
    const { data } = await supabase.from("client_avatar_dictionary").select("id, written, spoken, note").eq("client_id", clientId).order("written");
    setDict((data || []) as Dict[]);
  }
  useEffect(() => { if (avatar) loadDict(); }, [clientId, !!avatar]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit() {
    const a = avatar;
    setF({
      heygen_group_id: a?.heygen_group_id || "", voice_id: a?.voice_id || "", voice_model: a?.voice_model || "eleven_v4",
      engine: a?.engine || "avatar_v", language: a?.language || "ru", voice_speed: a?.voice_speed ?? 1, trim_silence: a?.trim_silence ?? true,
      monthly_limit: a?.monthly_limit ?? "",
      looks: (a?.look_ids || []).map((id) => ({ id, name: a?.look_names?.[id] || "" })) as Look[],
      default_look_id: a?.default_look_id || "",
    });
    setErr(""); setEdit(true);
  }

  async function save() {
    const looks = (f.looks as Look[]).map((l) => ({ id: l.id.trim(), name: l.name.trim() })).filter((l) => l.id);
    if (!f.heygen_group_id.trim()) return setErr("Нужен id группы аватара");
    if (!looks.length) return setErr("Нужен хотя бы один лук");
    const def = looks.some((l) => l.id === f.default_look_id) ? f.default_look_id : looks[0].id;
    setSaving(true); setErr("");
    const row = {
      client_id: clientId, heygen_group_id: f.heygen_group_id.trim(), look_ids: looks.map((l) => l.id), default_look_id: def,
      look_names: Object.fromEntries(looks.map((l) => [l.id, l.name || l.id.slice(0, 8)])), voice_id: f.voice_id.trim() || null,
      voice_model: f.voice_model.trim() || "eleven_v4", engine: f.engine, language: f.language, voice_speed: Number(f.voice_speed) || 1,
      trim_silence: !!f.trim_silence, monthly_limit: f.monthly_limit === "" ? null : Number(f.monthly_limit) || null, updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("client_avatars").upsert(row).select("*").single();
    setSaving(false);
    if (error) return setErr(error.message);
    onSaved(data as ClientAvatar); setEdit(false);
  }

  async function addWord() {
    if (!nw.written.trim() || !nw.spoken.trim()) return;
    const { error } = await supabase.from("client_avatar_dictionary").insert({ client_id: clientId, written: nw.written.trim(), spoken: nw.spoken.trim() });
    if (error) { alert(/duplicate|unique/i.test(error.message) ? "Это слово уже есть в словаре" : error.message); return; }
    setNw({ written: "", spoken: "" }); loadDict();
  }
  async function delWord(d: Dict) {
    if (!confirm(`Убрать «${d.written}» из словаря?`)) return;
    const { error } = await supabase.from("client_avatar_dictionary").delete().eq("id", d.id);
    if (error) alert(error.message); else loadDict();
  }

  if (!avatar && !isOwner) return null;

  return (
    <div style={{ marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid rgba(66,212,244,.35)", background: "rgba(66,212,244,.05)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: 13.5 }}>🧑‍💼 Аватар HeyGen</b>
        <span style={{ fontSize: 11.5, color: "var(--t3)" }}>{avatar ? "чат «Аватар» включён" : "не привязан"}</span>
        <div style={{ flex: 1 }} />
        {isOwner && !edit && avatar && <button className="v2-act ghost" style={{ height: 30, fontSize: 12 }} disabled={syncing} onClick={syncLooks} title="Забрать все образы группы с картинками. Только просмотр, кредиты не тратятся">
          {syncing ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} Обновить образы из HeyGen</button>}
        {isOwner && !edit && <button className="v2-act ghost" style={{ height: 30, fontSize: 12 }} onClick={startEdit}>{avatar ? "Изменить" : "Привязать аватар"}</button>}
      </div>

      {!edit && avatar && (
        <div style={{ fontSize: 12.5, color: "var(--t2)", display: "grid", gap: 4 }}>
          <div>Разрешённые образы ({avatar.look_ids.length}){groupLooks.length ? ` из ${groupLooks.length} в группе` : ""}:</div>
          <LookPicker avatar={avatar} value="" onChange={() => {}} readOnly />
          <div>Голос: <code>{avatar.voice_id?.slice(0, 10) || "—"}</code> · {avatar.voice_model} · {avatar.language} · скорость {avatar.voice_speed}x{avatar.trim_silence ? " · обрезать тишину" : ""}</div>
          <div>Видео: {ENGINES.find((e) => e.id === avatar.engine)?.label || avatar.engine} · {avatar.aspect} · {avatar.resolution} · лимит {videoLimit(avatar, clientPackage)} видео в месяц{avatar.monthly_limit ? "" : " (по пакету)"}</div>
        </div>
      )}

      {edit && f && (
        <div style={{ display: "grid", gap: 8, fontSize: 12.5 }}>
          <label>Группа аватара (id из HeyGen) <input style={{ ...sel, width: "100%" }} value={f.heygen_group_id} onChange={(e) => setF({ ...f, heygen_group_id: e.target.value })} /></label>
          {groupLooks.length > 0 && (
            <div>
              <div style={{ marginBottom: 6 }}>Нажмите на образ, чтобы разрешить или убрать (3–5 основных). ★ — сделать основным.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, maxHeight: 420, overflowY: "auto", padding: 2 }}>
                {groupLooks.map((g) => {
                  const on = (f.looks as Look[]).some((l) => l.id === g.id);
                  return (
                    <div key={g.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <LookCard look={g} width={130} title={g.name && g.name !== "Photo Avatar" ? g.name : "Без названия"} active={on} main={on && f.default_look_id === g.id} dim={!on}
                        onClick={() => setF({ ...f, looks: on ? f.looks.filter((l: Look) => l.id !== g.id) : [...f.looks, { id: g.id, name: g.name && g.name !== "Photo Avatar" ? g.name : "" }],
                          default_look_id: on && f.default_look_id === g.id ? "" : f.default_look_id })} />
                      {on && f.default_look_id !== g.id && <button className="v2-act ghost" style={{ height: 22, fontSize: 10.5, padding: "0 6px" }} onClick={() => setF({ ...f, default_look_id: g.id })}>★ основной</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div>{groupLooks.length ? "Выбранные образы (название можно поменять):" : "Разрешённые луки (3–5 основных; ● — по умолчанию). Картинки появятся после «Обновить образы из HeyGen»:"}
            {(f.looks as Look[]).map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginTop: 5, alignItems: "center" }}>
                <input type="radio" checked={f.default_look_id === l.id} onChange={() => setF({ ...f, default_look_id: l.id })} title="по умолчанию" />
                <input style={{ ...sel, flex: 1 }} placeholder="id лука" value={l.id} onChange={(e) => { const looks = [...f.looks]; looks[i] = { ...l, id: e.target.value }; setF({ ...f, looks }); }} />
                <input style={{ ...sel, flex: 1 }} placeholder="название" value={l.name} onChange={(e) => { const looks = [...f.looks]; looks[i] = { ...l, name: e.target.value }; setF({ ...f, looks }); }} />
                <button className="v2-act ghost" style={{ height: 30, padding: "0 8px" }} onClick={() => setF({ ...f, looks: f.looks.filter((_: Look, j: number) => j !== i) })}><Trash2 size={13} /></button>
              </div>
            ))}
            <button className="v2-act ghost" style={{ height: 28, fontSize: 12, marginTop: 5 }} onClick={() => setF({ ...f, looks: [...f.looks, { id: "", name: "" }] })}><Plus size={12} /> лук</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label>Голос (voice_id) <input style={sel} value={f.voice_id} onChange={(e) => setF({ ...f, voice_id: e.target.value })} /></label>
            <label>Модель <input style={{ ...sel, width: 110 }} value={f.voice_model} onChange={(e) => setF({ ...f, voice_model: e.target.value })} /></label>
            <label>Язык <select style={sel} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}><option value="ru">ru</option><option value="uk">uk</option><option value="en">en</option></select></label>
            <label>Скорость <input type="number" step="0.05" min="0.7" max="1.5" style={{ ...sel, width: 80 }} value={f.voice_speed} onChange={(e) => setF({ ...f, voice_speed: e.target.value })} /></label>
            <label style={{ display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={f.trim_silence} onChange={(e) => setF({ ...f, trim_silence: e.target.checked })} /> обрезать тишину</label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label>Движок видео <select style={sel} value={f.engine} onChange={(e) => setF({ ...f, engine: e.target.value })}>{ENGINES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
            <label>Видео в месяц <input type="number" style={{ ...sel, width: 90 }} placeholder={String(videoLimit(null, clientPackage))} value={f.monthly_limit} onChange={(e) => setF({ ...f, monthly_limit: e.target.value })} /></label>
          </div>
          {err && <div style={{ color: "var(--rd)" }}>{err}</div>}
          <div style={{ display: "flex", gap: 6 }}>
            <button className="v2-act pri" style={{ height: 32 }} disabled={saving} onClick={save}><Check size={13} /> {saving ? "Сохраняю…" : "Сохранить"}</button>
            <button className="v2-act ghost" style={{ height: 32 }} onClick={() => setEdit(false)}>Отмена</button>
          </div>
          <div className="v2-hint">id групп, луков и голоса — из HeyGen. Выбор из списка с превью появится после подключения HeyGen к серверу.</div>
        </div>
      )}

      {avatar && (
        <div style={{ display: "grid", gap: 5, fontSize: 12.5 }}>
          <b style={{ fontSize: 12.5 }}>Словарь произношения</b>
          <div className="v2-hint" style={{ marginTop: -3 }}>Как написано → как озвучивать: имена, бренды, термины, ударения. ИИ применяет перед каждой озвучкой.</div>
          {dict.map((d) => (
            <div key={d.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span>{d.written}</span><span style={{ color: "var(--t3)" }}>→</span><b>{d.spoken}</b>
              {isOwner && <button onClick={() => delWord(d)} title="Удалить (только Ярослав)" style={{ marginLeft: "auto", background: "none", border: 0, color: "var(--t3)", cursor: "pointer" }}><Trash2 size={12} /></button>}
            </div>
          ))}
          <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...sel, flex: 1 }} placeholder="как написано (Laccura)" value={nw.written} onChange={(e) => setNw({ ...nw, written: e.target.value })} />
            <input style={{ ...sel, flex: 1 }} placeholder="как сказать (Лакура)" value={nw.spoken} onChange={(e) => setNw({ ...nw, spoken: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") addWord(); }} />
            <button className="v2-act ghost" style={{ height: 32 }} onClick={addWord}><Plus size={13} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
