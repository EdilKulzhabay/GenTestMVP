import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

export interface FeatureUnavailableProps {
  /** Краткое название функции (например: "Полный результат теста") */
  featureName: string;
  /** Объяснение, почему недоступно */
  reason?: string;
  /** Что нужно сделать (по умолчанию: войти или зарегистрироваться) */
  actionHint?: string;
  /** Куда вернуться по кнопке "Назад" */
  backTo?: string;
  /** Текст кнопки "Назад" */
  backLabel?: string;
  /** Показать кнопки входа и регистрации */
  showAuthButtons?: boolean;
  /** returnUrl для редиректа после входа */
  returnUrl?: string;
}

const DEFAULT_REASON = 'Эта функция доступна только авторизованным пользователям.';
const DEFAULT_ACTION = 'Войдите или зарегистрируйтесь, чтобы получить доступ.';

/**
 * Единый паттерн "функция недоступна".
 * Показывает: почему закрыто, что делать, как вернуться.
 */
export const FeatureUnavailable: React.FC<FeatureUnavailableProps> = ({
  featureName,
  reason = DEFAULT_REASON,
  actionHint = DEFAULT_ACTION,
  backTo,
  backLabel = 'Назад',
  showAuthButtons = true,
  returnUrl
}) => {
  const navigate = useNavigate();
  const authState = returnUrl ? { returnUrl } : undefined;

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="card space-y-6">
      <div>
        <h1 className="section-title">{featureName}</h1>
        <p className="mt-2 text-sm text-slate-600">{reason}</p>
        <p className="mt-1 text-sm font-medium text-slate-700">{actionHint}</p>
      </div>

      {showAuthButtons && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            to="/login"
            state={authState}
            className="inline-flex w-full justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 sm:w-auto"
          >
            Войти
          </Link>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={handleBack}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          {backLabel}
        </button>
      </div>
    </div>
  );
};
