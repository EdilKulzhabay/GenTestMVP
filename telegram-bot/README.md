# Telegram Bot (Edu AI)

Отдельный микросервис для OTP-верификации через Telegram. Привязывает номер телефона к `chatId`, получает и пересылает коды подтверждения.

## Как это работает

1. Пользователь на сайте вводит номер телефона → сервер (`server`) создаёт запись в `pending_registrations` с кодом.
2. Если WhatsApp недоступен, сервер возвращает ссылку на Telegram-бота: `https://t.me/<bot>?start=<phone>`.
3. Пользователь переходит по ссылке → бот получает сообщение `/start +7...` → находит код в `pending_registrations` → отправляет его в чат.
4. Бот сохраняет связку `phone → chatId` в коллекции `telegram_phone_links`. При следующих OTP-запросах сервер отправляет код напрямую через Bot API.

### Команды бота

| Команда | Описание |
|---------|----------|
| `/start` | Проверка работоспособности — ответ «Бот работает» |
| `/start +79001234567` | Привязать номер и получить код подтверждения |
| `/verify +79001234567` | То же, что `/start +номер` — альтернативная команда |

## Режимы запуска

### Localhost (Long Polling)

Для локальной разработки без публичного URL и ngrok:

```bash
npm run dev:poll
```

Бот подключается к Telegram API через long polling. Напишите `/start` — должен ответить «Бот работает».

### Production (Webhook)

```bash
# Запустить webhook-сервер (порт 5113)
npm run dev

# Установить webhook (публичный URL)
npm run webhook -- https://your-domain.com
```

Webhook URL: `https://your-domain.com/webhooks/telegram`

Сервер также предоставляет:
- `GET /health` — health check
- `GET /webhook-info` — информация о текущем webhook

## Переменные окружения

См. `.env.example`.

| Переменная | Обязательна | Описание |
|------------|:-----------:|----------|
| `TELEGRAM_BOT_TOKEN` | да | Токен бота от @BotFather |
| `MONGODB_URI` | да | Строка подключения к MongoDB (та же БД, что у server) |
| `PORT` | нет | Порт webhook-сервера (по умолчанию `5113`) |
| `TELEGRAM_WEBHOOK_PATH` | нет | Путь webhook (по умолчанию `/webhooks/telegram`) |

## Модели данных

- **`TelegramPhoneLink`** — связка `phone (canonical) → chatId`. Создаётся при `/start +номер`.
- **`PendingRegistration`** — временная запись с кодом подтверждения (создаётся сервером, читается ботом).

## Структура

```
telegram-bot/
├── src/
│   ├── index.ts          # Webhook-сервер (Express)
│   ├── poll.ts           # Long Polling (для localhost)
│   ├── client.ts         # sendMessageToChat, linkPhoneToChat
│   └── models/
│       ├── PendingRegistration.model.ts
│       ├── TelegramPhoneLink.model.ts
│       └── index.ts
├── .env.example
├── package.json
└── tsconfig.json
```

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Webhook-сервер (Express, порт 5113) |
| `npm run dev:poll` | Long Polling (для localhost без ngrok) |
| `npm run webhook -- <URL>` | Установить webhook (`https://your-domain.com`) |
| `npm run build` | Компиляция TypeScript |
| `npm start` | Запуск из dist/ |
