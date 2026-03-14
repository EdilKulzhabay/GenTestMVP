import { Router } from 'express';
import passport from 'passport';
import { body } from 'express-validator';
import { authController } from '../controllers';
import { authenticate, asyncHandler, validate } from '../middlewares';

const router = Router();

/**
 * POST /auth/request-otp — отправка кода на телефон (WhatsApp → Telegram)
 */
router.post(
  '/request-otp',
  [
    body('phone')
      .trim()
      .isLength({ min: 10 })
      .withMessage('Введите номер телефона')
  ],
  validate,
  asyncHandler(authController.requestOtp.bind(authController))
);

/**
 * POST /auth/verify-phone — шаг 2: подтверждение кода
 */
router.post(
  '/verify-phone',
  [
    body('phone')
      .trim()
      .isLength({ min: 10 })
      .withMessage('Phone number is required'),
    body('code')
      .trim()
      .isLength({ min: 6, max: 6 })
      .withMessage('Code must be 6 digits')
  ],
  validate,
  asyncHandler(authController.verifyPhone.bind(authController))
);

/**
 * POST /auth/create-admin
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
 * POST /auth/login
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
 * GET /auth/google — Google OAuth (если настроен)
 */
router.get(
  '/google',
  (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      res.status(501).json({ success: false, message: 'Google OAuth not configured' });
      return;
    }
    return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  }
);

/**
 * GET /auth/google/callback
 */
router.get(
  '/google/callback',
  (req, res, next) => {
    passport.authenticate('google', { session: false }, (err: Error, user: any) => {
      if (err) return next(err);
      if (!user) {
        res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=google_auth_failed`
        );
        return;
      }
      (req as any).user = user;
      authController.googleCallback(req, res);
    })(req, res, next);
  }
);

/**
 * GET /auth/me
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(authController.getMe.bind(authController))
);

export default router;
