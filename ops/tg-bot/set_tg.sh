#!/bin/bash
# Подключает Telegram-бота загрузки исходников (@easylifeai_crm_bot) на сервере.
# Всё вводится скрыто: на экран и в историю команд не попадает.
#   1) токен бота от @BotFather (обязательно)
#   2) api_id и api_hash с my.telegram.org (можно пропустить: тогда файлы только до 20 МБ;
#      запустите скрипт ещё раз, когда будут ключи, — включится режим до 2 ГБ)
set -e
SERVER=root@2.28.125.113
read -s -p "1) Токен бота (от @BotFather), Enter: " TOKEN; echo
case "$TOKEN" in
  [0-9]*:*) ;;
  *) echo "Это не похоже на токен бота (вида 1234567890:AAH...). Ничего не записал."; exit 1 ;;
esac
read -p "2) api_id с my.telegram.org (цифры; пусто — пропустить), Enter: " API_ID
API_HASH=""
if [ -n "$API_ID" ]; then
  case "$API_ID" in *[!0-9]*) echo "api_id — только цифры. Ничего не записал."; exit 1 ;; esac
  read -s -p "3) api_hash с my.telegram.org, Enter: " API_HASH; echo
  [ ${#API_HASH} -eq 32 ] || { echo "api_hash должен быть 32 символа. Ничего не записал."; exit 1; }
fi
printf '%s\n%s\n%s\n' "$TOKEN" "$API_ID" "$API_HASH" | ssh "$SERVER" /usr/local/sbin/easylife-tg-apply.sh
echo "Готово. Напишите боту /start в Telegram."
