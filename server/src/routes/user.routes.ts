import { Router } from 'express';
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
 * @desc    Профиль текущего пользователя (без testHistory)
 * @access  Private
 */
router.get(
  '/me',
  asyncHandler(userController.getCurrentUser.bind(userController))
);

/**
 * @route   PATCH /users/me
 * @desc    Редактирование профиля (имя, аватарка)
 * @access  Private
 */
router.patch(
  '/me',
  [
    body('fullName')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('fullName must be between 2 and 100 characters'),
    body('avatarUrl')
      .optional({ nullable: true })
      .isString()
      .withMessage('avatarUrl must be a string or null')
  ],
  validate,
  asyncHandler(userController.updateProfile.bind(userController))
);

router.patch(
  '/me/profile-subject-pair',
  asyncHandler(userController.setProfileSubjectPair.bind(userController))
);

/**
 * @route   GET /users/me/tests
 * @desc    История тестов текущего пользователя
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
 * @desc    Агрегаты по истории тестов
 * @access  Private
 */
router.get(
  '/me/stats',
  asyncHandler(userController.getUserStats.bind(userController))
);

/**
 * @route   GET /users/me/profile-stats
 * @desc    Карточки профиля: стрик, изучено тем, выбрано предметов
 * @access  Private
 */
router.get(
  '/me/profile-stats',
  asyncHandler(userController.getProfileStats.bind(userController))
);

/**
 * @route   GET /users/me/ent-progress
 * @desc    Прогноз балла ЕНТ (шкала 140) по накопленным результатам
 * @access  Private
 */
router.get(
  '/me/ent-progress',
  asyncHandler(userController.getEntProgress.bind(userController))
);

// Валидатор id записи истории — общий для всех под-роутов
const testHistoryIdValidator = [
  param('testHistoryId').isMongoId().withMessage('Invalid test history ID')
];

/**
 * @route   GET /users/me/tests/:testHistoryId/breakdown
 * @desc    По-вопросный разбор + темы для повторения
 * @access  Private
 */
router.get(
  '/me/tests/:testHistoryId/breakdown',
  testHistoryIdValidator,
  validate,
  asyncHandler(userController.getTestBreakdown.bind(userController))
);

/**
 * @route   GET /users/me/tests/:testHistoryId/ai-explanation
 * @desc    AI-объяснение (ленивая генерация + кэш)
 * @access  Private
 */
router.get(
  '/me/tests/:testHistoryId/ai-explanation',
  testHistoryIdValidator,
  validate,
  asyncHandler(userController.getTestAiExplanation.bind(userController))
);

/**
 * @route   GET /users/me/tests/:testHistoryId/result
 * @desc    Лёгкая сводка результата
 * @access  Private
 */
router.get(
  '/me/tests/:testHistoryId/result',
  testHistoryIdValidator,
  validate,
  asyncHandler(userController.getTestResult.bind(userController))
);

/**
 * @route   GET /users/me/tests/:testHistoryId
 * @desc    Лёгкая сводка результата (алиас /result, обратная совместимость)
 * @access  Private
 */
router.get(
  '/me/tests/:testHistoryId',
  testHistoryIdValidator,
  validate,
  asyncHandler(userController.getTestResult.bind(userController))
);

export default router;
