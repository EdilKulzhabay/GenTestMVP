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

const step1Schema = z.object({
  fullName: z.string().min(2, 'Введите имя'),
  email: z.string().email('Введите корректный email'),
  userName: z.string().min(3, 'Минимум 3 символа'),
  password: z.string().min(6, 'Минимум 6 символов')
});

const step2Schema = z.object({
  code: z.string().length(6, 'Введите 6 цифр кода')
});

type Step1Form = z.infer<typeof step1Schema>;
type Step2Form = z.infer<typeof step2Schema>;

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { register: sendCode, verifyEmail } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [pendingEmail, setPendingEmail] = useState<string>('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [step1Success, setStep1Success] = useState<string | null>(null);

  const returnUrl =
    (location.state as { returnUrl?: string })?.returnUrl ||
    getPendingResultReturn() ||
    undefined;

  const step1Form = useForm<Step1Form>({ resolver: zodResolver(step1Schema) });
  const step2Form = useForm<Step2Form>({ resolver: zodResolver(step2Schema) });

  const onStep1Submit = async (values: Step1Form) => {
    setServerError(null);
    setStep1Success(null);
    try {
      await sendCode(values);
      setPendingEmail(values.email);
      setStep1Success('Код отправлен на вашу почту. Введите его ниже.');
      setStep(2);
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    }
  };

  const onStep2Submit = async (values: Step2Form) => {
    setServerError(null);
    try {
      const user = await verifyEmail({ email: pendingEmail, code: values.code });
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

  if (step === 2) {
    return (
      <form className="space-y-4" onSubmit={step2Form.handleSubmit(onStep2Submit)}>
        <p className="text-sm text-slate-600">
          Код отправлен на <strong>{pendingEmail}</strong>
        </p>
        <Input
          label="Код подтверждения"
          error={step2Form.formState.errors.code?.message}
          {...step2Form.register('code')}
          placeholder="000000"
          maxLength={6}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
        />
        {serverError ? <ErrorMessage message={serverError} /> : null}
        <Button
          type="submit"
          className="w-full"
          isLoading={step2Form.formState.isSubmitting}
        >
          Подтвердить
        </Button>
        <button
          type="button"
          onClick={() => {
            setStep(1);
            setServerError(null);
            step2Form.reset();
          }}
          className="w-full text-sm text-slate-500 hover:text-slate-700"
        >
          Изменить email
        </button>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={step1Form.handleSubmit(onStep1Submit)}>
      <Input
        label="Имя и фамилия"
        error={step1Form.formState.errors.fullName?.message}
        {...step1Form.register('fullName')}
      />
      <Input
        label="Email"
        type="email"
        error={step1Form.formState.errors.email?.message}
        {...step1Form.register('email')}
        placeholder="для подтверждения"
      />
      <Input
        label="Логин"
        error={step1Form.formState.errors.userName?.message}
        {...step1Form.register('userName')}
      />
      <Input
        label="Пароль"
        type="password"
        error={step1Form.formState.errors.password?.message}
        {...step1Form.register('password')}
      />
      {serverError ? <ErrorMessage message={serverError} /> : null}
      {step1Success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {step1Success}
        </div>
      ) : null}
      <Button
        type="submit"
        className="w-full"
        isLoading={step1Form.formState.isSubmitting}
      >
        Получить код на почту
      </Button>
    </form>
  );
};
