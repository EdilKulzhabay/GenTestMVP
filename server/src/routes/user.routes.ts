import { Router } from 'express';
import mongoose from 'mongoose';
import { body, param, query } from 'express-validator';
import { userController } from '../controllers';
import { authenticate, asyncHandler, validate } from '../middlewares';

/**
 * USER ROUTES
 * Маршруты для работы с пользователями
 */

const router = Router();

// Все маршруты требуют аутентификации
router.use(authenticate);

/**
 * @route   GET /users/me
 * @desc    Получить информацию о текущем пользователе
 * @access  Private
 */
router.get(
  '/me',
  asyncHandler(userController.getCurrentUser.bind(userController))
);

router.put(
  '/me/profile-subjects',
  [
    body('subjectIds')
      .custom((v) => {
        if (v === null) return true;
        if (Array.isArray(v) && v.length === 0) return true;
        if (Array.isArray(v) && v.length === 2) return v.every((id) => typeof id === 'string' && mongoose.isValidObjectId(id));
        return false;
      })
      .withMessage('subjectIds: null, [] (сброс) или [mongoId, mongoId]')
  ],
  validate,
  asyncHandler(userController.putProfileSubjects.bind(userController))
);

router.patch(
  '/me/profile-subject-pair',
  asyncHandler(userController.setProfileSubjectPair.bind(userController))
);

/**
 * @route   GET /users/me/tests
 * @desc    Получить историю тестов текущего пользователя
 * @access  Private
 */
router.get(
  '/me/tests',
  [
    query('subjectId')
      .optional()
      .isMongoId()
      .withMessage('Invalid subject ID'),
    query('limit')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Limit must be a positive integer'),
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'scorePercent'])
      .withMessage('sortBy must be either "createdAt" or "scorePercent"'),
    query('order')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('order must be either "asc" or "desc"')
  ],
  validate,
  asyncHandler(userController.getTestHistory.bind(userController))
);

/**
 * @route   GET /users/me/stats
 * @desc    Получить статистику пользователя
 * @access  Private
 */
router.get(
  '/me/stats',
  asyncHandler(userController.getUserStats.bind(userController))
);

/**
 * @route   GET /users/me/tests/:testHistoryId
 * @desc    Получить детальную информацию о конкретном тесте из истории
 * @access  Private
 */
router.get(
  '/me/tests/:testHistoryId',
  [
    param('testHistoryId')
      .isMongoId()
      .withMessage('Invalid test history ID')
  ],
  validate,
  asyncHandler(userController.getTestHistoryDetails.bind(userController))
);

export default router;
