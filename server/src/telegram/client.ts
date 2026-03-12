/**
 * Telegram бот — отправка OTP на указанный номер.
 * Работает через связь phone → chat_id (пользователь должен сначала написать боту /start +номер).
 */

import { TelegramPhoneLink } from '../models';

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Отправляет сообщение на указанный номер через Telegram-бота.
 * Номер должен быть предварительно связан с chat_id (пользователь написал боту /start +номер).
 */
export async function sendMessage(phone: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram] sendMessage: TELEGRAM_BOT_TOKEN не задан');
    return false;
  }

  if (process.env.TELEGRAM_ENABLED === 'false') {
    console.log('[Telegram] sendMessage: отключён (TELEGRAM_ENABLED=false)');
    return false;
  }

  const normalized = normalizePhone(phone);
  const link = await TelegramPhoneLink.findOne({
    $or: [{ phone: normalized }, { phone: phone.trim() }]
  });

  if (!link) {
    console.log('[Telegram] sendMessage: номер не связан', phone, '— напишите боту /start +номер');
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: link.chatId,
        text
      })
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok) {
      console.error('[Telegram] sendMessage API error:', data.description);
      return false;
    }
    console.log('[Telegram] sendMessage: OTP отправлен на', phone, 'chatId:', link.chatId);
    return true;
  } catch (err) {
    console.error('[Telegram] sendMessage ошибка:', err);
    return false;
  }
}

/**
 * Отправляет сообщение в чат по chat_id (для ответов в webhook).
 */
export async function sendMessageToChat(chatId: number, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram] sendMessageToChat: TELEGRAM_BOT_TOKEN не задан');
    return false;
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok) {
      console.error('[Telegram] sendMessageToChat error chatId=', chatId, data.description);
      return false;
    }
    console.log('[Telegram] sendMessageToChat: ответ отправлен chatId=', chatId);
    return true;
  } catch (err) {
    console.error('[Telegram] sendMessageToChat:', err);
    return false;
  }
}

/**
 * Сохраняет связь phone → chatId (вызывается из webhook при /start +номер).
 */
export async function linkPhoneToChat(phone: string, chatId: number): Promise<void> {
  const normalized = normalizePhone(phone);
  await TelegramPhoneLink.findOneAndUpdate(
    { phone: normalized },
    { phone: normalized, chatId },
    { upsert: true, new: true }
  );
  console.log('[Telegram] linkPhoneToChat: привязан', normalized, '-> chatId', chatId);
}
