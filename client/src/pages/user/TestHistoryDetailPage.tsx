import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ErrorBreakdown } from '../../components/ErrorBreakdown';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { testApi } from '../../api/test.api';
import { TestHistoryItem } from '../../types/test.types';
import { getApiErrorMessage } from '../../utils/error';

export const TestHistoryDetailPage: React.FC = () => {
  const { testHistoryId } = useParams<{ testHistoryId: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<TestHistoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!testHistoryId) {
      navigate('/user', { replace: true });
      return;
    }
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await testApi.getTestDetails(testHistoryId);
        setItem(data);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [testHistoryId, navigate]);

  if (loading) return <Loader />;
  if (error) {
    return (
      <div className="space-y-4">
        <ErrorMessage message={error} />
        <Link to="/user">
          <Button variant="outline">На главную</Button>
        </Link>
      </div>
    );
  }
  if (!item) return null;

  const subjectTitle = typeof item.subjectId === 'object' ? item.subjectId.title : 'Предмет';
  const pct = item.result.scorePercent;

  return (
    <div className="space-y-6">
      <Link to="/user" className="text-sm text-slate-500 hover:text-slate-700">
        ← На главную
      </Link>

      <div className="card space-y-2">
        <h1 className="section-title">Результат теста</h1>
        <p className="text-sm text-slate-600">{subjectTitle}</p>
        <p className="text-sm text-slate-500">
          {new Date(item.createdAt).toLocaleString('ru-RU')}
        </p>
        <p className="text-sm text-slate-600">
          Правильных ответов: {item.result.correctAnswers} из {item.result.totalQuestions}
        </p>
        <p
          className={`text-lg font-semibold ${
            pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'
          }`}
        >
          {pct}%
        </p>
      </div>

      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Разбор ошибок</h2>
        <ErrorBreakdown mistakes={item.aiFeedback.mistakes} summary={item.aiFeedback.summary} />
      </div>

      <div className="flex gap-3">
        <Link to="/user/subjects">
          <Button>Новый тест</Button>
        </Link>
        <Link to="/user">
          <Button variant="outline">К истории</Button>
        </Link>
      </div>
    </div>
  );
};
