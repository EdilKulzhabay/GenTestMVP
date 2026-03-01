# Архитектура GenTest MVP

## Общая схема

```
┌─────────────┐     HTTP/JSON      ┌──────────────┐     Mongoose     ┌──────────┐
│  React SPA  │ ◄───────────────► │  Express API  │ ◄─────────────► │  MongoDB │
│  (Vite)     │    cookie auth     │  /api/v1/*    │                 │          │
└─────────────┘                    └──────┬───────┘                 └──────────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │  OpenAI API   │
                                   │  (или mock)   │
                                   └──────────────┘
```

## Модель данных

### Subject (вложенная иерархия)
```
Subject
 ├── title, description
 └── books[]
      ├── title, author
      └── chapters[]
           ├── title, order
           └── topics[]
                ├── title
                └── paragraphs[]
                     ├── order
                     └── content { text, pages[], metadata { keywords[], difficulty, source } }
```

Оптимизация: используются вложенные документы (embedded) вместо ссылок, так как контент всегда читается целиком для генерации тестов. Индексы на `books._id`, `books.chapters._id`, `books.chapters.topics._id`.

### User
```
User
 ├── fullName, userName, email (unique, sparse), password (bcrypt), role (admin|user)
 └── testHistory[] (embedded)
      ├── subjectId (ref → Subject), bookId, chapterId
      ├── answers[] { question, selectedOption, isCorrect }
      ├── result { totalQuestions, correctAnswers, scorePercent }
      ├── aiFeedback { summary, mistakes[] { question, explanation, whereToRead } }
      └── generatedQuestionsHash[] (base64, для предотвращения повторов)
```

### Test (сгенерированный тест — кэш)
```
Test
 ├── subjectId, bookId, chapterId
 ├── sourceContentHash (SHA-256, для кэширования)
 └── questions[]
      ├── questionText, options[4], correctOption
      ├── aiExplanation
      └── relatedContent { chapterId, topicId, pages[] }
```

### PendingRegistration (временная, TTL 15 мин)
```
PendingRegistration
 ├── email, fullName, userName, password (bcrypt)
 ├── verificationCode (6 цифр)
 └── verificationCodeExpires (Date, TTL index)
```

## API эндпоинты

### Auth (`/auth`)

| Метод | Путь | Доступ | Описание |
|-------|------|--------|----------|
| POST | `/register` | Public | Шаг 1: отправить код верификации на email |
| POST | `/verify-email` | Public | Шаг 2: подтвердить код → создать аккаунт → JWT cookie |
| POST | `/create-admin` | Public | Создать админа (без email-верификации) |
| POST | `/login` | Public | Войти (JWT в cookie) |
| GET | `/me` | Auth | Текущий пользователь по cookie |

### Subjects (`/subjects`)

| Метод | Путь | Доступ | Описание |
|-------|------|--------|----------|
| GET | `/` | Public | Список всех предметов (с books для подсчёта) |
| GET | `/:id` | Public | Предмет с полным деревом до параграфов |
| POST | `/` | Admin | Создать пустой предмет |
| POST | `/import` | Admin | **Импорт предмета целиком** (books → chapters → topics → paragraphs) |
| POST | `/:id/books` | Admin | Добавить книгу к предмету |
| POST | `/books/:bookId/chapters` | Admin | Добавить главу (query: subjectId) |
| POST | `/chapters/:chapterId/topics` | Admin | Добавить тему (query: subjectId, bookId) |
| POST | `/topics/:topicId/paragraphs` | Admin | Добавить параграф (query: subjectId, bookId, chapterId) |

### Tests (`/tests`)

| Метод | Путь | Доступ | Описание |
|-------|------|--------|----------|
| POST | `/generate` | Auth | Сгенерировать тест (с учётом ранее виденных вопросов) |
| POST | `/submit` | Auth | Отправить ответы → AI-анализ → сохранение в testHistory |
| POST | `/generate-guest` | Public | Сгенерировать тест (без привязки к юзеру) |
| POST | `/submit-guest` | Public | Отправить ответы (без сохранения в историю) |
| POST | `/claim-guest` | Auth | **Привязать гостевой тест** к авторизованному пользователю |
| GET | `/:id` | Auth | Получить тест по ID (без correctOption) |

### Users (`/users`)

| Метод | Путь | Доступ | Описание |
|-------|------|--------|----------|
| GET | `/me` | Auth | Профиль пользователя |
| GET | `/me/tests` | Auth | История тестов (query: subjectId, limit, sortBy, order) |
| GET | `/me/stats` | Auth | Статистика: среднее, лучший, худший |
| GET | `/me/tests/:id` | Auth | Детали конкретного теста из истории |

### System

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Health check |
| GET | `/api-docs` | Swagger UI |

## Потоки

### Импорт предмета (admin)

1. Админ загружает JSON-файл через кнопку «Импорт JSON» на дашборде (или через API)
2. `POST /subjects/import` с телом `{ title, description?, books[] }` — полная вложенная структура
3. Сервер валидирует title, проверяет дубликат → `Subject.create(...)` с полным деревом
4. Возвращает созданный предмет + статистику (количество книг/глав/тем/параграфов)

### Генерация теста

1. Клиент выбирает предмет → книгу → главу (или «вся книга»)
2. `POST /tests/generate` с `{ subjectId, bookId, chapterId?, fullBook? }`
3. Сервер собирает текст контента из Subject (методы `getBookContent` / `getChapterContent`)
4. Проверяет кэш (по `sourceContentHash`)
5. Если нет кэша → AI-сервис генерирует вопросы с опциями, объяснениями и ссылками
6. Сохраняет Test (кэш), возвращает вопросы **без correctOption и aiExplanation**

### Отправка ответов

1. Клиент отправляет `POST /tests/submit` с `{ testId, answers[] }`
2. Сервер проверяет ответы по `Test.questions[].correctOption`
3. AI-сервис анализирует ошибки → summary + рекомендации (книга, глава, страницы)
4. Результат сохраняется в `User.testHistory` (для auth-пользователей)
5. Возвращается полный разбор: баллы, aiFeedback, detailedAnswers по каждому вопросу

### Привязка гостевого теста (claim)

1. Гость проходит тест → `submitTestGuest` возвращает результат
2. Клиент сохраняет `{ testId, answers[] }` в `sessionStorage`
3. Гость нажимает «Войти» / «Зарегистрироваться» → проходит авторизацию
4. После успешного `login()` или `verifyEmail()` клиент автоматически вызывает `POST /tests/claim-guest`
5. Сервер проверяет ответы, строит AI-feedback, сохраняет в `User.testHistory`
6. Дубликаты предотвращаются проверкой `generatedQuestionsHash`
7. `sessionStorage` очищается

### Регистрация (двухэтапная)

1. `POST /register` → валидация → сохранение в `PendingRegistration` + отправка 6-значного кода на email
2. `POST /verify-email` → проверка кода → создание User → JWT в httpOnly cookie
3. При отсутствии SMTP — код выводится в консоль сервера (fallback для разработки)
4. После верификации автоматический вход (cookie устанавливается)

### Создание администратора

1. `POST /auth/create-admin` с `{ fullName, userName, password }` — без email-верификации
2. Создаёт пользователя с `role: admin` → JWT в cookie
3. Рекомендуется использовать только при первоначальной настройке

### Гостевой режим

1. Гость проходит тест через `/guest/*` маршруты (публичные API)
2. Видит тизер результата: счёт + обрезанный summary
3. При входе/регистрации → `returnUrl` возвращает к полному результату
4. Гостевой тест автоматически привязывается к аккаунту (claim-guest)
5. Данные теста хранятся в `sessionStorage` (переживают refresh страницы)

## Клиентская архитектура

### Состояние
- **Auth**: Context API + `useSyncExternalStore` (внешний store для cross-component access)
- **Тест**: `sessionStorage` — currentTest, currentAnswers, lastResult, guestTestSubmission
- **Формы**: react-hook-form + zod

### Маршрутизация
- React Router v6, `createBrowserRouter`
- `PrivateRoute` — проверка auth + роли → `/welcome` если нет доступа
- `useGuestMode()` — определяет guest/user по pathname, возвращает `basePath`

### Страницы

| Путь | Компонент | Описание |
|------|-----------|----------|
| `/welcome` | `WelcomePage` | Единая точка входа: вход, регистрация, гость |
| `/login` | `LoginPage` | Авторизация |
| `/register` | `RegisterPage` | Двухэтапная регистрация |
| `/admin` | `AdminDashboard` | Статистика, список предметов, **импорт JSON** |
| `/admin/subjects/import` | `SubjectImportPage` | Полная форма импорта с предпросмотром |
| `/admin/subjects/new` | `SubjectCreatePage` | Создать пустой предмет |
| `/admin/books/new` | `BookCreatePage` | Добавить книгу |
| `/admin/chapters/new` | `ChapterCreatePage` | Добавить главу |
| `/admin/contents/new` | `ContentCreatePage` | Добавить тему/параграф |
| `/user` | `UserDashboard` | Дашборд с историей тестов |
| `/user/subjects` | `SubjectSelectPage` | Выбор предмета |
| `/user/books` | `BookSelectPage` | Выбор книги/главы |
| `/user/test/start` | `TestStartPage` | Генерация теста (loading UX) |
| `/user/test` | `TestPage` | Прохождение теста |
| `/user/test/result` | `TestResultPage` | Полный результат |
| `/guest/*` | Те же компоненты | Гостевые версии (guest API) |

### Layouts
- `AdminLayout` — боковая навигация с иконками, статистика
- `UserLayout` — упрощённый layout для студентов
- `GuestLayout` — минимальный layout с amber-баннером
- `AuthLayout` — pill-переключатель login/register

### Защита от потери данных
- Ответы автосохраняются в `sessionStorage` при каждом изменении
- `beforeunload` предупреждение при попытке закрыть вкладку
- Данные восстанавливаются при refresh

### UX генерации теста
- Компонент `TestGenerationLoading` c 4 состояниями:
  - `queue` → `preparing` → `ready` → автоматическое перенаправление
  - `error` → кнопки «Повторить» / «Назад»

### Обработка ошибок (клиент)
- `ErrorBoundary` — React error boundary для runtime-ошибок
- `ErrorMessage` — компонент для отображения ошибок в формах
- `FeatureUnavailable` — паттерн «функция недоступна» с пояснением
- Axios interceptor: 401 → редирект на `/welcome` с `returnUrl`

## Серверная архитектура

### Middleware pipeline
```
cors → json → cookieParser → [swagger] → routes → notFound → errorHandler
```

### Обработка ошибок
- `AppError` — типизированные бизнес-ошибки (badRequest/unauthorized/notFound/internal)
- `asyncHandler` — обёртка для контроллеров, автоматический проброс в errorHandler
- `errorHandler` — обработка AppError, Mongoose ValidationError/CastError/11000, JWT errors
- Единый формат: `{ success: boolean, message, data?, errors? }`

### Безопасность
- JWT в httpOnly cookie (7 дней, SameSite)
- bcrypt для паролей (salt rounds: 10)
- express-validator на всех входных данных
- CORS с whitelist (`CORS_ORIGIN`)
- `isAdmin` middleware для admin-only эндпоинтов

### AI-сервис
- `ai.service.ts` — абстракция над OpenAI API
- При отсутствии `OPENAI_API_KEY` — mock-генерация (4 вопроса с заглушками)
- Генерация: текст контента → промпт → 4 вопроса с опциями, объяснениями, ссылками
- Анализ: ответы + правильные → summary, детальный разбор ошибок, рекомендации

### Email-сервис
- `email.service.ts` — Nodemailer с fallback в консоль
- SMTP конфигурация через `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, etc.)
- При ошибке / отсутствии конфига — код выводится в `console.log` (для dev)
