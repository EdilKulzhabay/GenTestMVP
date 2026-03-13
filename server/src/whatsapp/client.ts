/**
 * WhatsApp Web клиент на базе whatsapp-web.js.
 * Используется для отправки OTP-кодов верификации.
 */

import { Client, LocalAuth } from 'whatsapp-web.js';
import * as path from 'path';
import * as fs from 'fs';

let client: Client | null = null;

/** Пути к Chrome по умолчанию (macOS, Linux, Windows) */
const DEFAULT_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];

function findChromeExecutable(): string | undefined {
  const envPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  return DEFAULT_CHROME_PATHS.find((p) => fs.existsSync(p));
}
let isReady = false;
let initPromise: Promise<void> | null = null;

/**
 * Форматирует номер телефона для WhatsApp API.
 * +79001234567 -> 79001234567@c.us
 */
export function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@c.us`;
}

/**
 * Инициализирует WhatsApp клиент (один раз).
 */
function initClient(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    const dataPath = path.join(process.cwd(), '.wwebjs_auth');
    const chromePath = findChromeExecutable();
    if (!chromePath) {
      reject(
        new Error(
          'Chrome не найден. Установите Google Chrome или выполните: npx puppeteer browsers install chrome'
        )
      );
      return;
    }
    const puppeteerOpts: Record<string, unknown> = {
      headless: true,
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'gentest_otp',
        dataPath
      }),
      puppeteer: puppeteerOpts
    });

    client.on('qr', (qr) => {
      console.log('[WhatsApp] Отсканируйте QR-код в приложении WhatsApp:');
      console.log('[WhatsApp] Настройки → Связанные устройства → Привязать устройство');
      try {
        const qrcode = require('qrcode-terminal');
        qrcode.generate(qr, { small: true });
      } catch {
        console.log('[WhatsApp] Установите qrcode-terminal для отображения QR в консоли');
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

    client.on('auth_failure', (msg) => {
      console.error('[WhatsApp] Ошибка аутентификации:', msg);
      reject(new Error(msg));
    });

    client.on('disconnected', (reason) => {
      isReady = false;
      console.warn('[WhatsApp] Отключено:', reason);
    });

    client.initialize().catch(reject);
  });

  return initPromise;
}

/**
 * Отправляет текстовое сообщение на указанный номер.
 * @param phone Номер в формате +79001234567 или 79001234567
 * @param text Текст сообщения
 * @returns true если отправлено успешно
 */
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
    await client.sendMessage(chatId, text);
    return true;
  } catch (err) {
    console.error('[WhatsApp] Ошибка отправки:', err);
    return false;
  }
}

/**
 * Проверяет, готов ли клиент к отправке.
 */
export function isClientReady(): boolean {
  return isReady && client !== null;
}

/**
 * Запускает инициализацию клиента при старте сервера.
 * Вызывать опционально — клиент инициализируется при первой отправке.
 */
export async function startWhatsAppClient(): Promise<void> {
  const enabled = process.env.WHATSAPP_ENABLED !== 'false';
  if (!enabled) {
    console.log('[WhatsApp] Отключён (WHATSAPP_ENABLED=false)');
    return;
  }
  try {
    // await initClient();
  } catch (err) {
    console.warn('[WhatsApp] Предзагрузка не удалась, клиент инициализируется при первой отправке:', err);
  }
}
