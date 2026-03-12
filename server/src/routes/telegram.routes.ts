import { Router } from 'express';
import { linkPhoneToChat, sendMessageToChat } from '../telegram';
import { PendingRegistration } from '../models';

/**
 * Webhook для Telegram-бота.
 * 1) /start 79001234567 — по ссылке t.me/bot?start=79001234567: ищем PendingRegistration по номеру, отправляем код.
 * 2) /start +79001234567 — привязка номера для будущих fallback.
 *
 * Настройка webhook: npm run telegram:webhook -- https://your-url.com
 */
const router = Router();

const OTP_TEXT = (code: string) =>
  `Ваш код подтверждения GenTest: ${code}\n\nКод действителен 15 минут.`;

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

router.post('/telegram', async (req, res) => {
  const body = req.body;
  const updateId = body?.update_id;
  const message = body?.message ?? body?.edited_message;
  const from = message?.from;

  console.log('[Telegram] ========== Webhook ==========');
  console.log('[Telegram] update_id:', updateId);
  console.log('[Telegram] Кто нажал /start:', logUser(from));
  console.log('[Telegram] chatId:', message?.chat?.id, '| type:', message?.chat?.type);
  console.log('[Telegram] text:', message?.text ?? '(нет текста)');
  if (!message?.text) {
    console.log('[Telegram] raw body:', JSON.stringify(body).slice(0, 500));
  }
  console.log('[Telegram] ============================');

  res.status(200).send();
  try {
    if (!message?.text) {
      return;
    }

    const text = message.text.trim();
    const chatId = message.chat?.id;
    if (!chatId) {
      console.log('[Telegram] Пропуск: нет chatId');
      return;
    }

    // /start 79001234567 или /start +79001234567 — номер в ссылке или вручную
    const phoneMatch = text.match(/^\/(?:start|verify)\s*(\+?[\d\s\-()]+)/);
    if (phoneMatch) {
      const phone = phoneMatch[1].replace(/\D/g, '');
      console.log('[Telegram] Извлечён номер:', phone, '| пользователь:', logUser(from));

      if (phone.length < 10) {
        console.log('[Telegram] Номер слишком короткий');
        await sendMessageToChat(chatId, 'Введите номер в формате: /start +79001234567');
        return;
      }

      // Ищем ожидающую регистрацию по номеру — отправить код
      const pending = await PendingRegistration.findOne({
        $or: [{ phone }, { phone: `+${phone}` }],
        verificationCodeExpires: { $gt: new Date() }
      });

      if (pending) {
        console.log('[Telegram] PendingRegistration найден, отправка кода пользователю:', logUser(from));
        const sent = await sendMessageToChat(chatId, OTP_TEXT(pending.verificationCode));
        console.log('[Telegram] Код отправлен:', sent ? 'OK' : 'ОШИБКА');
      } else {
        console.log('[Telegram] PendingRegistration НЕ найден для номера', phone, '| истёк или не регистрировался');
        await sendMessageToChat(
          chatId,
          'Номер привязан. Теперь вы будете получать коды подтверждения в Telegram.'
        );
      }
      await linkPhoneToChat(phone, chatId);
      return;
    }

    // /start или /verify без параметров
    if (/^\/(?:start|verify)\s*$/.test(text) || text === '/start' || text === '/verify') {
      console.log('[Telegram] /start без параметров от:', logUser(from));
      await sendMessageToChat(chatId, 'Бот работает');
    }
  } catch (err) {
    console.error('[Telegram] Webhook error:', err);
  }
});

export default router;
