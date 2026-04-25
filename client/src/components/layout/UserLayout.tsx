import React, { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../store/auth.store';
import { getPendingTrialMerge, clearPendingTrialMerge } from '../../utils/trialSession';
import { trialApi } from '../../api/trial.api';
import { Button } from '../ui/Button';
import { ProfilePairRequiredModal } from '../ProfilePairRequiredModal';
import { learnerHasProfilePair } from '../../utils/learnerSubjects.util';

const navItems = [
  { to: '/user', label: 'Дашборд', end: true },
  { to: '/user/roadmap', label: 'Карта знаний' },
  { to: '/user/roadmap/chat', label: 'Чат' },
  { to: '/user/trial', label: 'Пробник' },
  { to: '/user/subjects', label: 'Начать тест' }
];

export const UserLayout: React.FC = () => {
  const { user, logout, isLoading, refresh } = useAuth();
  const location = useLocation();
  const trialMergeDone = useRef(false);
  const mustPickPair = Boolean(
    !isLoading && user?.role === 'user' && !learnerHasProfilePair(user)
  );

  useEffect(() => {
    trialMergeDone.current = false;
  }, [user?.id]);

  useEffect(() => {
    if (isLoading || user?.role !== 'user' || trialMergeDone.current) return;
    const pending = getPendingTrialMerge();
    if (!pending?.results?.length) return;
    trialMergeDone.current = true;
    void (async () => {
      try {
        await trialApi.mergePendingIfAny(pending);
        clearPendingTrialMerge();
        await refresh();
      } catch {
        trialMergeDone.current = false;
      }
    })();
  }, [isLoading, user?.role, user?.id, refresh]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header
        className={`sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur ${
          mustPickPair ? 'pointer-events-none opacity-50' : ''
        }`}
      >
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
              const isActive =
                item.to === '/user/roadmap'
                  ? location.pathname === '/user/roadmap'
                  : item.end
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
      <div
        className={`mx-auto max-w-5xl px-4 py-6 sm:px-6 ${
          mustPickPair ? 'pointer-events-none select-none opacity-40' : ''
        }`}
      >
        <Outlet />
      </div>
      {mustPickPair && (
        <ProfilePairRequiredModal
          onComplete={() => {
            void refresh();
          }}
        />
      )}
    </div>
  );
};
