import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { testApi } from '../../api/test.api';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { MathText } from '../../components/MathText';
import { getApiErrorMessage } from '../../utils/error';
import {
  clearCurrentTest,
  saveLastResult,
  getCurrentTest,
  saveCurrentAnswers,
  getCurrentAnswers,
  saveGuestTestSubmission,
  getRoadmapContext,
  clearRoadmapContext
} from '../../utils/session';
import { useGuestMode } from '../../hooks/useGuestMode';

interface AnswerForm {
  answers: string[];
}

const emptyAnswers = (count: number): string[] => Array(count).fill('');

const normalizeAnswers = (answers: string[] | null, count: number): string[] => {
  if (!answers || answers.length !== count) return emptyAnswers(count);
  return answers.slice(0, count);
};

export const TestPage: React.FC = () => {
  const navigate = useNavigate();
  const { isGuest, basePath } = useGuestMode();
  const test = getCurrentTest();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const savedAnswers = test ? getCurrentAnswers(test._id) : null;
  const autoCorrect = test
    ? test.questions.map((q) => q.correctOption ?? '')
    : [];
  const initialAnswers = test
    ? normalizeAnswers(savedAnswers ?? autoCorrect, test.questions.length)
    : [];
  const prevLengthRef = useRef(initialAnswers.length);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<AnswerForm>({
    defaultValues: { answers: initialAnswers }
  });

  const answers = watch('answers');

  useEffect(() => {
    if (!test || !answers) return;
    if (answers.length !== test.questions.length) return;
    const hasAny = answers.some((a) => a && a.trim());
    if (hasAny || prevLengthRef.current !== answers.length) {
      prevLengthRef.current = answers.length;
      saveCurrentAnswers(test._id, answers);
    }
  }, [test, answers]);

  useEffect(() => {
    const hasAnswers = answers?.some((a) => a?.trim());
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasAnswers) e.preventDefault();
    };
    if (hasAnswers) {
      window.addEventListener('beforeunload', onBeforeUnload);
      return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }
  }, [answers]);

  if (!test) {
    return (
      <div className="card space-y-3">
        <p className="text-sm text-slate-600">Нет активного теста.</p>
        <Link to={`${basePath}/subjects`}>
          <Button>Создать тест</Button>
        </Link>
      </div>
    );
  }

  const onSubmit = async (values: AnswerForm) => {
    setServerError(null);
    const hasEmpty = values.answers.some((value) => !value);
    if (hasEmpty) {
      setServerError('Ответьте на все вопросы перед отправкой.');
      return;
    }

    setSubmitting(true);
    try {
      const submissionAnswers = test.questions.map((question, index) => ({
        questionText: question.questionText,
        selectedOption: values.answers[index]
      }));

      const roadmapCtx = getRoadmapContext();

      const submitPayload = {
        testId: test._id,
        answers: submissionAnswers,
        ...(roadmapCtx && !isGuest
          ? { roadmapNodeId: roadmapCtx.nodeId, roadmapSessionId: roadmapCtx.sessionId }
          : {})
      };

      const submitFn = isGuest ? testApi.submitTestGuest : testApi.submitTest;
      const result = await submitFn(submitPayload);

      if (isGuest) {
        saveGuestTestSubmission({ testId: test._id, answers: submissionAnswers });
      }

      saveLastResult(result);
      clearCurrentTest();

      const navState = roadmapCtx
        ? { roadmapSubjectId: roadmapCtx.subjectId, roadmapNodeId: roadmapCtx.nodeId, roadmapNodeTitle: roadmapCtx.nodeTitle }
        : undefined;
      clearRoadmapContext();

      navigate(`${basePath}/test/result`, { replace: true, state: navState });
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = answers?.filter((a) => a?.trim()).length ?? 0;

  return (
    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="section-title">Тест</h1>
        {answeredCount > 0 && (
          <span className="text-xs text-slate-500">
            Ответов: {answeredCount} из {test.questions.length} · сохраняются автоматически
          </span>
        )}
      </div>
      {serverError ? <ErrorMessage message={serverError} /> : null}
      {errors.answers ? <ErrorMessage message="Ответьте на все вопросы" /> : null}

      <div className="space-y-4">
        {test.questions.map((question, index) => (
          <div key={question.questionText} className="card space-y-3">
            <p className="text-sm font-medium text-slate-900">
              {index + 1}. <MathText>{question.questionText}</MathText>
            </p>
            <div className="space-y-2">
              {question.options.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    value={option}
                    {...register(`answers.${index}` as const)}
                  />
                  <MathText>{option}</MathText>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button type="submit" isLoading={submitting}>
        Завершить тест
      </Button>
    </form>
  );
};
