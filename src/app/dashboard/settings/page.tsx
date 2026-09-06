"use client";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { createClient } from "@/lib/supabase-browser";
import { useIsOwner } from "@/components/RoleContext";
import { AI_FEATURES, AI_MODEL_OPTIONS, type AiFeature } from "@/lib/aiModels";
import { Sun, Moon, Sparkles } from "lucide-react";

export default function SettingsPage() {
  const { theme, toggle } = useTheme();
  const supabase = createClient();
  const isOwner = useIsOwner();
  const [models, setModels] = useState<Partial<Record<AiFeature, string>>>({});
  const [tableMissing, setTableMissing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => { (async () => {
    const { data, error } = await supabase.from("app_settings").select("key, value").like("key", "ai_model.%");
    if (error) { setTableMissing(true); return; }
    const m: any = {};
    for (const r of data || []) m[String(r.key).replace("ai_model.", "")] = r.value;
    setModels(m);
  })(); }, []);

  async function setModel(f: AiFeature, id: string) {
    setModels(m => ({ ...m, [f]: id }));
    const { error } = await supabase.from("app_settings").upsert({ key: `ai_model.${f}`, value: id, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) alert("Не сохранилось: " + error.message);
    else { setSaved(f); setTimeout(() => setSaved(null), 1500); }
  }

  return (
    <div className="v2" style={{ maxWidth: 720 }}>
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
    </div>
  );
}
