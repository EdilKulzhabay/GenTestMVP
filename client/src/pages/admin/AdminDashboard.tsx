import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { Subject } from '../../types/subject.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { SuccessMessage } from '../../components/ui/SuccessMessage';
import { Button } from '../../components/ui/Button';
import { getApiErrorMessage } from '../../utils/error';

export const AdminDashboard: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

  const loadSubjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await subjectApi.getSubjects();
      setSubjects(data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSubjects();
  }, []);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      try {
        const parsed = JSON.parse(text);
        if (!parsed.title) {
          setImportError('JSON должен содержать поле "title"');
          return;
        }
        setImportLoading(true);
        setImportError('');
        setImportSuccess('');
        const res = await subjectApi.importSubject(parsed);
        setImportSuccess(
          `«${parsed.title}» импортирован: ${res.stats.books} книг, ${res.stats.chapters} глав, ${res.stats.topics} тем, ${res.stats.paragraphs} параграфов`
        );
        void loadSubjects();
      } catch (err: any) {
        if (err instanceof SyntaxError) {
          setImportError('Невалидный JSON-файл');
        } else {
          setImportError(err.response?.data?.message || getApiErrorMessage(err));
        }
      } finally {
        setImportLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const totalBooks = subjects.reduce((sum, s) => sum + (s.books?.length ?? 0), 0);
  const totalChapters = subjects.reduce(
    (sum, s) => sum + (s.books ?? []).reduce((bs, b) => bs + (b.chapters?.length ?? 0), 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Stats */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{subjects.length}</p>
            <p className="mt-1 text-xs text-slate-500">Предметов</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{totalBooks}</p>
            <p className="mt-1 text-xs text-slate-500">Книг</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{totalChapters}</p>
            <p className="mt-1 text-xs text-slate-500">Глав</p>
          </div>
        </div>
      )}

      {/* Import messages */}
      {importSuccess && <SuccessMessage message={importSuccess} />}
      {importError && <ErrorMessage message={importError} />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="section-title">Предметы</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            loading={importLoading}
            disabled={importLoading}
          >
            📥 Импорт JSON
          </Button>
          <Link to="/admin/subjects/new">
            <Button>+ Добавить предмет</Button>
          </Link>
        </div>
      </div>

      {loading && <Loader />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && subjects.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-slate-200 px-6 py-12 text-center">
          <p className="text-base font-medium text-slate-900">Пока нет предметов</p>
          <p className="mt-1 text-sm text-slate-500">
            Создайте предмет вручную или импортируйте готовый JSON-файл с полной структурой.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              loading={importLoading}
            >
              📥 Импорт JSON
            </Button>
            <Link to="/admin/subjects/new">
              <Button>Создать предмет</Button>
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && subjects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {subjects.map((subject) => {
            const bookCount = subject.books?.length ?? 0;
            const chapterCount = (subject.books ?? []).reduce(
              (sum, b) => sum + (b.chapters?.length ?? 0),
              0
            );
            return (
              <div
                key={subject._id}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-slate-900 group-hover:text-blue-700">
                      {subject.title}
                    </h2>
                    {subject.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                        {subject.description}
                      </p>
                    )}
                  </div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm text-blue-600">
                    📚
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                  <span>{bookCount} {bookCount === 1 ? 'книга' : 'книг'}</span>
                  <span className="text-slate-300">•</span>
                  <span>{chapterCount} {chapterCount === 1 ? 'глава' : 'глав'}</span>
                </div>

                <div className="mt-4 flex gap-2">
                  <Link
                    to="/admin/books/new"
                    state={{ subjectId: subject._id }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    + Книга
                  </Link>
                  <Link
                    to="/admin/contents/new"
                    state={{ subjectId: subject._id }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    + Контент
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
