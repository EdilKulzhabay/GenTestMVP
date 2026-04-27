import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { testApi } from '../../api/test.api';
import { roadmapApi } from '../../api/roadmap.api';
import { subjectApi } from '../../api/subject.api';
import { TestHistoryItem } from '../../types/test.types';
import { PersonalRoadmapResponse } from '../../types/roadmap.types';
import { Subject } from '../../types/subject.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { Button } from '../../components/ui/Button';
import { getApiErrorMessage } from '../../utils/error';
import { useAuth } from '../../store/auth.store';
import { saveRoadmapContext } from '../../utils/session';
import { filterSubjectsForLearner } from '../../utils/learnerSubjects.util';

function scoreColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600 bg-emerald-50';
  if (pct >= 50) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

interface ContinueLearningData {
  subjectId: string;
  subjectTitle: string;
  nextNodeId: string;
  nextNodeTitle: string;
  nextNodeReason: string;
  totalNodes: number;
  masteredNodes: number;
  bookId?: string;
  chapterId?: string;
}

export const UserDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState<TestHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [continueData, setContinueData] = useState<ContinueLearningData | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [testsData, subjectsData] = await Promise.all([
          testApi.getMyTests(),
          subjectApi.getSubjects().catch(() => [] as Subject[])
        ]);
        setHistory(testsData);
        const allowed = filterSubjectsForLearner(subjectsData, user);
        setSubjects(allowed);

        for (const subj of allowed) {
          try {
            const personal = await roadmapApi.getPersonal(subj._id);
            if (personal.nextRecommended) {
              const nextNode = personal.nodes.find(
                (n) => n.nodeId === personal.nextRecommended?.nodeId
              );
              const masteredCount = personal.nodes.filter((n) => n.mastered).length;

              const bookId = nextNode?.bookId || subj.books?.[0]?._id;
              const chapterId = nextNode?.chapterId;

              setContinueData({
                subjectId: subj._id,
                subjectTitle: subj.title,
                nextNodeId: personal.nextRecommended.nodeId,
                nextNodeTitle: nextNode?.title || personal.nextRecommended.nodeId,
                nextNodeReason: personal.nextRecommended.reason,
                totalNodes: personal.nodes.length,
                masteredNodes: masteredCount,
                bookId,
                chapterId
              });
              break;
            }
          } catch {
            // no roadmap for this subject
          }
        }
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user]);

  const handleContinue = () => {
    if (!continueData) return;

    if (!continueData.bookId) {
      navigate(`/user/roadmap?subjectId=${continueData.subjectId}`);
      return;
    }

    const sessionId = `roadmap-${continueData.subjectId}-${continueData.nextNodeId}-${Date.now()}`;
    const useChapter = Boolean(continueData.chapterId);
    saveRoadmapContext({
      subjectId: continueData.subjectId,
      nodeId: continueData.nextNodeId,
      nodeTitle: continueData.nextNodeTitle,
      sessionId,
      bookId: continueData.bookId,
      chapterId: continueData.chapterId,
      fullBook: !useChapter
    });

    navigate('/user/test/start', {
      state: {
        subjectId: continueData.subjectId,
        bookId: continueData.bookId,
        ...(continueData.chapterId ? { chapterId: continueData.chapterId } : {}),
        fullBook: !useChapter,
        roadmapNodeId: continueData.nextNodeId,
        roadmapNodeTitle: continueData.nextNodeTitle,
        roadmapSessionId: sessionId
      }
    });
  };

  const handleSoloDailyPack = () => {
    const firstSubject = subjects[0];
    const firstBook = firstSubject?.books?.[0];
    if (!firstSubject?._id || !firstBook?._id) {
      navigate('/user/subjects');
      return;
    }

    navigate('/user/test/start', {
      state: {
        subjectId: firstSubject._id,
        bookId: firstBook._id,
        fullBook: true,
        soloMode: 'daily_pack'
      }
    });
  };

  const handleLiveKahootHost = () => {
    const firstSubject = subjects[0];
    const firstBook = firstSubject?.books?.[0];
    if (!firstSubject?._id || !firstBook?._id) {
      navigate('/user/subjects');
      return;
    }
    navigate('/user/test/start', {
      state: {
        subjectId: firstSubject._id,
        bookId: firstBook._id,
        fullBook: true,
        kahootLiveHost: true
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Здравствуйте, {user?.fullName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Готовы проверить знания? Запустите новый тест.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/user/subjects">
            <Button>Начать тест</Button>
          </Link>
          <Button variant="outline" onClick={handleSoloDailyPack}>
            Solo Kahoot (Daily Pack)
          </Button>
          <Button variant="outline" onClick={handleLiveKahootHost}>
            Создать Live Kahoot
          </Button>
          <Link
            to="/user/kahoot/join"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Присоединиться к Live Kahoot
          </Link>
          <Link to="/user/roadmap">
            <Button variant="outline">Карта знаний</Button>
          </Link>
        </div>
      </div>

      {continueData && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                Продолжить обучение
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {continueData.subjectTitle}
                <span className="mx-1 text-slate-400">·</span>
                <span className="text-slate-500">
                  {continueData.masteredNodes}/{continueData.totalNodes} тем освоено
                </span>
              </p>
              <p className="mt-2 text-base font-medium text-slate-900">
                {continueData.nextNodeTitle}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{continueData.nextNodeReason}</p>
            </div>
            <Button onClick={handleContinue} className="shrink-0">
              Пройти тест →
            </Button>
          </div>
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{
                  width: `${continueData.totalNodes > 0
                    ? Math.round((continueData.masteredNodes / continueData.totalNodes) * 100)
                    : 0}%`
                }}
              />
            </div>
          </div>
        </div>
      )}

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
                <Link
                  key={item._id}
                  to={`/user/tests/${item._id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
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
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
