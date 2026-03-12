import { Router } from 'express';
import authRoutes from './auth.routes';
import subjectRoutes from './subject.routes';
import testRoutes from './test.routes';
import userRoutes from './user.routes';
import telegramRoutes from './telegram.routes';
import { ROUTES } from '../config/constants';
import { success } from '../utils';

/**
 * ROUTES INDEX
 * Центральный роутер для всех API маршрутов
 */

const router = Router();

router.use('/webhooks', telegramRoutes);
router.use(ROUTES.AUTH, authRoutes);
router.use(ROUTES.SUBJECTS, subjectRoutes);
router.use(ROUTES.TESTS, testRoutes);
router.use(ROUTES.USERS, userRoutes);

router.get(ROUTES.HEALTH, (_req, res) => {
  success(res, { timestamp: new Date().toISOString() }, 'API is running');
});

export default router;
