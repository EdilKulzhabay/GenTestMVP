import { Router, Request } from 'express';
import passport from 'passport';
import { body } from 'express-validator';
import { authController } from '../controllers';
import { authenticate, asyncHandler, validate } from '../middlewares';
import { API_BASE_PATH } from '../config/constants';

const router = Router();

function getRequestOrigin(req: Request): string {
  const proto =
    (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'https';
  const host =
    (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
    req.get('host') ||
    'localhost';
  return `${proto}://${host}`;
}

function isAllowedOAuthOrigin(origin: string): boolean {
  if (!origin) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const normalized = `${parsed.protocol}//${parsed.host}`;

  const exact = new Set<string>();
  const wildcardSuffixes: string[] = []; // ".onrender.com" — с ведущей точкой

  const pushAllowed = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    // Wildcard форма: `*.example.com` или `https://*.example.com`
    const wildcardMatch = trimmed.match(/^(?:https?:\/\/)?\*\.(.+)$/);
    if (wildcardMatch) {
      const domain = wildcardMatch[1].replace(/\/$/, '').toLowerCase();
      if (domain) wildcardSuffixes.push(`.${domain}`);
      return;
    }
    try {
      const u = new URL(trimmed);
      exact.add(`${u.protocol}//${u.host}`);
    } catch {
      /* ignore */
    }
  };

  if (process.env.FRONTEND_URL) pushAllowed(process.env.FRONTEND_URL);
  for (const item of (process.env.OAUTH_ALLOWED_ORIGINS || '').split(',')) {
    pushAllowed(item);
  }

  if (exact.has(normalized)) return true;

  if (parsed.protocol === 'https:') {
    const hostname = parsed.hostname.toLowerCase();
    for (const suffix of wildcardSuffixes) {
      // hostname.length > suffix.length гарантирует, что есть хотя бы 1 символ
      // поддомена перед суффиксом — корневой домен (`onrender.com` для `.onrender.com`)
      // не матчится. Ведущая точка в суффиксе защищает от `evil-onrender.com`.
      if (hostname.length > suffix.length && hostname.endsWith(suffix)) {
        return true;
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const h = parsed.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  }
  return false;
}

/**
 * POST /auth/request-otp — отправка кода на телефон (WhatsApp → Telegram)
 */
router.post(
  '/request-otp',
  [body('phone').trim().isLength({ min: 10 }).withMessage('Введите номер телефона')],
  validate,
  asyncHandler(authController.requestOtp.bind(authController))
);

/**
 * POST /auth/verify-phone — шаг 2: подтверждение кода
 */
router.post(
  '/verify-phone',
  [
    body('phone').trim().isLength({ min: 10 }).withMessage('Phone number is required'),
    body('code').trim().isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'),
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
      .withMessage('Password must be at least 6 characters long'),
  ],
  validate,
  asyncHandler(authController.createAdmin.bind(authController))
);

/**
 * POST /auth/login/admin — только администраторы (отдельная форма)
 */
router.post(
  '/login/admin',
  [
    body('userName').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  asyncHandler(authController.loginAdmin.bind(authController))
);

/**
 * POST /auth/login
 */
router.post(
  '/login',
  [
    body('userName').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  asyncHandler(authController.login.bind(authController))
);

/**
 * GET /auth/google — Google OAuth (если настроен)
 *
 * ?redirect_origin=http://localhost:5173  — клиент передаёт свой origin,
 * чтобы после авторизации редирект шёл именно туда (а не на хост сервера).
 * callbackURL для Google всегда строится по хосту сервера.
 */
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    res.status(501).json({ success: false, message: 'Google OAuth not configured' });
    return;
  }
  const serverOrigin = getRequestOrigin(req);
  const callbackURL = `${serverOrigin}${API_BASE_PATH}/auth/google/callback`;

  const frontendOrigin = (req.query.redirect_origin as string) || serverOrigin;
  const state = Buffer.from(JSON.stringify({ frontendOrigin })).toString('base64url');

  return (passport.authenticate as Function)('google', {
    scope: ['profile', 'email'],
    callbackURL,
    state,
  })(req, res, next);
});

/**
 * GET /auth/google/callback
 */
router.get('/google/callback', (req, res, next) => {
  let frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
  try {
    const stateRaw = req.query.state as string;
    if (stateRaw) {
      const parsed = JSON.parse(Buffer.from(stateRaw, 'base64url').toString());
      if (parsed.frontendOrigin && isAllowedOAuthOrigin(parsed.frontendOrigin)) {
        frontendOrigin = parsed.frontendOrigin;
      }
    }
  } catch {
    /* fallback to FRONTEND_URL */
  }

  const callbackURL = `${getRequestOrigin(req)}${API_BASE_PATH}/auth/google/callback`;

  (passport.authenticate as Function)(
    'google',
    { session: false, callbackURL },
    (err: Error, user: any) => {
      if (err) return next(err);
      if (!user) {
        res.redirect(`${frontendOrigin}/login?error=google_auth_failed`);
        return;
      }
      (req as any).user = user;
      (req as any)._oauthFrontendOrigin = frontendOrigin;
      authController.googleCallback(req, res);
    }
  )(req, res, next);
});

/**
 * GET /auth/me
 */
router.get('/me', authenticate, asyncHandler(authController.getMe.bind(authController)));

export default router;
