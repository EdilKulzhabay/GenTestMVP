---
name: ktp-roadmap-architecture
description: "How the subject roadmap is built — from the КТП catalog, not from linear book topics"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5c10c7f2-4852-4e69-b10b-9b84c6b75b66
---

Роудмап предмета строится из **КТП** (KtpCatalog) — канонического упорядоченного списка тем предмета (от центра тестирования), а НЕ из линейных тем книг. Это сделано, чтобы убрать дублирование обучения: одна тема (напр. митохондрии) встречается в книгах 7/9/10 классов, и раньше становилась тремя узлами.

Ключевые решения:
- `KtpCatalog` (модель, уникальна на subjectId, embedded `topics` с _id = стабильный id, поля year/version). Эталон редактирует только admin; читать может teacher.
- Маппинг M:N: `Subject.Topic.ktpTopicIds[]` — тема книги ссылается на 1+ тем КТП. Маппинг делают admin/teacher в `SubjectDetailPage` (инлайн `TopicKtpEditor`).
- Роудмап **строится вживую** в `roadmapService.resolveCanonical` через `buildKtpCanonicalNodes` (utils/roadmapKtp.util.ts) — отдельного сохранённого документа не нужно; `rebuild-from-ktp` лишь валидирует и бампает `subject.updatedAt` (версия для учеников). nodeId = `ktp:{ktpTopicId}` (utils/ktpNode.util.ts).
- Узел = тема КТП = ОДИН консолидированный урок. Контент собирается AI-консолидацией из текстов замапленных тем книг (`roadmapAIService.consolidateLessonContent`): дедуп без потери фактов, язык источников, при большом объёме — 2–4 урока. Граф строится вживую из КТП, а контент урока кэшируется отдельно в `NodeLessonContent` (ключ subjectId+ktpTopicId, инвалидация по `sourceHash`); резолвер — `nodeLessonContent.service.ts` (`resolveNodeLessons`/`nodeLessonIds`/`describeNodeSources`), без OPENAI_API_KEY — сырой fallback (utils/nodeLessons.util.ts). Последовательный гейтинг уроков; прогресс по урокам в `UserRoadmapProgress.nodes[].lessons[]`. В ответе урока есть `sources` (книга/класс+тема) для трассируемости.
- Триал: `computeTrialTopicMasteryRows` фанаутит тему книги → замапленные КТП-узлы (`mapBookTopicToKtpNodeIds`); применяется `applyTrialKtpResults`.
- Роль `teacher` (admin-lite): декомпозиция книг + маппинг; не может править эталон КТП/пользователей/удалять предметы.

Миграции прогресса не делали (был dev без реальных пользователей). Старая схема `book:chapter:topic` nodeId и статический JSON-сидинг удалены.
