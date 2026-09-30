#!/bin/bash
# Записывает токен подписки Claude (sk-ant-oat01-…) на сервер монтажа.
# Токен вводится скрыто, на экран и в историю команд не попадает.
# Исполнитель подхватит его со следующей задачи, перезапуск не нужен.
set -e
SERVER=root@2.28.125.113
read -s -p "Вставьте токен и нажмите Enter: " TOKEN; echo
case "$TOKEN" in
  sk-ant-oat01-*) ;;
  *) echo "Это не токен подписки (должен начинаться с sk-ant-oat01-). Ничего не записал."; exit 1 ;;
esac
printf '%s' "$TOKEN" | ssh "$SERVER" 'f=/srv/easylife-chat-agent/.env; t=$(cat); cp $f $f.bak; grep -v "^CLAUDE_CODE_OAUTH_TOKEN=" $f.bak > $f; echo "CLAUDE_CODE_OAUTH_TOKEN=$t" >> $f; chown chatagent:chatagent $f; chmod 600 $f
  cd /srv/easylife-chat-agent && sudo -u chatagent env -i HOME=/srv/easylife-chat-agent PATH=/usr/bin:/bin CLAUDE_CODE_OAUTH_TOKEN="$t" timeout 120 /usr/bin/claude -p "Ответь одним словом: работает" --model claude-opus-5-5 2>&1 | tail -1'
echo "Готово: токен записан. Выше должно быть слово «работает» — значит, новый аккаунт подключён."
