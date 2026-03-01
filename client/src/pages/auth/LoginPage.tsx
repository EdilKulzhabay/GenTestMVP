import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../../utils/error';
import { useAuth } from '../../store/auth.store';
import { getPendingResultReturn, clearPendingResultReturn } from '../../utils/session';

const schema = z.object({
  userName: z.string().min(1, 'Введите логин'),
  password: z.string().min(1, 'Введите пароль')
});

type LoginForm = z.infer<typeof schema>;

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const returnUrl =
    (location.state as { returnUrl?: string })?.returnUrl ||
    getPendingResultReturn() ||
    undefined;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    try {
      const user = await login(values);
      if (returnUrl && user.role === 'user') {
        clearPendingResultReturn();
        navigate(returnUrl, { replace: true });
      } else {
        navigate(user.role === 'admin' ? '/admin' : '/user', { replace: true });
      }
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <Input label="Логин" error={errors.userName?.message} {...register('userName')} />
      <Input
        label="Пароль"
        type="password"
        error={errors.password?.message}
        {...register('password')}
      />
      {serverError ? <ErrorMessage message={serverError} /> : null}
      <Button type="submit" className="w-full" isLoading={isSubmitting}>
        Войти
      </Button>
    </form>
  );
};
