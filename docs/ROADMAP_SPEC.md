# Roadmap Service — Спецификация

---

## 0. Термины и ключевая идея

1. **Canonical roadmap** — статичная «карта знаний» по предмету (JSON), которую выдаёт система всем одинаково. Это граф/дерево узлов (topics), с prereq-связями и метаданными.

2. **Personal roadmap** — персональная проекция canonical roadmap для конкретного пользователя: те же узлы, но с прогрессом, доступностью, рекомендованностью и агрегатными метриками.

3. **Узел (node)** — минимальная единица обучения, из которой можно стартовать тест (и затем получить результат/разбор).

> **Главное:** canonical = контент/структура, personal = состояние пользователя.

---

## 1. Бизнес-цель Roadmap сервиса

Roadmap сервис должен уметь:

- **Показать структуру обучения** (canonical) быстро и стабильно.
- **Для пользователя:** определить, какие узлы «доступны сейчас», какие «закрыты пререквизитами», какие «рекомендованы».
- **После каждого теста:** обновить персональный прогресс и выбрать «следующий шаг».

> Roadmap не должен «учить сам» — он оркестрирует навигацию по знаниям и управляет состоянием прогресса.

---

## 2. Основной пользовательский флоу

### A. Первый вход (guest или auth)

1. Пользователь выбирает предмет.
2. Приложение запрашивает canonical roadmap (можно кешировать на клиенте, но бэкенд должен уметь отдать).
3. Приложение показывает roadmap: узлы с состояниями.
4. Пользователь выбирает доступный узел → стартует генерацию теста → проходит тест → получает результат.
5. После submit: бэкенд обновляет personal roadmap (progress) и возвращает рекомендации (следующий узел / несколько узлов).

### B. Возвращающийся пользователь

1. Login.
2. **«Resume learning»**: бэкенд возвращает следующий рекомендуемый узел (и приоритет/обоснование).
3. Пользователь идёт по рекомендованному узлу → тест → обновление прогресса → новые рекомендации.

---

## 3. Состояния узлов (для UI и логики)

Минимум такие состояния в personal-проекции:

### 3.1 availability (доступность)

| Значение | Описание |
|---|---|
| `locked` | Недоступен — не выполнены prerequisites (или не достигнут порог в prereq-узлах) |
| `available` | Можно проходить сейчас |
| `optional_available` | Доступен, но не обязателен для прогресса (факультативные ветки; можно не делать в MVP) |

### 3.2 progressStatus (статус прогресса)

| Значение | Описание |
|---|---|
| `not_started` | Не начато |
| `in_progress` | Есть попытки теста, но порог mastery не достигнут |
| `mastered` / `completed` | Узел считается закрытым |

### 3.3 metrics (минимум)

- `attemptsCount`
- `lastAttemptAt`
- `bestScore` / `avgScore`
- `masteryScore` (0..1) — агрегат, который решает «закрыт узел или нет»

### 3.4 recommendation

- `isRecommended` (bool)
- `recommendedPriority` (число)
- `recommendedReason` (строка/код причины)

> **В MVP можно упростить:** `locked`/`available` + `not_started`/`in_progress`/`mastered` + `recommended`.

---

## 4. Правила: когда узел считается пройденным

Нужно **одно чёткое правило**, иначе будет хаос.

### Варианты

| Правило | Описание |
|---|---|
| **Rule 1** (простая) | Узел `mastered` если score последней попытки ≥ threshold (например 70%) |
| **Rule 2** (устойчивее) | Узел `mastered` если `bestScore` за последние N попыток ≥ threshold |
| **Rule 3** (самая «умная», но сложнее) | `masteryScore` рассчитывается по экспоненциальному сглаживанию, учитывает время и т.п. |

### Рекомендация для MVP — Rule 2

- **threshold** = 70%
- **N** = 3 (или «bestScore вообще»)
- Если `bestScore ≥ threshold` → `mastered`
- Иначе → `in_progress`

> Если узел `mastered`, его можно всё равно перепроходить, но это **не должно «ломать» прогресс назад** (или должно, но тогда нужна чёткая политика деградации — обычно не надо для MVP).

---

## 5. Как вычислять доступность (locked / available)

Canonical roadmap должен содержать `prerequisites` для каждого узла (список `nodeId`).

**Правило:**

- Узел `available` если для **всех** prereq-узлов: они `mastered`.
- Иначе `locked`.
- **Нулевые prerequisites** — стартовые узлы **всегда** `available`.

> Если prerequisites будут не «все», а «любое из» (OR-группы), тогда canonical должен поддерживать структуру:
> ```json
> "prerequisites": [
>   { "type": "all", "nodeIds": ["..."] },
>   { "type": "any", "nodeIds": ["..."] }
> ]
> ```
> Но для MVP можно только `"all"`.

---

## 6. Откуда берётся «следующий рекомендуемый узел»

Рекомендации — это отдельная логика, но она должна быть **стабильной и объяснимой**.

### Минимальная логика (хорошо работает для MVP)

1. **Найти «frontier»** — все `available` узлы, которые `not_started` или `in_progress`.
2. **Приоритизировать:**
   - Выше приоритет узлам `in_progress` (пользователь уже начал)
   - Затем узлам, которые «разблокируют» больше всего следующих узлов (`outDegree`)
   - Затем узлам с более низким `masteryScore` (если есть) — «подтянуть слабое место»
3. **Вернуть** `top-1` (для Resume) и `top-K` (например 3) для экрана рекомендаций.

### Коды причин (reason)

| Код | Описание |
|---|---|
| `CONTINUE_IN_PROGRESS` | Пользователь уже начал этот узел |
| `UNLOCKS_NEXT_TOPICS` | Прохождение разблокирует больше всего следующих тем |
| `LOW_MASTERY` | Слабое место — нужно подтянуть |
| `PART_OF_MAIN_PATH` | Узел на основном пути |

---

## 7. События, которые обновляют personal roadmap

Roadmap должен обновляться после «значимых событий»:

### 7.1 TestSessionSubmitted (основное)

**Входные данные:** `userId`, `subjectId`, `nodeId`, `score`, `errors`, `timestamps`.

**Действия:**
1. Записать attempt
2. Пересчитать metrics/mastery для `nodeId`
3. Если `nodeId` стал `mastered` → потенциально разблокировать зависящие узлы (availability пересчитается)
4. Пересчитать рекомендации (next nodes)

**Выход:** обновлённый personal snapshot или хотя бы delta + recommendations.

### 7.2 TestSessionStarted / Abandoned (опционально)

Можно использовать, чтобы ставить `in_progress` даже без submit (если нужно). Для MVP можно считать `in_progress` только после хотя бы одной submit.

### 7.3 SubjectSelected (первичный старт)

Создать personal roadmap (или lazy-create при первом запросе).

---

## 8. Данные и сущности в хранилище

### 8.1 CanonicalRoadmap (версия по предмету)

| Поле | Описание |
|---|---|
| `subjectId` | Привязка к предмету |
| `version` | **Важно!** Версионирование |
| `nodes` | `{ nodeId, title, prerequisites[], metadata… }` |

> **Versioning:** если canonical поменяется, надо понимать, что делать с существующим прогрессом.
>
> Минимально для MVP:
> - «Замораживаем» версию на пользователя (`userSubjectRoadmap.version`) и не ломаем его прогресс.
> - Либо миграция (сложнее).

### 8.2 UserNodeProgress (personal)

| Поле | Описание |
|---|---|
| `userId`, `subjectId`, `canonicalVersion` | Привязка |
| `nodeId` | Узел |
| `status` | `not_started` / `in_progress` / `mastered` |
| `availability` | `locked` / `available` |
| `bestScore`, `avgScore`, `attemptsCount`, `lastAttemptAt` | Метрики |
| `masteryScore` | Агрегатная оценка |

### 8.3 TestAttempts / TestSessions

| Поле | Описание |
|---|---|
| `sessionId`, `userId`, `subjectId`, `nodeId` | Привязка |
| `createdAt`, `submittedAt` | Временные метки |
| `score` | Результат |
| `errors[]` | Для аналитики/разбора (может быть в другом сервисе) |

> Roadmap сервису не обязательно хранить все детали ошибок, но должен получать `score` и `nodeId`.

---

## 9. Контракты API (минимально необходимые)

### 9.1 Получить canonical

```
GET /api/roadmaps/canonical?subjectId=...
→ { version, nodes, edges/prereqs }
```

### 9.2 Получить personal roadmap (snapshot для UI)

```
GET /api/roadmaps/personal?subjectId=...
→ {
    version,
    nodes: [
      {
        nodeId, availability, status,
        attemptsCount, bestScore, masteryScore,
        isRecommended, recommendedPriority, recommendedReason
      }
    ],
    nextRecommended: { nodeId, reason, priority }
  }
```

### 9.3 Получить «next step» (если отдельным)

```
GET /api/roadmaps/next?subjectId=...
→ { nodeId, reason, alternatives: [...] }
```

### 9.4 Обработать завершение теста

```
POST /api/roadmaps/events/test-submitted
Body: { userId, subjectId, nodeId, score, sessionId, submittedAt }
→ { updatedNodesDelta, nextRecommended }
```

> Если архитектура event-driven: Test Sessions публикует событие, Roadmap подписывается и обновляет read-model.

---

## 10. Edge cases (обязательно учесть)

### 10.1 Генерация/сессия упала или отменена

Прогресс **не обновлять**.

### 10.2 Повторные сабмиты / idempotency

Обработка `TestSessionSubmitted` должна быть **идемпотентной по `sessionId`**, иначе будут дубли `attemptsCount`.

### 10.3 Изменение canonical roadmap

Если версия изменилась, нельзя silently «пересобрать» прогресс без правил.

### 10.4 Guest → Auth migration

Если есть `guestSessionId`, после регистрации надо смержить попытки/прогресс в `userId`.

### 10.5 Конкурентные сабмиты

Два submit подряд должны корректно пересчитать `bestScore`/`avgScore` (транзакция / оптимистичная блокировка).
