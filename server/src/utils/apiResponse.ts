import { Response } from 'express';

/**
 * API Response Helpers
 * Единообразный формат ответов API
 */

export interface ApiErrorItem {
  field?: string;
  message: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: ApiErrorItem[];
  stack?: string;
}

/**
 * Успешный ответ
 */
export function success<T>(res: Response, data?: T, message?: string, statusCode = 200): void {
  const body: ApiResponse<T> = {
    success: true,
    ...(message && { message }),
    ...(data !== undefined && { data })
  };
  res.status(statusCode).json(body);
}

/**
 * Ответ об ошибке (единый формат)
 */
export function error(
  res: Response,
  message: string,
  statusCode = 400,
  errors?: ApiErrorItem[]
): void {
  const body: ApiResponse = {
    success: false,
    message,
    ...(errors && errors.length > 0 && { errors })
  };
  res.status(statusCode).json(body);
}

/**
 * 404 Not Found
 */
export function notFound(res: Response, message = 'Resource not found'): void {
  error(res, message, 404);
}

/**
 * 401 Unauthorized
 */
export function unauthorized(res: Response, message = 'Not authenticated'): void {
  error(res, message, 401);
}
