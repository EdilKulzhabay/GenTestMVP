import React from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  `rounded-lg px-4 py-1.5 text-sm font-medium transition ${
    isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-900'
  }`;

export const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <Link to="/welcome" className="inline-flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
                GT
              </div>
            </Link>
            <h1 className="mt-4 text-xl font-semibold text-slate-900">Добро пожаловать</h1>
            <p className="mt-1 text-sm text-slate-500">Войдите или создайте аккаунт</p>
          </div>
          <div className="flex items-center justify-center gap-1 rounded-xl bg-slate-100 p-1">
            <NavLink to="/login" className={linkClass}>
              Вход
            </NavLink>
            <NavLink to="/register" className={linkClass}>
              Регистрация
            </NavLink>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <Outlet />
          </div>
          <p className="text-center text-xs text-slate-400">
            <Link to="/guest/subjects" className="hover:text-slate-600">
              Или попробуйте как гость →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
