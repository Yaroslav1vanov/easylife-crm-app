#!/bin/bash
# Записывает ключ HikerAPI в настройки CRM на Vercel и пересобирает CRM.
# Нужен для транскрибации роликов Instagram, которые без входа не отдаются (18+, «чувствительный» контент).
# Ключ вводится скрыто — на экран и в историю команд не попадает.
set -e
cd "$(dirname "$0")/.."
read -s -p "Вставьте ключ HikerAPI (Access key из кабинета hikerapi.com) и нажмите Enter: " KEY; echo
[ ${#KEY} -ge 16 ] || { echo "Ключ слишком короткий — похоже, скопировался не целиком. Ничего не записал."; exit 1; }
for ENVN in production preview; do
  npx -y vercel@latest env rm HIKERAPI_KEY $ENVN --yes --scope yaroslav1vanovs-projects >/dev/null 2>&1 || true
  printf '%s' "$KEY" | npx -y vercel@latest env add HIKERAPI_KEY $ENVN --scope yaroslav1vanovs-projects >/dev/null
done
echo "Ключ записан. Пересобираю CRM (1–2 минуты)…"
npx -y vercel@latest deploy --prod --yes --scope yaroslav1vanovs-projects >/dev/null 2>&1 && echo "Готово: CRM пересобрана с ключом HikerAPI." || echo "Ключ записан, но пересборка не запустилась — напишите Claude."
