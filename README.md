# Перенос сессии Claude Code (0750cdf5-…)

Транскрипт и авто-память сессии Claude Code для продолжения на другом ПК.
Служебная ветка (orphan) — к коду проекта отношения не имеет.

## Восстановление на новом ПК
1. Установи Claude Code и залогинься (`claude`); склонируй рабочие репозитории
   (`GenTestMVP`, `edu-pwa`) — желательно по тем же путям, что на старом ПК.
2. Забери эту ветку в отдельный каталог:
   git clone --branch session-transfer/0750cdf5 --single-branch \
     https://github.com/EdilKulzhabay/GenTestMVP.git ~/edu-session-xfer
3. Разложи файлы:
   mkdir -p ~/.claude/projects
   cp -R ~/edu-session-xfer/dot-claude/projects/. ~/.claude/projects/
   # Если путь рабочего репо на новом ПК ДРУГОЙ — переименуй папку под новый слаг
   # (абсолютный путь, '/'→'-'), напр.:
   #   mv ~/.claude/projects/-Users-madiever-GenTestMVP \
   #      ~/.claude/projects/-Users-<новый-путь>
4. Продолжи сессию:
   cd ~/GenTestMVP
   claude --resume 0750cdf5-39fe-48c2-b958-d128c20b597e

## Удалить перенос после использования
   git push https://github.com/EdilKulzhabay/GenTestMVP.git --delete session-transfer/0750cdf5
