"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { notify } from "@/components/NoticeHost";
import { when } from "./files";
import { btn } from "./DocsSection";
import { UNPACK_GROUPS, UNPACK_FIELDS, unpackingToText, filledCount, type Unpacking } from "@/lib/forecast";

/*
 * Распаковка клиента: тимлид отвечает на вопросы о бизнесе, воронке, аудитории и пакете.
 * По ней (вместе с цифрами профиля и «Нашими цифрами») ИИ делает прогноз. Пустые поля — нормально:
 * ИИ перечислит, чего не хватает, и посчитает с пометкой «допущение».
 * Каждое сохранение — новая версия (client_documents, kind = unpacking).
 */
type Doc = { id: number; version: number; is_current: boolean; data: Unpacking | null; author_name: string | null; created_at: string; note: string | null };

export default function UnpackingSection({ clientId }: { clientId: number }) {
  const supabase = createClient();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Unpacking>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function load() {
    const { data } = await supabase.from("client_documents").select("id, version, is_current, data, author_name, created_at, note")
      .eq("client_id", clientId).eq("kind", "unpacking").order("version", { ascending: false });
    const rows = (data ?? []) as Doc[];
    setDocs(rows);
    const cur = rows.find(d => d.is_current) ?? rows[0];
    setForm(cur?.data ?? {}); setDirty(false);
    setLoading(false);
  }
  useEffect(() => { load(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id: string, v: string) => { setForm(f => ({ ...f, [id]: v })); setDirty(true); };
  const current = docs.find(d => d.is_current) ?? docs[0];

  async function save() {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tm } = user ? await supabase.from("team_members").select("name").eq("profile_id", user.id).maybeSingle() : { data: null };
      const clean: Unpacking = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v || "").trim()]).filter(([, v]) => v));
      const nextVersion = (docs[0]?.version ?? 0) + 1;
      if (docs.length) await supabase.from("client_documents").update({ is_current: false }).eq("client_id", clientId).eq("kind", "unpacking");
      const { error } = await supabase.from("client_documents").insert({
        client_id: clientId, kind: "unpacking", version: nextVersion, is_current: true,
        title: `Распаковка · версия ${nextVersion}`, body: unpackingToText(clean), data: clean,
        note: note.trim() || null, created_by: user?.id ?? null, author_name: tm?.name || user?.email?.split("@")[0] || "команда",
      });
      if (error) throw error;
      setNote("");
      notify(`Распаковка сохранена — версия ${nextVersion}`);
      await load();
    } catch (e: any) { notify(`Не сохранилось: ${e.message ?? e}`); }
    finally { setBusy(false); }
  }

  if (loading) return <p style={{ color: "var(--t3)", fontSize: 13 }}>Загружаю…</p>;
  const filled = filledCount(form);

  const inp: React.CSSProperties = { width: "100%", background: "var(--v2-inset)", color: "var(--t1)", border: "1px solid var(--brd)",
    borderRadius: 10, padding: "9px 12px", fontSize: 13.5, lineHeight: 1.5, fontFamily: "inherit", resize: "vertical", outline: "none" };

  return (
    <div>
      <p style={{ color: "var(--t3)", fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
        Ответы клиента о бизнесе, воронке и аудитории. По ним и цифрам профиля ИИ делает прогноз на 3 месяца работы.
        Не знаете ответа — оставьте пустым: ИИ перечислит, что спросить у клиента, и посчитает с пометкой «допущение».
      </p>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className={`v2-chip ${filled >= 14 ? "gr" : filled >= 8 ? "pu" : "mut"}`}>заполнено {filled} из {UNPACK_FIELDS.length}</span>
        {current && <small style={{ color: "var(--t3)", fontSize: 11.5 }}>версия {current.version} · {current.author_name ?? "—"} · {when(current.created_at)}</small>}
        {dirty && <span className="v2-chip or">есть несохранённые изменения</span>}
      </div>

      {UNPACK_GROUPS.map((g) => (
        <div key={g.title} className="v2-card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--pu)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>{g.title}</div>
          <div style={{ display: "grid", gap: 12 }}>
            {g.fields.map((f) => {
              const n = UNPACK_FIELDS.indexOf(f) + 1;
              const v = form[f.id] || "";
              return (
                <label key={f.id} style={{ display: "block" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--t1)", marginBottom: 5 }}>
                    <span style={{ color: "var(--t3)", marginRight: 6 }}>{n}.</span>{f.label}
                    {!v.trim() && <span style={{ color: "var(--t3)", fontWeight: 500, marginLeft: 6 }}>· пусто</span>}
                  </div>
                  {f.options ? (
                    <div className="flex gap-2 flex-wrap">
                      {f.options.map((o) => (
                        <button key={o} type="button" onClick={() => set(f.id, v === o ? "" : o)} className={`v2-chip ${v === o ? "pu" : "mut"}`}
                          style={{ cursor: "pointer", height: 30, padding: "0 12px" }}>{o}</button>
                      ))}
                    </div>
                  ) : f.short ? (
                    <input value={v} onChange={(e) => set(f.id, e.target.value)} placeholder={f.hint} style={inp} />
                  ) : (
                    <textarea value={v} onChange={(e) => set(f.id, e.target.value)} placeholder={f.hint} rows={2} style={inp} />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <div className="v2-card" style={{ padding: 12, position: "sticky", bottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Что поменяли — коротко, для истории (необязательно)"
          style={{ ...inp, flex: 1, minWidth: 220, resize: undefined }} />
        <button className="v2-act" style={btn(true)} disabled={busy || !dirty} onClick={save}>{busy ? "Сохраняю…" : "Сохранить версию"}</button>
      </div>

      {docs.length > 1 && (
        <div className="v2-sec" style={{ marginTop: 16 }}>
          <div className="v2-sec-h">История <span className="cnt">{docs.length}</span></div>
          {docs.map((d) => (
            <div key={d.id} className="v2-card"><div className="meta">
              <small style={{ color: d.is_current ? "var(--gr)" : "var(--t3)" }}>в.{d.version}{d.is_current ? " · актуальная" : ""}</small>
              <small>{d.author_name ?? "—"}</small><small>{when(d.created_at)}</small>
              <small>заполнено {filledCount(d.data || {})}</small>
              {d.note && <small style={{ color: "var(--t2)" }}>· {d.note}</small>}
            </div></div>
          ))}
        </div>
      )}
    </div>
  );
}
