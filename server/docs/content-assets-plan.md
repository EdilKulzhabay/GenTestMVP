# ContentAssets — handoff план (Фазы 5–6 + LLM)

> Читай это ПОЛНОСТЬЮ перед началом. Самодостаточно: фронт-репо не нужен — контракт ниже.
> Задача: доделать бэкенд ContentAssets — resolved `assets[]`/`assetIds` в тестах и Kahoot (Фазы 5–6)
> **вместе с** LLM-генератором (эмит `assetIds`) и enrich-воркером, одним сфокусированным проходом.

## 0. Как работать (операционка)

- **Запускай сессию в `/Users/madiever/edu`** — там файлы памяти (`content-assets-plan`). Бэкенд правь по абсолютным путям `/Users/madiever/GenTestMVP/server/...` (память привязана к cwd; из `server/` она НЕ загрузится).
- Бэкенд-репо: `EdilKulzhabay/GenTestMVP`, ветка **`feat/content-assets`** (push-доступ есть). Уже запушены Фазы 1–4.
- Стек: Express 4 + Mongoose 8 + Multer + Socket.io, TS. Build `tsc`, lint `eslint . --ext .ts`.
- **node_modules:** если нет — `cd server && npm install --cache <writable-dir>` (глобальный `~/.npm` root-owned, падает EACCES без `--cache`).
- **Гейт:** `node_modules/.bin/tsc --noEmit` (должен быть 0) + `eslint` ТОЛЬКО свои файлы. **БД локально не поднимай** — только статический гейт.
- **Предсуществующий `no-explicit-any`-долг в репо — НЕ мой, НЕ чинить** (importSubject stats, IErrorResponse/ISuccessResponse и т.п.). Правило: `no-explicit-any: error`, `no-unused-vars` (без ignoreRestSiblings) → в новом коде НЕ писать `any`, НЕ деструктурировать-в-rest с выкидыванием.
- В конце: коммит (Conventional Commits + `Co-Authored-By: Claude ...`) + `git push` в `feat/content-assets`. PR откроет юзер вручную (gh нет, github-MCP creds битые).

## 1. Статус

**Готово + запушено (feat/content-assets, 3 коммита):**
- Ф1 модель+типы: `ContentAssetSchema` (flat, `kind`-enum, авто-`_id`) на `TopicSchema.assets` (Subject.model.ts); `assetIds:[String]` в ОБОИХ `RelatedContentSchema` (Test.model.ts + QuestionItem.model.ts — дубль, держать в синхроне); типы `IContentAsset`/`INewContentAsset`, `ITopic.assets`, `IRelatedContent.assetIds`, `IRoadmapLessonResponse.assets` (types/index.ts + types/roadmap.types.ts).
- Ф2 CRUD: `SubjectController.addAsset/updateAsset(replace через splice, _id+kind сохраняются)/deleteAsset/reorderAssets(физический, те же субдоки)` + роуты (subject.controller.ts / subject.routes.ts), `isTeacherOrAdmin`.
- Ф3 upload: `assetUpload.middleware.ts` (multer→`uploads/subject-assets/<subjectId>/<mintedId><ext>`, image-filter, 5MB) + `express.static('/api/v1/uploads')` в app.ts + `POST /subjects/:subjectId/assets/upload` → `{ url }` (абсолютный из `req.host` + `${API_BASE_PATH}/uploads/...`).
- Ф4 lesson: `extractTopicAssets` (roadmapChapter.util.ts, рядом с extractTopicText) + `resolveNodeAssets` (nodeLessonContent.service.ts) → `assets:[]` на ответе урока (roadmapLesson.service.ts, рядом с `sources:`). **Урок-сторона готова E2E.**

**Осталось (этот проход):** Ф5 (HTTP-тесты), Ф6 (Kahoot), LLM-A (enrich), LLM-B (генератор эмитит assetIds).

## 2. Контракт фронта (что бэк ОБЯЗАН отдавать)

Фронт запушен в `madiever/edu` ветка `feat/content-assets`. Ключевое:

**ContentAsset** (то, что уже в Mongoose-схеме) — discriminated по `kind`:
```
{ _id, kind:'table'|'image'|'formula'|'problem', caption?, pages?:number[], enrichment?, embedding? } &
  table:{columns:string[],rows:string[][],llmSummary?} | image:{url,webpUrl?,alt,width?,height?,pixelDependent?,llmDescription?,ocrText?}
  | formula:{latex,display:boolean,imageUrl?,plainText?} | problem:{promptMarkdown,answer?,solutionMarkdown?}
```
`_id` на выходе — СТРОКА (res.json стрингифицит ObjectId; в коде для сравнения/дедупа делай `String(a._id)`).

**HTTP-тесты** (`GET/POST /tests/*`: generate, generate-guest, node-bank, getTestById, startSolo):
- top-level `assets?: ContentAsset[]` (resolved-сайдкар).
- `questions[].relatedContent.assetIds?: string[]` (НЕСЁТСЯ ВЛОЖЕННО в relatedContent — фронт-маппер `mapGeneratedQuestion` хойстит его в `question.assetIds`, а `mapGeneratedTestToClient` читает `data.assets`).

**Kahoot** (socket): `ClientQuestion` у фронта НЕ имеет `relatedContent` → `assetIds` должен быть на **ТОП-ЛЕВЕЛ** `ClientQuestion.assetIds`. Плюс:
- `LiveRoomStatePayload.assets?: ContentAsset[]`
- `SoloJoinAck.session.assets?: ContentAsset[]`, `SoloAnswerAck.assets?: ContentAsset[]`
→ **`sanitizeQuestionForClient` для Kahoot должен ХОЙСТИТЬ `assetIds` из `relatedContent` в топ-левел** (в HTTP-пути — оставить вложенным). Проверь, одна ли это функция для обоих путей; если да — хойстить всегда безопасно (HTTP-фронт читает и вложенный, и топ-левел? нет — GeneratedTestQuestion читает `relatedContent.assetIds`, ClientQuestion — топ-левел. Значит: в HTTP оставь вложенным; в Kahoot-обёртке добавь топ-левел `assetIds`).

**Обратная совместимость:** всё опционально; без данных — как раньше; `PERSISTED_TEST_VERSION` фронт не бампал.

## 3. Решения (зафиксированы)

- **Сайдкар = СУПЕРМНОЖЕСТВО** ассетов in-scope тем (не только процитированные) — работает даже до LLM-B; фронт показывает только по `assetIds`/токенам, лишнее безвредно.
- Enrich-модель: **gpt-4o-mini** (тот же, что везде; есть vision). `ocrText`/`embedding` — DEFER (нет OCR/embeddings клиента).
- Upload: только `{url}`; **sharp НЕ добавлять** (webp/width/height опциональны).
- Триггер enrich — на твоё решение (fire-and-forget после upload / on-demand endpoint / batch-скрипт). Best-effort, НЕ блокирует CRUD/upload.

## 4. Ф5 — HTTP-тесты (инвазивная: sanitize→async)

Файлы: `test.controller.ts`, `entQuestion.util.ts`, `questionBank.service.ts`, `roadmapChapter.util.ts` (уже есть `extractTopicAssets`).

- **5A (тривиально, сделать первым):** в `entQuestion.util.ts` в литерале `relatedContent` у `validateEntQuestion` (~:300-303) и `validateRegularQuestion` (~:429-432) добавить `assetIds: Array.isArray(rc.assetIds) ? rc.assetIds.map(String) : undefined` (сейчас дропается). Тогда `assetIds` доживает от LLM/банка до `sanitizeQuestionForClient` (который relatedContent отдаёт целиком).
- **5B (сайдкар):** `test.controller.ts` `private sanitize(test)` (:174) → сделать **async**, добавить top-level `assets`. Call-sites (заawaitить): `:251,:263,:300,:315,:417,:489,:742`. Резолв сайдкара:
  - generate / generate-guest: `book`/`subject` уже загружены (~:244/:293) — резолвь оттуда `extractTopicAssets` по in-scope темам (dto.bookId/chapterId, либо по `relatedContent.topicId` вопросов).
  - node-bank: через `questionBankService.resolveNode(...).sourceRefs` (:137) внутри `assembleNodeTest` (:354) → union ассетов sourceRefs-тем.
  - cache-hit / getTestById: держат только `Test` (не subject) → один `Subject.findById(test.subjectId).lean()` и резолв по `relatedContent.topicId` вопросов (дедуп по _id). Не добавляй лишний запрос там, где subject уже в scope.
  - Дедуп по `String(_id)`. Тип `assets` — `IContentAsset[]`.

## 5. Ф6 — Kahoot Live/Solo

Файлы: `liveKahoot.service.ts`, `socket/index.ts`.

- **Live:** резолвь `assets` ОДИН раз в `createLiveRoom` (~:305, `testDoc` имеет `subjectId`) — `Subject.findById().lean()` + union ассетов in-scope тем теста; сохрани `assets` на объекте `LiveRoomState` (интерфейс ~:51-71). В `buildStatePayload` (~:117-160) добавь `assets: room.assets ?? []` (~:138). Снапшот на момент создания комнаты (как questions) — правка ассетов темы в игре не рефрешит.
- **Solo:** в `socket/index.ts` — в ack `solo:join.session` (~:230-237, Test загружен ~:223) и `solo:answer` (~:286-297, Test ~:259) добавь `assets` (тот же резолвер по Test.subjectId + relatedContent вопросов).
- **`ClientQuestion.assetIds` — топ-левел** (см. §2): в Kahoot-обёртке вопроса добавь `assetIds` из `relatedContent.assetIds`.

## 6. LLM-A — enrich (vision → llmDescription)

Клиент: raw `fetch` → `https://api.openai.com/v1/chat/completions`, `gpt-4o-mini`. JSON: `openAiJsonCompletion` (ai.service.ts:647). VISION: `chatLessonNode` (roadmap.ai.service.ts:292-364) — user-message из массива `{type:'text'}` + `{type:'image_url',image_url:{url:`data:${mime};base64,${b64}`}}`. Disk-readback файла: `fs.readFile(path.join(cwd, relPath)).toString('base64')` (roadmapLesson.service.ts:237-256).

Сделать: `describeImageAsset({mimeType,base64,caption?,alt?}):Promise<string>` (новый `asset.ai.service.ts` или рядом с chatLessonNode) → 1 image_url part + describe-промпт → вернуть content. Писать в `image.llmDescription` + `asset.enrichment = {version, model:'gpt-4o-mini', generatedAt:new Date(), status:'done'}`. Триггер: best-effort (не блокирует upload/CRUD). DEFER: `ocrText`, `embedding`.

## 7. LLM-B — генератор эмитит relatedContent.assetIds

Файлы: `ai.service.ts` (regularSpec :167, entSpec :193 — там описан `relatedContent`), `subjectContent.service.ts` (`resolveBookContentForAI` — read-path контента для AI), `questionBank.service.ts` (`generateKcQuestions`).

Сделать: (1) в контекст промпта инжектить СПИСОК КАНДИДАТ-АССЕТОВ in-scope тем: `{assetId, kind, caption/llmSummary/alt}` (surface `topic.assets` из resolveBookContentForAI или параллельным билдером); (2) расширить инструкцию relatedContent: опциональный `"assetIds": [<только из предоставленного списка>]`; (3) ingest уже несёт (5A); (4) защитный фильтр `assetIds ∈ candidateSet` (анти-галлюцинация). Bank-сторона (`generateKcQuestions`) — та же инжекция по sourceRefs-темам. Новых зависимостей не надо (тот же gpt-4o-mini JSON).

## 8. Подводные камни

- **ObjectId↔string:** lean-ассеты имеют `_id: ObjectId`; контракт — `string[]`. Сравнивай/дедупь через `String(_id)`. res.json стрингифицит топ-левел ObjectId сам.
- **Дубль `RelatedContentSchema`** (Test.model.ts + QuestionItem.model.ts): `assetIds` уже в обоих (Ф1). Любую правку relatedContent — в оба.
- **Kahoot sanitize хойстит assetIds в топ-левел** (§2) — не забудь.
- **Reorder** (уже сделан) — двигает ТЕ ЖЕ субдоки (сохраняет _id); не строить новые объекты (перемнёт _id → сломает ссылки assetIds).
- **express.static под `/api/v1/uploads`** — reverse-proxy форвардит `/api/v1`; upload-url из `req.get('host')` (nginx обычно проксирует Host). Если prod отдаёт файлы иначе — это deploy-деталь.
- **Нет БД локально** — E2E не прогнать; полагайся на tsc + code-review + аккуратность на async-рефакторе sanitize.
- Cleanup файлов на диске при delete ассета/subject — DEFER (минорный leak; можно зеркалить RoadmapChatAttachment.deleteMany в deleteSubject).

## 9. Полный заземлённый план (первоисточник)

Детальный understand+plan воркфлоу по бэкенду — был в session tmp (`wc0aay01d`), эфемерно. Этот док — его выжимка + контракт. Если нужен ещё контекст — фронт-ветка `madiever/edu:feat/content-assets` (типы: `packages/shared/src/types/contentAsset.ts`, `packages/edu-app/src/entities/{test,quiz}/lib/types.ts`, `packages/edu-app/src/entities/lesson/lib/roadmapNodeLessonApi.ts`).
