/**
 * Сервис отправки кодов верификации на телефон.
 *
 * Стратегия (быстрый OTP):
 * 1. Preflight: проверка /health WhatsApp-бота (~50ms).
 *    Если не ready — сразу пропускаем WA, не тратим время.
 * 2. Если WA ready — запускаем WA и TG параллельно, берём первый успешный.
 *    Если WA не ready — сразу только TG.
 * 3. Если оба канала не сработали — возвращаем ссылку на бота.
 */

import { sendMessage as sendViaTelegramBot } from '../telegram';

export type SendResult = {
  sent: boolean;
  channel?: 'whatsapp' | 'telegram';
  botLink?: string;
  error?: string;
};

const OTP_TEXT = (code: string) =>
  `Ваш код подтверждения Edu AI: ${code}\n\nКод действителен 15 минут.`;

const WA_HEALTH_TIMEOUT_MS = 400;
const WA_SEND_TIMEOUT_MS = Number(process.env.WHATSAPP_SEND_TIMEOUT_MS || 3000);
const TG_SEND_TIMEOUT_MS = Number(process.env.TELEGRAM_SEND_TIMEOUT_MS || 2500);

let waHealthy = false;
let waHealthCheckedAt = 0;
const WA_HEALTH_CACHE_MS = 5_000;

function buildBotLink(phone: string): string {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!username) return '';
  const bot = username.startsWith('@') ? username.slice(1) : username;
  return `https://t.me/${bot}?start=${phone.replace(/\D/g, '')}`;
}

function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return '7' + digits.slice(1);
  return digits;
}

async function isWhatsAppReady(): Promise<boolean> {
  const url = process.env.WHATSAPP_BOT_URL;
  if (!url || process.env.WHATSAPP_ENABLED === 'false') return false;

  const now = Date.now();
  if (now - waHealthCheckedAt < WA_HEALTH_CACHE_MS) return waHealthy;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), WA_HEALTH_TIMEOUT_MS);
    const res = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    const data = (await res.json()) as { ready?: boolean };
    waHealthy = !!data.ready;
  } catch {
    waHealthy = false;
  }
  waHealthCheckedAt = Date.now();
  return waHealthy;
}

async function sendViaWhatsApp(phone: string, code: string): Promise<boolean> {
  const url = process.env.WHATSAPP_BOT_URL;
  if (!url) return false;

  const apiKey = process.env.WHATSAPP_BOT_API_KEY;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-Api-Key'] = apiKey;

  const phoneForWA = normalizePhoneForWhatsApp(phone);
  const t0 = Date.now();

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), WA_SEND_TIMEOUT_MS);
    const res = await fetch(`${url.replace(/\/$/, '')}/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: phoneForWA, text: OTP_TEXT(code) }),
      signal: ctrl.signal
    });
    clearTimeout(timeout);
    const data = (await res.json()) as { ok?: boolean; error?: string };
    console.log(`[MESSAGING] WA: ${data.ok ? 'ok' : 'fail'} ${Date.now() - t0}ms`);
    if (!data.ok) waHealthy = false;
    return !!data.ok;
  } catch (err) {
    console.warn(`[MESSAGING] WA error ${Date.now() - t0}ms:`, (err as Error).message ?? err);
    waHealthy = false;
    return false;
  }
}

async function sendViaTelegram(phone: string, code: string): Promise<boolean> {
  const t0 = Date.now();
  const timeoutP = new Promise<false>((r) => setTimeout(() => r(false), TG_SEND_TIMEOUT_MS));
  const result = await Promise.race([
    sendViaTelegramBot(phone.trim(), OTP_TEXT(code)),
    timeoutP
  ]);
  console.log(`[MESSAGING] TG: ${result ? 'ok' : 'fail'} ${Date.now() - t0}ms`);
  return result;
}

export async function sendVerificationCodeToPhone(
  phone: string,
  code: string
): Promise<SendResult> {
  const trimmed = phone.trim();
  const t0 = Date.now();

  const waReady = await isWhatsAppReady();
  console.log(`[MESSAGING] WA ready=${waReady} (check ${Date.now() - t0}ms)`);

  if (waReady) {
    const waP = sendViaWhatsApp(trimmed, code).then(
      (ok) => (ok ? ('whatsapp' as const) : null)
    );
    const tgP = sendViaTelegram(trimmed, code).then(
      (ok) => (ok ? ('telegram' as const) : null)
    );

    const results = await Promise.allSettled([waP, tgP]);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        console.log(`[MESSAGING] OTP → ${r.value} total ${Date.now() - t0}ms`);
        return { sent: true, channel: r.value };
      }
    }
  } else {
    const tgOk = await sendViaTelegram(trimmed, code);
    if (tgOk) {
      console.log(`[MESSAGING] OTP → telegram total ${Date.now() - t0}ms`);
      return { sent: true, channel: 'telegram' };
    }
  }

  const botLink = buildBotLink(trimmed);
  console.log(`[MESSAGING] Все каналы fail total ${Date.now() - t0}ms. botLink=${botLink || 'none'}`);
  if (botLink) return { sent: false, botLink };
  return { sent: false, error: 'Все каналы недоступны' };
}
