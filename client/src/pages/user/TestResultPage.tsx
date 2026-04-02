import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ErrorBreakdown } from '../../components/ErrorBreakdown';
import { getLastResult } from '../../utils/session';

export const TestResultPage: React.FC = () => {
  const result = getLastResult();

  if (!result) {
    return (
      <div className="card space-y-3">
        <p className="text-sm text-slate-600">Нет данных по последнему тесту.</p>
        <Link to="/user/subjects">
          <Button>Создать тест</Button>
        </Link>
      </div>
    );
  }

  const pct = result.result.scorePercent;
  const scoreColor =
    pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      <div className="card space-y-2">
        <h1 className="section-title">Результат теста</h1>
        <p className="text-sm text-slate-600">
          Правильных ответов: {result.result.correctAnswers} из {result.result.totalQuestions}
        </p>
        <p className={`text-lg font-semibold ${scoreColor}`}>{pct}%</p>
      </div>

      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Разбор ошибок</h2>
        <ErrorBreakdown mistakes={result.aiFeedback.mistakes} summary={result.aiFeedback.summary} />
      </div>

      <Link to="/user/subjects">
        <Button className="w-full sm:w-auto">Новый тест</Button>
      </Link>
    </div>
  );
};
