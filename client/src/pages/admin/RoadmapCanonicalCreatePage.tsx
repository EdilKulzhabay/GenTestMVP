import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { roadmapApi } from '../../api/roadmap.api';
import { Subject } from '../../types/subject.types';
import { CanonicalRoadmapResponse } from '../../types/roadmap.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { SuccessMessage } from '../../components/ui/SuccessMessage';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { getApiErrorMessage } from '../../utils/error';

/** Шаблон статичного canonical roadmap (Notion: Sprint 0, JSON со структурой знаний). */
const CANONICAL_JSON_EXAMPLE = `{
  "version": 1,
  "nodes": [
    {
      "nodeId": "start_topic",
      "title": "Вводная тема",
      "prerequisites": []
    },
    {
      "nodeId": "next_topic",
      "title": "Тема с зависимостью",
      "prerequisites": ["start_topic"]
    }
  ]
}`;

function parseCanonicalJsonText(text: string): { version?: number; nodes: unknown[] } {
  const raw = JSON.parse(text) as unknown;
  if (Array.isArray(raw)) {
    return { nodes: raw };
  }
  if (raw && typeof raw === 'object' && 'nodes' in raw && Array.isArray((raw as { nodes: unknown }).nodes)) {
    const o = raw as { version?: number; nodes: unknown[] };
    return { version: typeof o.version === 'number' ? o.version : undefined, nodes: o.nodes };
  }
  throw new Error('Ожидается объект с полем "nodes" или массив узлов');
}

export const RoadmapCanonicalCreatePage: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subjectId, setSubjectId] = useState('');
  const [jsonText, setJsonText] = useState(CANONICAL_JSON_EXAMPLE);

  const [bookId, setBookId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [fullBook, setFullBook] = useState(true);

  const [submittingJson, setSubmittingJson] = useState(false);
  const [submittingAi, setSubmittingAi] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
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
    void load();
  }, []);

  const selectedSubject = useMemo(
    () => subjects.find((s) => s._id === subjectId),
    [subjects, subjectId]
  );

  const selectedBook = useMemo(
    () => selectedSubject?.books.find((b) => b._id === bookId),
    [selectedSubject, bookId]
  );

  useEffect(() => {
    setBookId('');
    setChapterId('');
  }, [subjectId]);

  useEffect(() => {
    setChapterId('');
  }, [bookId, fullBook]);

  const handleSubmitJson = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMsg(null);
    if (!subjectId) {
      setSubmitError('Выберите предмет');
      return;
    }
    setSubmittingJson(true);
    try {
      const { version, nodes } = parseCanonicalJsonText(jsonText.trim());
      await roadmapApi.upsertCanonical({
        subjectId,
        ...(version !== undefined ? { version } : {}),
        nodes: nodes as CanonicalRoadmapResponse['nodes']
      });
      setSuccessMsg('Статичный canonical roadmap сохранён в базе (как описано в продуктовой спецификации: JSON → хранение).');
    } catch (err) {
      if (err instanceof SyntaxError) {
        setSubmitError('Невалидный JSON');
      } else {
        setSubmitError(getApiErrorMessage(err));
      }
    } finally {
      setSubmittingJson(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setJsonText(text);
      setSubmitError(null);
    };
    reader.readAsText(file);
  };

  const handleSubmitAi = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMsg(null);
    if (!subjectId || !bookId) {
      setSubmitError('Выберите предмет и книгу');
      return;
    }
    if (!fullBook && !chapterId) {
      setSubmitError('Выберите главу или включите «Вся книга»');
      return;
    }

    setSubmittingAi(true);
    try {
      const res = await roadmapApi.generateCanonicalFromBook({
        subjectId,
        bookId,
        ...(fullBook ? { fullBook: true } : { chapterId })
      });
      setSuccessMsg(
        `Карта по книге сохранена (версия ${res.version}, узлов: ${res.nodes.length}). Источник: ИИ — вне базового процесса JSON.`
      );
    } catch (err) {
      setSubmitError(getApiErrorMessage(err));
    } finally {
      setSubmittingAi(false);
    }
  };

  if (loading) return <Loader />;
  if (error) {
    return (
      <div className="space-y-4">
        <ErrorMessage message={error} />
        <Link to="/admin" className="text-sm text-blue-600 hover:underline">
          ← В дашборд
        </Link>
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="card space-y-4">
        <p className="text-sm text-slate-600">Сначала добавьте хотя бы один предмет.</p>
        <Link to="/admin/subjects/new">
          <Button>Создать предмет</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to="/admin" className="text-sm text-slate-500 hover:text-slate-800">
          ← Админ-панель
        </Link>
        <h1 className="section-title mt-2">Canonical roadmap (статичный JSON)</h1>
        <p className="muted-text mt-1 max-w-3xl">
          По спецификации продуктовая карта задаётся как <strong>статичный JSON</strong> со структурой знаний (узлы и
          зависимости), готовится на этапе подготовки контента и сохраняется в системе. Ниже — основной способ: вставка
          или загрузка файла. Альтернатива через ИИ — опциональна.
        </p>
      </div>

      {successMsg && (
        <div className="space-y-2">
          <SuccessMessage message={successMsg} />
          {subjectId ? (
            <Link
              to={`/admin/roadmaps/${subjectId}`}
              className="inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              Открыть карту знаний →
            </Link>
          ) : null}
        </div>
      )}
      {submitError && <ErrorMessage message={submitError} />}

      <form onSubmit={handleSubmitJson} className="card max-w-3xl space-y-4">
        <h2 className="text-base font-semibold text-slate-900">1. JSON-файл или вставка</h2>
        <Select
          label="Предмет"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          required
        >
          <option value="">— Выберите предмет —</option>
          {subjects.map((s) => (
            <option key={s._id} value={s._id}>
              {s.title}
            </option>
          ))}
        </Select>

        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".json,application/json" className="hidden" onChange={handleFile} />
            <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              Загрузить .json
            </span>
          </label>
          <Button type="button" variant="outline" onClick={() => setJsonText(CANONICAL_JSON_EXAMPLE)}>
            Подставить пример
          </Button>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Содержимое JSON</label>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
            className="min-h-[240px] w-full rounded-lg border border-slate-200 bg-slate-50/80 p-3 font-mono text-xs text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <p className="mt-1 text-xs text-slate-500">
            Формат: <code className="rounded bg-slate-100 px-1">{'{ "version"?, "nodes": [ { nodeId, title, prerequisites } ] }'}</code> или только массив узлов.
            Файл с тем же именем <code className="rounded bg-slate-100 px-1">{'<subjectId>.json'}</code> в каталоге{' '}
            <code className="rounded bg-slate-100 px-1">server/data/canonical-roadmaps/</code> подхватывается сервером при
            первом запросе, если в базе ещё нет записи.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button type="submit" disabled={submittingJson || !subjectId}>
            {submittingJson ? 'Сохранение…' : 'Сохранить canonical roadmap'}
          </Button>
          {subjectId ? (
            <Link to={`/admin/roadmaps/${subjectId}`}>
              <Button type="button" variant="outline">
                Открыть текущую карту
              </Button>
            </Link>
          ) : null}
        </div>
      </form>

      <details className="card max-w-3xl space-y-4 border-dashed border-amber-200 bg-amber-50/40">
        <summary className="cursor-pointer text-sm font-medium text-amber-900">
          Опционально: черновик через ИИ по тексту книги
        </summary>
        <p className="text-sm text-slate-600">
          Не входит в базовый процесс «статичный JSON»: можно сгенерировать черновик графа по содержимому книги, затем
          при необходимости выгрузить и править вручную. Нужен API-ключ OpenAI на сервере.
        </p>
        <form onSubmit={handleSubmitAi} className="space-y-4 pt-2">
          {selectedSubject && (
            <Select
              label="Книга"
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
              required
              disabled={!selectedSubject.books?.length}
            >
              <option value="">— Выберите книгу —</option>
              {selectedSubject.books.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.title}
                </option>
              ))}
            </Select>
          )}

          {selectedBook && (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={fullBook}
                  onChange={(e) => setFullBook(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Учитывать всю книгу целиком
              </label>

              {!fullBook && (
                <Select
                  label="Глава"
                  value={chapterId}
                  onChange={(e) => setChapterId(e.target.value)}
                  required
                >
                  <option value="">— Выберите главу —</option>
                  {selectedBook.chapters.map((ch) => (
                    <option key={ch._id} value={ch._id}>
                      {ch.title}
                    </option>
                  ))}
                </Select>
              )}
            </>
          )}

          <Button type="submit" disabled={submittingAi || !subjectId || !bookId}>
            {submittingAi ? 'Генерация…' : 'Сгенерировать по книге (ИИ)'}
          </Button>
        </form>
      </details>
    </div>
  );
};
