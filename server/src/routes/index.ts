import { Router } from 'express';
import authRoutes from './auth.routes';
import subjectRoutes from './subject.routes';
import testRoutes from './test.routes';
import userRoutes from './user.routes';
import roadmapRoutes from './roadmap.routes';
import trialRoutes from './trial.routes';
import profileSubjectPairRoutes from './profileSubjectPair.routes';
import { ROUTES } from '../config/constants';
import { success } from '../utils';

/**
 * ROUTES INDEX
 * Центральный роутер для всех API маршрутов
 * Webhook Telegram — в отдельном сервисе telegram-bot/
 */

const router = Router();

router.use(ROUTES.AUTH, authRoutes);
router.use(ROUTES.SUBJECTS, subjectRoutes);
router.use(ROUTES.TESTS, testRoutes);
router.use(ROUTES.USERS, userRoutes);
router.use(ROUTES.ROADMAPS, roadmapRoutes);
router.use(ROUTES.TRIAL, trialRoutes);
router.use(ROUTES.PROFILE_SUBJECT_PAIRS, profileSubjectPairRoutes);

router.get(ROUTES.HEALTH, (_req, res) => {
  success(res, { timestamp: new Date().toISOString() }, 'API is running');
});

export default router;
