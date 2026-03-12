# Запуск Telegram-бота

## Вариант 1: Long Polling (для localhost, БЕЗ ngrok)

Работает на localhost без настройки webhook.

**Шаги:**

1. Запустите MongoDB (если ещё не запущена)
2. Запустите сервер в первом терминале:
   ```bash
   npm run dev
   ```
3. Запустите бота во втором терминале:
   ```bash
   npm run telegram:poll
   ```
4. Напишите боту в Telegram: `/start` — должен ответить «Бот работает»

---

## Вариант 2: Webhook (для production или ngrok)

Если у вас есть публичный HTTPS URL (например через ngrok):

1. Запустите ngrok: `ngrok http 5111`
2. Скопируйте HTTPS URL (например `https://abc123.ngrok-free.app`)
3. Установите webhook:
   ```bash
   npm run telegram:webhook -- https://abc123.ngrok-free.app
   ```
4. Сервер должен быть запущен (`npm run dev`)

**Важно:** Webhook и Long Polling нельзя использовать одновременно. Если запускаете `telegram:poll`, webhook автоматически удаляется.
