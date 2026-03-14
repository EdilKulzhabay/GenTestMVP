/**
 * WhatsApp Bot — standalone сервис для отправки OTP.
 * API: POST /send { phone, text }
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
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

/** GET /qr — отдать QR-код для аутентификации (для сервера без TTY) */
app.get('/qr', (req: Request, res: Response) => {
  const qrPath = path.join(process.cwd(), '.wwebjs_auth', 'qr.png');
  if (!fs.existsSync(qrPath)) {
    res.status(404).json({
      ok: false,
      message: 'QR ещё не сгенерирован. Подождите 10–20 сек и обновите страницу.',
      path: qrPath
    });
    return;
  }
  res.type('png').sendFile(qrPath);
});

/** GET /qr-page — HTML-страница с QR и автообновлением */
app.get('/qr-page', (req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>WhatsApp QR</title>
<style>body{font-family:sans-serif;max-width:400px;margin:40px auto;text-align:center;padding:20px}
img{max-width:100%;border:1px solid #ddd;border-radius:8px}
p{color:#666;font-size:14px}
.refresh{color:#25D366;font-size:12px}</style></head>
<body>
<h2>WhatsApp — аутентификация</h2>
<p>Откройте WhatsApp на телефоне → Настройки → Связанные устройства → Привязать устройство</p>
<p>Отсканируйте QR-код в приложении</p>
<div id="qr"></div>
<p class="refresh" id="status">Загрузка...</p>
<script>
function load(){
  fetch('/qr').then(r=>{
    if(r.ok)return r.blob();
    throw new Error('QR ещё не готов');
  }).then(blob=>{
    document.getElementById('qr').innerHTML='<img src="'+URL.createObjectURL(blob)+'" alt="QR">';
    document.getElementById('status').textContent='QR-код отображается. Отсканируйте в WhatsApp.';
  }).catch(()=>{
    document.getElementById('qr').innerHTML='';
    document.getElementById('status').textContent='QR генерируется... Обновление через 5 сек';
    setTimeout(load,5000);
  });
}
load();
</script></body></html>`;
  res.type('html').send(html);
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
    console.log(`   GET  http://localhost:${PORT}/qr-page — QR-код для аутентификации (откройте в браузере)`);
    console.log('');
    // Инициализация WhatsApp — с повтором при auth timeout
    async function initWithRetry(attempt = 1): Promise<void> {
      try {
        await startClient();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[WhatsApp Bot] Предзагрузка не удалась (попытка ${attempt}):`, msg);
        if (msg.includes('auth timeout') && attempt < 5) {
          console.log(`[WhatsApp Bot] Повтор через 30 сек...`);
          setTimeout(() => initWithRetry(attempt + 1), 30000);
        }
      }
    }
    void initWithRetry();
  });
}
