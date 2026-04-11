import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { roadmapApi } from '../../api/roadmap.api';
import { CanonicalRoadmapResponse } from '../../types/roadmap.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../../utils/error';
import { RoadmapTreeView } from '../../components/roadmap/RoadmapTreeView';

export const RoadmapCanonicalViewPage: React.FC = () => {
  const { subjectId } = useParams<{ subjectId: string }>();
  const [subjectTitle, setSubjectTitle] = useState<string>('');
  const [roadmap, setRoadmap] = useState<CanonicalRoadmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subjectId) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      setRoadmap(null);
      try {
        const [subject, canonical] = await Promise.all([
          subjectApi.getSubjectById(subjectId),
          roadmapApi.getCanonical(subjectId)
        ]);
        setSubjectTitle(subject.title);
        setRoadmap(canonical);
      } catch (err: unknown) {
        const msg = getApiErrorMessage(err);
        if (msg.toLowerCase().includes('not found') || msg.includes('404')) {
          setError(
            'Для этого предмета ещё нет canonical roadmap. Добавьте статичный JSON (файл в server/data/canonical-roadmaps или форма «Создать») на странице создания карты.'
          );
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [subjectId]);

  if (!subjectId) {
    return <ErrorMessage message="Не указан предмет" />;
  }

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/roadmaps/create" className="text-sm text-slate-500 hover:text-slate-800">
          ← Создать / обновить карту
        </Link>
        <Link to="/admin" className="ml-4 text-sm text-slate-500 hover:text-slate-800">
          Админ-панель
        </Link>
        <h1 className="section-title mt-2">Карта знаний</h1>
        <p className="muted-text mt-1">
          Предмет: <span className="font-medium text-slate-800">{subjectTitle || '…'}</span>
        </p>
      </div>

      {error && (
        <div className="space-y-3">
          <ErrorMessage message={error} />
          <Link
            to="/admin/roadmaps/create"
            className="inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            Перейти к созданию карты
          </Link>
        </div>
      )}

      {roadmap && !error && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <span className="font-medium text-slate-800">Версия:</span> {roadmap.version}
            <span className="mx-2 text-slate-300">·</span>
            <span className="font-medium text-slate-800">Узлов:</span> {roadmap.nodes.length}
            {roadmap.description ? (
              <p className="mt-2 border-t border-slate-100 pt-2 text-sm leading-relaxed text-slate-700">
                {roadmap.description}
              </p>
            ) : null}
            {roadmap.sourceMeta?.bookTitle && (
              <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">Источник: </span>
                {roadmap.sourceMeta.bookTitle}
                {roadmap.sourceMeta.bookAuthor ? ` (${roadmap.sourceMeta.bookAuthor})` : ''}
                {roadmap.sourceMeta.fullBook
                  ? ' — вся книга'
                  : roadmap.sourceMeta.chapterTitle
                    ? ` — «${roadmap.sourceMeta.chapterTitle}»`
                    : ''}
              </p>
            )}
          </div>

          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Дерево узлов
          </p>
          <RoadmapTreeView mode="canonical" nodes={roadmap.nodes} />
        </>
      )}
    </div>
  );
};
