/**
 * Telegram бот в режиме Long Polling — для localhost без ngrok.
 * Запуск: npm run dev:poll
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { PendingRegistration } from './models';
import { linkPhoneToChat, sendMessageToChat } from './client';

const OTP_TEXT = (code: string) =>
  `Ваш код подтверждения Edu AI: ${code}\n\nКод действителен 15 минут.`;

function logUser(from: { id?: number; username?: string; first_name?: string; last_name?: string } | undefined): string {
  if (!from) return 'unknown';
  const parts = [from.id && `id=${from.id}`, from.username && `@${from.username}`, from.first_name, from.last_name].filter(Boolean);
  return parts.join(' ');
}

async function processUpdate(update: { message?: { text?: string; chat?: { id: number }; from?: unknown }; edited_message?: { text?: string; chat?: { id: number }; from?: unknown } }): Promise<void> {
  const message = update?.message ?? update?.edited_message;
  if (!message?.text) return;

  const text = message.text.trim();
  const chatId = message.chat?.id;
  const from = message.from;
  if (!chatId) return;

  console.log('[Telegram] ========== Сообщение ==========');
  console.log('[Telegram] Кто написал:', logUser(from as Parameters<typeof logUser>[0]));
  console.log('[Telegram] chatId:', chatId, '| text:', text);
  console.log('[Telegram] ============================');

  const phoneMatch = text.match(/^\/(?:start|verify)\s*(\+?[\d\s\-()]+)/);
  if (phoneMatch) {
    const phone = phoneMatch[1].replace(/\D/g, '');
    if (phone.length < 10) {
      await sendMessageToChat(chatId, 'Введите номер в формате: /start +79001234567');
      return;
    }

    const phoneVariants = [phone, `+${phone}`];
    if (phone.length === 11 && phone.startsWith('8')) {
      phoneVariants.push('7' + phone.slice(1));
    } else if (phone.length === 11 && phone.startsWith('7')) {
      phoneVariants.push('8' + phone.slice(1));
    }

    const pending = await PendingRegistration.findOne({
      phone: { $in: phoneVariants },
      verificationCodeExpires: { $gt: new Date() }
    });

    if (pending) {
      await sendMessageToChat(chatId, OTP_TEXT(pending.verificationCode));
    } else {
      await sendMessageToChat(chatId, 'Номер привязан. Теперь вы будете получать коды подтверждения в Telegram.');
    }
    await linkPhoneToChat(phone, chatId);
    return;
  }

  if (/^\/(?:start|verify)\s*$/.test(text) || text === '/start' || text === '/verify') {
    await sendMessageToChat(chatId, 'Бот работает');
  }
}

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('Ошибка: TELEGRAM_BOT_TOKEN не задан в .env');
    process.exit(1);
  }

  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/edu-ai-test-platform';
  await mongoose.connect(mongoURI);
  console.log('✅ MongoDB подключена');

  const delRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
  const delData = (await delRes.json()) as { ok?: boolean };
  if (delData.ok) {
    console.log('✅ Webhook удалён');
  }

  console.log('🤖 Telegram бот запущен (Long Polling). Напишите /start в боте.');
  let offset = 0;

  while (true) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=25`
      );
      const data = (await res.json()) as { ok?: boolean; result?: any[] };
      if (!data.ok || !data.result) continue;

      for (const update of data.result) {
        offset = update.update_id + 1;
        await processUpdate(update);
      }
    } catch (err) {
      console.error('[Telegram] Poll error:', err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
