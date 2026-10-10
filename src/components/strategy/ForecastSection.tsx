"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { notify } from "@/components/NoticeHost";
import { fileUrl, when } from "./files";
import { btn } from "./DocsSection";
import { FORECAST_STATUS, type ForecastStatus } from "@/lib/forecast";

/*
 * Прогноз-стратегия: кнопка отправляет задачу ИИ в чат «Стратегия». ИИ берёт распаковку, снимок профиля
 * (подписчики, последние 30 роликов из Metricool), аудит и «Наши цифры» и отдаёт документ для клиента
 * (HTML + PDF) и цифры для CRM. Каждый прогноз — новая версия: черновик → проверен тимлидом → согласован.
 * Первые прогнозы перед отправкой клиенту смотрит Ярослав.
 */
type Doc = { id: number; version: number; is_current: boolean; title: string; file_key: string | null; data: any; status: string | null; author_name: string | null; created_at: string };

const ASK = "📈 Сделай прогноз-стратегию по FORECAST.md: распаковка (UNPACKING.md) + снимок профиля (PROFILE.md) + аудит + «Наши цифры» (BENCHMARKS.md). "
  + "Отдай forecast.html и forecast.json, в ответе — тип аккаунта, цель, главные риски и что спросить у клиента.";

export default function ForecastSection({ clientId }: { clientId: number }) {
  const supabase = createClient();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"queued" | "working" | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data }, { data: q }] = await Promise.all([
      supabase.from("client_documents").select("id, version, is_current, title, file_key, data, status, author_name, created_at")
        .eq("client_id", clientId).eq("kind", "forecast").order("version", { ascending: false }),
      supabase.from("client_chat_messages").select("ai_status").eq("client_id", clientId).eq("thread", "strategy")
        .like("body", "📈 Сделай прогноз%").in("ai_status", ["queued", "working"]).limit(1),
    ]);
    setDocs((data ?? []) as Doc[]);
    setPending(((q || [])[0]?.ai_status as any) || null);
    setLoading(false);
  }
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 15000);
    return () => clearInterval(t);
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ask() {
    setBusy(true);
    try {
      const { data: c } = await supabase.from("clients").select("ai_chat").eq("id", clientId).maybeSingle();
      if (!c?.ai_chat) { notify("У клиента выключен ИИ: «Настройки» карточки → «ИИ-монтажёр в чате»"); return; }
      const { count } = await supabase.from("client_documents").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("kind", "unpacking");
      if (!count && !confirm("Распаковки ещё нет — прогноз будет почти целиком на допущениях. Всё равно сделать?")) return;
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tm } = user ? await supabase.from("team_members").select("name").eq("profile_id", user.id).maybeSingle() : { data: null };
      const { error } = await supabase.from("client_chat_messages").insert({
        client_id: clientId, thread: "strategy", author_type: "user", author_id: user?.id ?? null,
        author_name: tm?.name || user?.email?.split("@")[0] || "Сотрудник", ai_status: "queued", attachments: [], body: ASK,
      });
      if (error) throw error;
      notify("Задача у ИИ. Прогноз появится здесь через 10–20 минут, обсуждение — в «Чат · ИИ» → «Стратегия».");
      await load();
    } catch (e: any) { notify(`Не отправилось: ${e.message ?? e}`); }
    finally { setBusy(false); }
  }

  async function setStatus(d: Doc, status: ForecastStatus) {
    const { error } = await supabase.from("client_documents").update({ status }).eq("id", d.id);
    if (error) return notify(`Не сохранилось: ${error.message}`);
    setDocs(arr => arr.map(x => x.id === d.id ? { ...x, status } : x));
  }

  if (loading) return <p style={{ color: "var(--t3)", fontSize: 13 }}>Загружаю…</p>;
  const cur = docs.find(d => d.is_current) ?? docs[0];

  return (
    <div>
      <p style={{ color: "var(--t3)", fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
        Просчёт на 3–6 месяцев работы: сколько просмотров, подписчиков, обращений и продаж реально ждать, на каких цифрах держим план
        и что чиним, если не дошли. ИИ считает по распаковке, цифрам профиля и нашим реальным конверсиям — без завышения.
        Это прогноз, не гарантия: клиенту отправляем после проверки тимлидом.
      </p>
      <div className="flex gap-2 flex-wrap items-center mb-4">
        <button className="v2-act" style={btn(true)} disabled={busy || !!pending} onClick={ask}>
          {pending ? (pending === "working" ? "ИИ считает прогноз…" : "Прогноз в очереди…") : busy ? "Отправляю…" : cur ? "Пересчитать прогноз" : "📈 Сделать прогноз"}
        </button>
        {pending && <small style={{ color: "var(--t3)" }}>Обычно 10–20 минут. Ход работы — в «Чат · ИИ» → «Стратегия».</small>}
      </div>

      {!cur && !pending && (
        <div className="v2-card" style={{ padding: 22, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>
          Прогноза пока нет. Заполните «Распаковку» и нажмите «Сделать прогноз».
        </div>
      )}

      {docs.map((d) => {
        const st = (d.status as ForecastStatus) || "draft";
        const s = d.data?.summary || {};
        return (
          <div key={d.id} className="v2-card" style={{ padding: 14, marginBottom: 10, opacity: d.is_current ? 1 : 0.7, borderColor: d.is_current ? "var(--pu)" : undefined }}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div style={{ minWidth: 0 }}>
                <div className="tt" style={{ marginBottom: 3 }}>{d.title}</div>
                <small style={{ color: "var(--t3)", fontSize: 11.5 }}>версия {d.version}{d.is_current ? " · актуальная" : ""} · {when(d.created_at)}</small>
                <div className="flex gap-2 flex-wrap mt-2">
                  <span className={`v2-chip ${FORECAST_STATUS[st]?.cls || "mut"}`}>{FORECAST_STATUS[st]?.label || st}</span>
                  {s.account_type && <span className="v2-chip mut">{s.account_type}</span>}
                  {s.horizon_months && <span className="v2-chip mut">{s.horizon_months} мес.</span>}
                  {Array.isArray(s.missing) && s.missing.length > 0 && <span className="v2-chip or">не хватает данных: {s.missing.length}</span>}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {d.file_key && <a href={fileUrl(d.file_key)} target="_blank" rel="noreferrer" className="v2-act" style={{ ...btn(true), textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Открыть</a>}
                {d.data?.pdf_key && <a href={fileUrl(d.data.pdf_key)} target="_blank" rel="noreferrer" className="v2-act" style={{ ...btn(false), textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Скачать PDF</a>}
              </div>
            </div>
            {Array.isArray(s.missing) && s.missing.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--t2)", lineHeight: 1.5 }}>
                <b style={{ color: "var(--or)" }}>Спросить у клиента:</b> {s.missing.join(" · ")}
              </div>
            )}
            {d.is_current && (
              <div className="flex gap-2 flex-wrap mt-3">
                {st !== "reviewed" && st !== "approved" && <button className="v2-act ghost" style={{ height: 30, fontSize: 12 }} onClick={() => setStatus(d, "reviewed")}>✓ Проверен тимлидом</button>}
                {st !== "approved" && <button className="v2-act ghost" style={{ height: 30, fontSize: 12 }} onClick={() => setStatus(d, "approved")}>✓ Согласован с клиентом</button>}
                {st !== "draft" && <button className="v2-act ghost" style={{ height: 30, fontSize: 12, color: "var(--t3)" }} onClick={() => setStatus(d, "draft")}>Вернуть в черновик</button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
