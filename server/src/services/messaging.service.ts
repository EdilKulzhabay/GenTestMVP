/**
 * Сервис отправки кодов верификации на телефон.
 * Приоритет: WhatsApp (whatsapp-web.js) → Telegram (если пользователь связал номер с ботом).
 * При неудаче обоих — возвращает ссылку на бота с номером: t.me/bot?start=79001234567
 */

import { sendMessage as sendViaWhatsAppWeb } from '../whatsapp';
import { sendMessage as sendViaTelegramBot } from '../telegram';

export type SendResult = {
  sent: boolean;
  channel?: 'whatsapp' | 'telegram';
  /** Ссылка на бота с номером для получения кода */
  botLink?: string;
  error?: string;
};

const OTP_TEXT = (code: string) =>
  `Ваш код подтверждения GenTest: ${code}\n\nКод действителен 15 минут.`;

function buildBotLink(phone: string): string {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!username) {
    console.warn('[MESSAGING] TELEGRAM_BOT_USERNAME не задан — ссылка на бота недоступна');
    return '';
  }
  const bot = username.startsWith('@') ? username.slice(1) : username;
  const phoneDigits = phone.replace(/\D/g, '');
  return `https://t.me/${bot}?start=${phoneDigits}`;
}

/** Отправка через WhatsApp (whatsapp-web.js) */
async function sendViaWhatsApp(phone: string, code: string): Promise<boolean> {
  return sendViaWhatsAppWeb(phone.trim(), OTP_TEXT(code));
}

/** Отправка через Telegram (если пользователь связал номер с ботом) */
async function sendViaTelegram(phone: string, code: string): Promise<boolean> {
  return sendViaTelegramBot(phone.trim(), OTP_TEXT(code));
}

/**
 * Отправить код верификации на телефон.
 * Сначала пробует WhatsApp, при неудаче — Telegram.
 * Если оба недоступны — возвращает ссылку на бота с номером.
 */
export async function sendVerificationCodeToPhone(
  phone: string,
  code: string
): Promise<SendResult> {
  const trimmed = phone.trim();

  const whatsappOk = await sendViaWhatsApp(trimmed, code);
  if (whatsappOk) {
    return { sent: true, channel: 'whatsapp' };
  }

  const telegramOk = await sendViaTelegram(trimmed, code);
  if (telegramOk) {
    return { sent: true, channel: 'telegram' };
  }

  // Оба недоступны — ссылка на бота с номером (при /start выдаст код)
  const botLink = buildBotLink(trimmed);
  if (botLink) {
    console.log(`[MESSAGING] WhatsApp/Telegram недоступны. Ссылка для ${trimmed}: ${botLink}`);
    return { sent: false, botLink };
  }

  console.log(`[MESSAGING] Код для ${trimmed}: ${code} (настройте TELEGRAM_BOT_USERNAME)`);
  return { sent: true };
}

/** Реэкспорт для обратной совместимости (webhook использует linkTelegramToPhone) */
export { linkPhoneToChat as linkTelegramToPhone } from '../telegram';
