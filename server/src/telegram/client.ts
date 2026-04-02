/**
 * Telegram бот — отправка OTP на указанный номер.
 * Работает через связь phone → chat_id (пользователь должен сначала написать боту /start +номер).
 */

import { TelegramPhoneLink } from '../models';

const TELEGRAM_API_TIMEOUT_MS = Number(process.env.TELEGRAM_API_TIMEOUT_MS || 2000);

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Варианты номера для поиска (8XXXXXXXXXX и 7XXXXXXXXXX для России) */
function getPhoneVariants(phone: string): string[] {
  const digits = normalizePhone(phone);
  const variants = [digits];
  if (digits.length === 11 && digits.startsWith('8')) {
    variants.push('7' + digits.slice(1));
  } else if (digits.length === 11 && digits.startsWith('7')) {
    variants.push('8' + digits.slice(1));
  }
  return [...new Set(variants)];
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

  const variants = getPhoneVariants(phone);
  const link = await TelegramPhoneLink.findOne({
    phone: { $in: variants }
  });

  if (!link) {
    console.log('[Telegram] sendMessage: номер не связан', phone, '— напишите боту /start +номер');
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TELEGRAM_API_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: link.chatId,
        text
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
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

