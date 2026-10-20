#!/bin/bash
# Сохраняет на сервере ИИ вход в Instagram (куки), чтобы транскрибация по ссылке брала ролики,
# которые Instagram без входа не отдаёт (18+, пластика, медицина). Пароль не нужен и не передаётся.
# Значения вводятся скрыто — на экран и в историю команд не попадают.
#
# Где взять значения: Chrome → войти в нужный Instagram (лучше в окне инкогнито) → открыть instagram.com →
# ⌥⌘I (Windows: F12) → вкладка Application → слева Cookies → https://www.instagram.com → скопировать Value у строк:
# sessionid, csrftoken, ds_user_id. Потом просто закрыть окно инкогнито (НЕ нажимать «Выйти» — это сбросит вход и на сервере).
set -e
read -s -p "sessionid: " SID; echo
read -s -p "csrftoken: " CSRF; echo
read -s -p "ds_user_id: " UID_; echo
[ ${#SID} -ge 20 ] && [ ${#CSRF} -ge 10 ] && [ -n "$UID_" ] || { echo "Похоже, скопировалось не всё. Ничего не записал."; exit 1; }
SID="$SID" CSRF="$CSRF" UID_="$UID_" python3 -c '
import json, os, urllib.parse
print(json.dumps({"sessionid": urllib.parse.unquote(os.environ["SID"]), "csrftoken": os.environ["CSRF"], "ds_user_id": os.environ["UID_"]}))
' | ssh root@2.28.125.113 'F=/srv/easylife-chat-agent/ig_session.json; umask 077; cat > $F; chown chatagent:chatagent $F; chmod 600 $F;
sudo -u chatagent /srv/easylife-chat-agent/.venv/bin/python - <<PY
import json, requests
ck = json.load(open("/srv/easylife-chat-agent/ig_session.json"))
s = requests.Session(); s.cookies.update(ck)
s.headers.update({"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", "X-IG-App-ID": "936619743392459", "X-Requested-With": "XMLHttpRequest"})
r = s.get("https://www.instagram.com/api/v1/users/" + ck["ds_user_id"] + "/info/", timeout=30, allow_redirects=False)
ok = r.status_code == 200 and "user" in r.text
print("Вход в Instagram на сервере работает: @" + r.json()["user"]["username"] if ok else "Instagram не принял вход (код %s) — проверьте, что скопированы значения из вошедшего окна." % r.status_code)
PY'
