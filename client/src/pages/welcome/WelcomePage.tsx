import React from 'react';
import { Link, Navigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../store/auth.store';

export const WelcomePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const returnUrl =
    searchParams.get('returnUrl') ||
    (location.state as { returnUrl?: string })?.returnUrl ||
    undefined;
  const { isAuthenticated, isLoading, user } = useAuth();
  const authState = returnUrl ? { returnUrl } : undefined;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/user'} replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-10 text-center">
          <div>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white shadow-lg shadow-blue-600/20">
              GT
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              GenTest
            </h1>
            <p className="mt-3 text-base text-slate-500">
              Тесты по учебникам с AI-анализом ошибок
            </p>
          </div>

          <div className="space-y-3">
            <Link
              to="/guest/subjects"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md"
            >
              Попробовать бесплатно
            </Link>
            <p className="text-xs text-slate-400">Без регистрации — пройдите пробный тест прямо сейчас</p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-4 text-xs text-slate-400">уже есть аккаунт?</span>
            </div>
          </div>

          <div className="flex gap-3">
            <Link
              to="/login"
              state={authState}
              className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:shadow-md"
            >
              Войти
            </Link>
            <Link
              to="/register"
              state={authState}
              className="flex flex-1 items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 hover:shadow-md"
            >
              Регистрация
            </Link>
          </div>

          <p className="text-xs leading-relaxed text-slate-400">
            Регистрация даёт полные результаты, AI-разбор ошибок и историю тестов
          </p>
        </div>
      </div>
    </div>
  );
};
