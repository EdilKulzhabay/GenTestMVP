import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
  author: z.string().optional()
});

type BookForm = z.infer<typeof schema>;

export const BookCreatePage: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset
  } = useForm<BookForm>({ resolver: zodResolver(schema) });

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

  const onSubmit = async (values: BookForm) => {
    setServerError(null);
    setSuccessMsg(null);
    try {
      await subjectApi.createBook(values.subjectId, {
        title: values.title,
        author: values.author
      });
      setSuccessMsg('Книга успешно добавлена');
      reset();
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Добавить книгу</h1>
      <p className="mb-6 text-sm text-slate-500">Книга принадлежит предмету и содержит главы.</p>

      {subjects.length === 0 ? (
        <p className="text-sm text-slate-500">Сначала создайте хотя бы один предмет.</p>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <Select label="Предмет" error={errors.subjectId?.message} {...register('subjectId')}>
            <option value="">Выберите предмет</option>
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>{s.title}</option>
            ))}
          </Select>
          <Input label="Название книги" placeholder="Например: Алгебра 10 класс" error={errors.title?.message} {...register('title')} />
          <Input label="Автор (опционально)" placeholder="Автор книги" error={errors.author?.message} {...register('author')} />
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
