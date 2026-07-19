# Адаптация паттернов `di-sukharev/vibe`: план (не rewrite, а заимствование + консолидация)

> Статус: **план, реализация отложена**. Документ самодостаточен — его можно исполнять
> позже частями (человеком или агентом). Стек менять НЕ планируется.

## TL;DR

Переписывать бэкенд и фронт под шаблон `vibe` — **не нужно**. У нас ~54k строк работающего
strict-TypeScript продукта с богатой доменной моделью; полный rewrite (Mongo→Postgres, Express→Hono,
MUI/RTK→shadcn/TanStack) — это месяцы работы, высокий риск и **ноль пользовательской ценности**.
Стек у нас мейнстримный и актуальный — мы не отстали. `vibe` объективно сильнее **ровно в одном** для
нашего домена: **contracts-first** (общий слой Zod-схем). Его и забираем — на текущем стеке,
инкрементально, попутно объединяя репозитории и убирая дублирование.

## Контекст и цель

- **Бэкенд** — репозиторий `GenTestMVP`: `server/` (Express+Mongo) + `telegram-bot/` + `whatsapp-bot/`.
- **Фронтенд** — отдельный git-репозиторий `/Users/madiever/edu` (монорепо `edu-pwa`, yarn 4).
- Мотивация: (1) код, понятный агентам/Claude Code (**vibe-coding**); (2) скоро **мобильное приложение**;
  (3) честная **оценка стека**.
- Выбранная глубина: **паттерны + консолидация репозиториев** (без смены фреймворков и БД).

## Что такое `vibe` (факты из репозитория)

Greenfield-стартер для «vibe-coding», оптимизированный под разработку агентами:
- **Стек:** Bun · Hono · `@hono/zod-openapi` · Prisma 7 / PostgreSQL 18 (UUIDv7) · React 19 CSR
  (TanStack Query/Form/Router + shadcn/Tailwind v4) · Astro (website, SEO) · Expo (mobile-ветка).
- **Ядро идеи:** `packages/contracts` — Zod-схемы как единый источник правды для API-DTO и error-shape;
  бэкенд валидирует ими запросы, все фронты используют их же в API-клиентах и формах.
- **Модульный монолит:** один бэкенд, entrypoints `index/worker/cron`, общая Prisma/env/contracts.
- **Auth:** custom JWT (`jose`) + Argon2id (`Bun.password`) + ротация refresh-токенов.
- **Governance:** сильные `CLAUDE.md`/`AGENTS.md` (operating standard для агентов) + плотные `docs/`.

## Аудит текущего состояния (факты)

**Бэкенд `server/`** (~18k LOC, 96 файлов): Node 24 + TS (strict, npm), **Express 4** + Socket.IO,
**MongoDB/Mongoose** (16 моделей), routes→controllers→services→models, ~96 эндпоинтов. Валидация —
**express-validator**. Auth — JWT (cookie+bearer) + Passport Google OAuth + bcrypt. OpenAPI — **рукописный
Swagger на 2328 строк**. Проблемы: **0 тестов**; **нет валидации env** (хардкод
`JWT_SECRET='dev_jwt_secret_change_me'` в `src/server.ts`); типы только в `server/src/types`; крупные
файлы (`roadmap.service.ts` 1081, `test.controller.ts` 828).

**Боты**: `telegram-bot/` (Node+TS, **подключается напрямую к той же Mongo**, дублирует
`PendingRegistration`/`TelegramPhoneLink` и OTP-логику) и `whatsapp-bot/` (stateless HTTP-микросервис на
whatsapp-web.js, чисто через `POST /send`). **Дублирование — главный запах:** `normalizePhone`,
варианты телефона, текст OTP и модель `PendingRegistration` живут в **3–5 местах**, а две схемы
`PendingRegistration` уже расходятся по `required`-полям при **общей физической коллекции**. Деплой — PM2
(`ecosystem.config.js`), один хост, без Docker/CI. **Репо — не workspace:** три независимых package.json.

**Фронтенд `edu-pwa`** (~36k LOC, 634 файла): **yarn 4 workspaces** (`edu-app` PWA, `admin` CMS,
`shared` MUI-kit из 49 компонентов, `core` инфра), React 18 + Vite 5, TS strict, **Feature-Sliced Design**,
**RTK Query** (централизованный `baseApi/baseQuery`, Bearer+401+envelope `{data,success}`), **MUI 6**.
Проблемы: **0 тестов** (Vitest/RTL/MSW стоят, но не используются); формы на react-hook-form **без схем**
(`@hookform/resolvers` установлен, но **не подключён**); типы API **написаны руками** в
`entities/*/lib/types.ts` с пометками «placeholder — уточнить при готовности бэкенда» → **дрейф**.

## Вердикт: НЕ переписывать

`vibe` — golden-path стартер для нового проекта, а не цель миграции. Проблема не во фреймворках —
у нас чистый strict-TS и вполне слоёная архитектура на обеих сторонах. Ценность `vibe` — в **паттернах**,
которые закрывают ровно наши дыры: общий контракт-слой, тесты, валидация env, единый репозиторий,
operating-standard для агентов. Их и берём.

## Честная оценка стека (мы НЕ отстали)

| Слой | Наше | vibe | Вердикт |
|---|---|---|---|
| Runtime | Node 24 | Bun | Bun быстрее/приятнее, но Node 24 — прод-стандарт. **Не менять** (риск с Puppeteer/mongoose native-addons). |
| API-фреймворк | Express 4 | Hono + zod-openapi | Hono современнее, а его zod-openapi реально лучше рукописного Swagger на 2328 строк. Но не ради rewrite — **рассмотреть для НОВЫХ сервисов**. |
| БД | Mongo/Mongoose | Postgres/Prisma | **Единственное место, где vibe объективно лучше под наш домен:** roadmap-граф, prerequisites, KC-mastery, канонический КТП — по сути реляционные. Но переезд огромен → только «если когда-нибудь v2 данных». |
| Server-state (FE) | RTK Query | TanStack Query | Оба топовые; у нас уже чистый централизованный слой. **Менять смысла нет.** |
| Формы | RHF без схем | TanStack Form + Zod | Дыра не в библиотеке, а в отсутствии схем. Чинится подключением уже установленного `@hookform/resolvers` + Zod. |
| UI | MUI 6 + свой kit (49 комп.) | shadcn/Tailwind | Дело вкуса; наш UI-kit — актив, не долг. **Не менять.** |
| Контракты | ❌ типы дублируются/руками | ✅ `packages/contracts` (Zod SSOT) | **Здесь vibe прав — забираем.** |

## Мобильное приложение → контракты почти обязательны

Мобилка — **третий потребитель API**. Третья рукописная копия типов = гарантированный дрейф и баги.
Поэтому `packages/contracts` — это **предусловие** мобилки, а не отдельная задача. Expo/RN vs усиление
существующей PWA — **отдельное решение**; контракты нужны при любом варианте (мобилка переиспользует
`packages/contracts` и часть `core`, но НЕ MUI — RN нужен свой UI).

## Целевая архитектура (форма vibe, стек наш)

Один монорепо на базе **`edu` (уже yarn 4 workspace)**; бэкенд вносим через `git subtree` (с историей).
yarn 4 побеждает (бэкенд — тривиальные npm-пакеты; bun рискован для Puppeteer/mongoose). Runtime Node 24 +
PM2 остаются.

```
/
  packages/
    contracts/     # NEW — Zod SSOT: DTO, error-envelope, enums
    messaging/     # NEW — normalizePhone + OTP-текст + общие OTP-модели
    core/          # есть — FE-инфра (createStore/baseApi/baseQuery)
    shared/        # есть — MUI UI-kit (49 комп.)
  apps/
    server/  telegram-bot/  whatsapp-bot/   # subtree ← GenTestMVP
    edu-app/  admin/                        # из packages/* (переезд — no-op для импортов)
    mobile/                                 # NEW Expo (будущее, 3-й потребитель contracts)
```

## Роадмап (фазы: низкий риск/высокий ROI → выше). Каждая фаза отдельно поставляема и обратима.

### Phase 0 — Каркас безопасности (без слияния)
- **Zod `env.ts`** в `server/src/config/env.ts` (и мини-версии в оба бота): один парс на старте, fail-fast,
  **убрать хардкод dev JWT-secret** из `server/src/server.ts`. Требования: `MONGODB_URI` и `JWT_SECRET`
  (≥16 символов) — обязательны; в production запрещены заведомо слабые значения. Модуль **не мутирует**
  `process.env` (существующие чтения `process.env.X` не ломаются) — меняется только поведение при пустых
  обязательных переменных: сервер явно останавливается вместо старта с небезопасным дефолтом.
- **Первый тест на каждой стороне** (сегодня тестов нет):
  - бэк — supertest-интеграция `POST /auth/verify-phone` c `mongodb-memory-server` (security-критичный путь,
    выдаёт JWT + ставит cookie);
  - фронт — MSW-тест OTP-формы + `authApi` (Vitest/RTL/MSW уже установлены).
- **CI** (`.github/workflows`, сейчас нет нигде): typecheck + новые тесты + build, path-filtered.
- **Operating-standard для агентов:** внести адаптированные `CLAUDE.md`/`AGENTS.md` из `vibe` в оба репо —
  прямо усиливает vibe-coding-мотивацию, риск нулевой.

### Phase 1 — `packages/contracts` + первый вертикальный срез
- Пакет с одной зависимостью `zod`. **IN:** per-endpoint request/response Zod-схемы; единый envelope
  (свести дублирующиеся `ISuccessResponse` из `server/src/types/index.ts` и `ApiResponse<T>` из
  `core/src/api/types.ts`); общие enum'ы (`UserRole`, `Difficulty`, `SubjectKind`, roadmap-статусы).
  **OUT:** Mongoose-модели, секреты/env.
- **Срез — auth OTP** (`POST /auth/request-otp` + `POST /auth/verify-phone`): главный реальный путь входа,
  задевает enum и «грязную» user-форму, пре-стейджит де-дуп ботов. Доказать петлю в одном PR.
  Альтернатива-«разминка»: `/auth/login` (`{userName,password}` → `{token,user}`, синхронно).
- **Инкрементальное внедрение (без big-bang на 96 эндпоинтов):**
  - Бэк: добавить `validateBody(schema)` **рядом** с существующим `validate`
    (`server/src/middlewares/validation.middleware.ts`), отдающий тот же payload
    `{success:false, message:'Validation failed', errors:[{field,message}]}`; конвертировать роут за роутом;
    `express-validator` живёт, пока не мигрирует последний `body(...)`. Ответы: обернуть `success()`-хелпер
    в `responseSchema.parse` (throw в тестах, warn в prod) — детект дрейфа без изменения выдачи.
  - Фронт: `entities/*/lib/types.ts` → тонкие ре-экспорты `z.infer` из `@edu-pwa/contracts` (RTK-слайсы
    **не трогаем** — они импортят из барреля). `unwrapApiResponse` → schema-aware `unwrap(schema)` как
    `transformResponse`. Подключить наконец `zodResolver` в `packages/shared/src/hooks/useFormExtended`.

### Phase 2 — Слияние репозиториев
Гейт: после Phase 0–1 (ценность доказана). `git subtree add --prefix=apps/server <GenTestMVP-remote> master`
(и оба бота); расширить `workspaces` glob на `apps/*`; один `yarn.lock` (удалить три `package-lock.json`).
**НОВЫЙ риск — деплой:** `cwd` в `ecosystem.config.js` `./server`→`apps/server`, сборка → `yarn workspace
<name> build`; staging-прогон PM2. Откат: старые remotes живы, деплой возвращается на них.

### Phase 3 — Де-дуп ботов (`packages/messaging`)
Подтверждено: сервер — **единственный писатель** `pending_registrations`; telegram-bot только **читает** её
и **пишет** `TelegramPhoneLink`. **Step A** (чистый рефактор, без изменения wire): вынести
`normalizePhone`/`phoneVariants`/`OTP_TEXT` и обе модели в `packages/messaging`, канон — **пермиссивная
схема сервера**; **не трогать имена коллекций/индексов** (`pending_registrations`, `telegram_phone_links`).
**Step B** (позже, за флагом): telegram-bot за server-API (`/internal/telegram/*`), убрать mongoose из бота —
станет stateless как whatsapp-bot; direct-Mongo путь оставить как one-deploy fallback.

### Phase 4 — Масштабировать контракты
По сущности (`roadmap`, `subject`, `test`, `profileSubjectPair`, `user`): заменить баррель типов, мигрировать
`body(...)` этого роута; удалить `express-validator` только после последнего. Низкий риск, обратимо по сущности.
Попутно фиксировать per-endpoint несогласованность выдачи (`login`/`verify-phone` дают `{id,…}`, а `GET
/auth/me` — сырой Mongoose-документ с `_id`/`__v`/populate) — **документировать, не «чинить» молча** (это
breaking для PWA).

## Что НЕ делаем
- Не мигрируем Mongo→Postgres/Prisma и Express→Hono.
- Не переписываем фронт на shadcn/TanStack; не меняем RTK Query на TanStack.
- Не переходим на bun-runtime (риск Puppeteer/mongoose).
- Не переименовываем живые коллекции/индексы при консолидации моделей.

## Verification (как проверять по мере внедрения)
- **Контракты:** одно изменение Zod-схемы ломает типы у producer (роут) и consumer (RTK/форма) в одном
  проходе — `cd server && npx tsc --noEmit` + `cd packages/admin && npx tsc --noEmit` (админку root `tsc -b`
  не покрывает).
- **Env:** старт без обязательных переменных → мгновенный явный фейл, а не тихий дефолт.
- **Тесты:** `yarn test` (vitest) на фронте; supertest + `mongodb-memory-server` на бэке; всё в CI.
- **Слияние:** staging PM2-прогон трёх процессов из `apps/*` до прод-деплоя.
- **Живые данные:** после Step A де-дупа — OTP по WhatsApp/Telegram всё ещё проходит end-to-end.

## Риски (watch-list)
- **Живые общие Mongo-коллекции** (`pending_registrations`, `telegram_phone_links`): не переименовывать
  коллекции/индексы при консолидации моделей.
- **Кросс-доменные auth-cookie:** PWA шлёт `credentials:"include"`; сервер ставит cookie за origin-allowlist
  (`FRONTEND_URL`/`OAUTH_ALLOWED_ORIGINS`). Слияние origin'ы не меняет — но при любой «унификации» FE+BE в
  один origin сперва проверить `SameSite`/`secure` и CORS.
- **Внешний base URL фронта** (`VITE_API_BASE_URL`): остаётся env-driven; слияние не должно связывать
  build-time FE с BE.
- **Два деплой-пайплайна из одного репо** (`render.yaml` фронта + PM2 бэка): нужен path-filtered CI, чтобы
  FE-only правка не передеплоивала API.

## Открытые вопросы (обсудить перед реализацией)
- **Expo vs усиление PWA** для мобилки (контракты нужны при любом варианте).
- **Один git-репо или два репо + общий пакет контрактов.** Рекомендация — один репо: атомарные кросс-слойные
  коммиты и полная видимость для агентов. Альтернатива (два репо + публикуемый `@edu/contracts`) дешевле по
  дисрапту, но каждый контракт-чейндж превращается в publish-and-bump по 3–4 потребителям.
