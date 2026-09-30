# ИИ-исполнитель чата по клиенту

Работает на сервере `195.201.137.115` службой `easylife-chat-agent` от пользователя `chatagent`
(папка `/srv/easylife-chat-agent`, лог `logs/agent.log`). Авторизация — токен **подписки** Claude
(`CLAUDE_CODE_OAUTH_TOKEN`, вид `sk-ant-oat01-…`), модель `claude-opus-5-5`. API-ключ не используется.

- Очередь: CRM `/api/agent/chat` (секрет `x-agent-secret`).
- Папка клиента: `work/client_<id>/` — `CONTEXT.md`, `TASK.md`, `files/`, `out/<задача>/`. Сессия Claude по клиенту продолжается (`claude -c`), поэтому правки понимают прошлые версии.
- ИИ включается у клиента флагом `clients.ai_chat` (пилот — карточка 31).

Обновить: скопировать `agent.py` и `CLAUDE.md` в `/srv/easylife-chat-agent/`, `chown chatagent`, `systemctl restart easylife-chat-agent`.
