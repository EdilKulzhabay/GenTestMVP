/**
 * Telegram бот — отправка сообщений через REST API.
 */

import { TelegramPhoneLink } from './models';

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Канонический формат для России (7XXXXXXXXXX) — единая запись в БД */
function canonicalPhone(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length === 11 && digits.startsWith('8')) {
    return '7' + digits.slice(1);
  }
  return digits;
}

export async function sendMessageToChat(chatId: number, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN не задан');
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
    return true;
  } catch (err) {
    console.error('[Telegram] sendMessageToChat:', err);
    return false;
  }
}

export async function linkPhoneToChat(phone: string, chatId: number): Promise<void> {
  const canonical = canonicalPhone(phone);
  await TelegramPhoneLink.findOneAndUpdate(
    { phone: canonical },
    { phone: canonical, chatId },
    { upsert: true, new: true }
  );
  console.log('[Telegram] linkPhoneToChat: привязан', canonical, '-> chatId', chatId);
}
