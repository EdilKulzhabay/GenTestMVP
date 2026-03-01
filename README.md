# GenTest MVP

Платформа для AI-генерации тестов по учебникам с автоматическим разбором ошибок и рекомендациями.

## Что это

Преподаватель загружает учебный контент (предметы, книги, главы, темы, параграфы) через админ-панель — вручную или импортом JSON-файла. Студент выбирает предмет/книгу/главу и запускает генерацию теста. AI формирует вопросы по материалу, проверяет ответы, даёт развёрнутый анализ ошибок и ссылки на конкретные места в учебнике.

## Быстрый старт

```bash
# 1. Клонировать
git clone <repo-url> && cd GenTestMVP

# 2. Установить зависимости
cd server && npm install
cd ../client && npm install

# 3. Настроить окружение
cp server/.env.example server/.env   # отредактировать

# 4. Создать администратора
curl -X POST http://localhost:5000/api/v1/auth/create-admin \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Admin","userName":"admin","password":"admin123"}'

# 5. Запустить (два терминала)
cd server && npm run dev       # API — http://localhost:5000
cd client && npm run dev       # SPA — http://localhost:5173
```

## Импорт учебного контента

В корне проекта есть пример файла `subject.json`. Админ может импортировать предмет целиком (книги, главы, темы, параграфы) двумя способами:

**Через админ-панель:**
1. Войти как admin → Дашборд
2. Нажать кнопку «Импорт JSON» → выбрать файл
3. Проверить предпросмотр → «Импортировать предмет»

**Через API:**
```bash
curl -X POST http://localhost:5000/api/v1/subjects/import \
  -H "Content-Type: application/json" \
  -b "token=<jwt-cookie>" \
  -d @subject.json
```

## Переменные окружения

### server/.env

| Переменная | Обязательна | По умолчанию | Описание |
|------------|:-----------:|--------------|----------|
| `MONGODB_URI` | да | `mongodb://localhost:27017/edu-ai-test-platform` | Строка подключения к MongoDB |
| `JWT_SECRET` | да | dev-значение | Секрет для JWT |
| `PORT` | нет | `5000` | Порт API |
| `NODE_ENV` | нет | `development` | Окружение |
| `CORS_ORIGIN` | нет | `http://localhost:5173` | Разрешённые origins (через запятую) |
| `OPENAI_API_KEY` | нет | — | Ключ OpenAI (без него — mock-тесты) |
| `SMTP_HOST` | нет | — | SMTP хост для верификации email |
| `SMTP_PORT` | нет | `587` | SMTP порт |
| `SMTP_SECURE` | нет | `false` | `true` для порта 465 (SSL), `false` для STARTTLS |
| `SMTP_USER` | нет | — | SMTP логин |
| `SMTP_PASS` | нет | — | SMTP пароль |
| `SMTP_FROM` | нет | — | Адрес отправителя |

### client/.env

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `VITE_API_URL` | `http://localhost:5000/api/v1` | URL бэкенда |

## Стек технологий

| Слой | Технологии |
|------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, React Router 6, React Hook Form + Zod |
| **Backend** | Node.js, Express, TypeScript, Mongoose (MongoDB) |
| **Auth** | JWT в httpOnly cookie, двухэтапная регистрация с email-верификацией |
| **AI** | OpenAI API (mock при отсутствии ключа) |
| **Docs** | Swagger UI (`/api-docs`) |

## Структура проекта

```
GenTestMVP/
├── subject.json                # Пример данных для импорта
├── client/src/
│   ├── api/                    # Axios-клиенты к API
│   ├── components/             # UI-компоненты, layouts, ErrorBoundary
│   ├── hooks/                  # Custom hooks (useGuestMode)
│   ├── pages/                  # Страницы: admin, auth, guest, user, welcome
│   │   └── admin/              # Дашборд, CRUD предметов, импорт JSON
│   ├── router/                 # React Router + PrivateRoute
│   ├── store/                  # Auth store (Context + useSyncExternalStore)
│   ├── types/                  # TypeScript-типы
│   └── utils/                  # Session storage, error helpers
│
├── server/src/
│   ├── config/                 # DB, constants, Swagger
│   ├── controllers/            # Auth, Subject, Test, User
│   ├── middlewares/             # Auth, validation, error handler
│   ├── models/                 # Subject, User, Test, PendingRegistration
│   ├── routes/                 # Express-маршруты
│   ├── scripts/                # createAdmin.ts
│   ├── services/               # AI-сервис, email-сервис
│   ├── types/                  # Серверные типы и DTO
│   └── utils/                  # JWT, AppError, API response helpers
│
└── docs/
    └── ARCHITECTURE.md         # Подробная архитектура
```

## API документация

- **Swagger UI:** http://localhost:5000/api-docs (при запущенном сервере)
- **Подробнее:** см. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Роли и потоки

### Гость
`/welcome` → `/guest/subjects` → выбор книги → генерация теста → прохождение → тизер результата → вход/регистрация → **гостевой тест автоматически сохраняется в историю** → полный результат

### Студент (user)
Вход → `/user` (дашборд + история) → выбор предмета → книга/глава → генерация → тест → полный результат с AI-разбором

### Администратор (admin)
Вход → `/admin` → импорт предмета из JSON / ручное создание → добавление книг, глав, тем, параграфов

## Первоначальная настройка для клиента

1. Запустить сервер (`npm run dev` в `server/`)
2. Создать администратора через `POST /auth/create-admin`
3. Войти как admin в браузере
4. Импортировать `subject.json` через кнопку «Импорт JSON» на дашборде
5. Студенты могут начинать тесты

## Скрипты

### Server
| Команда | Описание |
|---------|----------|
| `npm run dev` | Запуск в dev-режиме (nodemon + ts-node) |
| `npm run build` | Компиляция TypeScript |
| `npm start` | Запуск из dist/ |

### Client
| Команда | Описание |
|---------|----------|
| `npm run dev` | Dev-сервер Vite |
| `npm run build` | Сборка для production |
| `npm run preview` | Предпросмотр production-сборки |

## Лицензия

ISC
