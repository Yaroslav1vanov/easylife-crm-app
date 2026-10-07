#!/usr/bin/env python3
"""Telegram-бот загрузки исходников в медиатеку клиента (EasyLife CRM) — @easylifeai_crm_bot.

Сотрудник выбирает клиента (/client), пересылает боту посты из канала с исходниками —
бот скачивает видео и фото и кладёт их в медиатеку клиента в CRM (тег «из Telegram»).
По окончании присылает сводку и кнопку «Разобрать с ИИ».

Файлы до 2 ГБ — через локальный сервер Telegram Bot API (telegram-bot-api на 127.0.0.1:8081).
Без него (TG_API_URL не задан) работает через api.telegram.org, но только с файлами до 20 МБ.

Доступ: TG_ADMINS (id через запятую) + те, кого админ добавил командой /allow <id>.
"""
import json, mimetypes, os, pathlib, queue, threading, time, traceback
import requests

HOME = pathlib.Path(__file__).resolve().parent
AGENT_ENV = pathlib.Path("/srv/easylife-chat-agent/.env")


def read_env(p):
    return dict(l.split("=", 1) for l in p.read_text().splitlines() if "=" in l and not l.startswith("#")) if p.exists() else {}


ENV = {**read_env(AGENT_ENV), **read_env(HOME / ".env")}
TOKEN = ENV["TG_BOT_TOKEN"]
TG_BASE = ENV.get("TG_API_URL", "").rstrip("/") or "https://api.telegram.org"
LOCAL = TG_BASE != "https://api.telegram.org"
TG = f"{TG_BASE}/bot{TOKEN}"
CRM = ENV["CRM_API_URL"].rstrip("/") + "/api/agent/files"
CRM_HDR = {"x-agent-secret": ENV["AGENT_SECRET"], "content-type": "application/json"}
ADMINS = {int(x) for x in ENV.get("TG_ADMINS", "").replace(" ", "").split(",") if x}
WORKERS = int(ENV.get("TG_WORKERS", "3"))
STATE_FILE = HOME / "state.json"
MAX_MB = 2000 if LOCAL else 20

VIDEO_EXT = {"mp4", "mov", "m4v", "webm", "mkv", "avi", "mts", "3gp"}
IMAGE_EXT = {"jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "tif", "tiff"}
FONT_EXT = {"ttf", "otf", "woff", "woff2"}

lock = threading.RLock()
jobs = queue.Queue()
batches = {}   # (chat_id, client_id) → сводка текущей пачки


def log(*a):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


# ── состояние: кто допущен и какой клиент выбран ─────────────────────────────
def load_state():
    try:
        s = json.loads(STATE_FILE.read_text())
    except Exception:
        s = {}
    s.setdefault("allowed", {})   # id → имя
    s.setdefault("client", {})    # id сотрудника → id клиента
    s.setdefault("topic", {})     # id сотрудника → папка (тема), в которую идут файлы
    return s


STATE = load_state()


def save_state():
    with lock:
        tmp = STATE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(STATE, ensure_ascii=False, indent=1))
        tmp.replace(STATE_FILE)


def is_allowed(uid):
    return uid in ADMINS or str(uid) in STATE["allowed"]


# ── Telegram и CRM ────────────────────────────────────────────────────────────
def tg(method, timeout=60, **params):
    r = requests.post(f"{TG}/{method}", json=params, timeout=timeout)
    j = r.json()
    if not j.get("ok"):
        raise RuntimeError(f"{method}: {j.get('description')}")
    return j["result"]


def send(chat_id, text, **kw):
    try:
        return tg("sendMessage", chat_id=chat_id, text=text, parse_mode="HTML", disable_web_page_preview=True, **kw)
    except Exception as e:
        log("send error", e)


def edit(chat_id, msg_id, text, **kw):
    try:
        tg("editMessageText", chat_id=chat_id, message_id=msg_id, text=text, parse_mode="HTML", **kw)
    except Exception as e:
        if "not modified" not in str(e):
            log("edit error", e)


def crm_get(**params):
    r = requests.get(CRM, headers=CRM_HDR, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def crm_post(**body):
    r = requests.post(CRM, headers=CRM_HDR, json=body, timeout=120)
    if r.status_code >= 400:
        raise RuntimeError(r.json().get("error") if r.headers.get("content-type", "").startswith("application/json") else r.text[:200])
    return r.json()


_clients = {"at": 0, "list": []}


def clients(force=False):
    if force or time.time() - _clients["at"] > 300:
        _clients["list"] = crm_get(op="clients")["clients"]
        _clients["at"] = time.time()
    return _clients["list"]


def client_name(cid):
    return next((c["name"] for c in clients() if c["id"] == cid), f"клиент #{cid}")


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ── выбор клиента ─────────────────────────────────────────────────────────────
def ask_client(chat_id):
    cl = clients(force=True)
    rows = [[{"text": c["name"][:30], "callback_data": f"c:{c['id']}"} for c in cl[i:i + 2]] for i in range(0, len(cl), 2)]
    send(chat_id, "Выберите клиента — файлы уйдут в его медиатеку:", reply_markup={"inline_keyboard": rows})


def set_client(uid, chat_id, cid):
    STATE["client"][str(uid)] = cid
    STATE["topic"].pop(str(uid), None)
    save_state()
    send(chat_id, f"Клиент: <b>{esc(client_name(cid))}</b>.\n\n"
                  "Если файлы про одну процедуру/тему — сначала напишите <code>папка BBL</code> (своё название), "
                  "и всё, что пришлёте дальше, ляжет в эту папку.\n\n"
                  "Пересылайте посты с видео и фото (из канала можно выделить до 100 сразу). Сменить клиента — /client.")


def set_topic(uid, chat_id, topic):
    cid = STATE["client"].get(str(uid))
    if not cid:
        send(chat_id, "Сначала выберите клиента 👇")
        return ask_client(chat_id)
    topic = " ".join(topic.split())[:50]
    if not topic or topic.lower() in ("-", "без папки", "нет"):
        STATE["topic"].pop(str(uid), None)
        save_state()
        return send(chat_id, f"Папка снята: файлы {esc(client_name(cid))} пойдут без папки, ИИ разложит сам.")
    STATE["topic"][str(uid)] = topic
    save_state()
    text = f"📁 Папка <b>{esc(topic)}</b> · {esc(client_name(cid))}\nВсё, что пришлёте дальше, ляжет сюда. Другая папка — напишите <code>папка Название</code>, снять — <code>без папки</code>."
    kb = None
    try:
        n = crm_post(op="untopiced", client_id=cid, hours=24).get("count", 0)
        if n:
            text += f"\n\nЗа последние сутки загружено без папки: {n}. Положить их тоже в «{esc(topic)}»?"
            kb = {"inline_keyboard": [[{"text": f"📁 Да, {n} файлов → {topic}"[:60], "callback_data": f"t:{cid}"}]]}
    except Exception as e:
        log("untopiced", e)
    send(chat_id, text, **({"reply_markup": kb} if kb else {}))


# ── разбор входящего файла ────────────────────────────────────────────────────
def media_of(m):
    """(file_id, unique_id, kind, filename, size) или None."""
    if m.get("photo"):
        p = m["photo"][-1]
        return p["file_id"], p["file_unique_id"], "image", "photo.jpg", p.get("file_size", 0)
    for key, default in (("video", "video.mp4"), ("animation", "animation.mp4"), ("video_note", "circle.mp4")):
        if m.get(key):
            v = m[key]
            return v["file_id"], v["file_unique_id"], "video", v.get("file_name") or default, v.get("file_size", 0)
    if m.get("document"):
        d = m["document"]
        name = d.get("file_name") or "file"
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        mime = d.get("mime_type") or ""
        kind = "video" if mime.startswith("video/") or ext in VIDEO_EXT else "image" if mime.startswith("image/") or ext in IMAGE_EXT \
            else "font" if ext in FONT_EXT else "other"
        return d["file_id"], d["file_unique_id"], kind, name, d.get("file_size", 0)
    if m.get("audio"):
        a = m["audio"]
        return a["file_id"], a["file_unique_id"], "other", a.get("file_name") or "audio.mp3", a.get("file_size", 0)
    return None


def title_of(m, filename):
    cap = (m.get("caption") or "").strip().replace("\n", " ")
    generic = filename in ("photo.jpg", "video.mp4", "animation.mp4", "circle.mp4", "file")
    if cap:
        return (cap[:120] if generic else f"{filename} · {cap[:100]}")
    when = time.strftime("%d.%m.%Y", time.localtime(m.get("forward_date") or m.get("date") or time.time()))
    return filename if not generic else f"Telegram {when}"


def batch(chat_id, cid):
    with lock:
        b = batches.get((chat_id, cid))
        if not b:
            b = batches[(chat_id, cid)] = {"video": 0, "image": 0, "other": 0, "dup": 0, "err": [], "pending": 0,
                                            "msg": None, "last": time.time(), "shown": "", "topics": set()}
        return b


def on_media(m, uid, chat_id):
    cid = STATE["client"].get(str(uid))
    if not cid:
        send(chat_id, "Сначала выберите клиента 👇")
        return ask_client(chat_id)
    info = media_of(m)
    if not info:
        return
    with lock:   # одной блокировкой: итог пачки не должен закрыться между «нашёл пачку» и «добавил файл»
        b = batch(chat_id, cid)
        b["pending"] += 1
        b["last"] = time.time()
        first = b["msg"] is None
        if first:
            b["msg"] = "…"
    if first:
        r = send(chat_id, f"Загружаю в медиатеку <b>{esc(client_name(cid))}</b>…")
        with lock:
            b["msg"] = r["message_id"] if r else None
    jobs.put((chat_id, cid, m, info, b, STATE["topic"].get(str(uid))))


def upload_one(chat_id, cid, m, info, b, topic=None):
    file_id, unique_id, kind, filename, size = info
    try:
        if crm_post(op="check", client_id=cid, uid=unique_id).get("exists"):
            with lock:
                b["dup"] += 1
            return
        if size and size > MAX_MB * 1024 * 1024:
            raise RuntimeError(f"файл {size // 1024 // 1024} МБ — больше {MAX_MB} МБ")
        for attempt in range(4):   # локальный сервер в этот момент сам скачивает файл; большие видео Telegram иногда отдаёт со сбоем
            try:
                f = tg("getFile", timeout=1800, file_id=file_id)
                break
            except RuntimeError as e:
                if attempt == 3 or "temporarily unavailable" not in str(e):
                    raise
                log("getFile retry", filename, attempt + 1)
                time.sleep(20 * (attempt + 1))
        path = f.get("file_path") or ""
        local = None
        if LOCAL and path.startswith("/"):
            local = pathlib.Path(path)
        else:
            tmp = HOME / "tmp"
            tmp.mkdir(exist_ok=True)
            local = tmp / f"{unique_id}_{filename}"
            with requests.get(f"{TG_BASE}/file/bot{TOKEN}/{path}", stream=True, timeout=600) as r:
                r.raise_for_status()
                with open(local, "wb") as out:
                    for chunk in r.iter_content(1 << 20):
                        out.write(chunk)
        ext = filename.rsplit(".", 1)[-1] if "." in filename else (local.suffix.lstrip(".") or "bin")
        up = crm_post(op="upload", client_id=cid, filename=f"x.{ext}")
        ctype = mimetypes.guess_type(f"x.{ext}")[0] or "application/octet-stream"
        for attempt in range(3):
            try:
                with open(local, "rb") as fh:
                    r = requests.put(up["uploadUrl"], data=fh, headers={"content-type": ctype}, timeout=3600)
                r.raise_for_status()
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(5)
        crm_post(op="add", client_id=cid, key=up["key"], kind=kind, title=title_of(m, filename), uid=unique_id, topic=topic)
        if topic:
            with lock:
                b["topics"].add(topic)
        try:
            local.unlink()   # копия уже в хранилище CRM — на сервере не держим
        except Exception:
            pass
        with lock:
            b["video" if kind == "video" else "image" if kind == "image" else "other"] += 1
    except Exception as e:
        log("upload error", cid, filename, repr(e))
        with lock:
            b["err"].append(f"{filename}: {e}")
    finally:
        with lock:
            b["pending"] -= 1
            b["last"] = time.time()


def worker():
    while True:
        chat_id, cid, m, info, b, topic = jobs.get()
        try:
            upload_one(chat_id, cid, m, info, b, topic)
        except Exception:
            traceback.print_exc()


def summary(cid, b, final):
    parts = [f"{n} {w}" for n, w in ((b["video"], "видео"), (b["image"], "фото"), (b["other"], "других файлов")) if n]
    head = f"{'✅ Готово' if final else '⏳ Загружаю'} — медиатека <b>{esc(client_name(cid))}</b>"
    lines = [head]
    if b["topics"]:
        lines.append("📁 Папка: " + ", ".join(sorted(b["topics"])))
    lines.append("Загружено: " + (", ".join(parts) if parts else "пока ничего"))
    if not final:
        lines.append(f"В очереди: {b['pending']}")
    if b["dup"]:
        lines.append(f"Уже были в медиатеке, пропустил: {b['dup']}")
    if b["err"]:
        lines.append(f"Не загрузились ({len(b['err'])}):\n" + "\n".join("• " + esc(x[:150]) for x in b["err"][:10]))
    if final and (b["video"] or b["image"]):
        lines.append("\nЧтобы ИИ подписал файлы и разложил по темам — нажмите кнопку ниже или «Разобрать с ИИ» в медиатеке.")
    return "\n".join(lines)


def reporter():
    """Обновляет сообщение-прогресс; когда пачка закончилась и 6 секунд тихо — итог."""
    while True:
        time.sleep(4)
        with lock:
            items = list(batches.items())
        for (chat_id, cid), b in items:
            if not isinstance(b["msg"], int):
                continue
            with lock:
                final = b["pending"] <= 0 and time.time() - b["last"] > 6
                text = summary(cid, b, final)
                changed = text != b["shown"]
                b["shown"] = text
                if final:
                    batches.pop((chat_id, cid), None)
            if final:
                kb = {"inline_keyboard": [[{"text": "✨ Разобрать с ИИ", "callback_data": f"s:{cid}"}]]} if (b["video"] or b["image"]) else None
                edit(chat_id, b["msg"], text, **({"reply_markup": kb} if kb else {}))
            elif changed:
                edit(chat_id, b["msg"], text)


# ── команды ───────────────────────────────────────────────────────────────────
HELP = ("Я загружаю исходники в медиатеку клиента в CRM.\n\n"
        "1. /client — выбрать клиента\n"
        "2. Если файлы про одну процедуру — написать <code>папка BBL</code> (своё название)\n"
        "3. Переслать сюда посты с видео и фото (из канала можно выделить до 100 и переслать разом)\n"
        "4. Дождаться ✅ и нажать «Разобрать с ИИ»\n\n"
        "Новая процедура — снова <code>папка Название</code>. Снять папку — <code>без папки</code>.\n"
        f"Файлы до {MAX_MB} МБ. Повторно присланные файлы пропускаю.")


def on_message(m):
    chat_id = m["chat"]["id"]
    if m["chat"].get("type") != "private":
        return
    u = m.get("from") or {}
    uid = u.get("id")
    text = (m.get("text") or "").strip()
    if not is_allowed(uid):
        send(chat_id, f"Нет доступа. Передайте администратору ваш Telegram ID: <code>{uid}</code>")
        log("denied", uid, u.get("username"), u.get("first_name"))
        return
    if text.startswith("/allow") and uid in ADMINS:
        arg = text.split()[1:] or [""]
        if not arg[0].lstrip("-").isdigit():
            return send(chat_id, "Формат: /allow 123456789")
        STATE["allowed"][arg[0]] = " ".join(text.split()[2:]) or "сотрудник"
        save_state()
        return send(chat_id, f"Доступ открыт: {arg[0]}")
    if text.startswith("/deny") and uid in ADMINS:
        arg = (text.split()[1:] or [""])[0]
        STATE["allowed"].pop(arg, None)
        save_state()
        return send(chat_id, f"Доступ закрыт: {arg}")
    if text.startswith("/users") and uid in ADMINS:
        rows = [f"{k} — {v}" for k, v in STATE["allowed"].items()] or ["никого, кроме админов"]
        return send(chat_id, "Допущены:\n" + "\n".join(rows))
    if text.startswith("/client"):
        return ask_client(chat_id)
    low = text.lower()
    if text.startswith("/folder"):
        arg = text[len("/folder"):].strip()
        if not arg:
            cur = STATE["topic"].get(str(uid))
            return send(chat_id, (f"Сейчас папка: <b>{esc(cur)}</b>." if cur else "Папка не выбрана.") + " Напишите <code>папка Название</code>.")
        return set_topic(uid, chat_id, arg)
    if low.startswith("папка ") or low.startswith("папка:"):
        return set_topic(uid, chat_id, text[6:].lstrip(": "))
    if low in ("без папки", "папка -"):
        return set_topic(uid, chat_id, "-")
    if text.startswith("/start") or text.startswith("/help"):
        send(chat_id, HELP)
        if not STATE["client"].get(str(uid)):
            ask_client(chat_id)
        return
    if media_of(m):
        return on_media(m, uid, chat_id)
    if text:
        # «лакура» → выбрать клиента по имени
        hits = [c for c in clients() if text.lower() in c["name"].lower()]
        if len(hits) == 1:
            return set_client(uid, chat_id, hits[0]["id"])
        if len(hits) > 1:
            rows = [[{"text": c["name"][:30], "callback_data": f"c:{c['id']}"}] for c in hits[:10]]
            return send(chat_id, "Какой именно?", reply_markup={"inline_keyboard": rows})
        return send(chat_id, HELP)


def on_callback(q):
    uid = q["from"]["id"]
    chat_id = q["message"]["chat"]["id"]
    data = q.get("data") or ""
    try:
        tg("answerCallbackQuery", callback_query_id=q["id"])
    except Exception:
        pass
    if not is_allowed(uid):
        return
    if data.startswith("c:"):
        return set_client(uid, chat_id, int(data[2:]))
    if data.startswith("t:"):
        cid = int(data[2:])
        topic = STATE["topic"].get(str(uid))
        if not topic or STATE["client"].get(str(uid)) != cid:
            return send(chat_id, "Папка уже сменилась — напишите <code>папка Название</code> ещё раз.")
        try:
            r = crm_post(op="set_topic", client_id=cid, topic=topic, hours=24)
            send(chat_id, f"📁 Готово: {r.get('updated', 0)} файлов теперь в папке «{esc(topic)}».")
        except Exception as e:
            send(chat_id, f"Не получилось: {esc(e)}")
        return
    if data.startswith("s:"):
        cid = int(data[2:])
        try:
            r = crm_post(op="sort", client_id=cid, by=q["from"].get("first_name") or "Telegram")
            if r.get("count"):
                send(chat_id, f"Отправил ИИ: {r['count']} файлов. Результат придёт в CRM: карточка клиента → «Чат · ИИ» → «Стратегия», подписи и темы появятся в медиатеке.")
            else:
                send(chat_id, "Все файлы уже разобраны.")
        except Exception as e:
            send(chat_id, f"Не получилось отправить ИИ: {esc(e)}")


def main():
    log("start", "local" if LOCAL else "cloud", f"max {MAX_MB} MB", "admins", sorted(ADMINS))
    try:
        tg("setMyCommands", commands=[{"command": "client", "description": "Выбрать клиента"},
                                      {"command": "folder", "description": "Папка (процедура) для следующих файлов"},
                                      {"command": "help", "description": "Как пользоваться"}])
    except Exception as e:
        log("setMyCommands", e)
    for _ in range(WORKERS):
        threading.Thread(target=worker, daemon=True).start()
    threading.Thread(target=reporter, daemon=True).start()
    offset = None
    while True:
        try:
            r = requests.post(f"{TG}/getUpdates", json={"timeout": 50, "offset": offset,
                              "allowed_updates": ["message", "callback_query"]}, timeout=70).json()
            if not r.get("ok"):
                raise RuntimeError(r.get("description"))
            ups = r["result"]
            for u in ups:
                offset = u["update_id"] + 1
                try:
                    if "message" in u:
                        on_message(u["message"])
                    elif "callback_query" in u:
                        on_callback(u["callback_query"])
                except Exception:
                    traceback.print_exc()
        except Exception as e:
            log("poll error", repr(e))
            time.sleep(5)


if __name__ == "__main__":
    main()
