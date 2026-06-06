import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { roadmapApi } from '../../api/roadmap.api';
import { RoadmapLessonResponse } from '../../types/roadmap.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { Button } from '../../components/ui/Button';
import { getApiErrorMessage } from '../../utils/error';
import { MarkdownMathText } from '../../components/MarkdownMathText';
import { useAuth } from '../../store/auth.store';
import { isSubjectAllowedForLearner } from '../../utils/learnerSubjects.util';
import { subjectApi } from '../../api/subject.api';

/** Материал урока по узлу карты; узел (тема КТП) может содержать несколько уроков с последовательным гейтингом */
export const RoadmapNodeMaterialPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const subjectId = searchParams.get('subjectId') || '';
  const nodeId = searchParams.get('nodeId') || '';

  const [lesson, setLesson] = useState<RoadmapLessonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [ackLoading, setAckLoading] = useState(false);
  const [ackMessage, setAckMessage] = useState<string | null>(null);

  const loadLesson = useCallback(
    async (lessonId?: string) => {
      if (!subjectId || !nodeId) return;
      setLoading(true);
      setError(null);
      try {
        const subj = await subjectApi.getSubjectById(subjectId);
        if (!isSubjectAllowedForLearner(user, subj)) {
          setError('Предмет недоступен для вашего профиля.');
          setLesson(null);
          return;
        }
        const data = await roadmapApi.getNodeLesson(nodeId, subjectId, lessonId);
        setLesson(data);
      } catch (e) {
        setError(getApiErrorMessage(e));
        setLesson(null);
      } finally {
        setLoading(false);
      }
    },
    [subjectId, nodeId, user]
  );

  useEffect(() => {
    if (!subjectId || !nodeId) {
      setLoading(false);
      setError('Укажите предмет и тему в адресе страницы.');
      return;
    }
    void loadLesson();
  }, [subjectId, nodeId, loadLesson]);

  const onCompleteLesson = async () => {
    if (!lesson) return;
    setCompleting(true);
    try {
      const res = await roadmapApi.postNodeLessonRead(nodeId, subjectId, lesson.lessonId);
      await loadLesson(res.nextLessonId ?? lesson.lessonId);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setCompleting(false);
    }
  };

  const onAcknowledge = async () => {
    if (!subjectId || !nodeId) return;
    setAckLoading(true);
    setAckMessage(null);
    try {
      await roadmapApi.acknowledgeNodeMaterial(nodeId, subjectId);
      setAckMessage('Готово. Снова можно пройти тест по этой теме в карте знаний.');
    } catch (e) {
      setAckMessage(getApiErrorMessage(e));
    } finally {
      setAckLoading(false);
    }
  };

  if (!subjectId || !nodeId) {
    return (
      <div className="card space-y-3">
        <ErrorMessage message="Неверные параметры (subjectId, nodeId)." />
        <Link to="/user/roadmap" className="text-sm text-emerald-700 hover:underline">
          К карте знаний
        </Link>
      </div>
    );
  }

  if (loading) return <Loader />;
  if (error && !lesson) {
    return (
      <div className="space-y-3">
        <ErrorMessage message={error} />
        <Link to={`/user/roadmap?subjectId=${encodeURIComponent(subjectId)}`}>
          <Button variant="outline">К карте</Button>
        </Link>
      </div>
    );
  }

  const fmt = lesson?.contentFormat === 'html' ? 'html' : 'markdown';
  const multiLesson = (lesson?.lessonsTotal ?? 0) > 1;
  const currentCompleted = lesson?.readCompletedAt != null;
  const allCompleted = (lesson?.lessons ?? []).every((l) => l.completed);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={`/user/roadmap?subjectId=${encodeURIComponent(subjectId)}`}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← К карте знаний
          </Link>
          <h1 className="section-title mt-2">{lesson?.title || 'Материал'}</h1>
          {multiLesson ? (
            <p className="muted-text mt-1 text-xs">
              Урок {(lesson?.lessonIndex ?? 0) + 1} из {lesson?.lessonsTotal}
            </p>
          ) : null}
          {lesson?.summary ? (
            <p className="muted-text mt-2 max-w-3xl leading-relaxed">{lesson.summary}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button onClick={() => void onAcknowledge()} isLoading={ackLoading}>
            Освоил
          </Button>
          <p className="max-w-xs text-right text-xs text-slate-500">
            Нажмите после повторения темы, если тест по узлу был заблокирован после трёх попыток ниже 80%.
          </p>
        </div>
      </div>

      {/* Степпер уроков (для тем КТП с несколькими уроками из разных книг/классов) */}
      {multiLesson ? (
        <div className="card space-y-2">
          <p className="text-xs font-medium text-slate-500">Уроки темы</p>
          <ol className="space-y-1.5">
            {(lesson?.lessons ?? []).map((l, i) => {
              const isCurrent = l.lessonId === lesson?.lessonId;
              return (
                <li key={l.lessonId}>
                  <button
                    disabled={l.locked}
                    onClick={() => !l.locked && void loadLesson(l.lessonId)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      isCurrent
                        ? 'border-emerald-300 bg-emerald-50/70 text-emerald-900'
                        : l.locked
                          ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200'
                    }`}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]">
                      {l.completed ? '✓' : l.locked ? '🔒' : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{l.title}</span>
                    {l.completed ? <span className="text-[11px] text-emerald-600">пройден</span> : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {ackMessage ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            ackMessage.startsWith('Готово')
              ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          {ackMessage}
        </div>
      ) : null}

      {lesson?.video?.url ? (
        <div className="card overflow-hidden p-0">
          <video
            className="w-full max-h-[420px] bg-black"
            src={lesson.video.url}
            poster={lesson.video.posterUrl}
            controls
          />
        </div>
      ) : null}

      <div className="card prose prose-slate max-w-none">
        {lesson?.content ? (
          fmt === 'html' ? (
            <div
              className="text-sm leading-relaxed text-slate-800 [&_a]:text-emerald-700"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: lesson.content }}
            />
          ) : (
            <MarkdownMathText className="text-sm text-slate-800">{lesson.content}</MarkdownMathText>
          )
        ) : (
          <p className="text-sm text-slate-500">Текст урока пока пуст.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!currentCompleted ? (
          <Button onClick={() => void onCompleteLesson()} isLoading={completing}>
            {lesson?.nextLessonId ? 'Завершить урок и далее' : 'Завершить урок'}
          </Button>
        ) : lesson?.nextLessonId ? (
          <Button onClick={() => void loadLesson(lesson.nextLessonId ?? undefined)} variant="outline">
            Следующий урок →
          </Button>
        ) : (
          <span className="text-sm text-emerald-700">
            {allCompleted ? 'Все уроки темы пройдены.' : 'Урок пройден.'}
          </span>
        )}
        <Link to={`/user/roadmap/chat?subjectId=${encodeURIComponent(subjectId)}&nodeId=${encodeURIComponent(nodeId)}`}>
          <Button variant="outline">Чат по теме</Button>
        </Link>
      </div>
    </div>
  );
};
