/**
 * WhatsApp Web клиент на базе whatsapp-web.js.
 * Отправка OTP. При невосстановимых ошибках Puppeteer — process.exit
 * с расчётом на автоперезапуск через PM2.
 */

import { Client, LocalAuth } from 'whatsapp-web.js';
import * as path from 'path';
import * as fs from 'fs';

let client: Client | null = null;
let isReady = false;
let initPromise: Promise<void> | null = null;
let consecutiveErrors = 0;
let lastSuccessfulSendAt = 0;

const SEND_TIMEOUT_MS = Number(process.env.WHATSAPP_SEND_TIMEOUT_MS || 15000);
const PROTOCOL_TIMEOUT_MS = Number(process.env.WHATSAPP_PROTOCOL_TIMEOUT_MS || 60000);
const HEALTH_CHECK_INTERVAL_MS = 60_000;
const MAX_IDLE_WITHOUT_HEALTH_MS = 5 * 60_000;

const DEFAULT_CHROME_PATHS = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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
    lower.includes('getchat') ||
    lower.includes('protocol') ||
    lower.includes('timed out') ||
    lower.includes('session closed') ||
    lower.includes('target closed') ||
    lower.includes('execution context was destroyed') ||
    lower.includes('most likely because of a navigation')
  );
}

function fatalExit(reason: string): void {
  console.error(`[WhatsApp] FATAL: ${reason} — процесс завершается, PM2 перезапустит`);
  isReady = false;
  if (client) {
    try { (client as any).destroy?.(); } catch { /* noop */ }
  }
  setTimeout(() => process.exit(1), 500);
}

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

async function runHealthCheck(): Promise<void> {
  if (!isReady || !client) return;

  try {
    const state = await Promise.race([
      (client as any).getState?.() as Promise<string | null>,
      new Promise<null>((r) => setTimeout(() => r(null), 10_000))
    ]);

    if (state === null) {
      console.warn('[WhatsApp] Health check: таймаут getState');
      fatalExit('health check timeout');
      return;
    }

    if (state !== 'CONNECTED') {
      console.warn(`[WhatsApp] Health check: state=${state}, не CONNECTED`);
      fatalExit(`state=${state}`);
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WhatsApp] Health check failed:', msg);
    if (isFatalPuppeteerError(err)) {
      fatalExit(`health check: ${msg}`);
    }
  }
}

function startHealthChecks(): void {
  if (healthCheckTimer) return;
  healthCheckTimer = setInterval(() => void runHealthCheck(), HEALTH_CHECK_INTERVAL_MS);
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
    console.log(`[WhatsApp] Chrome: ${chromePath}`);

    client = new Client({
      authStrategy: new LocalAuth({ clientId: 'gentest_otp', dataPath }),
      puppeteer: {
        headless: true,
        executablePath: chromePath,
        protocolTimeout: PROTOCOL_TIMEOUT_MS,
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
      lastSuccessfulSendAt = Date.now();
      console.log('[WhatsApp] Клиент готов');
      startHealthChecks();
      resolve();
    });

    client.on('authenticated', () => {
      console.log('[WhatsApp] Сессия аутентифицирована');
    });

    client.on('auth_failure', (msg: string) => {
      console.error('[WhatsApp] auth_failure:', msg);
      reject(new Error(msg));
    });

    client.on('disconnected', (reason: string) => {
      console.warn('[WhatsApp] disconnected:', reason);
      fatalExit(`disconnected: ${reason}`);
    });

    client.initialize().catch((err) => {
      isReady = false;
      initPromise = null;
      reject(err);
    });
  });

  return initPromise;
}

export function isClientReady(): boolean {
  return isReady && client !== null;
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
      lastSuccessfulSendAt = Date.now();
      console.log(`[WhatsApp] Отправлено за ${elapsed}ms`);
      return true;
    }

    console.warn(`[WhatsApp] Таймаут ${elapsed}ms`);
    consecutiveErrors++;
    if (consecutiveErrors >= 2) {
      fatalExit(`${consecutiveErrors} consecutive timeouts`);
    }
    return false;
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    console.error(`[WhatsApp] Ошибка отправки (${elapsed}ms):`, err);

    if (isFatalPuppeteerError(err)) {
      fatalExit(`puppeteer: ${(err as Error).message}`);
      return false;
    }

    consecutiveErrors++;
    if (consecutiveErrors >= 3) {
      fatalExit(`${consecutiveErrors} consecutive errors`);
    }
    return false;
  }
}

export function startClient(): Promise<void> {
  return initClient();
}
