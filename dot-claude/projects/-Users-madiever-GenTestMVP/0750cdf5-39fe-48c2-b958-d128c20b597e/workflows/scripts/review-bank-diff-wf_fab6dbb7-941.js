export const meta = {
  name: 'review-bank-diff',
  description: 'Adversarially review the bank admin-UI + variable-test-size diff; verify each finding',
  phases: [{ title: 'Review' }, { title: 'Verify' }],
}

const BASE = '6431bf3'
const SHARED = `
Репозиторий: /Users/madiever/GenTestMVP (монорепо: server/ Node+TS+Express+Mongoose+OpenAI; client/ React+Vite — это админка).
Ревью изменений ветки feat/knowledge-bank поверх базы ${BASE}..HEAD (2 коммита: админ-UI банка + переменный размер теста и качество вопросов).
Сначала прочитай диапазон диффа:  git -C /Users/madiever/GenTestMVP diff ${BASE} HEAD -- <относящиеся пути>
Затем читай окружающий код, чтобы понять контекст. Ищи РЕАЛЬНЫЕ дефекты корректности и интеграции, а не стиль.
Контекст фич:
 - Бэкенд KC/банк (questionBank.service.ts, ktp.controller.ts, ktp.routes.ts): новый read-эндпоинт listItems вопросов банка (admin); size-параметр assembleNodeTest (разрешено 5/10/15/20), size подмешан в реюз-хэш; generateForCoverage переписан на циклы раундов + разброс difficulty; contentHashOf теперь хеширует текст+варианты+правильный ответ.
 - Test.model.ts: валидатор questions.length сменён с ===10 на диапазон 1..120.
 - test.routes.ts/test.controller.ts: /tests/node-bank принимает size; /generate(+guest) валидируют questionCount.
 - client: ktp.api.ts (+методы KC/банка), ktp.types.ts (+типы), components/ktp/TopicKnowledgeBank.tsx (новый), KtpCatalogPage.tsx (врезка per-topic), гейтинг по role==='admin'.
Возвращай только обоснованные находки с file/location/severity/detail/suggestedFix.`

const FIND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dimension: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: { type: 'string' },
          location: { type: 'string', description: 'функция или строки' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
        required: ['file', 'location', 'severity', 'title', 'detail', 'suggestedFix'],
      },
    },
  },
  required: ['dimension', 'findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    isReal: { type: 'boolean' },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    reason: { type: 'string' },
  },
  required: ['isReal', 'severity', 'reason'],
}

const DIMENSIONS = [
  {
    key: 'backend-bank',
    prompt: `Дименсия: КОРРЕКТНОСТЬ БЭКЕНДА БАНКА (server/src/services/questionBank.service.ts, controllers/ktp.controller.ts, routes/ktp.routes.ts).
Проверь особо: (1) переписанный generateForCoverage — циклы раундов (MAX_ROUNDS), buildDifficultyPlan, producedThisRound-выход, нет ли бесконечного цикла/недогенерации/двойного учёта rejected между раундами; (2) size в assembleNodeTest: normalizeTestSize, реюз-хэш с size (нет ли коллизий/неверного реюза), масштабирование minPerKc=ceil(size/kcCount) при дозаполнении — хватает ли на size при малом числе KC; (3) listItems — фильтры/leak правильных ответов только под admin; (4) contentHashOf по text+options+correctOption — не ломает ли дедуп существующих item'ов, корректность .sort() вариантов.`,
  },
  {
    key: 'test-model-impact',
    prompt: `Дименсия: ВЛИЯНИЕ СМЕНЫ ВАЛИДАТОРА Test.model (===10 → 1..120) НА ВСЕ ПОТОКИ.
Проверь: не полагается ли где-то код на ровно 10 (submit/grade, solo, socket, kahoot, trial, аналитика, кэш sourceContentHash, предгенерация). Особо — generateEntBatchedTest и trial.service (блоки 20/10/10/40): теперь сохранение пройдёт — нет ли регрессий или, наоборот, ранее «мёртвого» кода, который теперь активируется неожиданно. Валидация questionCount на роутах vs пределы в ai.service (1..50 regular, кратно10 ent) — не рассинхронились ли (например, questionCount=120 для regular даст 500 в сервисе?).`,
  },
  {
    key: 'client-ui',
    prompt: `Дименсия: КОРРЕКТНОСТЬ КЛИЕНТА (client/src/components/ktp/TopicKnowledgeBank.tsx, api/ktp.api.ts, types/ktp.types.ts, pages/admin/KtpCatalogPage.tsx).
Проверь: React-корректность (state, отсутствие гонок при ленивой загрузке, повторные клики при isLoading), гейтинг role==='admin' (нет ли утечки admin-действий teacher'у, и совпадает ли с бэкенд-middleware — list/coverage teacher+admin, остальное admin), обработка ошибок (долгая генерация, 400 «нет источника»/«мало вопросов»), корректность путей API и форм ответов (data.data), типобезопасность BankItem vs реальный ответ listItems (lean-документ с _id/ObjectId — сериализация). Соответствие визуальных задизейбленных кнопок (TODO) и реального бэкенда.`,
  },
  {
    key: 'integration-contract',
    prompt: `Дименсия: ИНТЕГРАЦИЯ И КОНТРАКТЫ между слоями.
Проверь сквозные швы: фронтовый ktp.api путь vs реальные роуты ktp.routes (метод/путь/роль/тело/квери совпадают?), форма ответа success() (data) vs ожидания клиента (.data.data), node-bank size: клиент пока не шлёт size — это ок? Валидатор роута isIn([5,10,15,20]) vs normalizeTestSize (молчаливый фолбэк на 10) — нет ли расхождения. Эндпоинт listItems возвращает lean IQuestionItem — уходят ли наружу лишние/чувствительные поля. Проверь, что bankSmoke.ts и существующие потребители не сломаны изменением сигнатур (assembleNodeTest, contentHashOf, generateForCoverage).`,
  },
]

const reviewed = await pipeline(
  DIMENSIONS,
  (d) => agent(`${SHARED}\n\n${d.prompt}`, { label: `review:${d.key}`, phase: 'Review', schema: FIND_SCHEMA, agentType: 'Explore' }),
  (rev) =>
    parallel(
      (rev?.findings ?? []).map((f) => () =>
        agent(
          `${SHARED}\n\nАдверсариально ПРОВЕРЬ находку — попробуй её ОПРОВЕРГНУТЬ, прочитав реальный код. Если это не настоящий дефект (ложноположительное, или уже корректно обрабатывается), верни isReal=false. По умолчанию при сомнении — isReal=false.\n\nНаходка:\n${JSON.stringify(f, null, 2)}`,
          { label: `verify:${f.file.split('/').pop()}`, phase: 'Verify', schema: VERDICT_SCHEMA, agentType: 'Explore' }
        ).then((v) => ({ ...f, verdict: v }))
      )
    )
)

const confirmed = reviewed
  .flat()
  .filter(Boolean)
  .filter((f) => f.verdict?.isReal)
  .sort((a, b) => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 }
    return (rank[a.verdict.severity] ?? 9) - (rank[b.verdict.severity] ?? 9)
  })

log(`Подтверждено находок: ${confirmed.length}`)
return confirmed
