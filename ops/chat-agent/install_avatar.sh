#!/bin/bash
# Установка на сервер исполнителя (root): чат «Аватар» + Instagram через сервер аудитов.
# Запуск с мака:  см. команду в ответе Claude (scp папки ops/chat-agent → /tmp/chatagent-new, затем этот скрипт).
# Ничего не генерирует и кредиты HeyGen не тратит.
set -euo pipefail
SRC=/tmp/chatagent-new
H=/srv/easylife-chat-agent

install -o chatagent -g chatagent -m 755 $SRC/igprofile.py $H/bin/igprofile.py
install -o chatagent -g chatagent -m 755 $SRC/heygen_guard.py $H/bin/heygen_guard.py
install -o chatagent -g chatagent -m 644 $SRC/CLAUDE.md $H/CLAUDE.md
touch $H/heygen_guard.log && chown chatagent:chatagent $H/heygen_guard.log

# хук: каждый вызов HeyGen проверяется (лук/голос клиента, одна генерация на задачу)
python3 - <<'EOF'
import json, os
p = "/srv/easylife-chat-agent/.claude/settings.json"
s = json.load(open(p)) if os.path.exists(p) else {}
hook = {"matcher": "mcp__heygen__.*", "hooks": [{"type": "command", "command": "python3 /srv/easylife-chat-agent/bin/heygen_guard.py"}]}
pre = s.setdefault("hooks", {}).setdefault("PreToolUse", [])
pre[:] = [h for h in pre if h.get("matcher") != hook["matcher"]] + [hook]
json.dump(s, open(p, "w"), ensure_ascii=False, indent=1)
os.system(f"chown chatagent:chatagent {p}")
print("хук записан:", p)
EOF

# HeyGen как MCP-сервер у пользователя chatagent (вход OAuth — отдельно, делает Ярослав)
cd $H
if ! sudo -u chatagent -H claude mcp list 2>/dev/null | grep -q '^heygen'; then
  sudo -u chatagent -H claude mcp add --transport http -s user heygen https://mcp.heygen.com/mcp/v1/
fi
sudo -u chatagent -H claude mcp list 2>&1 | grep -i heygen || true

# новый agent.py — подменится, когда исполнитель закончит текущие задачи (ждёт пустую очередь)
install -o chatagent -g chatagent -m 644 $SRC/agent.py $H/agent.py.new
systemd-run --unit=easylife-agent-swap-$(date +%s) /usr/local/sbin/easylife-agent-swap.sh >/dev/null
echo "ГОТОВО: файлы на месте, agent.py подменится после текущих задач"
