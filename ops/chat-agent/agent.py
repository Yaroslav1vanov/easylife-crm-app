#!/usr/bin/env python3
"""ИИ-исполнитель чата по клиенту (EasyLife CRM).

Каждые 10 секунд спрашивает у CRM задачи в очереди. На каждую задачу:
  1) забирает её (claim), чтобы никто другой не взял;
  2) раскладывает в папку клиента контекст: бренд-кит, стратегию, переписку, файлы;
  3) запускает Claude Code в этой папке (сессия продолжается от задачи к задаче —
     так правки понимают, о каком ролике речь);
  4) заливает готовые файлы в хранилище и отвечает в чат.
"""
import json, os, pathlib, re, shutil, subprocess, sys, time, traceback
import requests

HOME = pathlib.Path("/srv/easylife-chat-agent")
ENV = dict(l.split("=", 1) for l in (HOME / ".env").read_text().splitlines() if "=" in l)
API = ENV["CRM_API_URL"].rstrip("/") + "/api/agent/chat"
HDR = {"x-agent-secret": ENV["AGENT_SECRET"], "content-type": "application/json"}
TIMEOUT = int(ENV.get("CHAT_TIMEOUT_MIN", "45")) * 60
WORK = HOME / "work"
# У клиента два чата с ИИ: по рилсам и по сторис. Переписка не смешивается, папка клиента общая.
THREAD_RU = {"reels": "рилсы", "stories": "сторис", "strategy": "стратегия", "avatar": "аватар"}
THREAD_HINT = {
    "reels": "Задачи этого чата — рилсы: монтаж роликов, правки, разбор стиля роликов.",
    "strategy": "Это чат по проекту в целом. Ты видишь переписку всех трёх чатов (метки [рилсы]/[сторис]/[стратегия]), PLAN.md и STATS.md. "
                "Задача — думать и советовать: что зашло, что выкладывать, какие сторис поставить рядом с рилсами, чего не хватает в плане. "
                "Отвечай текстом с конкретикой по этому клиенту; файлы делай, только если прямо попросили.",
    "stories": "Задачи этого чата — сторис: серии сторис (кадры PNG 1080×1920 или короткие видео), тексты, план сторис. Рилсы здесь не монтируй, если об этом прямо не просят.",
    "avatar": "Чат голоса и видео аватара HeyGen. Правила — раздел «Чат „Аватар“» в CLAUDE.md, настройки и заказ — AVATAR.json. Каждая генерация тратит кредиты агентства.",
}

# Инструменты HeyGen (MCP-сервер heygen у пользователя chatagent). Включаются только в чате «Аватар»,
# каждый вызов дополнительно проверяет хук bin/heygen_guard.py (лук и голос клиента, одна генерация на задачу).
HEYGEN_READ = ["list_avatar_looks", "get_avatar_look", "get_video", "get_current_user"]
HEYGEN_GEN = {"voice": ["create_speech", "create_speech_without_player"], "video": ["create_video_from_avatar"]}
CURRENT_DIR = HOME / ".current_jobs"     # по файлу на каждую задачу в работе (их может быть несколько)
CURRENT_DIR.mkdir(exist_ok=True)
LEGACY_CURRENT = HOME / ".current_job"
FILES_KEEP_DAYS = 14   # файлы переписки старше — не держим на диске (см. /etc/cron.d/easylife-disk-cleanup)
PARALLEL = int(ENV.get("CHAT_PARALLEL", "3"))   # сколько задач РАЗНЫХ клиентов идут одновременно
# правила перечитываются на каждую задачу — правка CLAUDE.md работает без перезапуска
MEDIA = re.compile(r"\.(mp4|mov|webm|m4v|png|jpe?g|webp|gif|pdf|zip|mp3|wav|srt|html?|docx|xlsx|pptx|csv|txt|md)$", re.I)


def log(*a):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


def api_get(**params):
    r = requests.get(API, headers=HDR, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def api_post(**body):
    r = requests.post(API, headers=HDR, json=body, timeout=120)
    r.raise_for_status()
    return r.json()


def safe(name):
    return re.sub(r"[^\w.\-() ]+", "_", name)[:120] or "file"


def fetch_file(key, dest):
    """Скачать файл из чата один раз и держать в папке клиента."""
    if dest.exists() and dest.stat().st_size > 0:
        return
    url = api_post(op="download", key=key)["url"]
    with requests.get(url, stream=True, timeout=600) as r:
        r.raise_for_status()
        tmp = dest.with_suffix(dest.suffix + ".part")
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
        tmp.rename(dest)


def upload_file(client_id, path):
    j = api_post(op="upload", client_id=client_id, filename=path.name)
    ctype = {".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".png": "image/png",
             ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
             ".pdf": "application/pdf", ".zip": "application/zip", ".mp3": "audio/mpeg", ".wav": "audio/wav",
             ".srt": "text/plain; charset=utf-8", ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
             ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".csv": "text/csv; charset=utf-8",
             ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
             ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
             ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}.get(path.suffix.lower(), "application/octet-stream")
    with open(path, "rb") as f:
        r = requests.put(j["uploadUrl"], data=f, headers={"Content-Type": ctype}, timeout=1800)
    r.raise_for_status()
    return {"key": j["key"], "name": path.name, "type": ctype.split(";")[0], "size": path.stat().st_size}


JOURNAL_KEEP = 60   # записей в JOURNAL.md; старше — в JOURNAL_ARCHIVE.md


def rotate_journal(ws):
    """Журнал растёт в конец, а ИИ читает файл с начала (по умолчанию первые 2000 строк) — при 2–3 тыс. строк
    он видел начало октября и не видел последние задачи (22.10: «тупит, рисует мимо» у Laccura, Юлии, Lash).
    Держим в JOURNAL.md последние JOURNAL_KEEP записей, остальное дописываем в JOURNAL_ARCHIVE.md (ничего не теряется)."""
    j = ws / "JOURNAL.md"
    if not j.exists():
        return
    text = j.read_text()
    parts = re.split(r"(?m)^(?=## )", text)
    head, entries = (parts[0], parts[1:]) if parts and not parts[0].startswith("## ") else ("", parts)
    if len(entries) <= JOURNAL_KEEP:
        return
    old, keep = entries[:-JOURNAL_KEEP], entries[-JOURNAL_KEEP:]
    arch = ws / "JOURNAL_ARCHIVE.md"
    fresh = not arch.exists() or arch.stat().st_size == 0
    with open(arch, "a") as f:
        if fresh:
            f.write("# Архив журнала (старые записи; искать: grep -n \"#<номер задачи>\" JOURNAL_ARCHIVE.md)\n\n")
        f.write("".join(old))
    head = head.strip() or "# Рабочий журнал клиента"
    j.write_text(head + "\n\nЗдесь последние " + str(JOURNAL_KEEP) + " задач, свежие внизу. Более ранние — в JOURNAL_ARCHIVE.md "
                 "(ищи по номеру задачи или названию ролика: grep -n).\n\n" + "".join(keep))


def prepare(job):
    msg, client = job["message"], job["client"]
    cid, mid = client["id"], msg["id"]
    ws = WORK / f"client_{cid}"
    files = ws / "files"
    out = ws / "out" / str(mid)
    for d in (files, out):
        d.mkdir(parents=True, exist_ok=True)
    (ws / "CLAUDE.md").write_text((HOME / "CLAUDE.md").read_text())
    try:
        rotate_journal(ws)
    except Exception as e:
        log("журнал не перенёсся в архив", e)

    # файлы из переписки: имя «<id сообщения>_<имя файла>», чтобы не путать версии
    def local(m, a):
        return files / f"{m['id']}_{safe(a['name'])}"
    quoted = job.get("quoted")
    # Файлы переписки качаем только за последние FILES_KEEP_DAYS дней (+ текущее сообщение и цитата).
    # Старше — их удаляет ночная чистка диска (18.10.2026 диск забился), ИИ докачает нужный сам: bin/getfile.
    fresh_from = time.time() - FILES_KEEP_DAYS * 86400
    def is_fresh(m):
        try:
            from datetime import datetime, timezone
            return datetime.strptime(m["created_at"][:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp() >= fresh_from
        except Exception:
            return True
    for m in job["history"] + ([quoted] if quoted else []):
        if m is not msg and m is not quoted and not is_fresh(m):
            continue
        for a in m.get("attachments") or []:
            try:
                fetch_file(a["key"], local(m, a))
            except Exception as e:
                log("не скачался файл", a.get("name"), e)

    name = " ".join(x for x in [client.get("name"), client.get("surname")] if x)
    hist = []
    for m in job["history"]:
        who = "ИИ (ты)" if m["author_type"] == "ai" else (m.get("author_name") or "Сотрудник")
        att = "".join(f"\n    📎 files/{local(m, a).name}" + ("" if local(m, a).exists() else f"  (старый, на сервере нет — если нужен: python3 ~/bin/getfile.py {a['key']} files/{local(m, a).name})")
                      for a in (m.get("attachments") or []))
        tag = f"[{THREAD_RU.get(m.get('thread') or 'reels')}] " if (msg.get('thread') == 'strategy') else ""
        re_ = f" (ответ на #{m['quote_id']})" if m.get("quote_id") else ""
        hist.append(f"{tag}[{m['created_at'][:16].replace('T', ' ')}] #{m['id']} {who}{re_}: {m['body']}{att}")

    (ws / "CONTEXT.md").write_text(f"""# Клиент: {name} (карточка {cid})
Ниша: {client.get('niche') or '—'} · Продукт: {client.get('product') or '—'}
Instagram: {client.get('instagram') or '—'} · TikTok: {client.get('tiktok') or '—'} · Часовой пояс: {client.get('timezone') or '—'}

## Голос бренда (из карточки)
{client.get('brand_voice') or '— не заполнен —'}

## Бренд-кит (вкладка «Стратегия» → «Бренд»)
```json
{json.dumps(job.get('brand_kit'), ensure_ascii=False, indent=2) if job.get('brand_kit') else '— не заполнен —'}
```

## Контент-стратегия
{job.get('strategy') or '— не заполнена —'}

## Переписка в этом чате ({THREAD_RU.get(msg.get('thread') or 'reels')}), старые сверху
{chr(10).join(hist)}
""")
    try:
        write_folder(ws, job)
    except Exception:
        log("папка клиента не собралась", traceback.format_exc()[-800:])
    try:
        write_script(ws, job.get("script"))
    except Exception:
        log("сценарий не собрался", traceback.format_exc()[-800:])
    # чат «Стратегия»: распаковка, «Наши цифры», снимок профиля и методика прогноза
    pl = job.get("planning")
    for name, key in (("UNPACKING.md", "unpacking"), ("BENCHMARKS.md", "benchmarks"), ("PROFILE.md", "profile")):
        f = ws / name
        if pl and pl.get(key):
            f.write_text(pl[key])
        else:
            f.unlink(missing_ok=True)
    if pl and (HOME / "FORECAST.md").exists():
        (ws / "FORECAST.md").write_text((HOME / "FORECAST.md").read_text())
    else:
        (ws / "FORECAST.md").unlink(missing_ok=True)
    # чат «Аватар»: что разрешено клиенту и что заказано кнопкой (хук сверяет с этим файлом каждый вызов HeyGen)
    av = job.get("avatar")
    if av:
        (ws / "AVATAR.json").write_text(json.dumps(av, ensure_ascii=False, indent=1))
    else:
        (ws / "AVATAR.json").unlink(missing_ok=True)
    task_att = "".join(f"\n- files/{local(msg, a).name}" for a in (msg.get("attachments") or [])) or "\n- (файлов нет)"
    quote_block = ""
    if quoted:
        qwho = "ИИ (твой ответ)" if quoted["author_type"] == "ai" else (quoted.get("author_name") or "сотрудник")
        qatt = "".join(f"\n- files/{local(quoted, a).name}" for a in (quoted.get("attachments") or []))
        quote_block = (f"\n## Человек ОТВЕЧАЕТ на сообщение #{quoted['id']} ({qwho}, {quoted['created_at'][:16].replace('T', ' ')})\n"
                       f"Задача относится именно к нему — правь/обсуждай то, что в нём, а не последнее сообщение чата.\n"
                       f"Если это твой ответ с файлом — переделывай этот файл/вариант.\n\n> " + (quoted.get("body") or "(без текста)")[:8000].replace("\n", "\n> ")
                       + (f"\n\nФайлы того сообщения:{qatt}" if qatt else "") + "\n")
    (ws / "TASK.md").write_text(f"""# Чат: {THREAD_RU.get(msg.get('thread') or 'reels').upper()}. {THREAD_HINT.get(msg.get('thread') or 'reels')}

# Текущая задача — сообщение #{mid} от {msg.get('author_name') or 'сотрудника'}

{msg['body'] or '(без текста — смотри приложенные файлы)'}
{quote_block}
## Приложено к этому сообщению{task_att}

## Куда класть результат
- Ответ человеку: out/{mid}/reply.md
- Готовые файлы (ролик, кадры сторис): out/{mid}/ — всё из этой папки уйдёт в чат
{AVATAR_HINT.format(mid=mid, kind=((av or {}).get("job") or {}).get("kind") or "заказ") if av else ""}{SCRIPT_HINT.format(mid=mid) if job.get("script") else ""}{FORECAST_HINT.format(mid=mid, pkg=(pl or {}).get("package") or "не указан") if pl else ""}""")
    return ws, out


AVATAR_HINT = """
## Чат «Аватар» — AVATAR.json (вид задачи: {kind})
- Нет job.gen_id и нет sync → это ЗАКАЗ: ничего не генерируй. Разметь текст тегами эмоций, примени словарь, выбери лук и запиши
  out/{mid}/avatar.json → {{"order": {{"text": "текст с тегами", "look_id": "id лука из config.look_ids"}}}} + короткий reply.md.
- В AVATAR.json sync = true → «Обнови образы из HeyGen»: только list_avatar_looks (groupId = каждый id из config.heygen_group_id — их может быть несколько через запятую, limit 50, листай next_token до конца),
  ничего не генерируй. Запиши out/{mid}/looks.json — массив [{{"id", "name", "avatar_type", "preview_image_url", "supported_api_engines", "status"}}] как пришло. Картинки скачает исполнитель.
- job.kind = "voice" → ОДНА озвучка текста job.text (create_speech, voiceId и модель из config, speed = config.voice_speed).
- job.kind = "video" → ОДНО видео на луке job.look_id из аудио files/… (create_video_from_avatar, audioUrl, engine из config).
- Результат положи в out/{mid}/ (mp3 / mp4 / webm / srt) и запиши out/{mid}/avatar.json →
  {{"gen": {{"file": "имя файла результата", "seconds": 0, "credits_before": 0, "credits_after": 0, "heygen_id": "…"}}}}
  Кредиты — из get_current_user до и после генерации. Ошибка или таймаут HeyGen — НЕ повторяй, запиши {{"gen": {{"error": "что случилось"}}}}.
"""


SCRIPT_HINT = """
## Сценарий, над которым идёт работа — SCRIPT.md
В этом чате работают над конкретным сценарием из CRM: его текст, референс (ссылка, расшифровка, цифры, разбор) и путь к скачанному видео-референсу — в SCRIPT.md.
Записать согласованный текст в сценарий — ТОЛЬКО когда человек прямо сказал («записывай», «вноси в сценарий», «сохрани»):
out/{mid}/script.json → {{"hook_text": "тема", "hook": "хук", "body_text": "основной текст", "cta": "призыв", "post_caption": "описание к ролику"}}
(только те поля, что меняются; прежний текст CRM вернёт в журнал).
"""


FORECAST_HINT = """
## Прогноз (если просят прогноз-стратегию)
Методика — FORECAST.md. Данные: UNPACKING.md, PROFILE.md, BENCHMARKS.md, DOCS.md (аудит). Пакет в карточке клиента: {pkg} роликов в месяц.
Результат: out/{mid}/forecast.html + out/{mid}/forecast.json + out/{mid}/reply.md. PDF и сохранение во вкладку «Стратегия» → «Прогноз» сделает исполнитель.
"""


def write_script(ws, sc):
    """SCRIPT.md: сценарий из CRM + референс; видео-референс скачиваем один раз в refs/."""
    f = ws / "SCRIPT.md"
    if not sc:
        f.unlink(missing_ok=True)
        return
    ref = sc.get("reference") or {}
    url = (sc.get("ref_url") or ref.get("url") or "").strip()
    video = None
    if url:
        refs = ws / "refs"
        refs.mkdir(exist_ok=True)
        have = sorted(refs.glob(f"script_{sc['id']}.*"))
        video = have[0] if have else None
        if not video:
            try:
                subprocess.run([str(HOME / ".venv/bin/yt-dlp"), "-q", "--no-playlist", "-f", "mp4/best", "-o", str(refs / f"script_{sc['id']}.%(ext)s"), url],
                               timeout=240, check=True, capture_output=True)
                have = sorted(refs.glob(f"script_{sc['id']}.*"))
                video = have[0] if have else None
            except Exception as e:
                log("референс не скачался", sc["id"], url, str(e)[:200])
    transcript = (sc.get("ref_text") or sc.get("transcription") or ref.get("transcript") or "").strip()
    nums = " · ".join(f"{k} {n(v)}" for k, v in (("просмотры", sc.get("ref_views") or ref.get("views")), ("лайки", sc.get("ref_likes") or ref.get("likes")),
                                                 ("комментарии", sc.get("ref_comments") or ref.get("comments"))) if v)
    f.write_text(f"""# Сценарий из CRM: #{sc.get('order_num') or '—'} (id {sc['id']}), месяц M{sc.get('month_number')}
Статус: сценарий {sc.get('script_status')} · монтаж {sc.get('video_status')}{' · ролик уже смонтирован: ' + sc['video_url'] if sc.get('video_url') else ''}

## Наш текст сейчас
- Тема: {sc.get('hook_text') or '—'}
- Хук: {sc.get('hook') or '—'}
- Основной текст:
{sc.get('body_text') or '—'}
- Призыв: {sc.get('cta') or '—'}
- Описание к ролику:
{sc.get('post_caption') or '—'}

## Референс
Ссылка: {url or '— нет —'}{(' · автор ' + ref['author']) if ref.get('author') else ''}
Цифры: {nums or '—'}
Видео: {('refs/' + video.name + ' — смотри кадры и звук сам') if video else ('не скачалось — работай по расшифровке' if url else '—')}

### Расшифровка референса
{transcript or '— нет —'}

### Подпись под референсом
{(ref.get('caption') or '—')[:3000]}

### Разбор (что тащило ролик)
{sc.get('description') or ref.get('analysis') or '—'}
""")


def n(v):
    return "—" if v is None else f"{v:,}".replace(",", " ") if isinstance(v, (int, float)) else str(v)


def write_folder(ws, job):
    """Папка клиента для ИИ: контент-план, статистика, медиатека, документы. Обновляется на каждую задачу."""
    ST = {"notStarted": "не начат", "inProgress": "в работе", "review": "на проверке", "approved": "утверждён",
          "ready": "готов", "published": "вышел"}
    # --- PLAN.md
    L = ["# Контент-план клиента (из CRM, свежие сверху)", "",
         "Рилсы: дата выхода · сценарий/монтаж · заголовок. Сторис и готовые ролики без сценария — ниже.", ""]
    for x in sorted(job.get("plan") or [], key=lambda x: x.get("pub_date") or "0000", reverse=True):
        L.append(f"- [{x.get('pub_date') or 'без даты'}] М{x.get('month_number')} #{x.get('order_num') or '?'} · сценарий: {ST.get(x.get('script_status'), x.get('script_status'))}"
                 f" · видео: {ST.get(x.get('video_status'), x.get('video_status'))} · {x.get('hook_text') or 'без заголовка'}"
                 + (f"\n  текст: {x['body_text']}" if x.get("body_text") else "") + (f"\n  призыв: {x['cta']}" if x.get("cta") else "")
                 + (f"\n  готовый ролик (файл): {x['video_url']}" if x.get("video_url") else "")
                 + (f"\n  опубликован: {x['published_url']}" if x.get("published_url") else ""))
    L += ["", "## Публикации (очередь и вышедшее): рилсы без сценария, карусели, сторис", ""]
    PS = {"adapting": "готовится", "review": "на проверке", "queued": "в очереди", "scheduled": "запланировано", "published": "вышло", "error": "ошибка"}
    for x in job.get("publications") or []:
        L.append(f"- [{(x.get('publish_at') or 'без даты')[:16].replace('T', ' ')}] {x.get('content_type')} · {PS.get(x.get('pub_status'), x.get('pub_status'))}"
                 + (f" · сценарий id {x['script_id']}" if x.get("script_id") else "") + (f" · {x['base_text']}" if x.get("base_text") else ""))
    (ws / "PLAN.md").write_text("\n".join(L) + "\n")

    # --- STATS.md
    L = ["# Статистика клиента (из CRM)", "", "## По неделям (свежие сверху)", ""]
    for w in job.get("weekly") or []:
        tp = w.get("top_post") or {}
        L.append(f"- {w.get('week_start')}…{w.get('week_end')}: роликов {n(w.get('reels_count'))}, просмотры {n(w.get('views'))}, охват {n(w.get('reach'))}, "
                 f"лайки {n(w.get('likes'))}, комм. {n(w.get('comments'))}, сохр. {n(w.get('saves'))}, репосты {n(w.get('shares'))}, ER {n(w.get('er'))}%, "
                 f"подписчиков {n(w.get('followers_end'))} ({'+' if (w.get('followers_gained') or 0) >= 0 else ''}{n(w.get('followers_gained'))})"
                 + (f"\n  лучший: {tp.get('url') or tp.get('post_url') or ''} · {n(tp.get('views'))} просм." if tp else ""))
    reels = sorted(job.get("reels") or [], key=lambda r: r.get("views") or 0, reverse=True)
    L += ["", f"## Ролики по просмотрам (последний снимок, всего {len(reels)})", "",
          "Сопоставляй ссылку с PLAN.md (там заголовки вышедших) — так видно, какие темы и хуки зашли, а какие нет.", ""]
    for r in reels[:60]:
        L.append(f"- {n(r.get('views'))} просм. · {r.get('network')} · вышел {r.get('published_at')} (возраст {n(r.get('age_days'))} дн.) · лайки {n(r.get('likes'))}, комм. {n(r.get('comments'))}, "
                 f"сохр. {n(r.get('saves'))}, репосты {n(r.get('shares'))}, досмотр {n(r.get('avg_watch_sec'))} с · {r.get('post_url')}")
    duel = [x for x in (job.get("plan") or []) if x.get("our_views")]
    if duel:
        L += ["", "## Наш ролик против референса (просмотры)", ""]
        for x in sorted(duel, key=lambda x: x.get("our_views") or 0, reverse=True)[:40]:
            L.append(f"- наш {n(x.get('our_views'))} / реф {n(x.get('ref_views'))} · {x.get('hook_text')} · {x.get('published_url') or ''}")
    if not (job.get("weekly") or reels or duel):
        L.append("Цифр по этому клиенту в CRM пока нет — не выдумывай их, так и скажи.")
    (ws / "STATS.md").write_text("\n".join(L) + "\n")

    # --- медиатека: ВСЕ файлы (и видео) лежат в media/files/<id>.<ext> — путь не меняется, когда ИИ
    #     переименовывает файл или меняет тему; разбор и «папки» по темам — в LIBRARY.md (ведёт ИИ).
    media = ws / "media" / "files"
    media.mkdir(parents=True, exist_ok=True)
    L = ["# Медиатека клиента (из CRM)", "",
         "Все файлы: media/files/<id>.<расширение>. Разбор (что на файле, тема, лучшие моменты) — в LIBRARY.md, его ведёшь ты.",
         "Тема файла в CRM — тег «тема:…», разобранный файл — тег «разобрано».",
         "**Фото/видео с лицом без согласия (согласие: нет / неизвестно) в ролики и сторис НЕ ставить.** «Нельзя использовать» — не трогать вообще.", ""]
    for a in job.get("assets") or []:
        ext = (a["file_key"].rsplit(".", 1)[-1] or "bin").lower()
        dest = media / f"{a['id']}.{ext}"
        if a.get("usable") and a.get("kind") in ("image", "video", "font"):
            try:
                fetch_file(a["file_key"], dest)
            except Exception as e:
                log("медиатека: не скачался", a.get("id"), e)
        tags = a.get("tags") or []
        consent = {"yes": "есть", "no": "НЕТ", "not_needed": "не нужно", "unknown": "неизвестно"}.get(a.get("consent"), a.get("consent"))
        L.append(f"- [id {a['id']}] {('media/files/' + dest.name) if dest.exists() else '(не скачан)'} · {a.get('kind')} · {a['category']} · {a.get('title') or ''}"
                 f" · теги: {', '.join(tags) or '—'} · {'разобран' if 'разобрано' in [t.lower() for t in tags] else 'НЕ РАЗОБРАН'}"
                 f" · лицо: {'да' if a.get('has_face') else 'нет'} · согласие: {consent}"
                 + ("" if a.get("usable") else " · НЕЛЬЗЯ ИСПОЛЬЗОВАТЬ"))
    if not (job.get("assets") or []):
        L.append("Медиатека пуста. Попроси сотрудника загрузить видео и фото клиента: карточка → «Стратегия» → «Медиатека».")
    lib = ws / "LIBRARY.md"
    if not lib.exists():
        lib.write_text("# Библиотека клиента — разбор медиатеки\n\nВедёт ИИ. По теме (процедура/услуга/место) — список файлов: что на нём, длительность, лучшие моменты с таймкодами, куда годится (рилс/сторис).\n")
    (ws / "MEDIA.md").write_text("\n".join(L) + "\n")

    # --- документы (аудит, бриф, контент-план текстом)
    L = ["# Документы клиента (текущие версии)", ""]
    for d in job.get("docs") or []:
        L += [f"## {d.get('title')} ({d.get('kind')}, версия {d.get('version')})", "", d.get("body") or "(файл без текста в CRM)", ""]
    (ws / "DOCS.md").write_text("\n".join(L) + "\n")


def fresh_token():
    """Токен подписки читаем из .env на каждую задачу — смена аккаунта Claude без перезапуска."""
    for l in (HOME / ".env").read_text().splitlines():
        if l.startswith("CLAUDE_CODE_OAUTH_TOKEN="):
            return l.split("=", 1)[1].strip()
    return ENV["CLAUDE_CODE_OAUTH_TOKEN"]


def run_claude(ws, mid, resume=False, avatar=None):
    # Каждая задача — с чистого листа. Раньше разговор по клиенту продолжался бесконечно, и к каждой задаче
    # тянулась вся прошлая история: 01.10 три кадра сторис стоили $9,8 при контексте 276 тыс. токенов.
    # Память между задачами теперь в файлах: JOURNAL.md (что сделано и где лежит), STYLE.md, files/, studio/src/crm.
    # Продолжаем тот же разговор только если эту же задачу прервали на середине.
    cmd = ["/usr/bin/claude", "-p",
           f"Прочитай CONTEXT.md, TASK.md и JOURNAL.md и выполни задачу #{mid} по правилам из CLAUDE.md. "
           f"Если ты уже начинал эту задачу и прервался — продолжи с места остановки, сделанное не переделывай. "
           f"Ответ человеку обязательно запиши в out/{mid}/reply.md.",
           "--output-format", "json",
           "--model", ENV.get("CHAT_MODEL", "claude-opus-5-5"),   # монтаж — только Opus 5.5
           "--add-dir", str(HOME / "easylife-montage"), str(HOME / "easylife-top-reels"),
           "--allowedTools", "Bash", "Read", "Write", "Edit", "Glob", "Grep"]
    kind = ((avatar or {}).get("job") or {}).get("kind")
    if avatar and not avatar.get("error"):
        # только чат «Аватар»: чтение луков и кредитов + ровно тот вид генерации, что заказан кнопкой
        cmd += [f"mcp__heygen__{t}" for t in HEYGEN_READ + HEYGEN_GEN.get(kind, [])]
    else:
        cmd += ["--disallowedTools", "mcp__heygen"]   # в остальных чатах HeyGen недоступен совсем
    if resume:
        cmd.insert(1, "-c")   # та же задача после обрыва — продолжаем её разговор
    env = {"PATH": "/srv/easylife-chat-agent/bin:/srv/easylife-chat-agent/.venv/bin:/usr/local/bin:/usr/bin:/bin",
           "HOME": str(HOME), "LANG": "C.UTF-8",
           "CLAUDE_CODE_OAUTH_TOKEN": fresh_token()}   # секрет CRM сюда не передаём
    p = subprocess.run(cmd, cwd=ws, env=env, capture_output=True, text=True, timeout=TIMEOUT)
    try:
        res = json.loads(p.stdout)
    except Exception:
        res = {"result": p.stdout[-3000:], "is_error": p.returncode != 0}
    if p.returncode != 0 and not res.get("result"):
        raise RuntimeError((p.stderr or p.stdout or "Claude завершился с ошибкой")[-800:])
    return res


def handle(job):
    msg, cid, mid = job["message"], job["client"]["id"], job["message"]["id"]
    if not api_post(op="claim", id=mid).get("ok"):
        return
    cur = CURRENT_DIR / str(mid)
    cur.write_text(str(cid))   # если сервер перезапустится посреди задачи — вернём её в очередь
    log("задача", mid, "клиент", cid)
    t0 = time.time()
    try:
        ws, out = prepare(job)
        mark = ws / ".resume"
        resumed = mark.exists() and mark.read_text().strip() == str(mid)   # эту же задачу прервали на середине
        mark.write_text(str(mid))
        before = studio_snapshot()
        try:
            res = run_claude(ws, mid, resume=resumed, avatar=job.get("avatar"))
        finally:
            mark.unlink(missing_ok=True)   # при убийстве процесса сюда не дойдём — метка останется
        reply = (out / "reply.md").read_text().strip() if (out / "reply.md").exists() else (res.get("result") or "").strip()
        fh = out / "forecast.html"   # прогноз → PDF для клиента (тот же документ, по слайду на страницу)
        if fh.exists() and not (out / "forecast.pdf").exists():
            try:
                subprocess.run(["node", str(HOME / "bin" / "html2pdf.mjs"), str(fh), str(out / "forecast.pdf")], timeout=180, check=True, capture_output=True)
            except Exception as e:
                log("прогноз: PDF не собрался", str(e)[:300])
        atts = []
        for f in sorted(out.iterdir()):
            if f.is_file() and f.name != "reply.md" and MEDIA.search(f.name) and f.stat().st_size < 500 * 1048576:
                atts.append(upload_file(cid, f))
        sj = out / "script.json"          # человек сказал «записывай» → текст в сценарий CRM
        if sj.exists() and job.get("script"):
            try:
                r = api_post(op="script_update", id=mid, script_id=job["script"]["id"], fields=json.loads(sj.read_text()))
                names = {"hook_text": "тема", "hook": "хук", "body_text": "текст", "cta": "призыв", "post_caption": "описание"}
                reply = (reply or "Готово.") + "\n\n📝 Записал в сценарий: " + ", ".join(names.get(k, k) for k in r.get("updated", []))
                with open(ws / "JOURNAL.md", "a") as jf:   # прежний текст — чтобы можно было вернуть
                    jf.write(f"\n### Прежний текст сценария {job['script']['id']} до записи в задаче #{mid}\n```json\n{json.dumps(r.get('previous'), ensure_ascii=False, indent=1)}\n```\n")
            except Exception as e:
                log("сценарий не записался", e)
                reply = (reply or "") + f"\n\n⚠ В сценарий не записалось: {str(e)[:200]}"
        if fh.exists():                    # прогноз → новая версия во вкладке «Стратегия» → «Прогноз»
            try:
                keys = {a["name"]: a["key"] for a in atts}
                fj = out / "forecast.json"
                data = json.loads(fj.read_text()) if fj.exists() else {}
                if keys.get("forecast.pdf"):
                    data["pdf_key"] = keys["forecast.pdf"]
                title = str(data.get("title") or f"Прогноз · {job['client'].get('name') or ''}").strip()
                r = api_post(op="doc_save", id=mid, kind="forecast", title=title, file_key=keys["forecast.html"], data=data)
                reply = (reply or "Готово.") + f"\n\nПрогноз сохранён: вкладка «Стратегия» → «Прогноз», версия {r.get('version')}, статус «черновик»."
            except Exception as e:
                log("прогноз не сохранился", e)
                reply = (reply or "") + f"\n\n⚠ Прогноз не сохранился во вкладку «Прогноз»: {str(e)[:200]}. Файл есть выше в чате."
        upd = out / "assets.json"          # ИИ разобрал медиатеку → подписи и темы в CRM
        if upd.exists():
            try:
                r = api_post(op="asset_update", id=mid, assets=json.loads(upd.read_text()))
                log("медиатека: обновлено в CRM", r.get("updated"))
            except Exception as e:
                log("медиатека: не обновилась", e)
        try:
            journal(ws, mid, msg, reply, atts, before)
        except Exception:
            log("журнал не записался", traceback.format_exc()[-500:])
        lj = out / "looks.json"             # «Обновить образы из HeyGen»: картинки образов → наше хранилище → CRM
        if lj.exists() and (job.get("avatar") or {}).get("sync"):
            try:
                n = sync_looks(cid, mid, json.loads(lj.read_text()), ws)
                reply = (reply or "") + f"\n\n🖼 Образов в CRM: {n}. Выбрать разрешённые — «Настройки» → «Аватар HeyGen» → «Изменить»."
            except Exception as e:
                log("образы не сохранились", e)
                reply = (reply or "") + f"\n\n⚠ Образы не сохранились в CRM: {str(e)[:200]}"
        meta = None
        aj = out / "avatar.json"            # чат «Аватар»: карточка-заказ или итог генерации HeyGen
        gen_id = (((job.get("avatar") or {}).get("job")) or {}).get("gen_id")
        if aj.exists():
            try:
                a = json.loads(aj.read_text())
                if a.get("order") and not gen_id:
                    meta = {"type": "avatar_order", "text": a["order"].get("text", ""), "look_id": a["order"].get("look_id")}
                g = a.get("gen")
                if g and gen_id:
                    key = next((x["key"] for x in atts if x["name"] == g.get("file")), None)
                    api_post(op="avatar_gen", gen_id=gen_id, status="error" if g.get("error") or not key else "done",
                             error=g.get("error") or (None if key else "файл результата не найден"), result_key=key,
                             seconds=g.get("seconds"), credits_before=g.get("credits_before"), credits_after=g.get("credits_after"), heygen_id=g.get("heygen_id"))
                    gen_id = None
            except Exception as e:
                log("аватар: итог не разобрался", e)
        if gen_id:   # генерацию заказали, а итога нет — фиксируем ошибку (без автоповтора), id HeyGen — чтобы достать готовое
            try:
                hid = (json.loads(aj.read_text()).get("gen") or {}).get("heygen_id") if aj.exists() else None
            except Exception:
                hid = None
            api_post(op="avatar_gen", gen_id=gen_id, status="error", heygen_id=hid,
                     error="ИИ не дождался результата" + (f" (видео HeyGen {hid} — можно достать без новой генерации)" if hid else ""))
        mins = (time.time() - t0) / 60
        cost = res.get("total_cost_usd")
        log("готово", mid, f"{mins:.1f} мин", f"файлов {len(atts)}", f"расход ${cost}" if cost else "")
        api_post(op="reply", id=mid, body=reply or "Готово.", attachments=atts, status="done", meta=meta,
                 metrics={"minutes": round(mins, 2), "cost_usd": cost, "files": len(atts)})
    except subprocess.TimeoutExpired:
        avatar_failed(job, "таймаут задачи")
        api_post(op="reply", id=mid, body="", status="error", error=f"Не уложился в {TIMEOUT // 60} минут. Разбейте задачу или напишите ещё раз.")
    except Exception as e:
        log("ошибка", mid, traceback.format_exc()[-1500:])
        avatar_failed(job, f"сбой исполнителя: {str(e)[:200]}")
        api_post(op="reply", id=mid, body="", status="error", error=f"Сбой исполнителя: {str(e)[:300]}")
    finally:
        cur.unlink(missing_ok=True)


def sync_looks(cid, mid, looks, ws):
    """Картинки образов HeyGen живут по временным ссылкам — копируем их к нам и отдаём список в CRM."""
    tmp = ws / ".looks_tmp"
    tmp.mkdir(exist_ok=True)
    out = []
    for lk in looks[:200]:
        lid = re.sub(r"[^A-Za-z0-9]", "", str(lk.get("id") or ""))[:64]
        if not lid:
            continue
        key = None
        if lk.get("preview_image_url"):
            try:
                r = requests.get(lk["preview_image_url"], timeout=60)
                r.raise_for_status()
                ext = ".webp" if "webp" in r.headers.get("content-type", "") or ".WEBP" in lk["preview_image_url"].upper() else ".jpg"
                f = tmp / f"look_{lid}{ext}"
                f.write_bytes(r.content)
                key = upload_file(cid, f)["key"]
                f.unlink(missing_ok=True)
            except Exception as e:
                log("картинка образа не скачалась", lid, str(e)[:120])
        out.append({"id": lid, "name": str(lk.get("name") or "")[:80], "type": lk.get("avatar_type"), "preview_key": key,
                    "engines": lk.get("supported_api_engines") or [], "status": lk.get("status")})
    api_post(op="avatar_looks", id=mid, looks=out)
    return len(out)


def avatar_failed(job, why):
    """Задача чата «Аватар» упала — закрываем генерацию ошибкой, иначе следующие кнопки будут ждать её вечно. Без автоповтора."""
    gid = (((job.get("avatar") or {}).get("job")) or {}).get("gen_id")
    if gid:
        try:
            api_post(op="avatar_gen", gen_id=gid, status="error", error=why)
        except Exception:
            pass


STUDIO = HOME / "easylife-montage" / "studio"


def studio_snapshot():
    """Время изменения рабочих файлов студии — чтобы после задачи записать в журнал, что ИИ создал или правил."""
    snap = {}
    for pat in ("src/crm/*.tsx", "public/crm_*"):
        for f in STUDIO.glob(pat):
            try:
                snap[str(f.relative_to(STUDIO))] = f.stat().st_mtime
            except OSError:
                pass
    return snap


def journal(ws, mid, msg, reply, atts, before):
    """Рабочий журнал клиента: по записи на задачу. Каждая задача начинается с чистого листа,
    и это единственное, откуда ИИ узнаёт, что делал раньше и в каких файлах лежит прошлый ролик."""
    after = studio_snapshot()
    touched = sorted(k for k, v in after.items() if before.get(k) != v and re.search(rf"(?<!\d){mid}(?!\d)", k))
    j = ws / "JOURNAL.md"
    if not j.exists():
        j.write_text("# Рабочий журнал клиента\n\nСвежие записи внизу. Технические заметки ИИ дописывает сам под записью задачи.\n")
    notes = ws / "out" / str(mid) / "notes.md"     # технические заметки ИИ по задаче (см. CLAUDE.md)
    L = ["", f"## [{THREAD_RU.get(msg.get('thread') or 'reels')}] Задача #{mid} · {time.strftime('%Y-%m-%d %H:%M')} UTC · от {msg.get('author_name') or 'сотрудника'}",
         f"Просили: {(msg.get('body') or '(без текста)').strip()[:500]}",
         f"Отдал файлы: {', '.join(a['name'] for a in atts) or 'нет'} (лежат в out/{mid}/)",
         f"Файлы студии, созданные или изменённые: {', '.join(touched) or 'нет'}"]
    if notes.exists():
        L.append("Заметки: " + notes.read_text().strip()[:1500])
    L.append("Ответил: " + (reply or "").strip()[:700])
    with open(j, "a") as f:
        f.write("\n".join(L) + "\n")


def resume_interrupted():
    """Задача прервалась (перезапуск, нехватка памяти) — возвращаем её в очередь.
    Сессия Claude и файлы в папке клиента сохранились, так что ИИ продолжит с того же места."""
    files = list(CURRENT_DIR.iterdir()) + ([LEGACY_CURRENT] if LEGACY_CURRENT.exists() else [])
    for f in files:
        try:
            mid = int(f.name) if f.parent == CURRENT_DIR else int(f.read_text().strip() or 0)
        except ValueError:
            f.unlink(missing_ok=True); continue
        f.unlink(missing_ok=True)
        try:
            if mid and api_post(op="requeue", id=mid).get("ok"):
                api_post(op="progress", id=mid, body="Сервер прервал задачу на середине (перезапуск или нехватка памяти). Продолжаю с того же места, всё сделанное сохранилось.")
                log("вернул в очередь прерванную задачу", mid)
        except Exception as e:
            log("не смог вернуть задачу", mid, e)


# ---------------- Быстрая очередь: ИИ-кнопки CRM (стоп-слова, адаптация, подписи, отчёты) ----------------
QUICK_API = ENV["CRM_API_URL"].rstrip("/") + "/api/agent/quick"


def quick_model(m):
    """Модель из настроек CRM (claude-opus-5, claude-sonnet-5…) → псевдоним Claude Code (последняя версия семейства)."""
    m = (m or "").lower()
    return "haiku" if "haiku" in m else "sonnet" if "sonnet" in m else "opus"


def quick_run(job):
    """Одна короткая задача: без инструментов и без сессии — просто ответ модели по подписке."""
    jid = job["id"]
    try:
        if not requests.post(QUICK_API, headers=HDR, json={"op": "claim", "id": jid}, timeout=30).json().get("ok"):
            return
        t0 = time.time()
        cmd = ["/usr/bin/claude", "-p", "--model", quick_model(job.get("model")), "--tools", "", "--no-session-persistence",
               "--setting-sources", "", "--output-format", "json"]
        if job.get("system"):
            cmd += ["--system-prompt", job["system"]]
        env = {"PATH": "/usr/bin:/bin", "HOME": str(HOME), "LANG": "C.UTF-8", "CLAUDE_CODE_OAUTH_TOKEN": fresh_token()}
        quick_dir = HOME / "quick"
        quick_dir.mkdir(exist_ok=True)
        p = subprocess.run(cmd, input=job["prompt"], cwd=quick_dir, env=env, capture_output=True, text=True, timeout=180)
        res = json.loads(p.stdout) if p.stdout.strip().startswith("{") else {}
        text = (res.get("result") or "").strip()
        if p.returncode != 0 or res.get("is_error") or not text:
            raise RuntimeError((res.get("result") or p.stderr or p.stdout or "пустой ответ")[-500:])
        requests.post(QUICK_API, headers=HDR, json={"op": "done", "id": jid, "result": text}, timeout=60)
        log("кнопка ИИ", job.get("kind"), jid, f"{time.time() - t0:.0f} с", f"${res.get('total_cost_usd')}")
    except Exception as e:
        log("кнопка ИИ: ошибка", jid, str(e)[:300])
        try:
            requests.post(QUICK_API, headers=HDR, json={"op": "error", "id": jid, "error": f"Сервер ИИ: {str(e)[:300]}"}, timeout=30)
        except Exception:
            pass


def quick_loop():
    """Отдельный поток: короткие задачи не ждут, пока идут монтажи (до 4 одновременно)."""
    from concurrent.futures import ThreadPoolExecutor
    pool = ThreadPoolExecutor(max_workers=4)
    while True:
        try:
            r = requests.get(QUICK_API, headers=HDR, params={"op": "queue"}, timeout=30)
            for job in (r.json().get("jobs") or []) if r.ok else []:
                pool.submit(quick_run, job)
        except Exception as e:
            log("быстрая очередь недоступна:", e)
        time.sleep(2)


# ---------------- Instagram через наш вход: ролики, которые без входа не отдаются (18+, пластика, медицина) ----------------
IG_SESSION = HOME / "ig_session.json"   # куки вошедшего аккаунта (ставит Ярослав: ops/set_ig_session.sh), chmod 600
IG_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
IG_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"


def ig_fetch_video(url):
    """Ссылка на рилс → байты mp4 через вход в наш Instagram. Исключение с понятным текстом, если не вышло."""
    m = re.search(r"instagram\.com/(?:reel|reels|p|tv)/([A-Za-z0-9_-]+)", url or "")
    if not m:
        raise RuntimeError("Не похоже на ссылку на ролик Instagram.")
    if not IG_SESSION.exists():
        return ig_fetch_via_bridge(m.group(1))
    ck = json.loads(IG_SESSION.read_text())
    pk = 0
    for ch in m.group(1)[:11]:
        pk = pk * 64 + IG_ALPHA.index(ch)
    s = requests.Session()
    s.cookies.update({k: v for k, v in ck.items() if v})
    s.headers.update({"User-Agent": IG_UA, "X-IG-App-ID": "936619743392459", "X-Requested-With": "XMLHttpRequest",
                      "X-CSRFToken": ck.get("csrftoken", ""), "Referer": f"https://www.instagram.com/reel/{m.group(1)}/",
                      "Accept": "*/*", "Accept-Language": "ru,en;q=0.9"})
    r = s.get(f"https://www.instagram.com/api/v1/media/{pk}/info/", timeout=30, allow_redirects=False)
    if r.status_code in (301, 302, 401, 403) or "login" in (r.headers.get("location") or ""):
        raise RuntimeError("Вход в Instagram на сервере устарел — Ярославу нужно обновить его (ops/set_ig_session.sh).")
    if r.status_code == 404:
        raise RuntimeError("Ролик не найден — возможно, удалён.")
    r.raise_for_status()
    it = (r.json().get("items") or [{}])[0]
    vers = it.get("video_versions") or next((c.get("video_versions") for c in it.get("carousel_media") or [] if c.get("video_versions")), None)
    if not vers:
        raise RuntimeError("В этой публикации нет видео.")
    v = max(vers, key=lambda x: x.get("width") or 0)
    d = requests.get(v["url"], headers={"User-Agent": IG_UA, "Referer": "https://www.instagram.com/"}, timeout=180)
    d.raise_for_status()
    return d.content


IG_BRIDGE = "auditig@195.201.137.115"   # браузер с входом в Instagram (сервер аудитов); ключ умеет только «video <код>»


def ig_fetch_via_bridge(code):
    """Видео ролика через браузер на сервере аудитов (вход в Instagram там уже есть). Браузер общий с аудитами —
    если идёт аудит, ждём его окончания (замок на той стороне)."""
    key = HOME / ".ssh" / "id_igbridge"
    if not key.exists():
        raise RuntimeError("Нет ключа к браузеру с входом в Instagram (/srv/easylife-chat-agent/.ssh/id_igbridge).")
    r = subprocess.run(["ssh", "-i", str(key), "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
                        "-o", f"UserKnownHostsFile={HOME / '.ssh' / 'known_hosts'}", IG_BRIDGE, "video", code],
                       capture_output=True, text=True, timeout=900)
    try:
        d = json.loads((r.stdout or "").strip().splitlines()[-1])
    except Exception:
        raise RuntimeError("Браузер с входом в Instagram не ответил — попробуйте позже.")
    if d.get("error"):
        raise RuntimeError("Вход в Instagram на сервере аудитов слетел — Ярославу нужно зайти заново." if str(d["error"]).startswith("LOGIN") else str(d["error"]))
    v = requests.get(d["url"], headers={"User-Agent": IG_UA, "Referer": "https://www.instagram.com/"}, timeout=300)
    v.raise_for_status()
    return v.content


def ig_loop():
    """Раз в 15 секунд: есть ли ролики, которые CRM не смогла взять без входа."""
    while True:
        try:
            for job in api_post(op="igq").get("jobs", []):
                jid = job["id"]
                try:
                    data = ig_fetch_video(job.get("source_url"))
                    put = api_post(op="igq_put", id=jid)
                    requests.put(put["uploadUrl"], data=data, headers={"Content-Type": "video/mp4"}, timeout=300).raise_for_status()
                    api_post(op="igq_done", id=jid, key=put["key"])
                    log("instagram: скачал ролик для транскрибации", jid, f"{len(data) // 1048576} МБ")
                except Exception as e:
                    log("instagram: не скачал", jid, str(e)[:200])
                    api_post(op="igq_done", id=jid, error=str(e)[:400])
                time.sleep(3)   # не дёргаем Instagram пачкой
        except Exception as e:
            log("instagram: очередь недоступна", str(e)[:200])
        time.sleep(15)


_limits = {"at": 0.0, "data": {}}


def claude_limits():
    """Загрузка лимитов подписки Claude (5-часовое окно и неделя) — из заголовков ответа на крошечный запрос
    (1 токен Haiku раз в час — Ярославу важно понимать, хватает ли 5-часового окна, чаще не нужно).
    Эндпоинт /api/oauth/usage часто отвечает 429, а заголовки приходят всегда."""
    if time.time() - _limits["at"] < 3600:
        return _limits["data"]
    _limits["at"] = time.time()
    try:
        r = requests.post("https://api.anthropic.com/v1/messages", timeout=30, headers={
            "Authorization": f"Bearer {fresh_token()}", "anthropic-beta": "oauth-2025-04-20",
            "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-haiku-4-5", "max_tokens": 1,
                  "system": "You are Claude Code, Anthropic's official CLI for Claude.",
                  "messages": [{"role": "user", "content": "ping"}]})
        h = r.headers   # при 429 (лимит исчерпан) заголовки тоже есть
        g = lambda k: h.get(f"anthropic-ratelimit-unified-{k}")
        ts = lambda v: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(v))) if v and str(v).isdigit() else None
        num = lambda v: float(v) if v not in (None, "") else None
        _limits["data"] = {k: v for k, v in {
            "claude_5h_util": num(g("5h-utilization")), "claude_5h_reset": ts(g("5h-reset")),
            "claude_7d_util": num(g("7d-utilization")), "claude_7d_reset": ts(g("7d-reset")),
            "claude_status": g("status"), "claude_overage": g("overage-status"),
        }.items() if v is not None}
    except Exception as e:
        log("лимиты Claude не снялись:", str(e)[:200])
    return _limits["data"]


def heartbeat_loop():
    """Раз в 5 минут — состояние сервера в CRM (страница «ИИ-чат: аналитика», видит только владелец)."""
    while True:
        try:
            du = shutil.disk_usage("/")
            load1 = os.getloadavg()[0]
            mem = {}
            for line in open("/proc/meminfo"):
                k, v = line.split(":", 1); mem[k] = int(v.split()[0])
            running = len(list(CURRENT_DIR.iterdir())) if CURRENT_DIR.exists() else 0
            # как в df: занято / (занято + свободно), в ГиБ (зарезервированное системой не считаем)
            api_post(op="heartbeat", disk_used_gb=round(du.used / 2**30, 1), disk_total_gb=round((du.used + du.free) / 2**30, 1),
                     load1=round(load1, 2), cpus=os.cpu_count(), mem_used_mb=(mem.get("MemTotal", 0) - mem.get("MemAvailable", 0)) // 1024,
                     mem_total_mb=mem.get("MemTotal", 0) // 1024, running=running, **claude_limits())
        except Exception as e:
            log("пульс не ушёл:", str(e)[:200])
        time.sleep(300)


def main():
    """Задачи разных клиентов идут параллельно (до PARALLEL), по одному клиенту — строго по очереди:
    у клиента общая папка и журнал, две задачи в ней мешали бы друг другу."""
    from concurrent.futures import ThreadPoolExecutor
    log("исполнитель запущен, параллельно до", PARALLEL)
    resume_interrupted()
    import threading
    threading.Thread(target=quick_loop, daemon=True).start()
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    threading.Thread(target=ig_loop, daemon=True).start()
    pool = ThreadPoolExecutor(max_workers=PARALLEL)
    busy = {}   # client_id -> future
    while True:
        try:
            for cid in [c for c, fut in busy.items() if fut.done()]:
                busy.pop(cid)
            if len(busy) < PARALLEL:
                for job in api_get(op="queue").get("jobs", []):
                    cid = job["client"]["id"]
                    if cid in busy:
                        continue
                    busy[cid] = pool.submit(handle, job)
                    if len(busy) >= PARALLEL:
                        break
        except Exception as e:
            log("очередь недоступна:", e)
        time.sleep(10)


if __name__ == "__main__":
    main()
