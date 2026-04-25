import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { getPendingTrialMerge } from '../../utils/trialSession';

export const GuestTrialCompletePage: React.FC = () => {
  const pending = getPendingTrialMerge();
  const rows = pending?.results ?? [];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="section-title">Пробное тестирование завершено</h1>
      <p className="text-sm leading-relaxed text-slate-600">
        Ниже ваши баллы по блокам. Темы, где в блоке ≥ 80% ответов верны, переносятся на персональную карту
        (отметка «освоено») после входа. Войдите или зарегистрируйтесь — привяжем результаты к аккаунту.
      </p>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Результаты</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">Нет сохранённых баллов.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((r, i) => (
              <li
                key={`${r.nodeId}-${i}`}
                className="flex justify-between gap-2 border-b border-slate-100 pb-2 last:border-0"
              >
                <span className="text-slate-700">
                  <span className="font-medium">{r.subjectTitle}</span>
                  <span className="text-slate-500">
                    {' '}
                    — {r.chapterTitle}
                    {r.topicTitle ? ` · ${r.topicTitle}` : ''}
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-slate-900">{r.scorePercent}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card space-y-3 border-amber-100 bg-amber-50/50">
        <p className="text-sm font-medium text-amber-900">Дальше</p>
        <p className="text-sm text-slate-700">
          Войдите — темы, где в пробнике ≥ 80% заданий по теме пройдены верно, откроют следующие узлы на карте
          знаний.
        </p>
        <Link to="/login">
          <Button className="w-full">Войти</Button>
        </Link>
      </div>

      <Link to="/welcome">
        <Button variant="ghost" className="w-full">
          На главную
        </Button>
      </Link>
    </div>
  );
};
