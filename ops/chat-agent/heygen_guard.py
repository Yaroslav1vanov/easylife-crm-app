#!/usr/bin/env python3
"""PreToolUse-хук Claude Code для инструментов HeyGen (ТЗ «аватары HeyGen», п. 3).

В HeyGen-аккаунте лежат аватары ВСЕХ клиентов, промпта мало — проверяем кодом каждый вызов:
- без AVATAR.json в папке задачи (её кладёт исполнитель только в чате «Аватар») — никаких HeyGen-вызовов;
- голос: только voice_id клиента и его модель; видео: только лук из разрешённых, только из нашего аудио, только движок клиента;
- одна задача = одна генерация и только того вида, что заказан кнопкой (озвучка или видео); повтор — новой задачей от человека;
- удаление, клоны голоса, Video Agent и прочее — запрещено всегда.
Код выхода 2 = вызов заблокирован, текст из stderr получает ИИ.

Подключение (~chatagent/.claude/settings.json):
{"hooks": {"PreToolUse": [{"matcher": "mcp__heygen__.*", "hooks": [{"type": "command", "command": "python3 /srv/easylife-chat-agent/bin/heygen_guard.py"}]}]}}
"""
import json, os, sys, time

READ_ONLY = {"list_avatar_looks", "get_avatar_look", "get_video", "get_current_user", "get_voice", "list_voices", "show_video", "get_avatar_group",
             "lookup_videos", "list_videos", "get_video_scenes"}   # последние три — ежедневная выгрузка видео для аналитики владельца
VOICE = {"create_speech", "create_speech_without_player"}
VIDEO = {"create_video_from_avatar"}


def deny(msg):
    print(msg, file=sys.stderr)
    log(f"BLOCK {msg}")
    sys.exit(2)


def log(line):
    try:
        with open("/srv/easylife-chat-agent/heygen_guard.log", "a") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {os.getcwd()} {line}\n")
    except Exception:
        pass


def main():
    ev = json.load(sys.stdin)
    full = ev.get("tool_name") or ""
    name = full.split("__")[-1]   # mcp__heygen__create_speech → create_speech
    inp = ev.get("tool_input") or {}
    cwd = ev.get("cwd") or os.getcwd()
    os.chdir(cwd)

    if name in READ_ONLY:
        log(f"ok {name}")
        return
    if name not in VOICE and name not in VIDEO:
        deny(f"Инструмент HeyGen «{name}» запрещён исполнителю (разрешены только озвучка и видео из чата «Аватар»).")

    try:
        av = json.load(open("AVATAR.json"))
    except Exception:
        deny("Генерация HeyGen разрешена только в задаче из чата «Аватар» по кнопке «Озвучить» или «Сделать видео».")
    cfg, job = av.get("config") or {}, av.get("job") or {}
    if not job.get("gen_id"):
        deny("Это подготовка заказа — генерировать нельзя. Подготовь карточку-заказ (out/<номер>/avatar.json), озвучит человек кнопкой.")

    want = "voice" if name in VOICE else "video"
    if job.get("kind") != want:
        deny(f"Заказана {'озвучка' if job.get('kind') == 'voice' else 'генерация видео'}, а не {'озвучка' if want == 'voice' else 'видео'}.")

    counter = f".heygen_calls_{job['gen_id']}"
    if os.path.exists(counter):
        deny("Генерация по этому заказу уже была. Повтор — только новой задачей от человека (кнопкой «Озвучить»/«Сделать видео» ещё раз).")

    if want == "voice":
        voices = {cfg.get("voice_id")} | {g.get("voice") for g in (cfg.get("group_looks") or []) if g.get("voice")}
        if inp.get("voiceId") not in voices:
            deny("Этот голос не привязан к клиенту.")
        model = (inp.get("settings") or {}).get("model_id")
        if model and model != cfg.get("voice_model"):
            deny(f"Модель голоса клиента — {cfg.get('voice_model')}, а не {model}.")
    else:
        allowed = set(cfg.get("look_ids") or []) | {g.get("id") for g in (cfg.get("group_looks") or [])}   # основные + вся группа клиента
        if inp.get("avatarId") not in allowed:
            deny("Этот аватар не привязан к клиенту.")
        if job.get("look_id") and inp.get("avatarId") != job.get("look_id"):
            deny("В заказе выбран другой лук — бери его из AVATAR.json → job.look_id.")
        if inp.get("script") or not (inp.get("audioUrl") or inp.get("audioAssetId")):
            deny("Видео делается только из готового аудио (audioUrl), не из текста.")
        if inp.get("voiceId") and inp.get("voiceId") not in ({cfg.get("voice_id")} | {g.get("voice") for g in (cfg.get("group_looks") or []) if g.get("voice")}):
            deny("Этот голос не привязан к клиенту.")
        eng = (inp.get("engine") or {}).get("type") or "avatar_iv"
        if eng != cfg.get("engine"):
            deny(f"Движок клиента — {cfg.get('engine')}, а не {eng}.")
        if av.get("videos_this_month", 0) >= av.get("video_limit", 0) and not (av.get("generation") or {}).get("over_limit_ok"):
            deny("Лимит видео клиента на месяц исчерпан, а подтверждения Ярослава нет.")

    open(counter, "w").write(f"{name} {time.time()}")
    log(f"ok {name} gen {job['gen_id']}")


if __name__ == "__main__":
    main()
