import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { roadmapApi } from '../../api/roadmap.api';
import { Subject } from '../../types/subject.types';
import { CanonicalRoadmapResponse, PersonalRoadmapResponse } from '../../types/roadmap.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { Button } from '../../components/ui/Button';
import { getApiErrorMessage } from '../../utils/error';
import { saveRoadmapContext } from '../../utils/session';
import { RoadmapTreeView } from '../../components/roadmap/RoadmapTreeView';
import { useAuth } from '../../store/auth.store';
import { filterSubjectsForLearner, isSubjectAllowedForLearner } from '../../utils/learnerSubjects.util';

const REASON_RU: Record<string, string> = {
  CONTINUE_IN_PROGRESS: 'Вы уже начали эту тему',
  UNLOCKS_NEXT_TOPICS: 'Откроет следующие темы',
  LOW_MASTERY: 'Нужно подтянуть',
  PART_OF_MAIN_PATH: 'Основной путь обучения',
  NOT_STARTED: 'Следующий по порядку'
};

export const KnowledgeMapPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const subjectId = searchParams.get('subjectId');

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [listLoading, setListLoading] = useState(!subjectId);

  const [subjectTitle, setSubjectTitle] = useState('');
  const [subject, setSubject] = useState<Subject | null>(null);
  const [canonical, setCanonical] = useState<CanonicalRoadmapResponse | null>(null);
  const [personal, setPersonal] = useState<PersonalRoadmapResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(subjectId));
  const [error, setError] = useState<string | null>(null);
  const [mapActionError, setMapActionError] = useState<string | null>(null);

  useEffect(() => {
    if (subjectId) return;
    const load = async () => {
      setListLoading(true);
      setError(null);
      try {
        const data = await subjectApi.getSubjects();
        setSubjects(filterSubjectsForLearner(data, user));
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setListLoading(false);
      }
    };
    void load();
  }, [subjectId, user]);

  useEffect(() => {
    if (!subjectId) {
      setCanonical(null);
      setPersonal(null);
      setSubjectTitle('');
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      setCanonical(null);
      setPersonal(null);
      try {
        const subj = await subjectApi.getSubjectById(subjectId);
        if (!isSubjectAllowedForLearner(user, subj)) {
          setError('Этот предмет недоступен для вашего профиля.');
          setSearchParams({});
          setLoading(false);
          return;
        }
        setSubjectTitle(subj.title);
        setSubject(subj);
      } catch {
        setError('Не удалось загрузить предмет');
        setLoading(false);
        return;
      }

      try {
        const can = await roadmapApi.getCanonical(subjectId);
        setCanonical(can);
      } catch (err) {
        setError(getApiErrorMessage(err));
        setLoading(false);
        return;
      }

      try {
        const pers = await roadmapApi.getPersonal(subjectId, { includeAi: true });
        setPersonal(pers);
      } catch (err) {
        setError(
          `Карта загружена, но личный прогресс недоступен: ${getApiErrorMessage(err)}`
        );
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [subjectId, user, setSearchParams]);

  const selectSubject = (id: string) => {
    setSearchParams({ subjectId: id });
  };

  const personalById = useMemo(() => {
    if (!personal?.nodes.length) return new Map();
    return new Map(personal.nodes.map((n) => [n.nodeId, n]));
  }, [personal]);

  const handleOpenChat = (openNodeId: string) => {
    if (!subjectId) return;
    navigate(
      `/user/roadmap/chat?subjectId=${encodeURIComponent(subjectId)}&nodeId=${encodeURIComponent(
        openNodeId
      )}`
    );
  };

  const handleStartTestForNode = (nodeId: string) => {
    if (!subjectId || !subject) return;

    const pNode = personal?.nodes.find((n) => n.nodeId === nodeId);
    if (pNode?.knowledgeMapTestBlocked) {
      setMapActionError(
        'По этой теме тест временно закрыт: три раза меньше 80%. Откройте «Материал урока», повторите тему и нажмите «Освоил».'
      );
      return;
    }
    setMapActionError(null);

    const node = pNode
      || canonical?.nodes.find((n) => n.nodeId === nodeId);
    const nodeTitle = node?.title || nodeId;

    const bookId =
      node && 'bookId' in node && node.bookId
        ? node.bookId
        : canonical?.sourceMeta?.bookId || subject.books?.[0]?._id;
    if (!bookId) return;

    const chapterId =
      node && 'chapterId' in node && node.chapterId ? node.chapterId : undefined;

    const sessionId = `roadmap-${subjectId}-${nodeId}-${Date.now()}`;
    const useChapter = Boolean(chapterId);

    saveRoadmapContext({
      subjectId,
      nodeId,
      nodeTitle,
      sessionId,
      bookId,
      chapterId,
      fullBook: !useChapter
    });

    navigate('/user/test/start', {
      state: {
        subjectId,
        bookId,
        ...(chapterId ? { chapterId } : {}),
        fullBook: !useChapter,
        roadmapNodeId: nodeId,
        roadmapNodeTitle: nodeTitle,
        roadmapSessionId: sessionId
      }
    });
  };

  if (!subjectId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="section-title">Карта знаний</h1>
          <p className="muted-text mt-1">
            Выберите предмет — покажем общую структуру тем и ваш личный прогресс.
          </p>
        </div>
        {listLoading && <Loader />}
        {error && <ErrorMessage message={error} />}
        {!listLoading && !error && subjects.length === 0 && (
          <div className="card text-sm text-slate-600">Нет доступных предметов.</div>
        )}
        {!listLoading && !error && subjects.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {subjects.map((s) => (
              <button
                key={s._id}
                type="button"
                onClick={() => selectSubject(s._id)}
                className="card text-left transition hover:border-emerald-200 hover:bg-emerald-50/50"
              >
                <h2 className="text-lg font-semibold text-slate-900">{s.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{s.description || ' '}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <button
          type="button"
          onClick={() => setSearchParams({})}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Другой предмет
        </button>
        <h1 className="section-title mt-2">Карта знаний</h1>
        <p className="muted-text mt-1">
          Предмет: <span className="font-medium text-slate-800">{subjectTitle || '…'}</span>
        </p>
      </div>

      {loading && <Loader />}
      {error && !canonical && (
        <div className="space-y-2">
          <ErrorMessage message={error} />
          <p className="text-sm text-slate-500">
            Статичная карта не найдена или недоступна. Попробуйте другой предмет или зайдите позже.
          </p>
        </div>
      )}
      {error && canonical && <ErrorMessage message={error} />}

      {!loading && !error && canonical && (
        <section className="space-y-4" aria-labelledby="static-map-heading">
          <div className="border-b border-slate-200 pb-2">
            <h2 id="static-map-heading" className="text-lg font-semibold text-slate-900">
              Статичная карта
            </h2>
            <p className="text-sm text-slate-500">
              Структура по темам внутри глав (обновляется при изменении структуры учебника). Версия{' '}
              {canonical.version},
              узлов: {canonical.nodes.length}.
            </p>
            {canonical.description ? (
              <p className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm leading-relaxed text-slate-700">
                {canonical.description}
              </p>
            ) : null}
            {canonical.sourceMeta?.bookTitle && (
              <p className="mt-2 rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Источник карты: </span>
                {canonical.sourceMeta.bookTitle}
                {canonical.sourceMeta.bookAuthor ? ` — ${canonical.sourceMeta.bookAuthor}` : ''}
                {canonical.sourceMeta.fullBook
                  ? ' (вся книга)'
                  : canonical.sourceMeta.chapterTitle
                    ? ` · глава «${canonical.sourceMeta.chapterTitle}»`
                    : ''}
                {canonical.sourceMeta.contentLanguage ? ` · язык: ${canonical.sourceMeta.contentLanguage}` : ''}
              </p>
            )}
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Древовидная структура (ветви по prerequisites)
          </p>
          <RoadmapTreeView mode="canonical" nodes={canonical.nodes} routePrefix="/user" />
        </section>
      )}

      {!loading && !error && personal && (
        <section className="space-y-4" aria-labelledby="personal-map-heading">
          <div className="border-b border-slate-200 pb-2">
            <h2 id="personal-map-heading" className="text-lg font-semibold text-slate-900">
              Ваш прогресс
            </h2>
            <p className="text-sm text-slate-500">
              Доступность узлов, флаг «освоено» и рекомендации следующего шага.
            </p>
          </div>

          {personal.ai?.coachSummary ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                Совет
              </p>
              <p className="mt-1 leading-relaxed">{personal.ai.coachSummary}</p>
            </div>
          ) : null}

          {personal.nextRecommended && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/90 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                Следующий шаг
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {personal.nodes.find((n) => n.nodeId === personal.nextRecommended?.nodeId)?.title ||
                  personal.nextRecommended.nodeId}
              </p>
              <p className="mt-1 text-xs text-slate-600">{personal.nextRecommended.reason}</p>
              {(() => {
                const nr = personal.nodes.find((n) => n.nodeId === personal.nextRecommended?.nodeId);
                const blocked = nr?.knowledgeMapTestBlocked === true;
                return (
                  <>
                    {blocked && (
                      <p className="mt-2 text-xs text-rose-800">
                        Тест по этой теме закрыт после трёх попыток ниже 80%. Сначала пройдите{' '}
                        <Link
                          to={`/user/roadmap/material?subjectId=${encodeURIComponent(
                            subjectId!
                          )}&nodeId=${encodeURIComponent(personal.nextRecommended!.nodeId)}`}
                          className="font-medium underline"
                        >
                          материал
                        </Link>{' '}
                        и нажмите «Освоил».
                      </p>
                    )}
                    <Button
                      onClick={() => handleStartTestForNode(personal.nextRecommended!.nodeId)}
                      className="mt-3 text-sm"
                      disabled={blocked}
                    >
                      Пройти тест по этой теме
                    </Button>
                  </>
                );
              })()}
            </div>
          )}

          {personal.topRecommendations.length > 1 && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                Рекомендованные темы
              </p>
              <ul className="mt-2 space-y-2">
                {personal.topRecommendations.map((rec) => {
                  const pn = personal.nodes.find((n) => n.nodeId === rec.nodeId);
                  const blocked = pn?.knowledgeMapTestBlocked === true;
                  return (
                    <li key={rec.nodeId} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{rec.title}</p>
                        <p className="text-xs text-slate-500">{REASON_RU[rec.reason] ?? rec.reason}</p>
                      </div>
                      <Button
                        onClick={() => handleStartTestForNode(rec.nodeId)}
                        variant="outline"
                        className="shrink-0 text-xs"
                        disabled={blocked}
                      >
                        Пройти тест
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {mapActionError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {mapActionError}
            </div>
          )}
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Ваш прогресс на дереве тем
          </p>
          <RoadmapTreeView
            mode="personal"
            nodes={personal.nodes}
            personalById={personalById}
            subjectId={subjectId ?? undefined}
            onStartTest={handleStartTestForNode}
            onOpenChat={handleOpenChat}
            routePrefix="/user"
          />
        </section>
      )}

      {!loading && canonical && !personal && (
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            to="/user/books"
            state={{ subjectId }}
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            Выбрать книгу и пройти тест →
          </Link>
        </div>
      )}
    </div>
  );
};
