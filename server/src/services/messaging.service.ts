/**
 * Сервис отправки кодов верификации на телефон.
 *
 * Защита от зависаний:
 * - Circuit breaker: после N фейлов WhatsApp отключается на M минут.
 * - Hard timeout: вся функция гарантированно завершается за HARD_TIMEOUT_MS.
 * - Preflight /health (кэш 2 сек при false, 15 сек при true).
 * - Параллельная отправка WA+TG, берём первый успешный.
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

const HARD_TIMEOUT_MS = 15000;
const WA_HEALTH_TIMEOUT_MS = 3000;
const WA_SEND_TIMEOUT_MS = 13000;
const TG_SEND_TIMEOUT_MS = 5000;

// ─── Circuit Breaker для WhatsApp ───
const CB_FAIL_THRESHOLD = 2;
const CB_OPEN_DURATION_MS = 3 * 60 * 1000;
let cbFailCount = 0;
let cbOpenUntil = 0;

let waHealthy = false;
let waHealthCheckedAt = 0;
const WA_HEALTH_CACHE_OK_MS = 15_000;
const WA_HEALTH_CACHE_FAIL_MS = 2_000;

function cbRecordSuccess(): void { cbFailCount = 0; }
function cbRecordFailure(): void {
  cbFailCount++;
  if (cbFailCount >= CB_FAIL_THRESHOLD) {
    cbOpenUntil = Date.now() + CB_OPEN_DURATION_MS;
    console.warn(`[MESSAGING] Circuit breaker OPEN: WA отключён на ${CB_OPEN_DURATION_MS / 1000}s`);
  }
}
function cbIsOpen(): boolean { return Date.now() < cbOpenUntil; }

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

function isWhatsAppConfigured(): boolean {
  return !!process.env.WHATSAPP_BOT_URL && process.env.WHATSAPP_ENABLED !== 'false';
}

async function checkWhatsAppHealth(): Promise<boolean> {
  if (!isWhatsAppConfigured() || cbIsOpen()) return false;

  const now = Date.now();
  const cacheMs = waHealthy ? WA_HEALTH_CACHE_OK_MS : WA_HEALTH_CACHE_FAIL_MS;
  if (now - waHealthCheckedAt < cacheMs) return waHealthy;

  try {
    const url = process.env.WHATSAPP_BOT_URL!;
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
  const url = process.env.WHATSAPP_BOT_URL!;
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
    if (data.ok) { cbRecordSuccess(); return true; }
    waHealthy = false;
    waHealthCheckedAt = 0;
    cbRecordFailure();
    return false;
  } catch (err) {
    console.warn(`[MESSAGING] WA error ${Date.now() - t0}ms:`, (err as Error).message ?? err);
    waHealthy = false;
    waHealthCheckedAt = 0;
    cbRecordFailure();
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

async function sendOtpInternal(phone: string, code: string): Promise<SendResult> {
  const trimmed = phone.trim();
  const t0 = Date.now();

  const waReady = await checkWhatsAppHealth();
  console.log(`[MESSAGING] WA ready=${waReady} cb=${cbIsOpen() ? 'open' : 'closed'} (${Date.now() - t0}ms)`);

  if (waReady) {
    type Chan = 'whatsapp' | 'telegram';
    const first = await new Promise<Chan | null>((resolve) => {
      let settled = false;
      const guard = setTimeout(() => done(null), Math.max(WA_SEND_TIMEOUT_MS, TG_SEND_TIMEOUT_MS) + 200);

      const done = (ch: Chan | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        resolve(ch);
      };

      sendViaWhatsApp(trimmed, code).then((ok) => { if (ok) done('whatsapp'); });
      sendViaTelegram(trimmed, code).then((ok) => { if (ok) done('telegram'); });
    });

    if (first) {
      console.log(`[MESSAGING] OTP → ${first} total ${Date.now() - t0}ms`);
      return { sent: true, channel: first };
    }
  } else {
    const tgOk = await sendViaTelegram(trimmed, code);
    if (tgOk) {
      console.log(`[MESSAGING] OTP → telegram total ${Date.now() - t0}ms`);
      return { sent: true, channel: 'telegram' };
    }
  }

  const botLink = buildBotLink(trimmed);
  console.log(`[MESSAGING] Все каналы fail total ${Date.now() - t0}ms`);
  if (botLink) return { sent: false, botLink };
  return { sent: false, error: 'Все каналы недоступны' };
}

/**
 * Точка входа. Гарантированно завершается за HARD_TIMEOUT_MS.
 */
export async function sendVerificationCodeToPhone(
  phone: string,
  code: string
): Promise<SendResult> {
  let hardTimer: ReturnType<typeof setTimeout> | undefined;

  const hardTimeout = new Promise<SendResult>((resolve) => {
    hardTimer = setTimeout(() => {
      console.error(`[MESSAGING] HARD TIMEOUT ${HARD_TIMEOUT_MS}ms`);
      const botLink = buildBotLink(phone.trim());
      resolve(botLink ? { sent: false, botLink } : { sent: false, error: 'Timeout' });
    }, HARD_TIMEOUT_MS);
  });

  const result = await Promise.race([sendOtpInternal(phone, code), hardTimeout]);
  clearTimeout(hardTimer);
  return result;
}
