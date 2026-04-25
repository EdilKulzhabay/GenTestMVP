import './env';
import http from 'http';
import app from './app';
import { connectDB } from './config/db';
import { initSocketServer } from './socket';

/**
 * SERVER ENTRY POINT
 * Точка входа в приложение
 *
 * WhatsApp и Telegram боты — отдельные сервисы:
 * - whatsapp-bot: npm run dev (порт 5112)
 * - telegram-bot: npm run dev (порт 5113)
 */

// Получаем порт из переменных окружения
const PORT = process.env.PORT || 5000;

if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://localhost:27017/edu-ai-test-platform';
  console.warn('⚠️  MONGODB_URI не задан, использую dev значение по умолчанию');
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'dev_jwt_secret_change_me';
  console.warn('⚠️  JWT_SECRET не задан, использую dev значение по умолчанию');
}

/**
 * Запуск сервера
 */
const startServer = async (): Promise<void> => {
  try {
    // Подключаемся к MongoDB
    await connectDB();

    const httpServer = http.createServer(app);
    initSocketServer(httpServer);

    // Запускаем сервер
    httpServer.listen(PORT, () => {
      console.log('🚀 ========================================');
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🚀 API URL: http://localhost:${PORT}/api/v1`);
      console.log(`🚀 Socket URL: http://localhost:${PORT}`);
      console.log('🚀 ========================================');
    });

    // Обработка необработанных promise rejections
    process.on('unhandledRejection', (error: Error) => {
      console.error('❌ Unhandled Promise Rejection:', error);
      // Graceful shutdown
      process.exit(1);
    });

    // Обработка необработанных исключений
    process.on('uncaughtException', (error: Error) => {
      console.error('❌ Uncaught Exception:', error);
      // Graceful shutdown
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Запускаем сервер
startServer();
