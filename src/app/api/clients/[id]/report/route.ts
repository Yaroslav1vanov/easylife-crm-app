import { createClient } from "@/lib/supabase-server";
import { buildReportHtml } from "@/lib/reportTemplate";

// Генерирует клиентский месячный отчёт (HTML) из данных Metricool.
// GET /api/clients/{id}/report?month=YYYY-MM
export const maxDuration = 60;

const RU_MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const pad = (n: number) => String(n).padStart(2, "0");

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const from = `${y}-${pad(m)}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${y}-${pad(m)}-${pad(last)}`;
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const pLast = new Date(py, pm, 0).getDate();
  return { from, to, prevFrom: `${py}-${pad(pm)}-01`, prevTo: `${py}-${pad(pm)}-${pad(pLast)}`, label: `${RU_MONTHS[m - 1]} ${y}` };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const url = new URL(req.url);
  const now = new Date();
  const ym = url.searchParams.get("month") || `${now.getFullYear()}-${pad(now.getMonth() + 1)}`; // по умолч. текущий
  const b = monthBounds(ym);
  const origin = url.origin;

  const sb = createClient();
  const { data: c } = await sb.from("clients").select("id, name, surname, niche, avatar_url, instagram, package, metricool_blog_id").eq("id", id).maybeSingle();
  if (!c) return new Response("клиент не найден", { status: 404 });
  if (!c.metricool_blog_id) return new Response(htmlError("У клиента не привязан бренд Metricool — нельзя собрать отчёт."), { status: 400, headers: htmlHeaders() });

  // тянем цифры из уже готового эндпоинта (текущий месяц, прошлый месяц, сырьё для топов/недель)
  const call = async (from: string, to: string, extra = "") => {
    try { const r = await fetch(`${origin}/api/metricool/analytics?from=${from}&to=${to}&clientId=${id}${extra}`); return await r.json(); }
    catch { return null; }
  };
  const [curRes, prevRes, rawRes] = await Promise.all([
    call(b.from, b.to),
    call(b.prevFrom, b.prevTo),
    call(b.from, b.to, "&raw=1"),
  ]);
  const cur = curRes?.rows?.[0] || null;
  const prev = prevRes?.rows?.[0] || null;
  const raw = { posts: rawRes?.posts || [], reels: rawRes?.reels || [] };
  if (!cur) return new Response(htmlError("Metricool не вернул данные за этот месяц. Проверь, что бренд привязан и период корректен."), { status: 502, headers: htmlHeaders() });

  // AI-черновик выводов (с фолбэком на цифры)
  const narrative = await aiNarrative(c, cur, prev, b.label);

  const html = buildReportHtml({ client: c, cur, prev, raw, monthLabel: b.label, ym, narrative });
  return new Response(html, { headers: htmlHeaders() });
}

function htmlHeaders() { return { "content-type": "text/html; charset=utf-8" }; }
function htmlError(msg: string) {
  return `<!doctype html><meta charset="utf-8"><body style="background:#070526;color:#f3f2ff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:40px"><div><h2 style="color:#b6f500">Отчёт не собран</h2><p style="color:#7a78a3;margin-top:12px">${msg}</p></div></body>`;
}

async function aiNarrative(c: any, cur: any, prev: any, monthLabel: string): Promise<{ worked: string[]; plan: string[] }> {
  const fallback = {
    worked: [
      cur.reels_count ? `Выпущено ${cur.reels_count} Reels за месяц${prev?.reels_count ? ` (было ${prev.reels_count})` : ""}` : "Системный поток контента на AI-аватаре",
      cur.engagement_rate ? `Вовлечённость ${String(cur.engagement_rate).replace(".", ",")}% — выше среднего по Instagram (1–3%)` : "Высокая вовлечённость аудитории",
      cur.reach ? `Охват за месяц ${fmtRu(cur.reach)} аккаунтов` : "Стабильный охват профиля",
    ],
    plan: [
      "Удержать объём и охват, усилить топовые форматы",
      "Подключить/измерить воронку заявок (лендинг + WhatsApp)",
      "Расширить каналы: YouTube Shorts как новый источник охвата",
    ],
  };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fallback;
  const model = process.env.REPORT_MODEL || "claude-opus-4-8";
  const facts = `Клиент: ${[c.name, c.surname].filter(Boolean).join(" ")} · ниша: ${c.niche || "—"}
Месяц: ${monthLabel}
Reels: ${cur.reels_count ?? "—"}${prev?.reels_count != null ? ` (прошлый месяц ${prev.reels_count})` : ""}
Охват: ${cur.reach ?? "—"}${prev?.reach != null ? ` (прошлый ${prev.reach})` : ""}
Показы: ${cur.impressions ?? "—"}
Взаимодействия: ${cur.interactions ?? "—"}
ER: ${cur.engagement_rate ?? "—"}%${prev?.engagement_rate != null ? ` (прошлый ${prev.engagement_rate}%)` : ""}
Подписчики: ${cur.followers_end ?? "—"}${cur.followers_delta != null ? ` (изм. ${cur.followers_delta >= 0 ? "+" : ""}${cur.followers_delta})` : ""}`;
  const sys = `Ты — аккаунт-менеджер агентства EasyLife AI (контент без съёмок на AI-аватаре). Пишешь короткие деловые формулировки для месячного отчёта клиенту: без воды, конкретика с цифрами, уверенно, на «вы» опускаем — просто факты. Верни ТОЛЬКО валидный JSON.`;
  const user = `Цифры за месяц:\n${facts}\n\nВерни JSON:\n{"worked":["3 пункта «что сработало» с цифрами"],"plan":["3 пункта плана на следующий месяц"]}`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 700, system: sys, messages: [{ role: "user", content: user }] }),
    });
    const j = await r.json();
    if (!r.ok) return fallback;
    const text = (j.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("").trim();
    const a = text.indexOf("{"), z = text.lastIndexOf("}");
    const parsed = JSON.parse(text.slice(a, z + 1));
    return {
      worked: Array.isArray(parsed.worked) && parsed.worked.length ? parsed.worked.slice(0, 3) : fallback.worked,
      plan: Array.isArray(parsed.plan) && parsed.plan.length ? parsed.plan.slice(0, 3) : fallback.plan,
    };
  } catch { return fallback; }
}

function fmtRu(n: number) { return n.toLocaleString("ru-RU"); }
