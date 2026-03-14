/**
 * WhatsApp Bot — standalone сервис для отправки OTP.
 * API: POST /send { phone, text }
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import { sendMessage, isClientReady, startClient } from './client';

const PORT = parseInt(process.env.WHATSAPP_BOT_PORT || '5112', 10);
const API_KEY = process.env.WHATSAPP_BOT_API_KEY;

const app = express();
app.use(express.json());

function checkAuth(req: Request, res: Response, next: () => void): void {
  if (!API_KEY) {
    next();
    return;
  }
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (key !== API_KEY) {
    res.status(401).json({ ok: false, error: 'Invalid API key' });
    return;
  }
  next();
}

app.post('/send', checkAuth, async (req: Request, res: Response) => {
  const { phone, text } = req.body;
  if (!phone || !text) {
    res.status(400).json({ ok: false, error: 'phone and text required' });
    return;
  }
  const ok = await sendMessage(String(phone).trim(), String(text));
  res.json({ ok });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    ready: isClientReady(),
    service: 'whatsapp-bot'
  });
});

const enabled = process.env.WHATSAPP_ENABLED !== 'false';

if (!enabled) {
  console.log('[WhatsApp Bot] Отключён (WHATSAPP_ENABLED=false)');
  app.listen(PORT, () => {
    console.log(`[WhatsApp Bot] Слушает порт ${PORT} (режим отключён — /send вернёт ok: false)`);
  });
} else {
  app.listen(PORT, () => {
    console.log('🚀 WhatsApp Bot запущен');
    console.log(`   Порт: ${PORT}`);
    console.log(`   POST http://localhost:${PORT}/send { phone, text }`);
    console.log(`   GET  http://localhost:${PORT}/health`);
    console.log('');
    // Инициализация WhatsApp — QR появится в консоли или в .wwebjs_auth/qr.png
    startClient().catch((err) => {
      console.warn('[WhatsApp Bot] Предзагрузка не удалась:', err?.message || err);
    });
  });
}
