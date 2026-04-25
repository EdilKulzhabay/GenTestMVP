import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ErrorBreakdown } from '../../components/ErrorBreakdown';
import { getLastResult } from '../../utils/session';

interface ResultLocationState {
  roadmapSubjectId?: string;
  roadmapNodeId?: string;
  roadmapNodeTitle?: string;
}

export const TestResultPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const result = getLastResult();
  const locState = location.state as ResultLocationState | null;

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
  const aiFeedback = result.aiFeedback;

  const roadmapData = result.roadmap;
  const fromRoadmap = Boolean(locState?.roadmapSubjectId);

  const handleGoToNext = () => {
    if (!roadmapData?.nextRecommended || !locState?.roadmapSubjectId) return;
    navigate(`/user/roadmap?subjectId=${locState.roadmapSubjectId}`);
  };

  return (
    <div className="space-y-6">
      <div className="card space-y-2">
        <h1 className="section-title">Результат теста</h1>
        <p className="text-sm text-slate-600">
          Правильных ответов: {result.result.correctAnswers} из {result.result.totalQuestions}
        </p>
        <p className={`text-lg font-semibold ${scoreColor}`}>{pct}%</p>
        {result.solo && (
          <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-slate-700">
            <p>
              Solo score: <span className="font-semibold text-indigo-700">{result.solo.finalScore}</span>
            </p>
            <p>
              Попытка: <span className="font-medium">{result.solo.attemptType === 'ranked' ? 'рейтинговая' : 'practice'}</span>
              {result.solo.rank ? ` · место #${result.solo.rank}` : ''}
            </p>
          </div>
        )}
      </div>

      {roadmapData && (
        <div className="card space-y-3 border-blue-100 bg-blue-50/60">
          <h2 className="text-sm font-semibold text-blue-800">Обновление карты знаний</h2>
          {roadmapData.updatedNodesDelta.map((d) => {
            const title = locState?.roadmapNodeTitle
              || roadmapData.topRecommendations.find((r) => r.nodeId === d.nodeId)?.title
              || d.nodeId;
            return (
              <p key={d.nodeId} className="text-sm text-slate-700">
                <span className="font-medium">{title}</span>:{' '}
                {d.mastered ? (
                  <span className="font-semibold text-emerald-600">Освоено!</span>
                ) : (
                  <span className="text-amber-600">Продолжайте обучение</span>
                )}
              </p>
            );
          })}
          {roadmapData.nextRecommended && (
            <div className="mt-2 rounded-lg border border-blue-100 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                Следующий рекомендованный шаг
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {roadmapData.topRecommendations.find(
                  (r) => r.nodeId === roadmapData.nextRecommended?.nodeId
                )?.title || roadmapData.nextRecommended.nodeId}
              </p>
              {roadmapData.nextRecommended.reason && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {roadmapData.nextRecommended.reason}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {aiFeedback ? (
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Разбор ошибок</h2>
          <ErrorBreakdown mistakes={aiFeedback.mistakes} summary={aiFeedback.summary} />
        </div>
      ) : (
        <></>
        // <div className="card space-y-2">
        //   <h2 className="text-lg font-semibold text-slate-900">Итог Solo</h2>
        //   <p className="text-sm text-slate-600">
        //     Для режима Solo показывается результат и рейтинг без AI-разбора.
        //   </p>
        // </div>
      )}

      <div className="flex flex-wrap gap-3">
        {fromRoadmap && roadmapData?.nextRecommended ? (
          <Button onClick={handleGoToNext}>
            Перейти к карте знаний →
          </Button>
        ) : (
          <Link to="/user/subjects">
            <Button>Новый тест</Button>
          </Link>
        )}
        {fromRoadmap && (
          <Link to="/user/subjects">
            <Button variant="outline">Свободный тест</Button>
          </Link>
        )}
        {!fromRoadmap && (
          <Link to="/user/roadmap">
            <Button variant="outline">Карта знаний</Button>
          </Link>
        )}
      </div>
    </div>
  );
};
