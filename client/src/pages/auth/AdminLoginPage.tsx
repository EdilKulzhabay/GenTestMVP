import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../../utils/error';
import { useAuth } from '../../store/auth.store';

const schema = z.object({
  userName: z.string().min(1, 'Введите логин'),
  password: z.string().min(1, 'Введите пароль')
});

type FormValues = z.infer<typeof schema>;

export const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginAdmin, user, isLoading } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const returnUrl = searchParams.get('returnUrl') || '/admin';

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { userName: '', password: '' }
  });

  if (!isLoading && user?.role === 'admin') {
    return <Navigate to={returnUrl.startsWith('/admin') ? returnUrl : '/admin'} replace />;
  }

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await loginAdmin({
        userName: values.userName.trim().toLowerCase(),
        password: values.password
      });
      const safeReturn =
        returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/admin';
      navigate(safeReturn, { replace: true });
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {serverError && <ErrorMessage message={serverError} />}

      <div className="space-y-4 rounded-lg bg-white p-4">
      <Input
        label="Логин"
        type="text"
        autoComplete="username"
        {...form.register('userName')}
        error={form.formState.errors.userName?.message}
      />

      <Input
        label="Пароль"
        type="password"
        autoComplete="current-password"
        {...form.register('password')}
        error={form.formState.errors.password?.message}
      />

      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Вход…' : 'Войти'}
      </Button>
      </div>
    </form>
  );
};
