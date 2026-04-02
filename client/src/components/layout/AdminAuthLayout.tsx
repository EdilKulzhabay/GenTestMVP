import React from 'react';
import { Outlet, Link } from 'react-router-dom';

export const AdminAuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900">
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <Link to="/welcome" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-700 text-sm font-bold text-white">
                GT
              </div>
            </Link>
            <h1 className="mt-4 text-xl font-semibold text-white">Панель администратора</h1>
            <p className="mt-1 text-sm text-slate-400">Вход по логину и паролю</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 shadow-lg backdrop-blur-sm">
            <Outlet />
          </div>
          <p className="text-center text-xs text-slate-500">
            <Link to="/welcome" className="hover:text-slate-300">
              ← На главную
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
