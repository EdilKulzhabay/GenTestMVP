#!/usr/bin/env bash
#
# Деплой Edu AI API на прод (kakoi-to-do-men.ru).
#
# Использование:
#   ./deploy.sh                 — тайпчек, пуш main, деплой на сервер
#   SKIP_CHECKS=1 ./deploy.sh   — без локального тайпчека
#
# Настройки (по умолчанию — текущий прод):
#   DEPLOY_HOST=46.247.40.26  DEPLOY_USER=ubuntu  DEPLOY_PATH=/home/ubuntu/GenTestMVP
#   PM2_APP=server  API_PORT=5111  DEPLOY_BRANCH=main
#
# SSH спросит пароль один раз (или настройте ключ — скрипт работает и так, и так).
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-46.247.40.26}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/ubuntu/GenTestMVP}"
# Процесс API запущен в pm2 под именем «server» (исторически, вручную),
# а не «edu-ai-api» из ecosystem.config.js — не переименовывать без миграции pm2.
PM2_APP="${PM2_APP:-server}"
API_PORT="${API_PORT:-5111}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

cd "$(cd "$(dirname "$0")" && pwd)"

step() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

step "Локальные проверки"
if [ -n "$(git status --porcelain)" ]; then
  echo "Рабочее дерево не чистое — закоммитьте или уберите изменения перед деплоем." >&2
  exit 1
fi
CUR_BRANCH="$(git branch --show-current)"
if [ "$CUR_BRANCH" != "$DEPLOY_BRANCH" ]; then
  echo "Текущая ветка «$CUR_BRANCH» — деплоим только «$DEPLOY_BRANCH». Переключитесь: git checkout $DEPLOY_BRANCH" >&2
  exit 1
fi
if [ "${SKIP_CHECKS:-}" != "1" ]; then
  (cd server && npx tsc --noEmit)
  echo "tsc OK"
fi

step "Пуш $DEPLOY_BRANCH в origin"
git push origin "$DEPLOY_BRANCH"
LOCAL_SHA="$(git rev-parse HEAD)"
echo "Локальный HEAD: $LOCAL_SHA"

step "Деплой на $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"
# Присваивания перед bash -s задают переменные удалённой команде; сам скрипт
# уходит через stdin (heredoc в кавычках — локально ничего не раскрывается).
ssh "$DEPLOY_USER@$DEPLOY_HOST" \
  DEPLOY_PATH="$DEPLOY_PATH" PM2_APP="$PM2_APP" API_PORT="$API_PORT" \
  DEPLOY_BRANCH="$DEPLOY_BRANCH" LOCAL_SHA="$LOCAL_SHA" 'bash -s' <<'REMOTE'
set -euo pipefail
# nvm не подхватывается в неинтерактивной SSH-сессии — подключаем явно
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

cd "$DEPLOY_PATH"
git fetch origin "$DEPLOY_BRANCH"
git checkout "$DEPLOY_BRANCH" >/dev/null 2>&1
git pull --ff-only origin "$DEPLOY_BRANCH"
REMOTE_SHA="$(git rev-parse HEAD)"
if [ "$REMOTE_SHA" != "$LOCAL_SHA" ]; then
  echo "На сервере оказался $REMOTE_SHA, ожидали $LOCAL_SHA — деплой прерван." >&2
  exit 1
fi

cd server
npm install --no-audit --no-fund
npm run build
pm2 restart "$PM2_APP" --update-env
pm2 save

# Сервер сначала коннектится к Mongo и только потом слушает порт — ждём health
echo "Ожидание health (до 45 c)..."
for i in $(seq 1 45); do
  if curl -sf "http://localhost:$API_PORT/api/v1/health" >/dev/null; then
    echo "health OK через ${i} c:"
    curl -s "http://localhost:$API_PORT/api/v1/health"; echo
    exit 0
  fi
  sleep 1
done
echo "API не поднялся за 45 c — последние логи:" >&2
pm2 logs "$PM2_APP" --lines 30 --nostream >&2 || true
exit 1
REMOTE

step "Готово: $LOCAL_SHA задеплоен и отвечает"
