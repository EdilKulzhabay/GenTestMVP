import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { Subject } from '../../types/subject.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { Button } from '../../components/ui/Button';
import { getApiErrorMessage } from '../../utils/error';

interface Props {
  routePrefix: '/user' | '/guest';
}

export const ChapterContentPage: React.FC<Props> = ({ routePrefix }) => {
  const { subjectId, bookId, chapterId } = useParams<{
    subjectId: string;
    bookId: string;
    chapterId: string;
  }>();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subjectId) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await subjectApi.getSubjectById(subjectId);
        setSubject(data);
      } catch (e) {
        setError(getApiErrorMessage(e));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [subjectId]);

  const { book, chapter, bodyText } = useMemo(() => {
    if (!subject || !bookId || !chapterId) {
      return { book: undefined, chapter: undefined, bodyText: '' };
    }
    const b = subject.books?.find((x) => x._id === bookId);
    const c = b?.chapters?.find((x) => x._id === chapterId);
    const parts: string[] = [];
    if (c?.topics) {
      for (const t of c.topics) {
        const paras = [...(t.paragraphs || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        for (const p of paras) {
          if (p.content?.text?.trim()) parts.push(p.content.text.trim());
        }
      }
    }
    return { book: b, chapter: c, bodyText: parts.join('\n\n') };
  }, [subject, bookId, chapterId]);

  if (!subjectId || !bookId || !chapterId) {
    return <ErrorMessage message="Неверная ссылка на главу." />;
  }

  if (loading) return <Loader />;
  if (error) return <ErrorMessage message={error} />;
  if (!subject || !book || !chapter) {
    return <ErrorMessage message="Глава не найдена." />;
  }

  const testStartState = {
    subjectId,
    bookId,
    chapterId,
    fullBook: false
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={routePrefix === '/user' ? '/user/subjects' : '/guest/subjects'}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← К предметам
        </Link>
        <h1 className="section-title mt-2">{chapter.title}</h1>
        <p className="muted-text mt-1">
          {subject.title} · {book.title}
        </p>
      </div>

      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Содержание главы</h2>
        {bodyText ? (
          <div className="prose prose-slate max-w-none whitespace-pre-wrap text-sm leading-relaxed">
            {bodyText}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Текст главы ещё не добавлен (нет параграфов).</p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to={`${routePrefix}/test/start`} state={testStartState}>
          <Button>Пройти тест по главе</Button>
        </Link>
        {routePrefix === '/user' ? (
          <Link to={`/user/roadmap?subjectId=${encodeURIComponent(subjectId)}`}>
            <Button variant="outline">Карта знаний</Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
};
