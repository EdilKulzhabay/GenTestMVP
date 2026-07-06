---
name: test-refresh-restore
description: "edu-app refresh-during-test restore is solved by full client persist, not the by-id endpoint"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5c10c7f2-4852-4e69-b10b-9b84c6b75b66
---

В edu-app восстановление теста при рефреше во время прохождения решено **полным клиентским персистом**, а не дозагрузкой с сервера: `usePersistedTest` (`entities/test/lib`) хранит снапшот `PersistedTest` в **sessionStorage** (вопросы `TestQuestionPublic[]` + `answers: Record<questionId, value>` + `currentIndex` + прогресс), ключ `TEST_STORAGE_KEY_PREFIX`+subject/book/node. На маунте `restoredState → selectResumeSnapshot → reducer`. Работает офлайн и для гостя.

`getGeneratedTestById` (`GET /tests/:id`) — контракт исправлен (был POST), но **намеренно не подключён**: для refresh-restore он хуже (сеть на каждый рефреш, ломается офлайн, гостю 401 — эндпоинт auth-only, всё равно надо персистить testId+answers локально).

**Why:** обсудили — решили оставить как есть (2026-06-14). Хук оставлен готовым на будущее.

**How to apply:** не вайрить `getGeneratedTestById` в refresh-restore. Он пригодится только для **кросс-девайс resume** (нужно серверное хранение прогресса) или deep-link на тест по URL. Контракт-фикс лежит в ветке `fix/edu-app-contract-sync`. Relates to [[mapping-hints-deprioritized]].
