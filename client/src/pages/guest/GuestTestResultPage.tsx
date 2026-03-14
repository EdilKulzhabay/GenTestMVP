import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { getLastResult, setPendingResultReturn } from '../../utils/session';

/**
 * Тизер результата для гостя.
 * Показывает счёт и краткий summary, объясняет что полный результат — после входа.
 * Сохраняет returnUrl для возврата после авторизации.
 */
export const GuestTestResultPage: React.FC = () => {
  const navigate = useNavigate();
  const result = getLastResult();

  const handleAuthClick = (path: string) => {
    setPendingResultReturn('/user/test/result');
    navigate(path, { state: { returnUrl: '/user/test/result' } });
  };

  if (!result) {
    return (
      <div className="card space-y-3">
        <p className="text-sm text-slate-600">Нет данных по последнему тесту.</p>
        <Link to="/guest/subjects">
          <Button>Попробовать тест</Button>
        </Link>
      </div>
    );
  }

  const summaryTeaser =
    result.aiFeedback.summary.length > 150
      ? result.aiFeedback.summary.slice(0, 150) + '…'
      : result.aiFeedback.summary;

  return (
    <div className="space-y-6">
      <div className="card space-y-2">
        <h1 className="section-title">Результат теста</h1>
        <p className="text-sm text-slate-600">
          Правильных ответов: {result.result.correctAnswers} из {result.result.totalQuestions}
        </p>
        <p className="text-2xl font-bold text-blue-600">{result.result.scorePercent}%</p>
      </div>

      <div className="card space-y-3 border-amber-200 bg-amber-50/50">
        <h2 className="text-lg font-semibold text-slate-900">Краткий обзор</h2>
        <p className="text-sm text-slate-600">{summaryTeaser}</p>
        <p className="text-sm font-medium text-amber-800">
          Полный результат с разбором ошибок, объяснениями и ссылками на места в книге доступен
          после входа.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">Войдите, чтобы увидеть:</p>
        <ul className="list-inside list-disc text-sm text-slate-600">
          <li>Подробный разбор каждой ошибки</li>
          <li>Рекомендации, что перечитать</li>
          <li>Историю всех тестов</li>
        </ul>
        <Button onClick={() => handleAuthClick('/login')} className="w-full">
          Войти
        </Button>
      </div>

      <Link to="/guest/subjects">
        <Button variant="ghost" className="w-full">
          Пройти ещё один тест как гость
        </Button>
      </Link>
    </div>
  );
};
