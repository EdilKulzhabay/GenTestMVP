import React from 'react';
import { Button } from './ui/Button';

export type TestGenerationState = 'queue' | 'preparing' | 'ready' | 'error';

export interface TestGenerationLoadingProps {
  state: TestGenerationState;
  errorMessage?: string | null;
  onRetry?: () => void;
  onBack?: () => void;
  /** Текст кнопки "Назад" */
  backLabel?: string;
}

const STATE_CONFIG: Record<
  TestGenerationState,
  { title: string; description: string; icon: string }
> = {
  queue: {
    title: 'В очереди',
    description: 'Ваш запрос принят. Тест скоро начнёт готовиться.',
    icon: '⏳'
  },
  preparing: {
    title: 'Готовится тест',
    description:
      'AI анализирует материал и формирует вопросы. Обычно это занимает 15–60 секунд.',
    icon: '📝'
  },
  ready: {
    title: 'Готово',
    description: 'Тест сформирован. Перенаправляем...',
    icon: '✓'
  },
  error: {
    title: 'Не удалось',
    description: 'Произошла ошибка при генерации теста.',
    icon: '⚠'
  }
};

export const TestGenerationLoading: React.FC<TestGenerationLoadingProps> = ({
  state,
  errorMessage,
  onRetry,
  onBack,
  backLabel = 'Назад'
}) => {
  const config = STATE_CONFIG[state];
  const isError = state === 'error';
  const isReady = state === 'ready';
  const showSpinner = state === 'queue' || state === 'preparing' || isReady;

  return (
    <div className="card max-w-md space-y-6">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 text-4xl">{config.icon}</div>
        <h2 className="section-title">{config.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{config.description}</p>
        {isError && errorMessage && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}
      </div>

      {showSpinner && (
        <div className="flex justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      )}

      <div className="flex flex-col gap-2">
        {isError && onRetry && (
          <Button onClick={onRetry} className="w-full">
            Повторить попытку
          </Button>
        )}
        {onBack && (
          <Button
            variant={isError && onRetry ? 'outline' : 'secondary'}
            onClick={onBack}
            className="w-full"
          >
            {backLabel}
          </Button>
        )}
      </div>

      {!isError && !isReady && (
        <p className="text-center text-xs text-slate-400">
          Не закрывайте страницу. Если прошло больше 2 минут — нажмите «Назад» и попробуйте снова.
        </p>
      )}
    </div>
  );
};
