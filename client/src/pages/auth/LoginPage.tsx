import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../../utils/error';
import { useAuth } from '../../store/auth.store';
import { getPendingResultReturn, clearPendingResultReturn } from '../../utils/session';
import { getPendingTrialMerge, clearPendingTrialMerge } from '../../utils/trialSession';
import { authApi } from '../../api/auth.api';
import { trialApi } from '../../api/trial.api';

const phoneSchema = z.object({
  phone: z.string().min(10, 'Введите номер телефона (минимум 10 цифр)')
});

const codeSchema = z.object({
  code: z.string().length(6, 'Введите 6 цифр кода')
});

type PhoneForm = z.infer<typeof phoneSchema>;
type CodeForm = z.infer<typeof codeSchema>;

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { requestOtp, verifyPhone } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [pendingPhone, setPendingPhone] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [botLink, setBotLink] = useState<string | null>(null);

  const returnUrl =
    (location.state as { returnUrl?: string })?.returnUrl ||
    searchParams.get('returnUrl') ||
    getPendingResultReturn() ||
    undefined;

  const googleError = searchParams.get('error') === 'google_auth_failed';

  const phoneForm = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema) });
  const codeForm = useForm<CodeForm>({ resolver: zodResolver(codeSchema) });

  const onPhoneSubmit = async (values: PhoneForm) => {
    setServerError(null);
    setBotLink(null);
    try {
      const result = await requestOtp(values.phone);
      setPendingPhone(values.phone);
      if (result.botLink) setBotLink(result.botLink);
      setStep(2);
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    }
  };

  const onCodeSubmit = async (values: CodeForm) => {
    setServerError(null);
    try {
      const user = await verifyPhone({ phone: pendingPhone, code: values.code });
      if (user.role === 'user') {
        const pendingTrial = getPendingTrialMerge();
        if (pendingTrial?.results?.length) {
          try {
            await trialApi.mergePendingIfAny(pendingTrial);
            clearPendingTrialMerge();
          } catch {
            /* перенос пробника не критичен для входа */
          }
        }
      }
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

  const handleGoogleLogin = () => {
    window.location.href = authApi.getGoogleAuthUrl();
  };

  if (step === 2) {
    return (
      <div className="space-y-4">
        <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-4">
          <p className="text-sm text-slate-600">
            Код отправлен на <strong>{pendingPhone}</strong>
          </p>
          {botLink && (
            <a
              href={botLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-center text-sm font-medium text-sky-700 hover:bg-sky-100"
            >
              Получить код в Telegram →
            </a>
          )}
          <Input
            label="Код подтверждения"
            error={codeForm.formState.errors.code?.message}
            {...codeForm.register('code')}
            placeholder="000000"
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          {serverError && <ErrorMessage message={serverError} />}
          <Button
            type="submit"
            className="w-full"
            isLoading={codeForm.formState.isSubmitting}
          >
            Войти
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep(1);
              setServerError(null);
              setBotLink(null);
              codeForm.reset();
            }}
            className="w-full text-sm text-slate-500 hover:text-slate-700"
          >
            Изменить номер
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
        <Input
          label="Номер телефона"
          error={phoneForm.formState.errors.phone?.message}
          {...phoneForm.register('phone')}
          placeholder="+7 999 123 45 67"
          type="tel"
        />
        <p className="text-xs text-slate-500">
          Код придёт в WhatsApp или Telegram
        </p>
        {serverError && <ErrorMessage message={serverError} />}
        {googleError && (
          <ErrorMessage message="Ошибка входа через Google. Попробуйте снова." />
        )}
        <Button
          type="submit"
          className="w-full"
          isLoading={phoneForm.formState.isSubmitting}
        >
          Получить код
        </Button>
      </form>

      <div className="relative">
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
        onClick={handleGoogleLogin}
      >
        <span className="flex items-center justify-center gap-2">
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Войти через Google
        </span>
      </Button>
    </div>
  );
};
