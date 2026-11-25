import type { SupabaseClient } from "@supabase/supabase-js";
import { clientReels, type ClientReel } from "@/lib/clientReels";
import { addDays, median } from "@/lib/weeklyStats";

/* ANALYTICS.md для ИИ в чате «Аналитика» вкладки «Аналитика»: цифры каждого ролика за 90 дней,
   нормы аккаунта по площадкам, аудитория из ChatPlace и тексты наших сценариев к этим роликам.
   ИИ разбирает, почему ролик зашёл или нет, только по этим цифрам. */

const NET_RU: Record<string, string> = { instagram: "IG", tiktok: "TT", youtube: "YT", facebook: "FB", threads: "Threads" };
const SNAP_RU: Record<string, string> = { ig: "Instagram", tt: "TikTok", yt: "YouTube" };
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("ru-RU"));
const n1 = (v: number | null | undefined) => (v == null ? "—" : String(Math.round(v * 10) / 10));
const pct = (v: number | null | undefined) => (v == null ? "—" : `${n1(v)}%`);
const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();

/* Посекундной кривой удержания Instagram не отдаёт никому, кроме самого приложения (ChatPlace даёт её только для TikTok).
   Есть доля пролиставших в первые ~3 секунды и среднее время просмотра. По темпу речи (слов в тексте / длительность ролика)
   находим, какая фраза звучит на 3-й секунде и на секунде, где в среднем уходят. Это оценка, ИИ так её и называет. */
function dropPoints(text: string, rr: ClientReel[]): string | null {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const r = rr.find(x => x.watch != null) || null;
  if (!r || words.length < 8) return null;
  const rate = r.duration && r.duration > 3 ? Math.min(4, Math.max(1.6, words.length / r.duration)) : 2.5;   // слов в секунду
  const at = (sec: number) => { const i = Math.min(words.length - 1, Math.max(0, Math.round(sec * rate))); return words.slice(Math.max(0, i - 6), i + 4).join(" "); };
  const parts = [`Где отваливаются (${NET_RU[r.net] || r.net}, оценка по темпу ${Math.round(rate * 10) / 10} слова/с${r.duration ? `, ролик ${n1(r.duration)} с` : ", длительность неизвестна — темп взят 2,5 слова/с"}):`];
  if (r.skip != null) parts.push(`пролистали в первые ~3 с ${pct(r.skip)}, к 3-й секунде звучит «…${at(3)}…»`);
  parts.push(`в среднем смотрят ${n1(r.watch)} с${r.retLoop ? " (больше длины ролика — пересматривают)" : `, к этому моменту звучит «…${at(r.watch!)}…»`}`);
  return parts.join("; ");
}

export async function analyticsContext(sb: SupabaseClient, cid: number, today = new Date().toISOString().slice(0, 10)): Promise<string> {
  const { data: c } = await sb.from("clients").select("id, name, surname, metricool_blog_id, chatplace_bot_id, timezone, platforms").eq("id", cid).maybeSingle();
  if (!c) return "# Аналитика\n\nКлиент не найден.";
  const from = addDays(today, -90);
  const L: string[] = [`# Аналитика клиента ${[c.name, c.surname].filter(Boolean).join(" ")} — собрано ${today}, ролики с ${from}`, ""];
  if (!c.metricool_blog_id && !c.chatplace_bot_id) {
    L.push("К карточке не привязан ни бренд Metricool, ни Instagram в ChatPlace — цифр роликов нет. Не выдумывай их: скажи, что нужно привязать в «Настройках» карточки.");
    return L.join("\n");
  }
  L.push("Источники: Instagram — " + (c.chatplace_bot_id ? "ChatPlace (официальная статистика аккаунта: пролистывания, среднее время просмотра), где его нет — Metricool" : "Metricool")
    + "; TikTok и YouTube — Metricool. Пустая ячейка «—» = сеть эту цифру не отдала, а не ноль.", "");

  let reels: ClientReel[] = [];
  try { reels = await clientReels(sb, c as any, from, today); }
  catch (e: any) { L.push(`Ролики не загрузились: ${e?.message || e}. Скажи об этом человеку, цифры не придумывай.`, ""); }

  // --- аккаунт из ChatPlace
  const { data: cp } = c.chatplace_bot_id ? await sb.from("client_chatplace_insights").select("day, availability, summary, funnels")
    .eq("client_id", cid).order("day", { ascending: false }).limit(1).maybeSingle() : { data: null };
  if (cp?.availability === "available" && cp.summary?.metrics) {
    const m = cp.summary.metrics, b = cp.summary.breakdowns || {};
    L.push(`## Instagram-аккаунт за 30 дней (ChatPlace, данные по ${cp.summary.dataThrough || cp.day})`,
      `Подписчики ${n0(m.followers)} (${m.followersDelta >= 0 ? "+" : ""}${n0(m.followersDelta)} за 30 дней, подписались ${n0(m.follows)}, отписались ${n0(m.unfollows)}) · просмотры ${n0(m.views)} · охват ${n0(m.reach)} · `
      + `лайки ${n0(m.likes)} · комментарии ${n0(m.comments)} · сохранения ${n0(m.saves)} · репосты ${n0(m.shares)} · визиты профиля ${n0(m.profileViews)} · клики по ссылке ${n0(m.websiteClicks ?? m.profileLinksTaps)}`);
    const br = (k: string, title: string) => Array.isArray(b[k]) && b[k].length ? `${title}: ${b[k].slice(0, 8).map((x: any) => `${x.label} ${Math.round((x.share || 0) * 1000) / 10}%`).join(", ")}` : null;
    for (const s of [br("countries", "Страны"), br("ages", "Возраст"), br("genders", "Пол (M муж, F жен, U не указан)"), br("viewerTypesViews", "Кто смотрит (просмотры)"), br("contentTypes", "Типы контента")]) if (s) L.push(s);
    if (Array.isArray(cp.funnels) && cp.funnels.length) L.push("Воронки ChatPlace: " + cp.funnels.slice(0, 10).map((f: any) => `«${f.name}» (${(f.words || []).join("/") || "без слова"}): вошли ${f.total}${f.active ? "" : ", выключена"}`).join("; "));
    L.push("");
  } else if (c.chatplace_bot_id) {
    L.push(`## Instagram-аккаунт: ChatPlace привязан, но статистики пока нет (${cp?.availability || "не собиралась"}). Аудиторию (страны, пол, возраст) не знаешь — не придумывай.`, "");
  }

  // --- подписчики по площадкам
  const { data: snaps } = await sb.from("social_snapshots").select("platform, snapshot_date, followers").eq("client_id", cid)
    .gte("snapshot_date", from).gt("followers", 0).order("snapshot_date");
  const byP: Record<string, any[]> = {};
  for (const s of snaps || []) (byP[s.platform] ||= []).push(s);
  if (Object.keys(byP).length) {
    L.push("## Подписчики (снимки CRM)");
    for (const [p, arr] of Object.entries(byP)) {
      const first = arr[0], last = arr[arr.length - 1];
      L.push(`${SNAP_RU[p] || p}: ${n0(first.followers)} (${first.snapshot_date}) → ${n0(last.followers)} (${last.snapshot_date}), ${last.followers - first.followers >= 0 ? "+" : ""}${n0(last.followers - first.followers)}`);
    }
    L.push("");
  }

  if (!reels.length) { L.push("## Ролики", "За 90 дней роликов в статистике нет."); return L.join("\n"); }

  // --- нормы аккаунта
  L.push("## Нормы аккаунта за 90 дней (медианы по площадке — с ними сравнивай каждый ролик)");
  for (const net of Array.from(new Set(reels.map(r => r.net)))) {
    const R = reels.filter(r => r.net === net);
    const med = (f: (r: ClientReel) => number | null | undefined) => { const v = R.map(f).filter((x): x is number => x != null && x > 0); return v.length ? median(v) : null; };
    L.push(`${NET_RU[net] || net}: роликов ${R.length} · просмотры ${n0(med(r => r.views))} · ER ${pct(med(r => r.er))} · пролистали в первые секунды ${pct(med(r => r.skip))} · `
      + `средний просмотр ${n1(med(r => r.watch))} с · длительность ${n1(med(r => r.duration))} с · удержание ${pct(med(r => r.retention))}`);
  }
  L.push("", "## Ролики (новые сверху). x = просмотры / медиана этой площадки; «наш» = ролик из контент-плана CRM (текст сценария ниже по номеру сценария)",
    "| Дата | Сеть | Название | Просм. | x | Охват | ER | Сохр. | Репосты | Комм. | Пролист. | Ср. просм., с | Длит., с | Удерж. | Подписки | Реклама, просм. | Сценарий | Ссылка |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of reels.slice(0, 80)) {
    L.push(`| ${r.date} | ${NET_RU[r.net] || r.net} | ${cell(r.title).slice(0, 70)} | ${n0(r.views)} | ${r.x} | ${n0(r.reach)} | ${pct(r.er)} | ${n0(r.saves)} | ${n0(r.shares)} | ${n0(r.comments)} | ${pct(r.skip)} | ${n1(r.watch)} | ${n1(r.duration)} | ${pct(r.retention)}${r.retLoop ? " (досматривают повторно)" : ""} | ${n0(r.follows)} | ${n0(r.paidViews)} | ${r.scriptId ? `#${r.scriptId}` : "не наш"} | ${r.url || "—"} |`);
  }
  L.push("");

  // --- тексты наших сценариев к этим роликам
  const ids = Array.from(new Set(reels.map(r => r.scriptId).filter((x): x is number => !!x))).slice(0, 45);
  if (ids.length) {
    const { data: sc } = await sb.from("scripts").select("id, pub_date, hook_text, body_text, cta, ref_url, ref_text, transcription, ref_views").in("id", ids);
    const byId = new Map((sc || []).map((s: any) => [s.id, s]));
    L.push("## Тексты наших сценариев (то, что сказано в ролике). Хук = первая фраза. Референс — чужой ролик, с которого брали идею");
    for (const id of ids) {
      const s: any = byId.get(id); if (!s) continue;
      const rr = reels.filter(r => r.scriptId === id);
      const ref = String(s.ref_text || s.transcription || "").trim();
      L.push("", `### Сценарий #${id} · ${s.pub_date || "без даты"} · ${rr.map(r => `${NET_RU[r.net] || r.net} ${n0(r.views)} просм. (x${r.x})`).join(", ")}`,
        String(s.body_text || "").trim().slice(0, 2500) || "(текста нет)");
      if (s.cta && !String(s.body_text || "").includes(s.cta)) L.push(`Призыв: ${s.cta}`);
      const drop = dropPoints(String(s.body_text || ""), rr);
      if (drop) L.push(drop);
      if (s.ref_url) L.push(`Референс: ${s.ref_url}${s.ref_views ? ` (${n0(s.ref_views)} просм.)` : ""}${ref.length > 60 ? `\nТекст референса: ${ref.slice(0, 1500)}` : ""}`);
    }
  }
  return L.join("\n");
}
