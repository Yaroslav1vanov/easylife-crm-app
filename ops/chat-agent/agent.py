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
CURRENT = HOME / ".current_job"
# правила перечитываются на каждую задачу — правка CLAUDE.md работает без перезапуска
MEDIA = re.compile(r"\.(mp4|mov|webm|m4v|png|jpe?g|webp|gif|pdf|zip|mp3|wav|srt)$", re.I)


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
             ".srt": "text/plain; charset=utf-8"}.get(path.suffix.lower(), "application/octet-stream")
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
    for m in job["history"]:
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
        hist.append(f"[{m['created_at'][:16].replace('T', ' ')}] #{m['id']} {who}: {m['body']}{att}")

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

## Переписка по клиенту (последние сообщения, старые сверху)
{chr(10).join(hist)}
""")
    task_att = "".join(f"\n- files/{local(msg, a).name}" for a in (msg.get("attachments") or [])) or "\n- (файлов нет)"
    (ws / "TASK.md").write_text(f"""# Текущая задача — сообщение #{mid} от {msg.get('author_name') or 'сотрудника'}

{msg['body'] or '(без текста — смотри приложенные файлы)'}

## Приложено к этому сообщению{task_att}

## Куда класть результат
- Ответ человеку: out/{mid}/reply.md
- Готовые файлы (ролик, кадры сторис): out/{mid}/ — всё из этой папки уйдёт в чат
""")
    return ws, out


def fresh_token():
    """Токен подписки читаем из .env на каждую задачу — смена аккаунта Claude без перезапуска."""
    for l in (HOME / ".env").read_text().splitlines():
        if l.startswith("CLAUDE_CODE_OAUTH_TOKEN="):
            return l.split("=", 1)[1].strip()
    return ENV["CLAUDE_CODE_OAUTH_TOKEN"]


def run_claude(ws, mid):
    started = (ws / ".session").exists()
    cmd = ["/usr/bin/claude", "-p",
           f"Прочитай CONTEXT.md и TASK.md и выполни задачу #{mid} по правилам из CLAUDE.md. "
           f"Если ты уже начинал эту задачу и прервался — продолжи с места остановки, сделанное не переделывай. "
           f"Ответ человеку обязательно запиши в out/{mid}/reply.md.",
           "--output-format", "json",
           "--model", ENV.get("CHAT_MODEL", "claude-opus-5-5"),   # монтаж — только Opus 5.5
           "--add-dir", str(HOME / "easylife-montage"), str(HOME / "easylife-top-reels"),
           "--allowedTools", "Bash", "Read", "Write", "Edit", "Glob", "Grep"]
    if started:
        cmd.insert(1, "-c")   # продолжаем разговор по этому клиенту — ИИ помнит прошлые версии
    env = {"PATH": "/srv/easylife-chat-agent/bin:/srv/easylife-chat-agent/.venv/bin:/usr/local/bin:/usr/bin:/bin",
           "HOME": str(HOME), "LANG": "C.UTF-8",
           "CLAUDE_CODE_OAUTH_TOKEN": fresh_token()}   # секрет CRM сюда не передаём
    p = subprocess.run(cmd, cwd=ws, env=env, capture_output=True, text=True, timeout=TIMEOUT)
    (ws / ".session").write_text(time.strftime("%Y-%m-%d %H:%M"))
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
    CURRENT.write_text(str(mid))   # если сервер перезапустится посреди задачи — вернём её в очередь
    log("задача", mid, "клиент", cid)
    t0 = time.time()
    try:
        ws, out = prepare(job)
        res = run_claude(ws, mid)
        reply = (out / "reply.md").read_text().strip() if (out / "reply.md").exists() else (res.get("result") or "").strip()
        atts = []
        for f in sorted(out.iterdir()):
            if f.is_file() and f.name != "reply.md" and MEDIA.search(f.name) and f.stat().st_size < 500 * 1048576:
                atts.append(upload_file(cid, f))
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
        CURRENT.unlink(missing_ok=True)


def resume_interrupted():
    """Задача прервалась (перезапуск, нехватка памяти) — возвращаем её в очередь.
    Сессия Claude и файлы в папке клиента сохранились, так что ИИ продолжит с того же места."""
    if not CURRENT.exists():
        return
    mid = int(CURRENT.read_text().strip() or 0)
    CURRENT.unlink(missing_ok=True)
    try:
        if api_post(op="requeue", id=mid).get("ok"):
            api_post(op="progress", id=mid, body="Сервер прервал задачу на середине (не хватило памяти при сборке). Продолжаю с того же места, всё сделанное сохранилось.")
            log("вернул в очередь прерванную задачу", mid)
    except Exception as e:
        log("не смог вернуть задачу", mid, e)


def main():
    log("исполнитель запущен")
    resume_interrupted()
    while True:
        try:
            for job in api_get(op="queue").get("jobs", []):
                handle(job)
        except Exception as e:
            log("очередь недоступна:", e)
        time.sleep(10)


if __name__ == "__main__":
    main()
