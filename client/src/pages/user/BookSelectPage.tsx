import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { Book, Subject } from '../../types/subject.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { Button } from '../../components/ui/Button';
import { getApiErrorMessage } from '../../utils/error';
import { useGuestMode } from '../../hooks/useGuestMode';
import { useAuth } from '../../store/auth.store';
import { isSubjectAllowedForLearner } from '../../utils/learnerSubjects.util';

interface LocationState {
  subjectId?: string;
}

export const BookSelectPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { basePath, isGuest } = useGuestMode();
  const { user } = useAuth();
  const state = location.state as LocationState | null;
  const subjectId = state?.subjectId;

  const [subject, setSubject] = useState<Subject | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [fullBook, setFullBook] = useState<boolean>(true);
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
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [subjectId]);

  const selectedBook: Book | undefined = useMemo(
    () => subject?.books.find((book) => book._id === selectedBookId),
    [selectedBookId, subject]
  );

  if (!subjectId) {
    return (
      <div className="card space-y-3">
        <p className="text-sm text-slate-600">Сначала выберите предмет.</p>
        <Link to={`${basePath}/subjects`}>
          <Button>Перейти к выбору предмета</Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return <Loader />;
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  if (!isGuest && subject && !isSubjectAllowedForLearner(user, subject)) {
    return (
      <div className="card space-y-3">
        <p className="text-sm text-slate-600">Этот предмет недоступен для вашего профиля.</p>
        <Link to={`${basePath}/subjects`}>
          <Button>К списку предметов</Button>
        </Link>
      </div>
    );
  }

  if (!subject || subject.books.length === 0) {
    return <div className="card text-sm text-slate-600">В этом предмете нет книг.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">Выберите книгу</h1>
        <p className="muted-text">Предмет: {subject.title}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {subject.books.map((book) => (
          <button
            key={book._id}
            className={`card text-left transition ${
              selectedBookId === book._id ? 'border-blue-300 bg-blue-50' : 'hover:border-blue-200'
            }`}
            onClick={() => {
              setSelectedBookId(book._id);
              setSelectedChapterId('');
            }}
          >
            <h2 className="text-lg font-semibold text-slate-900">{book.title}</h2>
            <p className="text-sm text-slate-600">{book.author || 'Автор не указан'}</p>
            <p className="text-xs text-slate-500">Глав: {book.chapters.length}</p>
          </button>
        ))}
      </div>

      {selectedBook ? (
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Настройки теста</h2>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={fullBook}
              onChange={(event) => setFullBook(event.target.checked)}
            />
            Тест по всей книге
          </label>

          {!fullBook ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Выберите главу</p>
              <div className="grid gap-2">
                {selectedBook.chapters.map((chapter) => (
                  <button
                    key={chapter._id}
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${
                      selectedChapterId === chapter._id
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-700 hover:border-blue-200'
                    }`}
                    onClick={() => setSelectedChapterId(chapter._id)}
                  >
                    {chapter.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <Button
            onClick={() =>
              navigate(`${basePath}/test/start`, {
                state: {
                  subjectId,
                  bookId: selectedBook._id,
                  chapterId: fullBook ? undefined : selectedChapterId,
                  fullBook
                }
              })
            }
            disabled={!selectedBookId || (!fullBook && !selectedChapterId)}
          >
            Продолжить
          </Button>
        </div>
      ) : null}
    </div>
  );
};
