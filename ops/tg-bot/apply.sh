#!/bin/bash
# Вызывается из set_tg.sh (на Mac): секреты приходят на вход, тремя строками. Запускается от root.
read -r TOKEN; read -r API_ID; read -r API_HASH
set -e
D=/srv/easylife-tg-bot
mkdir -p $D
OLD_ADMINS=$(grep -s "^TG_ADMINS=" $D/.env | cut -d= -f2-)
OLD_LOCAL=$(grep -s "^TG_API_URL=" $D/.env | cut -d= -f2-)
{
  echo "TG_BOT_TOKEN=$TOKEN"
  echo "TG_ADMINS=$OLD_ADMINS"
  # ключи my.telegram.org уже вводили раньше — остаёмся на своём сервере (с облачного бот уже вышел)
  if [ -n "$API_ID" ] || [ -n "$OLD_LOCAL" ]; then echo "TG_API_URL=http://127.0.0.1:8081"; fi
} > $D/.env
chown -R chatagent:chatagent $D; chmod 600 $D/.env
if [ -n "$API_ID" ]; then
  printf 'TELEGRAM_API_ID=%s\nTELEGRAM_API_HASH=%s\n' "$API_ID" "$API_HASH" > /etc/telegram-bot-api.env
  chmod 600 /etc/telegram-bot-api.env
  systemctl enable -q --now telegram-bot-api; systemctl restart telegram-bot-api; sleep 3
  # бот переезжает с серверов Telegram на наш — один раз выходим из облачного API
  [ -z "$OLD_LOCAL" ] && curl -s "https://api.telegram.org/bot$TOKEN/logOut" >/dev/null || true
fi
systemctl enable -q easylife-tg-bot; systemctl restart easylife-tg-bot; sleep 4
B=https://api.telegram.org; { [ -n "$API_ID" ] || [ -n "$OLD_LOCAL" ]; } && B=http://127.0.0.1:8081
NAME=$(curl -s "$B/bot$TOKEN/getMe" | python3 -c "import sys,json; r=json.load(sys.stdin); print('@'+r['result']['username'] if r.get('ok') else 'ОШИБКА: '+str(r.get('description')))")
echo "Бот: $NAME · режим: $([ "$B" != https://api.telegram.org ] && echo 'файлы до 2 ГБ' || echo 'файлы до 20 МБ (без ключей my.telegram.org)')"
systemctl is-active easylife-tg-bot
