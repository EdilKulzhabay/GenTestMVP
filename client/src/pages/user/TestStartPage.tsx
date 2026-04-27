import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { testApi } from '../../api/test.api';
import { Subject } from '../../types/subject.types';
import { TestGenerationProfile } from '../../types/test.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { Button } from '../../components/ui/Button';
import { TestGenerationLoading, TestGenerationState } from '../../components/TestGenerationLoading';
import { getApiErrorMessage } from '../../utils/error';
import { saveCurrentTest, saveRoadmapContext, RoadmapTestContext } from '../../utils/session';
import { getTrialSession } from '../../utils/trialSession';
import { useGuestMode } from '../../hooks/useGuestMode';
import { useAuth } from '../../store/auth.store';
import { isSubjectAllowedForLearner } from '../../utils/learnerSubjects.util';

interface LocationState {
  subjectId?: string;
  bookId?: string;
  chapterId?: string;
  fullBook?: boolean;
  soloMode?: 'daily_pack' | 'practice';
  roadmapNodeId?: string;
  roadmapNodeTitle?: string;
  roadmapSessionId?: string;
  /** Мастер-поток: 5 блоков ЕНТ (ВНО Казахстан) */
  trialFlow?: boolean;
  trialQuestionCount?: number;
  trialBlockLabel?: string;
  /** Сгенерировать тест и открыть лобби Live Kahoot (не Solo) */
  kahootLiveHost?: boolean;
}

export const TestStartPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isGuest, basePath } = useGuestMode();
  const { user } = useAuth();
  const state = location.state as LocationState | null;
  const subjectId = state?.subjectId;
  const bookId = state?.bookId;
  const chapterId = state?.chapterId;
  const kahootLiveHost = Boolean(!isGuest && state?.kahootLiveHost);
  const trialFlow = Boolean(state?.trialFlow);
  const fullBook = trialFlow ? (state?.fullBook ?? true) : (state?.fullBook ?? false);
  const trialQuestionCount = state?.trialQuestionCount;
  const trialBlockLabel = state?.trialBlockLabel;
  const roadmapNodeId = state?.roadmapNodeId;
  const roadmapNodeTitle = state?.roadmapNodeTitle;
  const roadmapSessionId = state?.roadmapSessionId;

  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [testProfile, setTestProfile] = useState<TestGenerationProfile>('regular');
  const [soloMode, setSoloMode] = useState<'classic' | 'daily_pack' | 'practice'>(() => {
    if (trialFlow) return 'classic';
    if (state?.kahootLiveHost) return 'classic';
    if (state?.soloMode === 'daily_pack' || state?.soloMode === 'practice') return state.soloMode;
    return 'classic';
  });
  const [generateState, setGenerateState] = useState<TestGenerationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queueShown = useRef(false);
  /** Сколько вопросов сгенерировать (Solo daily/practice — фиксировано на сервере) */
  const [genQuestionCount, setGenQuestionCount] = useState(10);

  useEffect(() => {
    if (trialFlow && typeof trialQuestionCount === 'number' && trialQuestionCount > 0) {
      const v = Math.max(10, Math.min(120, Math.round(trialQuestionCount / 10) * 10));
      setGenQuestionCount(v);
      return;
    }
    setGenQuestionCount((c) => {
      if (testProfile === 'ent' || trialFlow) {
        return Math.max(10, Math.min(120, Math.round((c || 10) / 10) * 10));
      }
      return Math.max(1, Math.min(50, c || 10));
    });
  }, [testProfile, trialFlow, trialQuestionCount]);

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

  if (!isGuest && subject && !isSubjectAllowedForLearner(user, subject)) {
    return (
      <div className="card space-y-3">
        <p className="text-sm text-slate-600">Этот предмет недоступен для вашего профиля.</p>
        <Link to={`${basePath}/subjects`}>
          <Button>К списку предметов</Button>
        </Link>
      </div>
    );
  }

  const book = subject?.books.find((item) => item._id === bookId);
  const chapter = book?.chapters.find((item) => item._id === chapterId);
  const isSoloMode = !isGuest && (soloMode === 'daily_pack' || soloMode === 'practice');

  const isEntStyleCount = trialFlow || testProfile === 'ent';

  const handleGenerate = async () => {
    if (!isSoloMode) {
      if (isEntStyleCount) {
        const q = genQuestionCount;
        if (q < 10 || q > 120 || q % 10 !== 0) {
          setError('Формат ЕНТ: укажите число вопросов 10, 20, … 120 (кратно 10).');
          return;
        }
      } else if (genQuestionCount < 1 || genQuestionCount > 50) {
        setError('Обычный тест: задайте от 1 до 50 вопросов.');
        return;
      }
    }

    setGenerateState('queue');
    setError(null);
    queueShown.current = true;

    const t = setTimeout(() => {
      setGenerateState((s) => (s === 'queue' ? 'preparing' : s));
    }, 800);

    try {
      const resolvedQuestionCount = isSoloMode
        ? undefined
        : isEntStyleCount
          ? Math.max(10, Math.min(120, Math.round((genQuestionCount || 10) / 10) * 10))
          : Math.max(1, Math.min(50, Math.floor(genQuestionCount) || 10));

      const payload = {
        subjectId,
        bookId,
        chapterId: fullBook ? undefined : chapterId,
        fullBook,
        testProfile: trialFlow ? ('ent' as const) : testProfile,
        ...(roadmapNodeTitle ? { topicFocus: roadmapNodeTitle } : {}),
        ...(roadmapNodeId && !trialFlow ? { roadmapNodeId } : {}),
        ...(typeof resolvedQuestionCount === 'number' && resolvedQuestionCount > 0
          ? { questionCount: resolvedQuestionCount }
          : {})
      };

      const test =
        !isGuest && (soloMode === 'daily_pack' || soloMode === 'practice')
          ? await testApi.startSoloTest({ ...payload, mode: soloMode })
          : await (isGuest ? testApi.generateTestGuest : testApi.generateTest)(payload);
      clearTimeout(t);
      setGenerateState('ready');
      saveCurrentTest(test);

      if (!trialFlow && roadmapNodeId && roadmapSessionId && subjectId && bookId) {
        const ctx: RoadmapTestContext = {
          subjectId,
          nodeId: roadmapNodeId,
          nodeTitle: roadmapNodeTitle || roadmapNodeId,
          sessionId: roadmapSessionId,
          bookId,
          chapterId,
          fullBook
        };
        saveRoadmapContext(ctx);
      }

      if (kahootLiveHost) {
        setTimeout(() => navigate('/user/kahoot/room', { state: { role: 'host' } }), 400);
        return;
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
    <div className="card space-y-5">
      <h1 className="section-title">
        {trialFlow ? 'Пробное тестирование' : kahootLiveHost ? 'Live Kahoot — подготовка' : 'Подтверждение'}
      </h1>
      {kahootLiveHost ? (
        <p className="rounded-lg border border-violet-100 bg-violet-50/80 px-3 py-2 text-sm text-violet-900">
          Сгенерируйте вопросы: затем откроется лобби с 6-значным кодом, который можно передать друзьям.
        </p>
      ) : null}
      <div className="text-sm text-slate-600 space-y-1">
        <p>Предмет: {subject?.title}</p>
        <p>Книга: {book?.title}</p>
        {trialFlow && trialBlockLabel ? (
          <p>
            Блок: <span className="font-medium text-slate-800">{trialBlockLabel}</span>
          </p>
        ) : roadmapNodeTitle ? (
          <p>
            Тема: <span className="font-medium text-slate-800">{roadmapNodeTitle}</span>
          </p>
        ) : (
          <p>Режим: {fullBook ? 'По всей книге' : `Глава: ${chapter?.title}`}</p>
        )}
        {trialFlow ? (
          <p className="text-sm font-medium text-amber-800">
            Шаг{' '}
            {(() => {
              const ts = getTrialSession();
              const cur = ts ? ts.currentIndex + 1 : 1;
              const tot = ts?.steps.length ?? 5;
              return `${cur} из ${tot}`;
            })()}
            <span className="ml-2 text-slate-600">
              · формат ЕНТ · {genQuestionCount} вопросов
            </span>
          </p>
        ) : null}
        {trialFlow ? (
          <p className="text-xs text-slate-500">
            Вопросы в смешанных форматах как на ЕНТ в Казахстане. Тип теста выбран автоматически.
          </p>
        ) : null}
      </div>

      {!isSoloMode && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-900" htmlFor="gen-question-count">
            Сколько вопросов сгенерировать
          </label>
          <input
            id="gen-question-count"
            type="number"
            className="w-full max-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
            min={isEntStyleCount ? 10 : 1}
            max={isEntStyleCount ? 120 : 50}
            step={isEntStyleCount ? 10 : 1}
            value={genQuestionCount}
            onChange={(e) => {
              const v = e.target.valueAsNumber;
              if (Number.isNaN(v)) return;
              setGenQuestionCount(v);
            }}
            onBlur={() => {
              if (isEntStyleCount) {
                const v = Math.max(10, Math.min(120, Math.round((genQuestionCount || 10) / 10) * 10));
                setGenQuestionCount(v);
              } else {
                setGenQuestionCount((c) => Math.max(1, Math.min(50, Math.floor(c) || 10)));
              }
            }}
          />
          <p className="text-xs text-slate-500 leading-relaxed">
            {isEntStyleCount
              ? trialFlow
                ? 'Пробник в формате ЕНТ: 10, 20, … 120 (сериями по 10). По умолчанию — число из сценария; при нехватке материала уменьшите.'
                : 'Формат ЕНТ: 10, 20, … 120 (сериями по 10). Укажите меньше, если учебного материала мало.'
              : 'Классический тест: от 1 до 50 вопросов. Можно взять меньше 10, если раздела мало на объём.'}
          </p>
        </div>
      )}

      {!trialFlow && !kahootLiveHost ? (
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-900">Режим</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              id: 'classic',
              title: 'Обычный',
              desc: 'Стандартный тест без solo-рейтинга.'
            },
            {
              id: 'daily_pack',
              title: 'Solo Daily Pack',
              desc: 'Одна рейтинговая попытка в день. Далее — practice.'
            },
            {
              id: 'practice',
              title: 'Solo Practice',
              desc: 'Тренировка без попадания в рейтинг.'
            }
          ].map((mode) => {
            const isSelected = soloMode === mode.id;
            const disabled = isGuest && mode.id !== 'classic';
            return (
              <label
                key={mode.id}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="soloMode"
                  className="sr-only"
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => setSoloMode(mode.id as 'classic' | 'daily_pack' | 'practice')}
                />
                <span className="text-sm font-semibold text-slate-900">{mode.title}</span>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">{mode.desc}</p>
              </label>
            );
          })}
        </div>
        {isGuest && (
          <p className="text-xs text-amber-700">Solo режимы доступны только после входа в аккаунт.</p>
        )}
      </div>
      ) : null}

      {!trialFlow ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-900">Тип теста</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label
              className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                testProfile === 'regular'
                  ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="testProfile"
                className="sr-only"
                checked={testProfile === 'regular'}
                onChange={() => setTestProfile('regular')}
              />
              <span className="text-sm font-semibold text-slate-900">Обычный</span>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                4 варианта, один верный. Число вопросов задаёте в поле выше (1–50).
              </p>
            </label>
            <label
              className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                testProfile === 'ent'
                  ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="testProfile"
                className="sr-only"
                checked={testProfile === 'ent'}
                onChange={() => setTestProfile('ent')}
              />
              <span className="text-sm font-semibold text-slate-900">Профильный (ЕНТ)</span>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Смешанные форматы ЕНТ (каз.). Объём — в поле выше, кратен 10 (сериями по 10).
              </p>
            </label>
          </div>
        </div>
      ) : null}

      {error ? <ErrorMessage message={error} /> : null}
      <Button onClick={handleGenerate}>{kahootLiveHost ? 'Сгенерировать и открыть лобби' : 'Начать тест'}</Button>
    </div>
  );
};
