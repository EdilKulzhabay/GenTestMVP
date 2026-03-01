/**
 * Типизированная ошибка приложения.
 * Бросай в контроллерах/сервисах — asyncHandler прокинет в errorHandler.
 */
export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(msg: string): AppError {
    return new AppError(msg, 400);
  }
  static unauthorized(msg: string): AppError {
    return new AppError(msg, 401);
  }
  static notFound(msg: string): AppError {
    return new AppError(msg, 404);
  }
  static internal(msg: string): AppError {
    return new AppError(msg, 500);
  }
}
