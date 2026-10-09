#!/bin/bash
# Записывает ключ Viralmaxing (vmx_…) в настройки CRM на Vercel и пересобирает CRM.
# Ключ вводится скрыто — на экран и в историю команд не попадает.
set -e
cd "$(dirname "$0")/.."
read -s -p "Вставьте ключ Viralmaxing (начинается с vmx_) и нажмите Enter: " KEY; echo
case "$KEY" in vmx_*) ;; *) echo "Это не ключ Viralmaxing (должен начинаться с vmx_). Ничего не записал."; exit 1 ;; esac
for ENVN in production preview; do
  npx -y vercel@latest env rm VIRALMAXING_API_KEY $ENVN --yes --scope yaroslav1vanovs-projects >/dev/null 2>&1 || true
  printf '%s' "$KEY" | npx -y vercel@latest env add VIRALMAXING_API_KEY $ENVN --scope yaroslav1vanovs-projects >/dev/null
done
echo "Ключ записан. Пересобираю CRM (1–2 минуты)…"
npx -y vercel@latest deploy --prod --yes --scope yaroslav1vanovs-projects >/dev/null 2>&1 && echo "Готово: CRM пересобрана с ключом Viralmaxing." || echo "Ключ записан, но пересборка не запустилась — напишите Claude."
