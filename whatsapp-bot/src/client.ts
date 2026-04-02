/**
 * WhatsApp Web клиент на базе whatsapp-web.js.
 * Отправка OTP. Авто-реинициализация при ошибках Puppeteer.
 */

import { Client, LocalAuth } from 'whatsapp-web.js';
import * as path from 'path';
import * as fs from 'fs';

let client: Client | null = null;
let isReady = false;
let initPromise: Promise<void> | null = null;
let isReinitializing = false;
let consecutiveErrors = 0;
let lastErrorAt = 0;

const SEND_TIMEOUT_MS = Number(process.env.WHATSAPP_SEND_TIMEOUT_MS || 6000);
const REINIT_COOLDOWN_MS = 30_000;

const DEFAULT_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];

function findChromeExecutable(): string | undefined {
  const envPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  return DEFAULT_CHROME_PATHS.find((p) => fs.existsSync(p));
}

export function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@c.us`;
}

function isFatalPuppeteerError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes('detached frame') ||
    lower.includes('getChat') ||
    lower.includes('protocol') ||
    lower.includes('timed out') ||
    lower.includes('session closed') ||
    lower.includes('target closed') ||
    lower.includes('execution context was destroyed')
  );
}

function initClient(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    const dataPath = path.join(process.cwd(), '.wwebjs_auth');
    const chromePath = findChromeExecutable();
    if (!chromePath) {
      reject(new Error('Chrome не найден. Установите Google Chrome или укажите CHROME_PATH'));
      return;
    }

    client = new Client({
      authStrategy: new LocalAuth({ clientId: 'gentest_otp', dataPath }),
      puppeteer: {
        headless: true,
        executablePath: chromePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--no-zygote',
          '--memory-pressure-off',
          '--single-process'
        ]
      } as Record<string, unknown>,
      authTimeoutMs: 120_000
    });

    client.on('qr', async (qr: string) => {
      console.log('[WhatsApp] QR получен — сканируйте в WhatsApp → Связанные устройства');
      try {
        const qrcode = require('qrcode-terminal');
        qrcode.generate(qr, { small: true });
      } catch { /* noop */ }
      try {
        const qrcodePkg = await import('qrcode');
        const dataUrl = await qrcodePkg.toDataURL(qr);
        const qrPath = path.join(dataPath, 'qr.png');
        const fsAsync = await import('fs/promises');
        await fsAsync.mkdir(path.dirname(qrPath), { recursive: true });
        const base64 = dataUrl.split(',')[1];
        if (base64) await fsAsync.writeFile(qrPath, Buffer.from(base64, 'base64'));
      } catch { /* noop */ }
    });

    client.on('ready', () => {
      isReady = true;
      consecutiveErrors = 0;
      console.log('[WhatsApp] Клиент готов');
      resolve();
    });

    client.on('authenticated', () => {
      console.log('[WhatsApp] Сессия аутентифицирована');
    });

    client.on('auth_failure', (msg: string) => {
      console.error('[WhatsApp] auth_failure:', msg);
      markBroken();
      reject(new Error(msg));
    });

    client.on('disconnected', (reason: string) => {
      console.warn('[WhatsApp] disconnected:', reason);
      markBroken();
      scheduleReinit('disconnected');
    });

    client.initialize().catch((err) => {
      markBroken();
      reject(err);
    });
  });

  return initPromise;
}

function markBroken(): void {
  isReady = false;
  initPromise = null;
}

function scheduleReinit(reason: string): void {
  if (isReinitializing) return;
  const now = Date.now();
  if (now - lastErrorAt < REINIT_COOLDOWN_MS) return;
  lastErrorAt = now;
  console.log(`[WhatsApp] Запланирована реинициализация через 10 сек (${reason})`);
  setTimeout(() => void reinitialize(reason), 10_000);
}

async function reinitialize(reason: string): Promise<void> {
  if (isReinitializing) return;
  isReinitializing = true;
  try {
    console.warn('[WhatsApp] Реинициализация:', reason);
    markBroken();
    if (client) {
      try { await (client as any).destroy?.(); } catch { /* noop */ }
      client = null;
    }
    await initClient();
    console.log('[WhatsApp] Реинициализация успешна');
  } catch (err) {
    console.error('[WhatsApp] Реинициализация не удалась:', err);
  } finally {
    isReinitializing = false;
  }
}

export function isClientReady(): boolean {
  return isReady && client !== null && !isReinitializing;
}

export async function sendMessage(phone: string, text: string): Promise<boolean> {
  if (!isClientReady()) {
    console.warn('[WhatsApp] sendMessage: клиент не готов, отказ');
    return false;
  }

  const chatId = formatPhoneForWhatsApp(phone);
  console.log('[WhatsApp] Отправка на', chatId);
  const startedAt = Date.now();

  try {
    const sendPromise = client!.sendMessage(chatId, text).then(() => true);
    const timeoutPromise = new Promise<false>((resolve) =>
      setTimeout(() => resolve(false), SEND_TIMEOUT_MS)
    );

    const sent = await Promise.race([sendPromise, timeoutPromise]);
    const elapsed = Date.now() - startedAt;

    if (sent) {
      consecutiveErrors = 0;
      console.log(`[WhatsApp] Отправлено за ${elapsed}ms`);
      return true;
    }

    console.warn(`[WhatsApp] Таймаут ${elapsed}ms`);
    onSendError('timeout');
    return false;
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    console.error(`[WhatsApp] Ошибка отправки (${elapsed}ms):`, err);
    onSendError(isFatalPuppeteerError(err) ? 'fatal' : 'transient');
    return false;
  }
}

function onSendError(kind: 'fatal' | 'transient' | 'timeout'): void {
  consecutiveErrors++;
  if (kind === 'fatal' || consecutiveErrors >= 3) {
    markBroken();
    scheduleReinit(kind === 'fatal' ? 'puppeteer-error' : `${consecutiveErrors}-consecutive-errors`);
  }
}

export function startClient(): Promise<void> {
  return initClient();
}
