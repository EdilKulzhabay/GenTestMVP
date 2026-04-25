import React, { useEffect, useState } from 'react';
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

/** Материал урока по узлу карты; кнопка «Освоил» снимает блокировку теста после неудачных попыток */
export const RoadmapNodeMaterialPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const subjectId = searchParams.get('subjectId') || '';
  const nodeId = searchParams.get('nodeId') || '';

  const [lesson, setLesson] = useState<RoadmapLessonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ackLoading, setAckLoading] = useState(false);
  const [ackMessage, setAckMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!subjectId || !nodeId) {
      setLoading(false);
      setError('Укажите предмет и тему в адресе страницы.');
      return;
    }

    const run = async () => {
      setLoading(true);
      setError(null);
      setAckMessage(null);
      try {
        const subj = await subjectApi.getSubjectById(subjectId);
        if (!isSubjectAllowedForLearner(user, subj)) {
          setError('Предмет недоступен для вашего профиля.');
          setLesson(null);
          return;
        }
        const data = await roadmapApi.getNodeLesson(nodeId, subjectId);
        setLesson(data);
      } catch (e) {
        setError(getApiErrorMessage(e));
        setLesson(null);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [subjectId, nodeId, user]);

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

      {ackMessage ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            ackMessage.startsWith('Готово') ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'
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

      <div className="flex flex-wrap gap-3">
        <Link to={`/user/roadmap/chat?subjectId=${encodeURIComponent(subjectId)}&nodeId=${encodeURIComponent(nodeId)}`}>
          <Button variant="outline">Чат по теме</Button>
        </Link>
      </div>
    </div>
  );
};
