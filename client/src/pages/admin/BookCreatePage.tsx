import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { subjectApi } from '../../api/subject.api';
import { Subject } from '../../types/subject.types';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { SuccessMessage } from '../../components/ui/SuccessMessage';
import { Loader } from '../../components/ui/Loader';
import { getApiErrorMessage } from '../../utils/error';

const schema = z.object({
  subjectId: z.string().min(1, 'Выберите предмет'),
  title: z.string().min(1, 'Введите название книги'),
  author: z.string().optional(),
  contentLanguage: z.string().optional()
});

type BookForm = z.infer<typeof schema>;

type LocationState = { subjectId?: string } | null;

export const BookCreatePage: React.FC = () => {
  const location = useLocation();
  const presetSubjectId = (location.state as LocationState)?.subjectId;

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<BookForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      subjectId: presetSubjectId || '',
      contentLanguage: ''
    }
  });

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
    if (presetSubjectId) {
      reset((f) => ({ ...f, subjectId: presetSubjectId }));
    }
  }, [presetSubjectId, reset]);

  const onSubmit = async (values: BookForm) => {
    setServerError(null);
    setSuccessMsg(null);
    try {
      await subjectApi.createBook(values.subjectId, {
        title: values.title.trim(),
        author: values.author?.trim() || undefined,
        contentLanguage: values.contentLanguage?.trim() || undefined
      });
      setSuccessMsg('Книга успешно добавлена. Дальше: создайте главы и параграфы (контент в Markdown).');
      reset({
        subjectId: values.subjectId,
        title: '',
        author: '',
        contentLanguage: values.contentLanguage || ''
      });
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin" className="text-sm text-slate-500 hover:text-slate-800">
          ← Админ-панель
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Новая книга</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Книга привязывается к предмету. Язык текста помогает ИИ строить тесты и карту знаний на том же языке, что и
          учебник.
        </p>
      </div>

      {subjects.length === 0 ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          Сначала{' '}
          <Link to="/admin/subjects/new" className="font-medium underline">
            создайте предмет
          </Link>
          .
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <form className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleSubmit(onSubmit)}>
            <Select label="Предмет" error={errors.subjectId?.message} {...register('subjectId')}>
              <option value="">Выберите предмет</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.title}
                </option>
              ))}
            </Select>

            <Input
              label="Название"
              placeholder="Например: Физика 11 сынып"
              error={errors.title?.message}
              {...register('title')}
            />

            <Input label="Автор" placeholder="Необязательно" error={errors.author?.message} {...register('author')} />

            <Select label="Язык текста книги" error={errors.contentLanguage?.message} {...register('contentLanguage')}>
              <option value="">Определить автоматически (по контенту)</option>
              <option value="Русский">Русский</option>
              <option value="Қазақша">Қазақша</option>
              <option value="English">English</option>
              <option value="Oʻzbekcha">Oʻzbekcha</option>
            </Select>

            {serverError && <ErrorMessage message={serverError} />}
            {successMsg && <SuccessMessage message={successMsg} />}

            <div className="flex flex-wrap gap-3 pt-1">
              <Button type="submit" isLoading={isSubmitting}>
                Сохранить книгу
              </Button>
              <Link
                to="/admin/chapters/new"
                className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Добавить главу →
              </Link>
            </div>
          </form>

          <aside className="space-y-4 text-sm text-slate-600">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="font-medium text-slate-800">Что дальше</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4">
                <li>Главы и темы</li>
                <li>
                  Параграфы в{' '}
                  <Link to="/admin/contents/new" className="text-blue-600 hover:underline">
                    «Добавить контент»
                  </Link>{' '}
                  — Markdown и формулы LaTeX
                </li>
                <li>
                  <Link to="/admin/roadmaps/create" className="text-blue-600 hover:underline">
                    Статичная карта знаний
                  </Link>{' '}
                  по книге
                </li>
              </ol>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
