export const meta = {
  name: 'map-for-bank-admin-plan',
  description: 'Map admin FE, bank/KC API, test-size constraints, learner flow, and question gen to ground an implementation plan',
  phases: [{ title: 'Map', detail: 'parallel read-only readers over the 5 relevant subsystems' }],
}

const SHARED = `
КОНТЕКСТ ПРОЕКТА. EdTech-платформа (Edu AI) — ИИ-генерация тестов ЕНТ для Казахстана.
Монорепо: server/ (Node+TS+Express+Mongoose, OpenAI gpt-4o-mini), packages/admin (админка для кураторов), edu-pwa (PWA для учеников).
Контент: Subject → Book → Chapter → Topic → Paragraph → текст. КТП (KtpCatalog) — канонический упорядоченный список тем; узел роадмапа = ktp-узел; маппинг темы книги → узел КТП.
НОВОЕ (уже реализовано на бэкенде, ветка feat/knowledge-bank, проверено сквозным smoke):
 - KnowledgeComponent (KC, подтема) встроен в KtpTopic.knowledgeComponents[] (status proposed|confirmed). ИИ предлагает, куратор подтверждает.
 - Банк вопросов QuestionItem (коллекция question_items): тег knowledgeNodeId(=ktpTopicId)+knowledgeComponentIds+difficulty+sourceRefs+contentHash.
 - questionBank.service: coverage, generateForCoverage (генерация+LLM-верификация+дедуп), assembleNodeTest (сборка Test из банка, зафиксирована на 10 вопросов).
 - Пер-KC mastery (UserKcMastery).
ЦЕЛЬ ПЛАНА (две вещи): (1) Админ-UI для кураторов: на экране узла КТП — предложить/подтвердить KC, посмотреть покрытие банка, сгенерировать банк. (2) Снять хардкод "ровно 10 вопросов" в тесте и сделать размер теста настраиваемым; плюс улучшить сам вопрос (качество/типы).
ТЫ — read-only исследователь. НИЧЕГО не редактируй. Верни структурированную карту по своей области: ключевые файлы с ролью, факты (как есть в коде, с путями и по возможности номерами строк), рекомендации по реализации, риски.`

const SCHEMA = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    keyFiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, role: { type: 'string' } },
        required: ['path', 'role'],
        additionalProperties: false,
      },
    },
    facts: { type: 'array', items: { type: 'string' }, description: 'Точные факты из кода: пути, file:line, формы данных, что хардкодится' },
    recommendations: { type: 'array', items: { type: 'string' }, description: 'Конкретные шаги реализации в терминах этого кода' },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'keyFiles', 'facts', 'recommendations', 'risks'],
  additionalProperties: false,
}

const DIMENSIONS = [
  {
    key: 'admin-frontend',
    prompt: `Область: АРХИТЕКТУРА АДМИНКИ (packages/admin) для встройки UI банка/KC.
Изучи packages/admin: какой фреймворк/сборка (React? Vite?), роутинг, КАК делаются запросы к API (общий axios-инстанс? сервисный слой? react-query/swr?), как хранится и подставляется auth-токен, управление состоянием, конвенции компонентов и стилей.
КРИТИЧНО: найди СУЩЕСТВУЮЩИЕ экраны КТП/роадмапа в админке (файлы, компоненты), куда естественно прикрутить работу с KC и банком на уровне узла КТП. Найди, как админка сейчас дёргает /ktp эндпоинты.
Верни: ключевые файлы с ролями, конкретный пример паттерна вызова API (с импортами), где именно (какой компонент/экран) повесить KC/банк-UI, и какие переиспользуемые UI-компоненты уже есть (модалки, списки, кнопки-генерации).`,
  },
  {
    key: 'bank-kc-api',
    prompt: `Область: СЕРВЕРНЫЙ API ДЛЯ KC И БАНКА (контракт для фронта).
Изучи: server/src/routes/ktp.routes.ts, server/src/controllers/ktp.controller.ts, server/src/services/knowledgeComponent.service.ts, server/src/services/questionBank.service.ts, server/src/models/QuestionItem.model.ts, server/src/models/KtpCatalog.model.ts (knowledgeComponents), server/src/routes/test.routes.ts (POST /tests/node-bank), server/src/controllers/test.controller.ts (generateNodeTestFromBank).
Для КАЖДОГО эндпоинта KC/банка верни: метод, полный путь, path-параметры, тело запроса, форму ответа. Отметь auth/role-middleware (кто имеет доступ — админ/куратор?). Отметь, какие операции есть (propose/confirm/list/reorder/remove KC; coverage/generate банка) и чего НЕ хватает для UI (например, нет эндпоинта "список вопросов банка по узлу/по KC для просмотра", нет ручного редактирования/ретайра вопроса).
Цель — точный контракт, по которому фронт построит клиент.`,
  },
  {
    key: 'test-size-constraint',
    prompt: `Область: ХАРДКОД "РОВНО 10 ВОПРОСОВ" И ПРИВЯЗКА ТЕСТА.
Найди ВСЕ места, где размер теста зафиксирован/валидируется, и всё, что мешает переменному размеру.
Изучи: server/src/utils/entQuestion.util.ts (parseAndValidateEntQuestions требует ровно 10; parseAndValidateRegularQuestions с expectedCount), server/src/models/Test.model.ts (валидаторы схемы, обязателен ли bookId), server/src/services/questionBank.service.ts (TEST_SIZE и assembleNodeTest), server/src/controllers/test.controller.ts, server/src/services/ai.service.ts (профили regular/ent, questionCount, computeTestContentHash — как size входит в ключ кэша).
Для каждого ограничения верни ТОЧНЫЙ file:line и что именно ограничивает. Отдельно: обязателен ли Test.bookId и где (чтобы оценить переанкоринг с book на node). Дай рекомендованное изменение для каждого пункта, чтобы размер теста стал настраиваемым (например 5/10/15/20) и сборка из банка могла быть переменного размера, НЕ ломая существующий regular/ent поток.`,
  },
  {
    key: 'learner-test-flow',
    prompt: `Область: ПОТОК ТЕСТА У УЧЕНИКА И ГДЕ ЗАДАЁТСЯ КОЛИЧЕСТВО ВОПРОСОВ.
Проследи end-to-end, как ученик запрашивает и проходит тест, с фокусом на ТО, ГДЕ решается число вопросов.
Сервер: server/src/controllers/test.controller.ts (generateTest, generateTestGuest, generateNodeTestFromBank, submitTest), ai.service генерация (regular vs ent, questionCount, батчинг ЕНТ).
Фронт ученика (edu-pwa): как вызывается /tests/generate и /tests/node-bank, выбирает ли пользователь количество/профиль или оно фиксировано, как рендерится прохождение и сабмит.
Верни: схему потока, где именно задаётся/прокидывается count и testProfile, и что нужно поменять, чтобы поддержать переменное число вопросов из банка (и переключить дефолтный поток узла на банк, если уместно). Отметь связь с roadmap-узлом (roadmapNodeId/ktpTopicId).`,
  },
  {
    key: 'question-gen-quality',
    prompt: `Область: ГЕНЕРАЦИЯ И КАЧЕСТВО ВОПРОСОВ БАНКА (для "поработать с самим вопросом").
Изучи: server/src/services/ai.service.ts (generateKcQuestions, verifyQuestionItem, openAiJsonCompletion), server/src/utils/entQuestion.util.ts (типы вопросов и валидаторы: single_choice, multiple_choice, matching_single/multiple, short_answer, text_input; функции validateRegularQuestion, parseRegularQuestionsLenient), server/src/services/questionBank.service.ts (generateForCoverage: difficulty, dedup contentHashOf, qualityStats, ретайр).
Верни: какие типы вопросов поддерживает платформа в принципе vs какие генерит банк сейчас (подтверди, что банк только single_choice с 4 вариантами). Как устроены difficulty (1-5), sourceRefs, contentHash-дедуп, qualityStats и авто-ретайр. Перечисли КОНКРЕТНЫЕ рычаги улучшения качества вопроса: промпт генерации, строгость/настройка LLM-судьи, распределение сложности, поддержка большего числа типов вопросов в банке, дистракторы. Отметь, что валидатор ЕНТ требует ровно 10 (связь с размером теста).`,
  },
]

phase('Map')
const results = await parallel(
  DIMENSIONS.map((d) => () =>
    agent(`${SHARED}\n\n${d.prompt}`, { label: d.key, phase: 'Map', schema: SCHEMA, agentType: 'Explore' })
  )
)
return results.filter(Boolean)
