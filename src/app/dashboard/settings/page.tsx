"use client";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { createClient } from "@/lib/supabase-browser";
import { useIsOwner } from "@/components/RoleContext";
import { AI_FEATURES, AI_MODEL_OPTIONS, type AiFeature } from "@/lib/aiModels";
import { PROMPT_FIELDS, PROMPT_KEYS } from "@/lib/adapterPrompts";
import { Sun, Moon, Sparkles } from "lucide-react";

export default function SettingsPage() {
  const { theme, toggle } = useTheme();
  const supabase = createClient();
  const isOwner = useIsOwner();
  const [models, setModels] = useState<Partial<Record<AiFeature, string>>>({});
  const [tableMissing, setTableMissing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [promptSaved, setPromptSaved] = useState<string | null>(null);

  useEffect(() => { (async () => {
    const { data, error } = await supabase.from("app_settings").select("key, value");
    if (error) { setTableMissing(true); return; }
    const m: any = {}, pr: Record<string, string> = {};
    for (const r of data || []) {
      if (String(r.key).startsWith("ai_model.")) m[String(r.key).replace("ai_model.", "")] = r.value;
      if (String(r.key).startsWith("prompt.")) pr[String(r.key)] = r.value || "";
    }
    setModels(m); setPrompts(pr);
  })(); }, []);

  async function setModel(f: AiFeature, id: string) {
    setModels(m => ({ ...m, [f]: id }));
    const { error } = await supabase.from("app_settings").upsert({ key: `ai_model.${f}`, value: id, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) alert("Не сохранилось: " + error.message);
    else { setSaved(f); setTimeout(() => setSaved(null), 1500); }
  }

  async function savePrompt(key: string, value: string) {
    setPrompts(p => ({ ...p, [key]: value }));
    const { error } = await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) alert("Не сохранилось: " + error.message);
    else { setPromptSaved(key); setTimeout(() => setPromptSaved(null), 1500); }
  }

  return (
    <div className="v2" style={{ maxWidth: 820 }}>
      <div className="v2-hdr"><div><h1>Настройки</h1><p>Интерфейс и AI</p></div></div>

      <div className="v2-fg" style={{ marginBottom: 14 }}>
        <h4>Интерфейс</h4>
        <div className="v2-fr">
          <span>Тема</span>
          <button className="v2-act ghost" onClick={toggle}>{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />} {theme === "dark" ? "Переключить на светлую" : "Переключить на тёмную"}</button>
        </div>
      </div>

      <div className="v2-fg">
        <h4><Sparkles size={12} style={{ verticalAlign: -2, marginRight: 4 }} /> AI-модели</h4>
        {tableMissing ? (
          <div className="v2-hint" style={{ color: "var(--or)" }}>Таблица настроек ещё не создана — прогони <code>MIGRATION_2026-09-06_app_settings.sql</code> в Supabase. Пока действуют модели по умолчанию.</div>
        ) : (
          <>
            {AI_FEATURES.map(f => {
              const cur = models[f.key] || f.def;
              const opt = AI_MODEL_OPTIONS.find(o => o.id === cur);
              return (
                <div key={f.key} className="v2-fr" style={{ alignItems: "flex-start" }}>
                  <div><span style={{ display: "block" }}>{f.label}</span><div className="v2-hint">{f.hint}</div></div>
                  <div style={{ textAlign: "right" }}>
                    <select value={cur} disabled={!isOwner} onChange={e => setModel(f.key, e.target.value)}
                      style={{ padding: "7px 10px", borderRadius: 8, background: "var(--inp)", border: `1px solid ${saved === f.key ? "var(--gr)" : "var(--brd)"}`, color: "var(--t1)", fontSize: 13, cursor: isOwner ? "pointer" : "default" }}>
                      {AI_MODEL_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <div className="v2-hint">{saved === f.key ? "✓ сохранено" : opt?.note || cur}</div>
                  </div>
                </div>
              );
            })}
            <div className="v2-hint" style={{ marginTop: 8 }}>Применяется сразу, без пересборки (сервер обновляет кэш до минуты). Менять может владелец. Цены: вход / выход за миллион токенов.</div>
          </>
        )}
      </div>

      <div className="v2-fg" style={{ marginTop: 14 }}>
        <h4>Промпты для подписей под соцсети</h4>
        <div className="v2-hint" style={{ marginBottom: 10 }}>Что AI получает как инструкцию, когда в «Публикациях» нажимают «Сгенерить тексты». Общие правила + отдельный блок под каждую сеть. Пусто = стандартный текст. Тон голоса клиента подставляется из его карточки автоматически.</div>
        {tableMissing ? <div className="v2-hint" style={{ color: "var(--or)" }}>Нужна та же миграция app_settings.</div> : PROMPT_FIELDS.map(fld => {
          const key = PROMPT_KEYS[fld.key]; const cur = prompts[key] ?? "";
          return (
            <div key={key} style={{ padding: "10px 0", borderTop: "1px solid var(--brd)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <b style={{ fontSize: 13 }}>{fld.label}</b>
                <span className="v2-hint" style={{ margin: 0 }}>{fld.hint}</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                  {promptSaved === key && <span className="v2-chip gr">✓ сохранено</span>}
                  {cur ? <span className="v2-chip pu">свой текст</span> : <span className="v2-chip mut">стандартный</span>}
                  {cur && isOwner && <button className="v2-act ghost" style={{ height: 28 }} onClick={() => savePrompt(key, "")}>Вернуть стандартный</button>}
                </span>
              </div>
              <textarea key={`${key}-${cur ? 1 : 0}`} defaultValue={cur || fld.def} rows={fld.rows} disabled={!isOwner}
                onBlur={e => { const v = e.target.value.trim(); if (v !== (cur || fld.def).trim()) savePrompt(key, v === fld.def.trim() ? "" : v); }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 9, background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 12.5, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
