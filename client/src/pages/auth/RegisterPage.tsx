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
import { authApi } from '../../api/auth.api';
import { getPendingResultReturn, clearPendingResultReturn } from '../../utils/session';

const step1Schema = z.object({
  fullName: z.string().min(2, 'Введите имя'),
  email: z.string().email('Введите корректный email'),
  phone: z.string().min(10, 'Введите номер телефона (минимум 10 цифр)'),
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
  const { register: sendCode, verifyPhone } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [pendingPhone, setPendingPhone] = useState<string>('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [step1Success, setStep1Success] = useState<string | null>(null);
  const [botLink, setBotLink] = useState<string | null>(null);

  const returnUrl =
    (location.state as { returnUrl?: string })?.returnUrl ||
    getPendingResultReturn() ||
    undefined;

  const step1Form = useForm<Step1Form>({ resolver: zodResolver(step1Schema) });
  const step2Form = useForm<Step2Form>({ resolver: zodResolver(step2Schema) });

  const onStep1Submit = async (values: Step1Form) => {
    setServerError(null);
    setStep1Success(null);
    setBotLink(null);
    try {
      const result = await sendCode(values);
      setPendingPhone(values.phone);
      if (result.botLink) {
        setBotLink(result.botLink);
        setStep1Success(
          'WhatsApp недоступен. Перейдите по ссылке ниже, чтобы получить код в Telegram:'
        );
      } else {
        setStep1Success('Код отправлен в WhatsApp или Telegram. Введите его ниже.');
      }
      setStep(2);
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    }
  };

  const onStep2Submit = async (values: Step2Form) => {
    setServerError(null);
    try {
      const user = await verifyPhone({ phone: pendingPhone, code: values.code });
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
          Код отправлен на <strong>{pendingPhone}</strong>
        </p>
        {botLink ? (
          <a
            href={botLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-center text-sm font-medium text-sky-700 hover:bg-sky-100"
          >
            Получить код в Telegram →
          </a>
        ) : null}
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
            setBotLink(null);
            step2Form.reset();
          }}
          className="w-full text-sm text-slate-500 hover:text-slate-700"
        >
          Изменить номер телефона
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
        placeholder="example@mail.com"
      />
      <Input
        label="Номер телефона"
        error={step1Form.formState.errors.phone?.message}
        {...step1Form.register('phone')}
        placeholder="+7 999 123 45 67"
        type="tel"
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
        Получить код в WhatsApp / Telegram
      </Button>

      <div className="relative pt-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-slate-500">или</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => { window.location.href = authApi.getGoogleAuthUrl(); }}
      >
        <span className="flex items-center justify-center gap-2">
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Зарегистрироваться через Google
        </span>
      </Button>
    </form>
  );
};
