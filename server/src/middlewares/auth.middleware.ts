import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { IJWTPayload, UserRole } from '../types';
import { User } from '../models';

/**
 * AUTH MIDDLEWARE
 * Middleware для проверки JWT токена и авторизации
 * 
 * Использование:
 * - authenticate: проверяет наличие валидного токена
 * - authorize: проверяет роль пользователя
 */


/**
 * Middleware для аутентификации пользователя
 * Проверяет JWT токен в заголовке Authorization
 * Добавляет информацию о пользователе в req.user
 */
/**
 * Если есть валидный JWT — заполняет req.user; иначе просто next (без 401).
 */
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const cookieToken = req.cookies?.token;
    const authHeader = req.headers.authorization;
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const token = cookieToken || headerToken;
    if (!token) {
      next();
      return;
    }
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      next();
      return;
    }
    const decoded = jwt.verify(token, jwtSecret) as IJWTPayload;
    const user = await User.findById(decoded.userId);
    if (user) {
      (req as any).user = { userId: decoded.userId, role: decoded.role };
    }
  } catch {
    // гость или просроченный токен
  }
  next();
};

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Получаем токен из cookie или заголовка
    const cookieToken = req.cookies?.token;
    const authHeader = req.headers.authorization;
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const token = cookieToken || headerToken;

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a valid token.'
      });
      return;
    }

    // Проверяем JWT секрет
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined');
    }

    // Верифицируем токен
    const decoded = jwt.verify(token, jwtSecret) as IJWTPayload;

    // Проверяем существование пользователя
    const user = await User.findById(decoded.userId);
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not found. Token is invalid.'
      });
      return;
    }

    // Добавляем информацию о пользователе в request
    req.user = {
      userId: decoded.userId,
      role: decoded.role
    };

    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
      return;
    }

    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Authentication error.',
      error: error.message
    });
  }
};

/**
 * Middleware для авторизации по ролям
 * Проверяет, имеет ли пользователь необходимую роль
 * 
 * @param roles - массив разрешенных ролей
 */
export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
      return;
    }

    if (!roles.includes((req as any).user.role)) {
      res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${roles.join(', ')}`
      });
      return;
    }

    next();
  };
};

/**
 * Middleware для проверки, является ли пользователь администратором
 */
export const isAdmin = authorize(UserRole.ADMIN);

/**
 * Middleware для проверки, является ли пользователь обычным пользователем или админом
 */
export const isUser = authorize(UserRole.USER, UserRole.ADMIN);
