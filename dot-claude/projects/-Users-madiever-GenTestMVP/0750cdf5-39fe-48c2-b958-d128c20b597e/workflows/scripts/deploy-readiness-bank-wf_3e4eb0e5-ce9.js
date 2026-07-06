export const meta = {
  name: 'deploy-readiness-bank',
  description: 'Map app topology, student-frontend impact, deploy config, and Test.model risk to advise on deploy + frontend changes',
  phases: [{ title: 'Investigate' }],
}

const SHARED = `
КОНТЕКСТ. Монорепо /Users/madiever/GenTestMVP (server/ Node+TS+Express+Mongoose+OpenAI; client/ React+Vite). Также есть ОТДЕЛЬНЫЙ каталог /Users/madiever/edu-pwa (вне репо) — вероятно student-PWA.
На ветке feat/knowledge-bank только что реализованы и запушены изменения (3 коммита поверх 6431bf3):
 Part A (админ-UI банка, аддитивно): новый бэкенд GET /api/v1/ktp/:subjectId/topics/:topicId/bank/items (admin); клиентские ktpApi методы KC/банка + типы; новый компонент client/src/components/ktp/TopicKnowledgeBank.tsx врезан per-topic в client/src/pages/admin/KtpCatalogPage.tsx; мутации гейтятся role==='admin'.
 Part B (размер теста + качество): Test.model валидатор questions.length сменён с ===10 на диапазон 1..120 (это ЕДИНАЯ точка валидации сохранения ВСЕХ тестов: regular/ent/bank/trial/solo); assembleNodeTest принимает size (5/10/15/20); /tests/node-bank принимает size; /tests/generate(+guest) получили профиле-зависимую валидацию questionCount (ent: 10..120 кратно10; regular: 1..50); ai.service qc-ошибки переведены на AppError.badRequest (400); генерация банка переписана (раунды+разброс difficulty); дедуп contentHash теперь по тексту+вариантам+ответу (+переходный legacy-дедуп).
ВОПРОС ВЛАДЕЛЬЦА: что делать дальше, нужно ли менять фронт, можно ли деплоить фронт и бэк сейчас.
ТЫ — read-only исследователь (Explore). НИЧЕГО не меняй. Используй git/grep/чтение в ОБОИХ путях (/Users/madiever/GenTestMVP и /Users/madiever/edu-pwa). Возвращай факты с путями, оценку влияния на деплой, нужны ли изменения фронта, риски, рекомендацию.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string' },
    facts: { type: 'array', items: { type: 'string' }, description: 'Факты с путями/командами/находками' },
    frontendChangesNeeded: {
      type: 'array',
      items: { type: 'string' },
      description: 'Конкретные изменения фронта, БЕЗ которых деплой даст регресс или фича не работает (или «нет»)',
    },
    deployImpact: { type: 'array', items: { type: 'string' }, description: 'Что безопасно/опасно деплоить и в каком порядке' },
    risks: { type: 'array', items: { type: 'string' } },
    recommendation: { type: 'string' },
  },
  required: ['area', 'facts', 'frontendChangesNeeded', 'deployImpact', 'risks', 'recommendation'],
}

const DIMS = [
  {
    key: 'topology',
    prompt: `Дименсия: ТОПОЛОГИЯ ПРИЛОЖЕНИЙ И ДЕПЛОЙ-СВЯЗИ.
Определи точно: что такое client/ внутри GenTestMVP — это админка, student-приложение или и то и другое (проверь client/src/pages/admin vs client/src/pages/user, роутер, кто это видит)? Что такое /Users/madiever/edu-pwa — существует ли, git-репо ли это, какой baseURL/VITE_API_URL у него (читает .env/vite.config), бьёт ли он в тот же backend /api/v1, и это ли реальное приложение учеников? Кто из фронтов какой аудитории служит. Сделай вывод: какие фронты вообще существуют и какой нужно деплоить ради админ-UI банка, а какой обслуживает учеников.`,
  },
  {
    key: 'student-impact',
    prompt: `Дименсия: РЕГРЕСС ДЛЯ УЧЕНИКОВ ОТ НОВЫХ ВАЛИДАТОРОВ И ПЕРЕМЕННОГО РАЗМЕРА.
Найди, что именно student-фронт(ы) шлют в POST /tests/generate, /tests/generate-guest, /tests/node-bank: какие testProfile и questionCount (диапазоны, кратность). Ищи в client/src/pages/user/* И в /Users/madiever/edu-pwa. Ключевой вопрос: есть ли сейчас отправляемые комбинации, которые НОВЫЙ профиле-зависимый валидатор (ent: 10..120 кратно10; regular: 1..50) отвергнет с 400, хотя раньше проходили (регресс)? Также: хардкодит ли student-фронт «10 вопросов» где-либо (прогресс-бар, длина, разметка), что сломается при переменном размере? Вызывает ли student-фронт уже /tests/node-bank (cutover) или нет.`,
  },
  {
    key: 'deploy-config',
    prompt: `Дименсия: КАК ЭТО ДЕПЛОИТСЯ.
Найди механизм деплоя/запуска: package.json scripts (build/start) в server/ и client/, наличие pm2/ecosystem.config, Dockerfile/docker-compose, systemd, nginx-конфиги, CI (.github/workflows), README/деплой-доки, как раздаётся собранный client (отдаёт ли server статику или отдельный хостинг). Нужен ли отдельный билд каждого фронта. Есть ли в проекте миграции/сиды (server/src/scripts) и нужен ли какой-то ручной шаг при этом релизе (например бэкфилл contentHash — оцени, нужен ли). Безопасны ли новые бэкенд-эндпоинты «вхолостую» (dark) до использования. Предложи безопасный порядок деплоя.`,
  },
  {
    key: 'testmodel-risk',
    prompt: `Дименсия: АДВЕРСАРИАЛЬНЫЙ РИСК СМЕНЫ Test.model ВАЛИДАТОРА (===10 → 1..120) В ПРОДЕ.
Пройди ВСЕ пути сохранения Test в работающей системе и оцени, что изменится: regular, ent (1-в-1 и батч 20/40), bank (assembleNodeTest), trial (trial.service блоки 20/10/10/40), solo, kahoot/socket, guest, claim. Что раньше падало на ===10 и теперь сохранится (например батч-ENT/пробник) — это желаемое или скрытый ранее-мёртвый путь, который теперь активируется и может повести себя неожиданно в проде? Полагается ли где-то аналитика/скоринг/предгенерация/кэш sourceContentHash на ровно 10? Дай вердикт: безопасно ли катить эту правку в прод и что проверить до этого.`,
  },
]

phase('Investigate')
const results = await parallel(
  DIMS.map((d) => () => agent(`${SHARED}\n\n${d.prompt}`, { label: d.key, phase: 'Investigate', schema: SCHEMA, agentType: 'Explore' }))
)
return results.filter(Boolean)
