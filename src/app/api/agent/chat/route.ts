import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase-admin";
import { r2 } from "@/lib/r2";
import { submitFile } from "@/lib/transcribe";
import { metricoolProfile } from "@/lib/metricoolProfile";
import { DEFAULT_FORECAST_BENCHMARKS, FORECAST_BENCHMARKS_KEY, unpackingToText } from "@/lib/forecast";
import { dictionaryText, monthStart, videoLimit } from "@/lib/avatar";

/* Канал для ИИ-исполнителя чата по клиенту (работает на нашем сервере).
   Только по секрету x-agent-secret, работает служебным ключом.

   GET  ?op=queue                         → задачи в очереди + контекст клиента
   POST {op:"claim", id}                  → взять задачу (если её ещё никто не взял)
   POST {op:"reply", id, body, attachments, status:"done"|"error", error?}
                                          → ответ ИИ в чат + закрыть задачу
   POST {op:"progress", id, body}         → промежуточное сообщение ИИ (вопрос, «начал монтаж»)
   POST {op:"upload", client_id, filename} → ссылка, чтобы залить готовый файл
   POST {op:"download", key}              → ссылка, чтобы скачать файл из чата
   POST {op:"script_update", id, script_id, fields} → записать согласованный текст в сценарий
   POST {op:"doc_save", id, kind:"forecast", title, file_key, data, body} → прогноз новой версией документа клиента
   POST {op:"avatar_gen", gen_id, status, seconds?, credits_before?, credits_after?, heygen_id?, result_key?, error?}
                                          → итог генерации HeyGen (журнал трат; готовый файл — в медиатеку клиента)
   reply/progress в чате «Аватар» могут нести meta {type:"avatar_order", text, look_id} — карточка-заказ озвучки */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_MIN = 360; // страховка на случай, если сервер лёг совсем; прерванные задачи исполнитель возвращает в очередь сам

function allowed(req: Request) {
  const s = process.env.STRATEGY_AGENT_SECRET;
  return !!s && req.headers.get("x-agent-secret") === s;
}
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/* «Папка клиента» для ИИ: контент-план, что уже вышло и как зашло, медиатека, документы.
   С этим ИИ не только монтирует, но и обсуждает сторис и стратегию, зная цифры клиента. */
async function folder(sb: ReturnType<typeof createAdmin>, cid: number) {
  const cut = (t: any, n: number) => (t ? String(t).replace(/\s+/g, " ").trim().slice(0, n) : null);
  const [scripts, pubs, weekly, snaps, assets, docs] = await Promise.all([
    sb.from("scripts").select("id, month_number, order_num, hook, hook_text, body_text, cta, script_status, video_status, pub_date, published_url, video_url, ref_views, our_views, our_likes, our_comments, content_type")
      .eq("client_id", cid).order("id", { ascending: false }).limit(90),
    sb.from("publications").select("id, script_id, content_type, publish_at, pub_status, base_text, published_url")
      .eq("client_id", cid).order("id", { ascending: false }).limit(80),
    sb.from("client_weekly_stats").select("week_start, week_end, reels_count, views, reach, likes, comments, saves, shares, er, avg_retention, followers_end, followers_gained, top_post")
      .eq("client_id", cid).order("week_start", { ascending: false }).limit(8),
    sb.from("reel_snapshots").select("network, post_url, published_at, snapshot_date, age_days, views, reach, likes, comments, saves, shares, avg_watch_sec")
      .eq("client_id", cid).order("snapshot_date", { ascending: false }).limit(600),
    sb.from("client_assets").select("id, file_key, category, kind, title, tags, has_face, consent, source, usable")
      .eq("client_id", cid).order("id", { ascending: false }).limit(500),
    sb.from("client_documents").select("kind, title, body, file_key, version")
      .eq("client_id", cid).eq("is_current", true).neq("kind", "strategy"),
  ]);
  // по каждому ролику — самый свежий снимок цифр
  const seen = new Set<string>();
  const reels = (snaps.data || []).filter((r: any) => (seen.has(r.post_url) ? false : (seen.add(r.post_url), true)));
  return {
    plan: (scripts.data || []).map((x: any) => ({ ...x, hook_text: cut(x.hook_text || x.hook, 200), hook: undefined, body_text: cut(x.body_text, 500), cta: cut(x.cta, 160) })),
    publications: (pubs.data || []).map((x: any) => ({ ...x, base_text: cut(x.base_text, 160) })),
    weekly: weekly.data || [],
    reels,
    assets: assets.data || [],
    docs: (docs.data || []).map((d: any) => ({ ...d, body: cut(d.body, 6000) })),
  };
}

/** Сценарий + его референс (ссылка, расшифровка, цифры, разбор) — для уникализации и монтажа. */
async function scriptContext(sb: ReturnType<typeof createAdmin>, sid: number, cid: number) {
  const { data: s } = await sb.from("scripts").select("id, client_id, month_number, order_num, hook_text, hook, body_text, cta, post_caption, description, ref_url, ref_text, transcription, ref_views, ref_likes, ref_comments, script_status, video_status, video_url")
    .eq("id", sid).eq("client_id", cid).maybeSingle();
  if (!s) return null;
  const { data: refs } = await sb.from("reference_videos").select("url, platform, author, caption, transcript, views, likes, comments, analysis, note")
    .eq("script_id", sid).order("id", { ascending: false }).limit(1);
  return { ...s, reference: refs?.[0] || null };
}

export async function GET(req: Request) {
  if (!allowed(req)) return bad("нет доступа", 403);
  const sb = createAdmin();

  // зависшие задачи — в ошибку, чтобы человек видел и мог написать снова
  const staleBefore = new Date(Date.now() - STALE_MIN * 60000).toISOString();
  const { data: stale } = await sb.from("client_chat_messages").select("id")
    .eq("ai_status", "working").lt("created_at", staleBefore);
  for (const s of stale || []) {
    await sb.from("client_chat_messages").update({ ai_status: "error", ai_error: "Исполнитель не ответил за 6 часов. Напишите задачу ещё раз." }).eq("id", s.id);
  }

  const { data: queued, error } = await sb.from("client_chat_messages").select("*")
    .eq("ai_status", "queued").order("id").limit(12);
  if (error) return bad(error.message, 500);

  const jobs = [];
  for (const m of queued || []) {
    const cid = m.client_id;
    const [{ data: client }, { data: brand }, { data: strategy }, { data: history }] = await Promise.all([
      sb.from("clients").select("id, name, surname, niche, product, instagram, tiktok, youtube, brand_voice, timezone, ai_chat").eq("id", cid).maybeSingle(),
      sb.from("client_brand").select("kit, version").eq("client_id", cid).maybeSingle(),
      sb.from("client_documents").select("title, body, version").eq("client_id", cid).eq("kind", "strategy").eq("is_current", true).maybeSingle(),
      sb.from("client_chat_messages").select("id, author_type, author_name, body, attachments, created_at, ai_status, thread, script_id, quote_id, meta")
        // рилсы и сторис — только своя переписка; «Стратегия» видит все три чата клиента
        .eq("client_id", cid).in("thread", m.thread === "strategy" ? ["reels", "stories", "strategy"] : [m.thread || "reels"]).is("hidden_at", null)   // скрытое владельцем ИИ не видит
        .lte("id", m.id).order("id", { ascending: false }).limit(m.thread === "strategy" ? 80 : 40),
    ]);
    if (!client?.ai_chat) {
      // ИИ у клиента выключили, пока сообщение ждало — снимаем его с очереди
      await sb.from("client_chat_messages").update({ ai_status: null }).eq("id", m.id);
      continue;
    }
    // сценарий, над которым идёт работа: из этого сообщения или последний, привязанный в этом чате
    // («Уникализировать в чате ИИ» в карточке сценария) — так «записывай» и монтаж понимают, о каком ролике речь
    // «Ответить» на конкретное сообщение: отдаём его целиком (оно могло уйти за окно последних 40)
    let quoted: any = null;
    if (m.quote_id) {
      const { data: q } = await sb.from("client_chat_messages").select("id, author_type, author_name, body, attachments, created_at, thread, script_id, reply_to")
        .eq("id", m.quote_id).eq("client_id", cid).maybeSingle();
      if (q) {
        // ответ ИИ сам не привязан к сценарию — берём сценарий из задачи, на которую он отвечал
        let qsid = q.script_id;
        if (!qsid && q.reply_to) qsid = (await sb.from("client_chat_messages").select("script_id").eq("id", q.reply_to).maybeSingle()).data?.script_id || null;
        quoted = { ...q, script_id: qsid };
      }
    }
    const sid = m.script_id || quoted?.script_id || (history || []).find((h: any) => h.script_id)?.script_id || null;
    const script = sid ? await scriptContext(sb, sid, cid) : null;
    // чат «Стратегия»: для прогноза — распаковка, «Наши цифры» и свежий снимок профиля из Metricool
    let planning: any = null;
    if (m.thread === "strategy") {
      const [{ data: unp }, { data: bench }, { data: cm }] = await Promise.all([
        sb.from("client_documents").select("version, data, created_at, author_name").eq("client_id", cid).eq("kind", "unpacking").eq("is_current", true).maybeSingle(),
        sb.from("app_settings").select("value").eq("key", FORECAST_BENCHMARKS_KEY).maybeSingle(),
        sb.from("clients").select("metricool_blog_id, package").eq("id", cid).maybeSingle(),
      ]);
      let profile = "Бренд Metricool у клиента не привязан — цифр профиля нет. Не выдумывай их: опирайся на STATS.md, если там что-то есть, и пиши «нет данных».";
      if (cm?.metricool_blog_id) { try { profile = await metricoolProfile(cm.metricool_blog_id); } catch (e: any) { profile = `Снимок профиля не собрался: ${e?.message || e}`; } }
      planning = {
        unpacking: unp ? `# Распаковка (версия ${unp.version}, ${String(unp.created_at).slice(0, 10)}, ${unp.author_name || "—"})\n\n${unpackingToText(unp.data || {})}` : "# Распаковка\n\nРаспаковки нет — все поля пустые. Перечисли, что нужно спросить у клиента, и считай с пометкой «допущение».",
        benchmarks: (bench?.value || "").trim() || DEFAULT_FORECAST_BENCHMARKS,
        profile, package: cm?.package ?? null,
      };
    }
    // чат «Аватар»: какой аватар разрешён клиенту, словарь, сколько генераций осталось; задача генерации — в m.meta.avatar_job
    let avatar: any = null;
    if (m.thread === "avatar") {
      const [{ data: av }, { data: dict }, { count: vids }, { data: pk }] = await Promise.all([
        sb.from("client_avatars").select("*").eq("client_id", cid).maybeSingle(),
        sb.from("client_avatar_dictionary").select("written, spoken, note").eq("client_id", cid).order("written"),
        sb.from("avatar_generations").select("id", { count: "exact", head: true }).eq("client_id", cid).eq("kind", "video").neq("status", "error").gte("created_at", monthStart()),
        sb.from("clients").select("package").eq("id", cid).maybeSingle(),
      ]);
      const job = m.meta?.avatar_job ? { ...m.meta.avatar_job } : null;
      // аудио для видео — подписанная ссылка на 12 ч: HeyGen скачивает его сам (audioUrl)
      if (job?.source_key) { const store = r2(); if (store) job.source_url = await store.signGet(job.source_key, 12 * 3600); }
      const { data: gen } = job?.gen_id ? await sb.from("avatar_generations").select("*").eq("id", job.gen_id).maybeSingle() : { data: null };
      avatar = av ? {
        config: av, dictionary: dictionaryText(dict || []), dictionary_rows: dict || [],
        video_limit: videoLimit(av, pk?.package), videos_this_month: vids || 0,
        job, generation: gen, sync: !!m.meta?.avatar_sync,   // «Обновить образы из HeyGen» — только просмотр списка
      } : { error: "К клиенту не привязан аватар — генерировать нельзя. Напиши, что Ярославу нужно привязать аватар в «Настройках»." };
    }
    jobs.push({ message: m, client, brand_kit: brand?.kit || null, strategy: strategy?.body || null, history: (history || []).reverse(), script, quoted, planning, avatar, ...(await folder(sb, cid)) });
  }
  return NextResponse.json({ jobs });
}

export async function POST(req: Request) {
  if (!allowed(req)) return bad("нет доступа", 403);
  const b = await req.json().catch(() => ({}));
  const sb = createAdmin();

  if (b.op === "claim") {
    const { data } = await sb.from("client_chat_messages").update({ ai_status: "working", ai_started_at: new Date().toISOString() })
      .eq("id", b.id).eq("ai_status", "queued").select("id");
    return NextResponse.json({ ok: !!data?.length });
  }

  // ИИ разобрал медиатеку клиента: подписи, темы (теги «тема:…») и категории файлов — обратно в CRM.
  // Только файлы клиента той задачи, в рамках которой ИИ работал.
  if (b.op === "asset_update") {
    const { data: m } = await sb.from("client_chat_messages").select("id, client_id").eq("id", b.id).maybeSingle();
    if (!m) return bad("нет такой задачи", 404);
    const CATS = new Set(["logo", "font", "portrait", "process", "location", "result", "review", "generated", "story", "other"]);
    let updated = 0;
    for (const a of (Array.isArray(b.assets) ? b.assets : []).slice(0, 500)) {
      const patch: any = {};
      if (typeof a?.title === "string" && a.title.trim()) patch.title = a.title.trim().slice(0, 200);
      if (Array.isArray(a?.tags)) patch.tags = a.tags.filter((t: any) => typeof t === "string" && t.trim()).map((t: string) => t.trim().slice(0, 60)).slice(0, 20);
      if (typeof a?.category === "string" && CATS.has(a.category)) patch.category = a.category;
      if (a?.has_face === true) patch.has_face = true;   // ИИ может только ПОМЕТИТЬ лицо (снять пометку — человек)
      if (!Object.keys(patch).length || !Number(a?.asset_id)) continue;
      if (patch.tags) {
        // тема, которую команда поставила при загрузке (папка в Telegram-боте), и служебные теги остаются
        const { data: cur } = await sb.from("client_assets").select("tags").eq("id", Number(a.asset_id)).eq("client_id", m.client_id).maybeSingle();
        const old: string[] = cur?.tags || [];
        const keepTopic = old.find(t => t.toLowerCase().startsWith("тема:"));
        const keep = old.filter(t => t === "из Telegram" || t.startsWith("tg:") || t === keepTopic);
        const fresh = (patch.tags as string[]).filter(t => !(keepTopic && t.toLowerCase().startsWith("тема:")));
        patch.tags = Array.from(new Set([...keep, ...fresh])).slice(0, 24);
      }
      const { data } = await sb.from("client_assets").update(patch).eq("id", Number(a.asset_id)).eq("client_id", m.client_id).select("id");
      updated += data?.length || 0;
    }
    return NextResponse.json({ ok: true, updated });
  }

  // ИИ записывает согласованный текст в сценарий (человек сказал «записывай»). Только сценарий клиента этой задачи,
  // только текстовые поля; прежний текст ИИ кладёт в журнал, так что его можно вернуть.
  if (b.op === "script_update") {
    const { data: m } = await sb.from("client_chat_messages").select("id, client_id").eq("id", b.id).maybeSingle();
    if (!m) return bad("нет такой задачи", 404);
    const sid = Number(b.script_id);
    const { data: s } = await sb.from("scripts").select("id, client_id, hook_text, hook, body_text, cta, post_caption").eq("id", sid).maybeSingle();
    if (!s || s.client_id !== m.client_id) return bad("сценарий не этого клиента");
    const patch: any = {};
    for (const k of ["hook_text", "hook", "body_text", "cta", "post_caption"]) {
      if (typeof b.fields?.[k] === "string" && b.fields[k].trim()) patch[k] = b.fields[k].trim().slice(0, 20000);
    }
    if (!Object.keys(patch).length) return bad("нечего записывать");
    const { error } = await sb.from("scripts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", sid);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true, updated: Object.keys(patch), previous: Object.fromEntries(Object.keys(patch).map(k => [k, (s as any)[k]])) });
  }

  // ИИ сделал прогноз: forecast.html (+ PDF) уже в хранилище — сохраняем новой версией документа клиента
  if (b.op === "doc_save") {
    const { data: m } = await sb.from("client_chat_messages").select("id, client_id").eq("id", b.id).maybeSingle();
    if (!m) return bad("нет такой задачи", 404);
    if (b.kind !== "forecast") return bad("можно сохранять только прогноз");
    const key = String(b.file_key || "");
    if (!key.startsWith(`strategy/${m.client_id}/`) || key.includes("..")) return bad("чужой файл");
    const { data: last } = await sb.from("client_documents").select("version").eq("client_id", m.client_id).eq("kind", "forecast").order("version", { ascending: false }).limit(1);
    const version = ((last?.[0]?.version as number) || 0) + 1;
    await sb.from("client_documents").update({ is_current: false }).eq("client_id", m.client_id).eq("kind", "forecast");
    const { error } = await sb.from("client_documents").insert({
      client_id: m.client_id, kind: "forecast", version, is_current: true, status: "draft",
      title: String(b.title || `Прогноз · версия ${version}`).slice(0, 200), file_key: key,
      data: b.data && typeof b.data === "object" ? b.data : null, body: typeof b.body === "string" ? b.body.slice(0, 20000) : null,
      author_name: "ИИ", note: `задача чата #${m.id}`,
    });
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true, version });
  }

  // исполнитель перезапустился посреди задачи — возвращаем её в очередь, он доделает с того же места
  if (b.op === "requeue") {
    const { data } = await sb.from("client_chat_messages").update({ ai_status: "queued" })
      .eq("id", b.id).eq("ai_status", "working").select("id");
    return NextResponse.json({ ok: !!data?.length });
  }

  if (b.op === "progress" || b.op === "reply") {
    const { data: m } = await sb.from("client_chat_messages").select("id, client_id, thread").eq("id", b.id).maybeSingle();
    if (!m) return bad("нет такой задачи", 404);
    const atts = Array.isArray(b.attachments) ? b.attachments.filter((a: any) => typeof a?.key === "string" && a.key.startsWith(`strategy/${m.client_id}/chat/`)) : [];
    if ((b.body && String(b.body).trim()) || atts.length) {
      const { error } = await sb.from("client_chat_messages").insert({
        client_id: m.client_id, author_type: "ai", author_name: "ИИ", body: String(b.body || "").slice(0, 20000),
        attachments: atts, reply_to: m.id, thread: m.thread || "reels",   // ответ — в тот же чат
        meta: await orderMeta(sb, m, b.meta),
      });
      if (error) return bad(error.message, 500);
    }
    if (b.op === "reply") {
      const status = b.status === "error" ? "error" : "done";
      const mt = b.metrics || {};
      const n = (v: any) => (v == null || !isFinite(Number(v)) ? null : Number(v));
      await sb.from("client_chat_messages").update({
        ai_status: status, ai_error: status === "error" ? String(b.error || "ошибка").slice(0, 1000) : null,
        ai_finished_at: new Date().toISOString(), ai_minutes: n(mt.minutes), ai_cost_usd: n(mt.cost_usd), ai_files: n(mt.files),
      }).eq("id", m.id);
    }
    return NextResponse.json({ ok: true });
  }

  // образы группы HeyGen с картинками (их копирует исполнитель) → выбор образов в CRM
  if (b.op === "avatar_looks") {
    const { data: m } = await sb.from("client_chat_messages").select("client_id, meta").eq("id", Number(b.id)).maybeSingle();
    if (!m?.meta?.avatar_sync) return bad("это не задача обновления образов");
    const cid = m.client_id;
    const looks = (Array.isArray(b.looks) ? b.looks : []).slice(0, 200).map((l: any) => ({
      id: String(l.id || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 64), name: String(l.name || "").slice(0, 80),
      type: l.type ? String(l.type).slice(0, 30) : null, status: l.status ? String(l.status).slice(0, 20) : null,
      engines: Array.isArray(l.engines) ? l.engines.map(String).slice(0, 6) : [],
      preview_key: typeof l.preview_key === "string" && l.preview_key.startsWith(`strategy/${cid}/`) ? l.preview_key : null,
    })).filter((l: any) => l.id);
    const { error } = await sb.from("client_avatars").update({ group_looks: looks, looks_synced_at: new Date().toISOString() }).eq("client_id", cid);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true, count: looks.length });
  }

  // итог генерации HeyGen: журнал трат + готовый файл в медиатеку клиента (ссылки HeyGen временные)
  if (b.op === "avatar_gen") {
    const { data: g } = await sb.from("avatar_generations").select("id, client_id, kind, script_id, status").eq("id", Number(b.gen_id)).maybeSingle();
    if (!g) return bad("нет такой генерации", 404);
    if (g.status === "done" && b.status !== "done") return NextResponse.json({ ok: true, skipped: "уже готово" });   // поздняя ошибка не затирает готовый результат
    const num = (v: any) => (v == null || v === "" || !isFinite(Number(v)) ? undefined : Number(v));
    const status = ["working", "done", "error"].includes(b.status) ? b.status : "done";
    const key = typeof b.result_key === "string" && b.result_key.startsWith(`strategy/${g.client_id}/`) ? b.result_key : undefined;
    await sb.from("avatar_generations").update({
      status, seconds: num(b.seconds), credits_before: num(b.credits_before), credits_after: num(b.credits_after),
      heygen_id: b.heygen_id ? String(b.heygen_id).slice(0, 120) : undefined, result_key: key,
      error: status === "error" ? String(b.error || "ошибка").slice(0, 1000) : null,
      ...(status !== "working" ? { finished_at: new Date().toISOString() } : {}),
    }).eq("id", g.id);
    if (status === "done" && key && g.status !== "done") {
      await sb.from("client_assets").insert({
        client_id: g.client_id, file_key: key, category: "generated", kind: g.kind === "video" ? "video" : "other", source: "ai",
        title: `${g.kind === "video" ? "Видео аватара" : "Озвучка аватара"}${g.script_id ? ` · сценарий #${g.script_id}` : ""} · ${new Date().toISOString().slice(0, 10)}`,
        tags: ["аватар", g.kind === "video" ? "видео аватара" : "озвучка", ...(g.script_id ? [`сценарий:${g.script_id}`] : [])],
      });
    }
    return NextResponse.json({ ok: true });
  }

  // пульс сервера (раз в 5 минут): диск, нагрузка, память, задач в работе — для страницы «ИИ-чат: аналитика»
  // Транскрибация роликов, которые Instagram без входа не отдаёт: сервер качает через вход в наш Instagram.
  // igq — что скачать; igq_put — куда залить; igq_done — залил (ставим на распознавание) или не смог (ошибка).
  if (b.op === "igq") {
    const { data } = await sb.from("transcriptions").select("id, source_url, language")
      .eq("provider", "ig_session").eq("status", "processing").is("provider_job_id", null).order("id").limit(5);
    return NextResponse.json({ jobs: data || [] });
  }
  if (b.op === "igq_put") {
    const store = r2();
    if (!store || !Number(b.id)) return bad("нет хранилища или id");
    const key = `transcribe/ig/${Number(b.id)}-${crypto.randomUUID().slice(0, 8)}.mp4`;
    return NextResponse.json({ uploadUrl: await store.signPut(key), key });
  }
  if (b.op === "igq_done") {
    const id = Number(b.id);
    const { data: t } = await sb.from("transcriptions").select("id, language, status").eq("id", id).maybeSingle();
    if (!t || t.status !== "processing") return bad("нет такой задачи");
    if (b.error) {
      await sb.from("transcriptions").update({ status: "error", error: String(b.error).slice(0, 500), updated_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ ok: true });
    }
    const key = String(b.key || "");
    if (!key.startsWith(`transcribe/ig/${id}-`)) return bad("чужой файл");
    const pub = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
    const f = await submitFile(`${pub}/${key}`, (t.language || "auto") as any);
    await sb.from("transcriptions").update(f.ok
      ? { provider: "assemblyai", provider_job_id: f.jobId, updated_at: new Date().toISOString() }
      : { status: "error", error: f.error, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: !!f.ok });
  }

  if (b.op === "heartbeat") {
    const n = (v: any) => (v == null || !isFinite(Number(v)) ? null : Number(v));
    const base = {
      disk_used_gb: n(b.disk_used_gb), disk_total_gb: n(b.disk_total_gb), load1: n(b.load1), cpus: n(b.cpus),
      mem_used_mb: n(b.mem_used_mb), mem_total_mb: n(b.mem_total_mb), running: n(b.running),
    };
    // лимиты подписки Claude (раз в 15 минут); без миграции 2026-10-27_claude_limits пишем пульс без них
    const d = (v: any) => (typeof v === "string" && !isNaN(Date.parse(v)) ? v : null);
    const limits = b.claude_5h_util != null || b.claude_7d_util != null ? {
      claude_5h_util: n(b.claude_5h_util), claude_5h_reset: d(b.claude_5h_reset), claude_7d_util: n(b.claude_7d_util), claude_7d_reset: d(b.claude_7d_reset),
      claude_status: b.claude_status ? String(b.claude_status).slice(0, 40) : null, claude_overage: b.claude_overage ? String(b.claude_overage).slice(0, 40) : null,
    } : {};
    const { error } = await sb.from("server_status").insert({ ...base, ...limits });
    if (error && Object.keys(limits).length) await sb.from("server_status").insert(base);
    await sb.from("server_status").delete().lt("at", new Date(Date.now() - 45 * 864e5).toISOString());
    return NextResponse.json({ ok: true });
  }

  const store = r2();
  if (!store) return bad("хранилище R2 не настроено", 500);

  if (b.op === "upload") {
    const cid = Number(b.client_id);
    if (!cid) return bad("нет client_id");
    const ext = (String(b.filename || "").split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
    const key = `strategy/${cid}/chat/${crypto.randomUUID()}.${ext}`;
    return NextResponse.json({ uploadUrl: await store.signPut(key), key });
  }

  if (b.op === "download") {
    const key = String(b.key || "");
    if (!key.startsWith("strategy/") || key.includes("..")) return bad("нет файла");
    return NextResponse.json({ url: await store.signGet(key) });
  }

  return bad("неизвестная операция");
}

/** Карточка-заказ озвучки (чат «Аватар»): берём только известные поля и только разрешённый клиенту лук. */
async function orderMeta(sb: ReturnType<typeof createAdmin>, m: { client_id: number; thread: string | null }, meta: any) {
  if (m.thread !== "avatar" || meta?.type !== "avatar_order" || typeof meta.text !== "string" || !meta.text.trim()) return null;
  const { data: av } = await sb.from("client_avatars").select("look_ids, default_look_id").eq("client_id", m.client_id).maybeSingle();
  if (!av) return null;
  const look = av.look_ids.includes(meta.look_id) ? meta.look_id : av.default_look_id || av.look_ids[0];
  return { type: "avatar_order", text: meta.text.slice(0, 5000), look_id: look };
}
