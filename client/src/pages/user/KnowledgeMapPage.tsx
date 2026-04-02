import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { roadmapApi } from '../../api/roadmap.api';
import { Subject } from '../../types/subject.types';
import { CanonicalRoadmapResponse, PersonalRoadmapResponse } from '../../types/roadmap.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../../utils/error';

function badgeClass(kind: 'avail' | 'prog' | 'neutral'): string {
  const base = 'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold';
  if (kind === 'avail') return `${base} bg-sky-100 text-sky-800`;
  if (kind === 'prog') return `${base} bg-amber-100 text-amber-900`;
  return `${base} bg-slate-100 text-slate-700`;
}

const AVAIL_RU: Record<string, string> = {
  locked: 'Заблокировано',
  available: 'Доступно'
};

const PROG_RU: Record<string, string> = {
  not_started: 'Не начато',
  in_progress: 'В процессе',
  mastered: 'Пройдено'
};

export const KnowledgeMapPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const subjectId = searchParams.get('subjectId');

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [listLoading, setListLoading] = useState(!subjectId);

  const [subjectTitle, setSubjectTitle] = useState('');
  const [canonical, setCanonical] = useState<CanonicalRoadmapResponse | null>(null);
  const [personal, setPersonal] = useState<PersonalRoadmapResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(subjectId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subjectId) return;
    const load = async () => {
      setListLoading(true);
      setError(null);
      try {
        const data = await subjectApi.getSubjects();
        setSubjects(data);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setListLoading(false);
      }
    };
    void load();
  }, [subjectId]);

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
        setSubjectTitle(subj.title);
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
  }, [subjectId]);

  const selectSubject = (id: string) => {
    setSearchParams({ subjectId: id });
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
              Общая структура тем для этого предмета (одинакова для всех). Версия {canonical.version},
              узлов: {canonical.nodes.length}.
            </p>
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
          <ul className="space-y-3">
            {canonical.nodes.map((node, idx) => {
              const chapterHint =
                node.metadata && typeof node.metadata.chapterHint === 'string'
                  ? node.metadata.chapterHint
                  : null;
              return (
              <li
                key={node.nodeId}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs text-slate-400">{idx + 1}. </span>
                    <span className="font-medium text-slate-900">{node.title}</span>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">{node.nodeId}</p>
                    {chapterHint && (
                      <p className="mt-1 text-xs text-slate-500">
                        <span className="text-slate-400">Из книги: </span>
                        {chapterHint}
                      </p>
                    )}
                  </div>
                </div>
                {node.prerequisites.length > 0 && (
                  <p className="mt-2 text-xs text-slate-600">
                    <span className="text-slate-400">После: </span>
                    {node.prerequisites.join(', ')}
                  </p>
                )}
              </li>
            );
            })}
          </ul>
        </section>
      )}

      {!loading && !error && personal && (
        <section className="space-y-4" aria-labelledby="personal-map-heading">
          <div className="border-b border-slate-200 pb-2">
            <h2 id="personal-map-heading" className="text-lg font-semibold text-slate-900">
              Ваш прогресс
            </h2>
            <p className="text-sm text-slate-500">
              Доступность узлов, баллы и рекомендации по вашим попыткам.
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
            </div>
          )}

          <ul className="space-y-3">
            {personal.nodes.map((node) => (
              <li
                key={node.nodeId}
                className={`rounded-xl border p-4 shadow-sm ${
                  node.isRecommended
                    ? 'border-blue-200 bg-blue-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{node.title}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={badgeClass('avail')}>
                        {AVAIL_RU[node.availability] ?? node.availability}
                      </span>
                      <span className={badgeClass('prog')}>
                        {PROG_RU[node.progressStatus] ?? node.progressStatus}
                      </span>
                      {node.isRecommended && (
                        <span className={badgeClass('neutral')}>Рекомендуем</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    {node.attemptsCount > 0 && (
                      <>
                        <p>Лучший: {node.bestScore}%</p>
                        <p>Попыток: {node.attemptsCount}</p>
                      </>
                    )}
                  </div>
                </div>
                {node.aiHint && (
                  <p className="mt-2 border-t border-slate-100 pt-2 text-sm text-slate-600">
                    {node.aiHint}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && canonical && (
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            to="/user/books"
            state={{ subjectId }}
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            Пройти тест по этому предмету →
          </Link>
        </div>
      )}
    </div>
  );
};
