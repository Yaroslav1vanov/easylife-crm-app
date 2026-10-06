import { SupabaseClient } from "@supabase/supabase-js";
import { createAdmin } from "@/lib/supabase-admin";
import { getSetting } from "@/lib/appSettings";

/* Один вход для всех ИИ-кнопок CRM (стоп-слова, адаптация, подписи, разбор рефа, отчёты).

   Два пути:
   • server (по умолчанию) — задача уходит в таблицу ai_jobs, её забирает исполнитель на нашем сервере
     и решает через подписку Claude (тот же аккаунт, что и чаты с ИИ). Платный API-ключ не нужен.
   • api — напрямую в Anthropic API по ANTHROPIC_API_KEY (как было раньше).
   Переключатель — «Настройки» → «ИИ-кнопки работают через» (app_settings, ключ ai_via). */

import { AI_VIA_KEY } from "@/lib/aiVia";
export { AI_VIA_KEY };

type Ask = { system: string; user: string; model: string; maxTokens?: number; kind: string; clientId?: number | null; timeoutMs?: number };

export async function askClaude(sb: SupabaseClient, a: Ask): Promise<string> {
  const via = (await getSetting(sb, AI_VIA_KEY, "server")).trim();
  return via === "api" ? viaApi(a) : viaServer(a);
}

async function viaApi(a: Ask): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY не задан (включите в «Настройках» работу ИИ через сервер)");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: a.model, max_tokens: a.maxTokens || 2000, system: a.system, messages: [{ role: "user", content: a.user }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = j?.error?.message || `Anthropic ${r.status}`;
    throw new Error(/credit balance is too low/i.test(m) ? "На балансе Anthropic API закончились деньги — пополните или включите в «Настройках» работу через сервер" : m);
  }
  return (j.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}

async function viaServer(a: Ask): Promise<string> {
  const admin = createAdmin();   // таблица ai_jobs закрыта для браузера, пишет и читает только сервер CRM
  const { data, error } = await admin.from("ai_jobs").insert({
    kind: a.kind, client_id: a.clientId ?? null, model: a.model, system: a.system, prompt: a.user, max_tokens: a.maxTokens || 2000,
  }).select("id").single();
  if (error || !data) throw new Error("Не удалось поставить задачу ИИ: " + (error?.message || ""));
  const deadline = Date.now() + (a.timeoutMs || 150_000);
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1500));
    const { data: j } = await admin.from("ai_jobs").select("status, result, error").eq("id", data.id).maybeSingle();
    if (j?.status === "done") return String(j.result || "").trim();
    if (j?.status === "error") throw new Error(j.error || "ИИ на сервере не справился");
  }
  await admin.from("ai_jobs").update({ status: "error", error: "истекло время ожидания" }).eq("id", data.id).in("status", ["queued", "working"]);
  throw new Error("Сервер ИИ не ответил за 2,5 минуты — попробуйте ещё раз");
}
