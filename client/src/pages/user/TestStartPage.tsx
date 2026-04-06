import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { testApi } from '../../api/test.api';
import { Subject } from '../../types/subject.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { Button } from '../../components/ui/Button';
import { TestGenerationLoading, TestGenerationState } from '../../components/TestGenerationLoading';
import { getApiErrorMessage } from '../../utils/error';
import { saveCurrentTest, saveRoadmapContext, RoadmapTestContext } from '../../utils/session';
import { useGuestMode } from '../../hooks/useGuestMode';

interface LocationState {
  subjectId?: string;
  bookId?: string;
  chapterId?: string;
  fullBook?: boolean;
  roadmapNodeId?: string;
  roadmapNodeTitle?: string;
  roadmapSessionId?: string;
}

export const TestStartPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isGuest, basePath } = useGuestMode();
  const state = location.state as LocationState | null;
  const subjectId = state?.subjectId;
  const bookId = state?.bookId;
  const chapterId = state?.chapterId;
  const fullBook = state?.fullBook ?? false;
  const roadmapNodeId = state?.roadmapNodeId;
  const roadmapNodeTitle = state?.roadmapNodeTitle;
  const roadmapSessionId = state?.roadmapSessionId;

  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [generateState, setGenerateState] = useState<TestGenerationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queueShown = useRef(false);

  useEffect(() => {
    if (!subjectId) return;
    const load = async () => {
      setLoading(true);
      try {
        const data = await subjectApi.getSubjectById(subjectId);
        setSubject(data);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [subjectId]);

  if (!subjectId || !bookId) {
    return (
      <div className="card space-y-3">
        <p className="text-sm text-slate-600">Нет данных для старта теста.</p>
        <Link to={`${basePath}/subjects`}>
          <Button>Выбрать предмет</Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return <Loader />;
  }

  if (error && !generateState) {
    return <ErrorMessage message={error} />;
  }

  const book = subject?.books.find((item) => item._id === bookId);
  const chapter = book?.chapters.find((item) => item._id === chapterId);

  const handleGenerate = async () => {
    setGenerateState('queue');
    setError(null);
    queueShown.current = true;

    const t = setTimeout(() => {
      setGenerateState((s) => (s === 'queue' ? 'preparing' : s));
    }, 800);

    try {
      const generateFn = isGuest ? testApi.generateTestGuest : testApi.generateTest;
      const test = await generateFn({
        subjectId,
        bookId,
        chapterId: fullBook ? undefined : chapterId,
        fullBook,
        ...(roadmapNodeTitle ? { topicFocus: roadmapNodeTitle } : {})
      });
      clearTimeout(t);
      setGenerateState('ready');
      saveCurrentTest(test);

      if (roadmapNodeId && roadmapSessionId && subjectId && bookId) {
        saveRoadmapContext({
          subjectId,
          nodeId: roadmapNodeId,
          nodeTitle: roadmapNodeTitle || roadmapNodeId,
          sessionId: roadmapSessionId,
          bookId,
          chapterId,
          fullBook
        });
      }

      setTimeout(() => navigate(`${basePath}/test`), 400);
    } catch (err) {
      clearTimeout(t);
      setGenerateState('error');
      setError(getApiErrorMessage(err));
    }
  };

  const handleRetry = () => {
    handleGenerate();
  };

  const handleBack = () => {
    setGenerateState(null);
    setError(null);
    navigate(-1);
  };

  if (generateState) {
    return (
      <div className="flex justify-center">
        <TestGenerationLoading
          state={generateState}
          errorMessage={error ?? undefined}
          onRetry={generateState === 'error' ? handleRetry : undefined}
          onBack={handleBack}
          backLabel="Выбрать другой тест"
        />
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <h1 className="section-title">Подтверждение</h1>
      <div className="text-sm text-slate-600">
        <p>Предмет: {subject?.title}</p>
        <p>Книга: {book?.title}</p>
        {roadmapNodeTitle ? (
          <p>Тема: <span className="font-medium text-slate-800">{roadmapNodeTitle}</span></p>
        ) : (
          <p>Режим: {fullBook ? 'По всей книге' : `Глава: ${chapter?.title}`}</p>
        )}
      </div>
      {error ? <ErrorMessage message={error} /> : null}
      <Button onClick={handleGenerate}>Начать тест</Button>
    </div>
  );
};
