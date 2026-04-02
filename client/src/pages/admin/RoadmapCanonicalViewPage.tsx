import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { roadmapApi } from '../../api/roadmap.api';
import { CanonicalRoadmapResponse } from '../../types/roadmap.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../../utils/error';

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

          <div className="space-y-3">
            {roadmap.nodes.map((node, idx) => (
              <div
                key={node.nodeId}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-medium text-slate-400">{idx + 1}</span>
                  <h2 className="text-base font-semibold text-slate-900">{node.title}</h2>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-500">{node.nodeId}</p>
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Требует пройти
                  </p>
                  {node.prerequisites.length === 0 ? (
                    <p className="mt-1 text-sm text-emerald-700">Стартовый узел (нет зависимостей)</p>
                  ) : (
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {node.prerequisites.map((p) => (
                        <li
                          key={p}
                          className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700"
                        >
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {node.metadata && Object.keys(node.metadata).length > 0 && (
                  <details className="mt-3 text-xs text-slate-500">
                    <summary className="cursor-pointer text-slate-600">Метаданные</summary>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2">
                      {JSON.stringify(node.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
