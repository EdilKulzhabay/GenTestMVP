import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../store/auth.store';
import { Button } from '../ui/Button';

const navItems = [
  { to: '/admin', label: 'Дашборд', icon: '📊', end: true },
  { to: '/admin/subjects/import', label: 'Импорт', icon: '📥' },
  { to: '/admin/subjects/new', label: 'Предмет', icon: '📚' },
  { to: '/admin/books/new', label: 'Книга', icon: '📖' },
  { to: '/admin/chapters/new', label: 'Глава', icon: '📄' },
  { to: '/admin/contents/new', label: 'Контент', icon: '✏️' }
];

export const AdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              GT
            </div>
            <div className="hidden sm:block">
              <p className="text-[11px] font-medium uppercase tracking-widest text-slate-400">Админ-панель</p>
              <p className="text-sm font-semibold text-slate-900">{user?.fullName}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={logout} className="text-slate-500">
            Выйти
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[240px_1fr] lg:gap-8">
        <aside className="mb-6 lg:mb-0">
          <nav className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Навигация
            </p>
            <div className="flex flex-col gap-0.5">
              {navItems.map((item) => {
                const isActive = item.end
                  ? location.pathname === item.to
                  : location.pathname.startsWith(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </nav>
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-relaxed text-blue-700">
            Добавляйте учебный контент: предметы, книги, главы и параграфы.
            AI будет генерировать тесты на основе этих материалов.
          </div>
        </aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
