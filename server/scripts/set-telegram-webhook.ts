/**
 * Установка webhook для Telegram-бота.
 * Запуск: npx ts-node scripts/set-telegram-webhook.ts https://your-ngrok-url.ngrok.io
 *
 * Для локальной разработки:
 * 1. Запустите ngrok: ngrok http 5111
 * 2. Скопируйте HTTPS URL (например https://abc123.ngrok.io)
 * 3. Запустите: npx ts-node scripts/set-telegram-webhook.ts https://abc123.ngrok.io
 */

import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;
const baseUrl = process.argv[2]?.replace(/\/$/, '');

if (!token) {
  console.error('Ошибка: TELEGRAM_BOT_TOKEN не задан в .env');
  process.exit(1);
}

if (!baseUrl) {
  console.error('Использование: npx ts-node scripts/set-telegram-webhook.ts <URL>');
  console.error('Пример: npx ts-node scripts/set-telegram-webhook.ts https://abc123.ngrok.io');
  process.exit(1);
}

const webhookUrl = `${baseUrl}/api/v1/webhooks/telegram`;

async function setWebhook(): Promise<void> {
  console.log('Установка webhook:', webhookUrl);
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl })
  });
  const data = (await res.json()) as { ok?: boolean; description?: string };
  if (data.ok) {
    console.log('Webhook установлен успешно');
  } else {
    console.error('Ошибка:', data.description);
    process.exit(1);
  }
}

setWebhook();
