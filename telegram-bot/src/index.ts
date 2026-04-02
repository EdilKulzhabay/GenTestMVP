/**
 * Telegram Bot — webhook сервер.
 * Принимает обновления от Telegram, обрабатывает /start +номер.
 */

import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import { PendingRegistration } from './models';
import { linkPhoneToChat, sendMessageToChat } from './client';

const PORT = parseInt(process.env.TELEGRAM_BOT_PORT || '5113', 10);
const WEBHOOK_PATH = process.env.TELEGRAM_WEBHOOK_PATH || '/webhooks/telegram';

const OTP_TEXT = (code: string) =>
  `Ваш код подтверждения Edu AI: ${code}\n\nКод действителен 15 минут.`;

function logUser(from: { id?: number; username?: string; first_name?: string; last_name?: string } | undefined): string {
  if (!from) return 'unknown';
  const parts = [
    from.id && `id=${from.id}`,
    from.username && `@${from.username}`,
    from.first_name,
    from.last_name
  ].filter(Boolean);
  return parts.join(' ');
}

const app = express();
app.use(express.json());

app.post(WEBHOOK_PATH, async (req, res) => {
  const body = req.body;
  const updateId = body?.update_id;
  const message = body?.message ?? body?.edited_message;
  const from = message?.from;

  console.log('[Telegram] ========== Webhook ==========');
  console.log('[Telegram] update_id:', updateId);
  console.log('[Telegram] Кто нажал /start:', logUser(from));
  console.log('[Telegram] chatId:', message?.chat?.id, '| type:', message?.chat?.type);
  console.log('[Telegram] text:', message?.text ?? '(нет текста)');
  console.log('[Telegram] ============================');

  res.status(200).send();

  try {
    if (!message?.text) return;

    const text = message.text.trim();
    const chatId = message.chat?.id;
    if (!chatId) return;

    const phoneMatch = text.match(/^\/(?:start|verify)\s*(\+?[\d\s\-()]+)/);
    if (phoneMatch) {
      const phone = phoneMatch[1].replace(/\D/g, '');
      console.log('[Telegram] Извлечён номер:', phone, '| пользователь:', logUser(from));

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
        console.log('[Telegram] PendingRegistration найден, отправка кода пользователю:', logUser(from));
        await sendMessageToChat(chatId, OTP_TEXT(pending.verificationCode));
      } else {
        await sendMessageToChat(
          chatId,
          'Номер привязан. Теперь вы будете получать коды подтверждения в Telegram.'
        );
      }
      await linkPhoneToChat(phone, chatId);
      return;
    }

    if (/^\/(?:start|verify)\s*$/.test(text) || text === '/start' || text === '/verify') {
      await sendMessageToChat(chatId, 'Бот работает');
    }
  } catch (err) {
    console.error('[Telegram] Webhook error:', err);
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'telegram-bot' });
});

app.get('/webhook-info', async (_req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    res.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN не задан' });
    return;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/edu-ai-test-platform';

mongoose.connect(mongoURI).then(() => {
  console.log('✅ MongoDB подключена');
  app.listen(PORT, async () => {
    console.log('🚀 Telegram Bot (webhook) запущен');
    console.log(`   Порт: ${PORT}`);
    console.log(`   Webhook: POST http://localhost:${PORT}${WEBHOOK_PATH}`);
    console.log(`   Настройка: npm run webhook -- <BASE_URL>`);

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
        const info = (await r.json()) as { result?: { url?: string; last_error_message?: string; last_error_date?: number; pending_update_count?: number } };
        const wh = info.result;
        if (wh) {
          console.log(`[Telegram] Текущий webhook URL: ${wh.url || '(не установлен)'}`);
          if (wh.last_error_message) console.warn(`[Telegram] Последняя ошибка webhook: ${wh.last_error_message}`);
          if (wh.pending_update_count) console.log(`[Telegram] Ожидающие обновления: ${wh.pending_update_count}`);
          if (!wh.url) {
            console.warn('[Telegram] ⚠️  Webhook НЕ установлен! Бот не будет получать обновления.');
            console.warn('[Telegram] Установите: npm run webhook -- https://your-domain.com');
          }
        }
      } catch (err) {
        console.error('[Telegram] Не удалось проверить webhook:', err);
      }
    } else {
      console.warn('[Telegram] ⚠️  TELEGRAM_BOT_TOKEN не задан!');
    }
  });
}).catch((err) => {
  console.error('❌ MongoDB:', err);
  process.exit(1);
});
