import React from 'react';
import { Link, Outlet } from 'react-router-dom';

export const GuestLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/welcome" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-sm font-bold text-white">
              GT
            </div>
            <span className="hidden text-sm font-semibold text-slate-900 sm:inline">Edu AI</span>
          </Link>
          <Link
            to="/login"
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Войти
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-sm text-amber-800">
          <span>⚡</span>
          <span>Гостевой режим — результаты ограничены. <Link to="/login" className="font-medium underline hover:no-underline">Войдите</Link> для полного доступа.</span>
        </div>
        <Outlet />
      </div>
    </div>
  );
};
