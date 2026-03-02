import React, { useState, useRef } from 'react';
import { Button } from '../../components/ui/Button';
import { subjectApi } from '../../api/subject.api';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { SuccessMessage } from '../../components/ui/SuccessMessage';

export const SubjectImportPage: React.FC = () => {
  const [jsonText, setJsonText] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [parseError, setParseError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ books: number; chapters: number; topics: number; paragraphs: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleParse = (text: string) => {
    setJsonText(text);
    setParseError('');
    setPreview(null);
    setError('');
    setResult(null);

    if (!text.trim()) return;

    try {
      const parsed = JSON.parse(text);
      if (!parsed.title) {
        setParseError('JSON должен содержать поле "title"');
        return;
      }
      setPreview(parsed);
    } catch {
      setParseError('Невалидный JSON. Проверьте формат файла.');
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      handleParse(text);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!preview) return;
    setLoading(true);
    setError('');
    try {
      const res = await subjectApi.importSubject(preview);
      setResult(res.stats);
      setJsonText('');
      setPreview(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка при импорте');
    } finally {
      setLoading(false);
    }
  };

  const stats = preview ? countStats(preview) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Импорт предмета</h1>
        <p className="mt-1 text-sm text-slate-500">
          Загрузите JSON-файл с полной структурой предмета: книги, главы, темы и параграфы будут созданы одним запросом.
        </p>
      </div>

      {result && (
        <SuccessMessage
          message={`Предмет импортирован: ${result.books} книг, ${result.chapters} глав, ${result.topics} тем, ${result.paragraphs} параграфов`}
        />
      )}

      {error && <ErrorMessage message={error} />}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
          >
            Выбрать JSON-файл
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFile}
          />
          <span className="text-xs text-slate-400">или вставьте JSON ниже</span>
        </div>

        <textarea
          value={jsonText}
          onChange={(e) => handleParse(e.target.value)}
          rows={14}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          placeholder='{"title": "География", "description": "...", "books": [...]}'
        />

        {parseError && (
          <p className="mt-2 text-sm text-red-500">{parseError}</p>
        )}
      </div>

      {preview && stats && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5">
          <h3 className="mb-3 text-sm font-semibold text-blue-800">Предпросмотр</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label="Предмет" value={(preview as any).title} />
            <StatCard label="Книг" value={stats.books} />
            <StatCard label="Глав" value={stats.chapters} />
            <StatCard label="Тем" value={stats.topics} />
            <StatCard label="Параграфов" value={stats.paragraphs} />
          </div>

          <Button
            className="mt-4"
            onClick={handleImport}
            isLoading={loading}
            disabled={loading}
          >
            Импортировать предмет
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Формат JSON-файла</h3>
        <pre className="overflow-x-auto rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">{`{
  "title": "Название предмета",
  "description": "Описание (необязательно)",
  "books": [
    {
      "title": "Название учебника",
      "author": "Автор",
      "chapters": [
        {
          "title": "Название главы",
          "order": 1,
          "topics": [
            {
              "title": "Название темы",
              "paragraphs": [
                {
                  "order": 1,
                  "content": {
                    "text": "Текст параграфа...",
                    "pages": [10, 11, 12],
                    "metadata": {
                      "keywords": ["ключевое слово"],
                      "difficulty": "medium"
                    }
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}`}</pre>
      </div>
    </div>
  );
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white p-3 text-center shadow-sm">
      <p className="text-lg font-bold text-blue-700">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function countStats(data: Record<string, unknown>) {
  const books = (data.books as any[]) || [];
  let chapters = 0, topics = 0, paragraphs = 0;
  for (const b of books) {
    const chs = b.chapters || [];
    chapters += chs.length;
    for (const c of chs) {
      const tops = c.topics || [];
      topics += tops.length;
      for (const t of tops) {
        paragraphs += (t.paragraphs || []).length;
      }
    }
  }
  return { books: books.length, chapters, topics, paragraphs };
}
