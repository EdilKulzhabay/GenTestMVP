/**
 * WhatsApp Web клиент на базе whatsapp-web.js.
 * Используется для отправки OTP-кодов верификации.
 */

import { Client, LocalAuth } from 'whatsapp-web.js';
import * as path from 'path';
import * as fs from 'fs';

let client: Client | null = null;

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

let isReady = false;
let initPromise: Promise<void> | null = null;

export function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@c.us`;
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
    const puppeteerOpts: Record<string, unknown> = {
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
        '--memory-pressure-off'
      ]
    };
    client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'gentest_otp',
        dataPath
      }),
      puppeteer: puppeteerOpts,
      authTimeoutMs: 120000 // 2 минуты — на медленных серверах QR появляется дольше
    });

    client.on('qr', async (qr: string) => {
      console.log('[WhatsApp] Отсканируйте QR-код в приложении WhatsApp:');
      console.log('[WhatsApp] Настройки → Связанные устройства → Привязать устройство');
      try {
        const qrcode = require('qrcode-terminal');
        qrcode.generate(qr, { small: true });
      } catch {
        // qrcode-terminal может не работать в pm2/headless
      }
      try {
        const qrcodePkg = await import('qrcode');
        const dataUrl = await qrcodePkg.toDataURL(qr);
        const qrPath = path.join(process.cwd(), '.wwebjs_auth', 'qr.png');
        const fsAsync = await import('fs/promises');
        await fsAsync.mkdir(path.dirname(qrPath), { recursive: true });
        const base64 = dataUrl.split(',')[1];
        if (base64) {
          await fsAsync.writeFile(qrPath, Buffer.from(base64, 'base64'));
          console.log('[WhatsApp] QR-код сохранён в:', qrPath);
        }
      } catch {
        // qrcode опционален
      }
    });

    client.on('ready', () => {
      isReady = true;
      console.log('[WhatsApp] Клиент готов к отправке сообщений');
      resolve();
    });

    client.on('authenticated', () => {
      console.log('[WhatsApp] Сессия аутентифицирована');
    });

    client.on('auth_failure', (msg: string) => {
      console.error('[WhatsApp] Ошибка аутентификации:', msg);
      reject(new Error(msg));
    });

    client.on('disconnected', (reason: string) => {
      isReady = false;
      console.warn('[WhatsApp] Отключено:', reason);
    });

    client.initialize().catch((err) => {
      initPromise = null; // сброс для повторной попытки
      reject(err);
    });
  });

  return initPromise;
}

export async function sendMessage(phone: string, text: string): Promise<boolean> {
  if (!client || !isReady) {
    try {
      await initClient();
    } catch (err) {
      console.error('[WhatsApp] Не удалось инициализировать клиент:', err);
      return false;
    }
  }

  if (!client) return false;

  try {
    const chatId = formatPhoneForWhatsApp(phone);
    console.log('[WhatsApp] Отправка на', chatId);
    await client.sendMessage(chatId, text);
    console.log('[WhatsApp] Сообщение отправлено');
    return true;
  } catch (err) {
    console.error('[WhatsApp] Ошибка отправки:', err);
    return false;
  }
}

export function isClientReady(): boolean {
  return isReady && client !== null;
}

/**
 * Запускает инициализацию клиента при старте.
 * QR-код появится в консоли или в .wwebjs_auth/qr.png
 */
export function startClient(): Promise<void> {
  return initClient();
}
