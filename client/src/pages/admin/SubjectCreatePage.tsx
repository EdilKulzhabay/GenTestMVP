import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { subjectApi } from '../../api/subject.api';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { SuccessMessage } from '../../components/ui/SuccessMessage';
import { getApiErrorMessage } from '../../utils/error';

const schema = z.object({
  title: z.string().min(1, 'Укажите название'),
  description: z.string().optional()
});

type SubjectForm = z.infer<typeof schema>;

export const SubjectCreatePage: React.FC = () => {
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset
  } = useForm<SubjectForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: SubjectForm) => {
    setServerError(null);
    setSuccessMsg(null);
    try {
      await subjectApi.createSubject(values);
      setSuccessMsg('Предмет успешно создан');
      reset();
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Добавить предмет</h1>
      <p className="mb-6 text-sm text-slate-500">Предмет — верхний уровень иерархии контента.</p>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <Input label="Название" placeholder="Например: Математика" error={errors.title?.message} {...register('title')} />
        <Input label="Описание (опционально)" placeholder="Краткое описание предмета" error={errors.description?.message} {...register('description')} />
        {serverError && <ErrorMessage message={serverError} />}
        {successMsg && <SuccessMessage message={successMsg} />}
        <Button type="submit" isLoading={isSubmitting}>
          Сохранить
        </Button>
      </form>
    </div>
  );
};
