import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../store/auth.store';
import { Button } from '../ui/Button';

const navItems = [
  { to: '/user', label: 'Дашборд', end: true },
  { to: '/user/subjects', label: 'Начать тест' }
];

export const UserLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-sm font-bold text-white">
              GT
            </div>
            <div className="hidden sm:block">
              <p className="text-[11px] font-medium uppercase tracking-widest text-slate-400">Личный кабинет</p>
              <p className="text-sm font-semibold text-slate-900">{user?.fullName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = item.end
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </NavLink>
              );
            })}
            <Button variant="ghost" onClick={logout} className="ml-2 text-slate-500">
              Выйти
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Outlet />
      </div>
    </div>
  );
};
