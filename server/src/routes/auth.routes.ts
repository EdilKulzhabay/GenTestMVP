import { Router } from 'express';
import { body } from 'express-validator';
import { authController } from '../controllers';
import { authenticate, asyncHandler, validate } from '../middlewares';

/**
 * AUTH ROUTES
 * Маршруты для аутентификации
 */

const router = Router();

/**
 * @route   POST /auth/register
 * @desc    Регистрация нового пользователя
 * @access  Public
 */
router.post(
  '/register',
  [
    body('fullName')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Full name must be between 2 and 100 characters'),
    body('email')
      .trim()
      .isEmail()
      .withMessage('Valid email is required'),
    body('userName')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers and underscores'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long')
  ],
  validate,
  asyncHandler(authController.register.bind(authController))
);

router.post(
  '/verify-email',
  [
    body('email')
      .trim()
      .isEmail()
      .withMessage('Valid email is required'),
    body('code')
      .trim()
      .isLength({ min: 6, max: 6 })
      .withMessage('Code must be 6 digits')
  ],
  validate,
  asyncHandler(authController.verifyEmail.bind(authController))
);

/**
 * @route   POST /auth/create-admin
 * @desc    Создание администратора (без email-верификации)
 * @access  Public (защитить в production через env-секрет)
 */
router.post(
  '/create-admin',
  [
    body('fullName')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Full name must be between 2 and 100 characters'),
    body('userName')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers and underscores'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long')
  ],
  validate,
  asyncHandler(authController.createAdmin.bind(authController))
);

/**
 * @route   POST /auth/login
 * @desc    Вход в систему
 * @access  Public
 */
router.post(
  '/login',
  [
    body('userName')
      .trim()
      .notEmpty()
      .withMessage('Username is required'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],
  validate,
  asyncHandler(authController.login.bind(authController))
);

/**
 * @route   GET /auth/me
 * @desc    Получить информацию о текущем пользователе
 * @access  Private
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(authController.getMe.bind(authController))
);

export default router;
