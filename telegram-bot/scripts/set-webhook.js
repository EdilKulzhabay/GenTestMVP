"use strict";
/**
 * Установка webhook для Telegram-бота.
 * Запуск: npm run webhook -- https://your-domain.com
 * Для localhost: используйте ngrok и перейдите в dev:poll.
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const token = process.env.TELEGRAM_BOT_TOKEN;
const baseUrl = process.argv[2]?.replace(/\/$/, '');
if (!token) {
    console.error('Ошибка: TELEGRAM_BOT_TOKEN не задан в .env');
    process.exit(1);
}
if (!baseUrl) {
    console.error('Использование: npm run webhook -- <BASE_URL>');
    console.error('Пример: npm run webhook -- https://your-domain.com');
    console.error('Webhook будет: BASE_URL/webhooks/telegram');
    process.exit(1);
}
const webhookPath = process.env.TELEGRAM_WEBHOOK_PATH || '/webhooks/telegram';
const webhookUrl = `${baseUrl}${webhookPath}`;
async function setWebhook() {
    console.log('Установка webhook:', webhookUrl);
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
    });
    const data = (await res.json());
    if (data.ok) {
        console.log('Webhook установлен успешно');
    }
    else {
        console.error('Ошибка:', data.description);
        process.exit(1);
    }
}
setWebhook();
