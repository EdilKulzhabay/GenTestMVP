import express, { Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import swaggerUi from 'swagger-ui-express';
import routes from './routes';
import './config/passport';
import { errorHandler, notFound } from './middlewares';
import { API_BASE_PATH } from './config/constants';
import swaggerSpec from './config/swagger';
import { success } from './utils';

/**
 * EXPRESS APPLICATION SETUP
 * Конфигурация Express приложения
 * 
 * Middleware:
 * - cors: разрешает кросс-доменные запросы
 * - express.json: парсинг JSON в body
 * - express.urlencoded: парсинг URL-encoded данных
 * 
 * Routes:
 * - /api/v1/*: все API эндпоинты
 * 
 * Error handling:
 * - notFound: обработка несуществующих маршрутов (404)
 * - errorHandler: централизованная обработка ошибок
 */

const app: Application = express();

// ==================== MIDDLEWARE ====================

app.use(cors({ origin: true, credentials: true }));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(passport.initialize());

// Request logging (в development режиме)
if (process.env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    console.log(`📨 ${req.method} ${req.path}`);
    next();
  });
}

// ==================== ROUTES ====================

// Root endpoint
app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Educational AI Test Platform API',
    version: '1.0.0',
    documentation: `${API_BASE_PATH}/health`,
    apiDocs: '/api-docs'
  });
});

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Отладка: GET /api/v1/debug — показывает, что запрос доходит до сервера
app.get(`${API_BASE_PATH}/debug`, (req, res) => {
  success(res, {
    path: req.path,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    method: req.method
  }, 'API reachable');
});

// Google OAuth — прямой маршрут (на случай проблем с вложенным роутером)
app.get(`${API_BASE_PATH}/auth/google`, (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    res.status(501).json({ success: false, message: 'Google OAuth not configured' });
    return;
  }
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// API routes
app.use(API_BASE_PATH, routes);

// ==================== ERROR HANDLING ====================

// 404 handler - должен быть перед errorHandler
app.use(notFound);

// Централизованный обработчик ошибок - должен быть последним
app.use(errorHandler);

export default app;
