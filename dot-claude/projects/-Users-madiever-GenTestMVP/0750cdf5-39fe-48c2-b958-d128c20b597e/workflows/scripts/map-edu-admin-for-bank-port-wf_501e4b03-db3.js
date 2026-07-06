export const meta = {
  name: 'map-edu-admin-for-bank-port',
  description: 'Map edu-pwa/packages/admin (RTK Query, FSD) to port the KC + question-bank admin UI matching its conventions',
  phases: [{ title: 'Map' }],
}

const ROOT = '/Users/madiever/edu-pwa/packages/admin'
const SHARED = `
ЗАДАЧА: портировать админ-UI «банка вопросов» в боевую админку ${ROOT} (часть монорепо edu-pwa, стек React+RTK Query+FSD, деплой на Render). Бэкенд УЖЕ готов (тот же kakoi-to-do-men.ru/api/v1).
В legacy-админке GenTestMVP/client это уже реализовано как референс (компонент TopicKnowledgeBank.tsx + методы ktpApi), но в edu-pwa другой стек — нельзя копировать дословно, надо адаптировать под их паттерны.
Бэкенд-эндпоинты, под которые делаем UI (все под /api/v1, авторизация cookie):
  KC:   GET  /ktp/:subjectId/topics/:topicId/components            (teacher+admin)
        POST /ktp/:subjectId/topics/:topicId/components/propose    (admin) — AI-предложение
        POST /ktp/:subjectId/topics/:topicId/components            (admin) — upsert {id?,title,description?,order?,status?}
        POST /ktp/:subjectId/topics/:topicId/components/confirm    (admin) {kcIds:[]}
        POST /ktp/:subjectId/topics/:topicId/components/reorder    (admin) {orderedKcIds:[]}
        DELETE /ktp/:subjectId/topics/:topicId/components/:kcId     (admin)
  BANK: GET  /ktp/:subjectId/topics/:topicId/bank/coverage          (teacher+admin) -> {totalActive, perKc:[{kcId,title,active}], unassigned}
        POST /ktp/:subjectId/topics/:topicId/bank/generate          (admin) {minPerKc?,difficulty?} -> {created,rejected,coverage}
        GET  /ktp/:subjectId/topics/:topicId/bank/items             (admin) -> QuestionItem[] (с правильными ответами)
KC-форма: {_id,title,description?,order,status:'proposed'|'confirmed'}. Все ответы сервера обёрнуты в {success,message?,data}.
ТЫ — read-only исследователь (Explore). НИЧЕГО не меняй. Читай файлы в ${ROOT}. Возвращай ТОЧНЫЕ пути, паттерны кода (с короткими выдержками), и как корректно встроить новую фичу под их конвенции.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string' },
    keyFiles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { path: { type: 'string' }, role: { type: 'string' } },
        required: ['path', 'role'],
      },
    },
    patterns: { type: 'array', items: { type: 'string' }, description: 'Конкретные паттерны с выдержками кода' },
    howToImplement: { type: 'array', items: { type: 'string' }, description: 'Пошагово как встроить фичу под их конвенции' },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'keyFiles', 'patterns', 'howToImplement', 'risks'],
}

const DIMS = [
  {
    key: 'rtk-api-auth',
    prompt: `Дименсия: RTK QUERY API-СЛОЙ + АУТЕНТИФИКАЦИЯ.
Изучи, как в ${ROOT} устроен RTK Query: где базовый api/baseQuery (baseUrl, prepareHeaders, credentials/cookie), как объявляются endpoints (injectEndpoints? createApi?), tagTypes/providesTags/invalidatesTags, как генерятся хуки (useXxxQuery/useXxxMutation). Найди существующий ktpApi (entities/ktp/model/ktpApi.ts) и покажи ТОЧНЫЙ паттерн его endpoints (query/mutation, как формируются url/body, как достаётся .data из {success,data}). Дай готовый план: как добавить endpoints KC (list/propose/upsert/confirm/reorder/delete) и банка (coverage/generate/items) в этот же api, с правильными tag-инвалидациями (например list KC инвалидируется после propose/confirm/delete).`,
  },
  {
    key: 'ktp-page-ui',
    prompt: `Дименсия: ЭКРАН KTP + UI-КОНВЕНЦИИ.
Изучи ${ROOT}/src/pages/ktpCatalog/KtpCatalogPage.tsx и связанные компоненты: как рендерится список тем КТП (per-topic разметка), какие UI-примитивы используются (библиотека компонентов? MUI/AntD/свои? стилизация — Tailwind/CSS-modules/styled?), есть ли кнопки/инпуты/модалки/лоадеры/подтверждение-удаления для переиспользования. Найди ИДЕАЛЬНУЮ точку вставки per-topic блока «Подтемы (KC) и банк» и как оформить разворачиваемую секцию в их стиле. Покажи выдержки разметки темы.`,
  },
  {
    key: 'fsd-role-structure',
    prompt: `Дименсия: FSD-СТРУКТУРА, РОЛИ, РАЗМЕЩЕНИЕ НОВОГО КОДА.
Изучи структуру ${ROOT}/src (FSD-слои: app/pages/widgets/features/entities/shared). Где по их конвенции должна жить новая фича «банк/KC» — entities/knowledgeBank? feature? widget? Как они читают роль пользователя (admin vs teacher) и гейтят admin-only действия (useSelector/хук/guard)? Как именованы файлы, model/ui/index, public API (index.ts реэкспорты). Покажи 1-2 примера существующей фичи/entity с мутациями как образец структуры. Дай рекомендацию по точному размещению новых файлов (api endpoints, типы, ui-компонент TopicKnowledgeBank-аналог) и их публичным экспортам.`,
  },
]

phase('Map')
const results = await parallel(
  DIMS.map((d) => () => agent(`${SHARED}\n\n${d.prompt}`, { label: d.key, phase: 'Map', schema: SCHEMA, agentType: 'Explore' }))
)
return results.filter(Boolean)
