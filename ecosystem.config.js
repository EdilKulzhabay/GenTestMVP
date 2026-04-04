/**
 * PM2 Ecosystem — все сервисы Edu AI
 * Запуск из корня: pm2 start ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      name: 'edu-ai-api',
      cwd: './server',
      script: './dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: { NODE_ENV: 'production', PORT: 5111 },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
      max_memory_restart: '1G',
      autorestart: true
    },
    {
      name: 'whatsapp-bot',
      cwd: './whatsapp-bot',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: { NODE_ENV: 'production', WHATSAPP_BOT_PORT: 5112 },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
      max_memory_restart: '1G',
      autorestart: true
    },
    {
      name: 'telegram-bot',
      cwd: './telegram-bot',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: { NODE_ENV: 'production', TELEGRAM_BOT_PORT: 5113 },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
      max_memory_restart: '512M',
      autorestart: true
    }
  ]
};
