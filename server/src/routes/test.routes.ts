import { Router } from 'express';
import { body, param } from 'express-validator';
import { testController } from '../controllers';
import { authenticate, asyncHandler, validate } from '../middlewares';

/**
 * TEST ROUTES
 * Маршруты для работы с тестами
 */

const router = Router();

/**
 * Гостевые маршруты (без аутентификации)
 */
router.post(
  '/generate-guest',
  [
    body('subjectId')
      .isMongoId()
      .withMessage('Invalid subject ID'),
    body('bookId')
      .isMongoId()
      .withMessage('Invalid book ID'),
    body('chapterId')
      .optional()
      .isMongoId()
      .withMessage('Invalid chapter ID'),
    body('fullBook')
      .optional()
      .isBoolean()
      .withMessage('fullBook must be a boolean')
  ],
  validate,
  asyncHandler(testController.generateTestGuest.bind(testController))
);

router.post(
  '/submit-guest',
  [
    body('testId')
      .isMongoId()
      .withMessage('Invalid test ID'),
    body('answers')
      .isArray({ min: 1 })
      .withMessage('Answers must be a non-empty array'),
    body('answers.*.questionText')
      .trim()
      .notEmpty()
      .withMessage('Each answer must have a question text'),
    body('answers.*.selectedOption')
      .trim()
      .notEmpty()
      .withMessage('Each answer must have a selected option')
  ],
  validate,
  asyncHandler(testController.submitTestGuest.bind(testController))
);

// Защищённые маршруты
router.use(authenticate);

/**
 * @route   POST /tests/claim-guest
 * @desc    Привязать гостевой тест к авторизованному пользователю
 * @access  Private (authenticated users)
 */
router.post(
  '/claim-guest',
  [
    body('testId')
      .isMongoId()
      .withMessage('Invalid test ID'),
    body('answers')
      .isArray({ min: 1 })
      .withMessage('Answers must be a non-empty array'),
    body('answers.*.questionText')
      .trim()
      .notEmpty()
      .withMessage('Each answer must have a question text'),
    body('answers.*.selectedOption')
      .trim()
      .notEmpty()
      .withMessage('Each answer must have a selected option')
  ],
  validate,
  asyncHandler(testController.claimGuestTest.bind(testController))
);

/**
 * @route   POST /tests/generate
 * @desc    Генерация теста на основе контента
 * @access  Private (authenticated users)
 */
router.post(
  '/generate',
  [
    body('subjectId')
      .isMongoId()
      .withMessage('Invalid subject ID'),
    body('bookId')
      .isMongoId()
      .withMessage('Invalid book ID'),
    body('chapterId')
      .optional()
      .isMongoId()
      .withMessage('Invalid chapter ID'),
    body('fullBook')
      .optional()
      .isBoolean()
      .withMessage('fullBook must be a boolean')
  ],
  validate,
  asyncHandler(testController.generateTest.bind(testController))
);

/**
 * @route   POST /tests/submit
 * @desc    Отправка ответов на тест
 * @access  Private (authenticated users)
 */
router.post(
  '/submit',
  [
    body('testId')
      .isMongoId()
      .withMessage('Invalid test ID'),
    body('answers')
      .isArray({ min: 1 })
      .withMessage('Answers must be a non-empty array'),
    body('answers.*.questionText')
      .trim()
      .notEmpty()
      .withMessage('Each answer must have a question text'),
    body('answers.*.selectedOption')
      .trim()
      .notEmpty()
      .withMessage('Each answer must have a selected option')
  ],
  validate,
  asyncHandler(testController.submitTest.bind(testController))
);

/**
 * @route   GET /tests/:id
 * @desc    Получить тест по ID (без правильных ответов)
 * @access  Private (authenticated users)
 */
router.get(
  '/:id',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid test ID')
  ],
  validate,
  asyncHandler(testController.getTestById.bind(testController))
);

export default router;
