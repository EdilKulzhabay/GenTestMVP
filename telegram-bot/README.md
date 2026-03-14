# Telegram Bot (GenTest MVP)

Отдельный сервис для OTP: webhook и привязка номера к chat_id.

## Localhost (Long Polling)

```bash
npm run dev
```

Напишите боту `/start` — должен ответить «Бот работает».

## Production (Webhook)

```bash
# Запустить webhook-сервер
npm run dev:webhook

# Установить webhook (публичный URL)
npm run webhook -- https://your-domain.com
```

Webhook URL: `https://your-domain.com/webhooks/telegram`

## Переменные окружения

См. `.env.example`. Нужны: `TELEGRAM_BOT_TOKEN`, `MONGODB_URI`.
