import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { testApi } from '../../api/test.api';
import { TestHistoryItem } from '../../types/test.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { Button } from '../../components/ui/Button';
import { getApiErrorMessage } from '../../utils/error';
import { useAuth } from '../../store/auth.store';

function scoreColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600 bg-emerald-50';
  if (pct >= 50) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

export const UserDashboard: React.FC = () => {
  const { user } = useAuth();
  const [history, setHistory] = useState<TestHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await testApi.getMyTests();
        setHistory(data);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Здравствуйте, {user?.fullName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Готовы проверить знания? Запустите новый тест.</p>
        <Link to="/user/subjects" className="mt-4 inline-block">
          <Button>Начать тест</Button>
        </Link>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">История тестов</h2>

        {loading && <Loader />}
        {error && <ErrorMessage message={error} />}

        {!loading && !error && history.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-slate-200 px-6 py-10 text-center">
            <p className="text-sm text-slate-500">Пока нет результатов тестов.</p>
            <p className="mt-1 text-xs text-slate-400">Пройдите первый тест — он появится здесь.</p>
          </div>
        )}

        {!loading && !error && history.length > 0 && (
          <div className="grid gap-3">
            {history.map((item) => {
              const subjectTitle =
                typeof item.subjectId === 'object' ? item.subjectId.title : 'Предмет';
              const pct = item.result.scorePercent;
              return (
                <div
                  key={item._id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{subjectTitle}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {new Date(item.createdAt).toLocaleString('ru-RU')}
                      {' · '}
                      {item.result.correctAnswers}/{item.result.totalQuestions} правильных
                    </p>
                  </div>
                  <span className={`rounded-lg px-3 py-1 text-sm font-bold ${scoreColor(pct)}`}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
