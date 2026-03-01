import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { subjectApi } from '../../api/subject.api';
import { Book, Subject } from '../../types/subject.types';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { SuccessMessage } from '../../components/ui/SuccessMessage';
import { Loader } from '../../components/ui/Loader';
import { getApiErrorMessage } from '../../utils/error';

const schema = z.object({
  subjectId: z.string().min(1, 'Выберите предмет'),
  bookId: z.string().min(1, 'Выберите книгу'),
  title: z.string().min(1, 'Введите название главы'),
  order: z.coerce.number().int().min(0, 'Порядок должен быть >= 0')
});

type ChapterForm = z.infer<typeof schema>;

export const ChapterCreatePage: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset
  } = useForm<ChapterForm>({ resolver: zodResolver(schema) });

  const subjectId = watch('subjectId');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await subjectApi.getSubjects();
        setSubjects(data);
      } catch (error) {
        setServerError(getApiErrorMessage(error));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const loadBooks = async () => {
      if (!subjectId) { setBooks([]); return; }
      try {
        const subject = await subjectApi.getSubjectById(subjectId);
        setBooks(subject.books || []);
      } catch (error) {
        setServerError(getApiErrorMessage(error));
      }
    };
    void loadBooks();
  }, [subjectId]);

  const onSubmit = async (values: ChapterForm) => {
    setServerError(null);
    setSuccessMsg(null);
    try {
      await subjectApi.createChapter(values.subjectId, values.bookId, {
        title: values.title,
        order: values.order
      });
      setSuccessMsg('Глава успешно добавлена');
      reset();
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Добавить главу</h1>
      <p className="mb-6 text-sm text-slate-500">Глава принадлежит книге и содержит темы.</p>

      {subjects.length === 0 ? (
        <p className="text-sm text-slate-500">Сначала создайте предмет и книгу.</p>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <Select label="Предмет" error={errors.subjectId?.message} {...register('subjectId')}>
            <option value="">Выберите предмет</option>
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>{s.title}</option>
            ))}
          </Select>
          <Select label="Книга" error={errors.bookId?.message} {...register('bookId')}>
            <option value="">Выберите книгу</option>
            {books.map((b) => (
              <option key={b._id} value={b._id}>{b.title}</option>
            ))}
          </Select>
          <Input label="Название главы" placeholder="Например: Глава 1. Введение" error={errors.title?.message} {...register('title')} />
          <Input label="Порядок" type="number" placeholder="0" error={errors.order?.message} {...register('order')} />
          {serverError && <ErrorMessage message={serverError} />}
          {successMsg && <SuccessMessage message={successMsg} />}
          <Button type="submit" isLoading={isSubmitting}>
            Сохранить
          </Button>
        </form>
      )}
    </div>
  );
};
