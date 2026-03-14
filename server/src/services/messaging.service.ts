/**
 * Сервис отправки кодов верификации на телефон.
 * Приоритет: WhatsApp (whatsapp-bot HTTP) → Telegram (если пользователь связал номер с ботом).
 * При неудаче обоих — возвращает ссылку на бота с номером: t.me/bot?start=79001234567
 */

import { sendMessage as sendViaTelegramBot } from '../telegram';

export type SendResult = {
  sent: boolean;
  channel?: 'whatsapp' | 'telegram';
  /** Ссылка на бота с номером для получения кода */
  botLink?: string;
  error?: string;
};

const OTP_TEXT = (code: string) =>
  `Ваш код подтверждения Edu AI: ${code}\n\nКод действителен 15 минут.`;

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

/** Нормализация номера для WhatsApp (Россия: 8XXXXXXXXXX → 7XXXXXXXXXX) */
function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    return '7' + digits.slice(1);
  }
  return digits;
}

/** Отправка через WhatsApp (HTTP к whatsapp-bot) */
async function sendViaWhatsApp(phone: string, code: string): Promise<boolean> {
  const url = process.env.WHATSAPP_BOT_URL;
  if (!url) {
    console.warn('[MESSAGING] WHATSAPP_BOT_URL не задан');
    return false;
  }
  if (process.env.WHATSAPP_ENABLED === 'false') return false;

  try {
    const apiKey = process.env.WHATSAPP_BOT_API_KEY;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-Api-Key'] = apiKey;

    const phoneForWhatsApp = normalizePhoneForWhatsApp(phone);
    console.log('[MESSAGING] WhatsApp: отправка на', phoneForWhatsApp);

    const res = await fetch(`${url.replace(/\/$/, '')}/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: phoneForWhatsApp, text: OTP_TEXT(code) })
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!data.ok) {
      console.warn('[MESSAGING] WhatsApp bot вернул ok: false', data.error || '');
    }
    return !!data.ok;
  } catch (err) {
    console.error('[MESSAGING] WhatsApp send error:', err);
    return false;
  }
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

  const botLink = buildBotLink(trimmed);
  if (botLink) {
    console.log(`[MESSAGING] WhatsApp/Telegram недоступны. Ссылка для ${trimmed}: ${botLink}`);
    return { sent: false, botLink };
  }

  console.log(`[MESSAGING] Код для ${trimmed}: ${code} (настройте TELEGRAM_BOT_USERNAME)`);
  return { sent: true };
}
