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
THREAD_RU = {"reels": "рилсы", "stories": "сторис", "strategy": "стратегия"}
THREAD_HINT = {
    "reels": "Задачи этого чата — рилсы: монтаж роликов, правки, разбор стиля роликов.",
    "strategy": "Это чат по проекту в целом. Ты видишь переписку всех трёх чатов (метки [рилсы]/[сторис]/[стратегия]), PLAN.md и STATS.md. "
                "Задача — думать и советовать: что зашло, что выкладывать, какие сторис поставить рядом с рилсами, чего не хватает в плане. "
                "Отвечай текстом с конкретикой по этому клиенту; файлы делай, только если прямо попросили.",
    "stories": "Задачи этого чата — сторис: серии сторис (кадры PNG 1080×1920 или короткие видео), тексты, план сторис. Рилсы здесь не монтируй, если об этом прямо не просят.",
}
CURRENT_DIR = HOME / ".current_jobs"     # по файлу на каждую задачу в работе (их может быть несколько)
CURRENT_DIR.mkdir(exist_ok=True)
LEGACY_CURRENT = HOME / ".current_job"
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


def prepare(job):
    msg, client = job["message"], job["client"]
    cid, mid = client["id"], msg["id"]
    ws = WORK / f"client_{cid}"
    files = ws / "files"
    out = ws / "out" / str(mid)
    for d in (files, out):
        d.mkdir(parents=True, exist_ok=True)
    (ws / "CLAUDE.md").write_text((HOME / "CLAUDE.md").read_text())

    # файлы из переписки: имя «<id сообщения>_<имя файла>», чтобы не путать версии
    def local(m, a):
        return files / f"{m['id']}_{safe(a['name'])}"
    quoted = job.get("quoted")
    for m in job["history"] + ([quoted] if quoted else []):
        for a in m.get("attachments") or []:
            try:
                fetch_file(a["key"], local(m, a))
            except Exception as e:
                log("не скачался файл", a.get("name"), e)

    name = " ".join(x for x in [client.get("name"), client.get("surname")] if x)
    hist = []
    for m in job["history"]:
        who = "ИИ (ты)" if m["author_type"] == "ai" else (m.get("author_name") or "Сотрудник")
        att = "".join(f"\n    📎 files/{local(m, a).name}" for a in (m.get("attachments") or []))
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
{SCRIPT_HINT.format(mid=mid) if job.get("script") else ""}""")
    return ws, out


SCRIPT_HINT = """
## Сценарий, над которым идёт работа — SCRIPT.md
В этом чате работают над конкретным сценарием из CRM: его текст, референс (ссылка, расшифровка, цифры, разбор) и путь к скачанному видео-референсу — в SCRIPT.md.
Записать согласованный текст в сценарий — ТОЛЬКО когда человек прямо сказал («записывай», «вноси в сценарий», «сохрани»):
out/{mid}/script.json → {{"hook_text": "тема", "hook": "хук", "body_text": "основной текст", "cta": "призыв", "post_caption": "описание к ролику"}}
(только те поля, что меняются; прежний текст CRM вернёт в журнал).
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


def run_claude(ws, mid, resume=False):
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
            res = run_claude(ws, mid, resume=resumed)
        finally:
            mark.unlink(missing_ok=True)   # при убийстве процесса сюда не дойдём — метка останется
        reply = (out / "reply.md").read_text().strip() if (out / "reply.md").exists() else (res.get("result") or "").strip()
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
        mins = (time.time() - t0) / 60
        cost = res.get("total_cost_usd")
        log("готово", mid, f"{mins:.1f} мин", f"файлов {len(atts)}", f"расход ${cost}" if cost else "")
        api_post(op="reply", id=mid, body=reply or "Готово.", attachments=atts, status="done")
    except subprocess.TimeoutExpired:
        api_post(op="reply", id=mid, body="", status="error", error=f"Не уложился в {TIMEOUT // 60} минут. Разбейте задачу или напишите ещё раз.")
    except Exception as e:
        log("ошибка", mid, traceback.format_exc()[-1500:])
        api_post(op="reply", id=mid, body="", status="error", error=f"Сбой исполнителя: {str(e)[:300]}")
    finally:
        cur.unlink(missing_ok=True)


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


def main():
    """Задачи разных клиентов идут параллельно (до PARALLEL), по одному клиенту — строго по очереди:
    у клиента общая папка и журнал, две задачи в ней мешали бы друг другу."""
    from concurrent.futures import ThreadPoolExecutor
    log("исполнитель запущен, параллельно до", PARALLEL)
    resume_interrupted()
    import threading
    threading.Thread(target=quick_loop, daemon=True).start()
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
