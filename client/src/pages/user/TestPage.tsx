import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { testApi } from '../../api/test.api';
import { getSoloSocket, SoloAnswerAck, SoloFinishAck, SoloJoinAck } from '../../api/solo.socket';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { EntQuestionBlock } from '../../components/EntQuestionBlock';
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
import {
  appendTrialStepResult,
  clearTrialSession,
  getTrialSession,
  savePendingTrialMergeForLogin
} from '../../utils/trialSession';
import { trialApi } from '../../api/trial.api';
import { useGuestMode } from '../../hooks/useGuestMode';
import { isAnswerComplete } from '../../utils/entAnswer.util';
import type { GeneratedTest } from '../../types/test.types';

const emptyAnswers = (count: number): string[] => Array(count).fill('');

/** Сохранённые ответы важнее; иначе devPrefillValue с сервера (временно для ускорения тестирования) */
function resolveInitialAnswers(test: GeneratedTest): string[] {
  const n = test.questions.length;
  const saved = getCurrentAnswers(test._id);
  if (saved && saved.length === n) {
    const hasUserInput = saved.some((s) => s && String(s).trim());
    if (hasUserInput) return saved;
  }
  const fromPrefill = test.questions.map((q) => (q.devPrefillValue?.trim() ? q.devPrefillValue : ''));
  if (fromPrefill.some((x) => x.trim())) return fromPrefill;
  return emptyAnswers(n);
}

export const TestPage: React.FC = () => {
  const navigate = useNavigate();
  const { isGuest, basePath } = useGuestMode();
  const test = getCurrentTest();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<string[]>(() => {
    const t = getCurrentTest();
    if (!t?.questions.length) return [];
    return resolveInitialAnswers(t);
  });
  const prevLengthRef = useRef(answers.length);
  const isSolo = !isGuest && Boolean(test?.dailyPackId && test?.mode);
  const soloTimeLimitSec = test?.questionTimeLimitSec ?? 15;
  const soloTimeLimitMs = soloTimeLimitSec * 1000;
  const [soloIndex, setSoloIndex] = useState(0);
  const [soloQuestionStartedAt, setSoloQuestionStartedAt] = useState<number>(Date.now());
  const [soloNowMs, setSoloNowMs] = useState<number>(Date.now());
  const socketRef = useRef<ReturnType<typeof getSoloSocket> | null>(null);

  useEffect(() => {
    if (!test?.questions.length) return;
    setAnswers(resolveInitialAnswers(test));
  }, [test?._id]);

  useEffect(() => {
    if (!test || !isSolo) return;
    setSoloIndex(0);
    setSoloQuestionStartedAt(test.soloQuestionStartedAt ? new Date(test.soloQuestionStartedAt).getTime() : Date.now());
    setSoloNowMs(Date.now());
  }, [test?._id, isSolo, test?.soloQuestionStartedAt]);

  useEffect(() => {
    if (!isSolo || !test?.soloSessionId) return;
    const socket = getSoloSocket();
    socketRef.current = socket;

    socket.emit('solo:join', { soloSessionId: test.soloSessionId }, (ack: SoloJoinAck) => {
      if (!ack?.success || !ack.session) {
        setServerError(ack?.message || 'Не удалось подключиться к Solo-сессии');
        return;
      }
      setSoloIndex(ack.session.currentQuestionIndex);
      setSoloQuestionStartedAt(new Date(ack.session.questionStartedAt).getTime());
      setSoloNowMs(Date.now());
    });

    return () => {
      socketRef.current = null;
    };
  }, [isSolo, test?.soloSessionId]);

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

  const setAnswerAt = (index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

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

  const onSubmit = async () => {
    if (!test) return;
    setServerError(null);

    const incomplete = !isSolo && test.questions.some((q, i) => !isAnswerComplete(q, answers[i]));
    if (incomplete && !isSolo) {
      setServerError('Ответьте на все вопросы перед отправкой.');
      return;
    }

    setSubmitting(true);
    try {
      const submissionAnswers = test.questions.map((question, index) => ({
        questionText: question.questionText,
        selectedOption: answers[index]
      }));

      const roadmapCtx = getRoadmapContext();

      const result = isSolo
        ? await new Promise<any>((resolve, reject) => {
            const socket = socketRef.current;
            if (!socket || !test.soloSessionId) {
              reject(new Error('Solo socket disconnected'));
              return;
            }
            socket.emit('solo:finish', { soloSessionId: test.soloSessionId }, (ack: SoloFinishAck) => {
              if (!ack?.success || !ack.result || !ack.solo) {
                reject(new Error(ack?.message || 'Не удалось завершить Solo'));
                return;
              }
              resolve({ result: ack.result, solo: ack.solo });
            });
          })
        : await (isGuest ? testApi.submitTestGuest : testApi.submitTest)({
            testId: test._id,
            answers: submissionAnswers,
            ...(!isSolo && getTrialSession() ? { forTrial: true } : {}),
            ...(roadmapCtx && !isGuest
              ? { roadmapNodeId: roadmapCtx.nodeId, roadmapSessionId: roadmapCtx.sessionId }
              : {})
          });

      if (isGuest) {
        saveGuestTestSubmission({ testId: test._id, answers: submissionAnswers });
      }

      saveLastResult(result);
      clearCurrentTest();

      const trialAfter = appendTrialStepResult(
        result.result.scorePercent,
        test,
        result.trialTopicMastery
      );
      if (trialAfter) {
        clearRoadmapContext();
        if (trialAfter.currentIndex < trialAfter.steps.length) {
          const next = trialAfter.steps[trialAfter.currentIndex];
          navigate(`${basePath}/test/start`, {
            replace: true,
            state: {
              subjectId: next.subjectId,
              bookId: next.bookId,
              fullBook: true,
              trialFlow: true,
              trialQuestionCount: next.questionCount,
              trialBlockLabel: next.trialBlockLabel,
              roadmapNodeTitle: next.topicTitle || next.chapterTitle
            }
          });
          return;
        }
        const { results: finalResults, topicMasteryRows = [] } = trialAfter;
        clearTrialSession();
        if (isGuest) {
          savePendingTrialMergeForLogin({ results: finalResults, topicMasteryRows });
          navigate('/guest/trial/complete', { replace: true });
        } else {
          try {
            if (topicMasteryRows.length) {
              await trialApi.applyResults(
                topicMasteryRows.map((r) => ({
                  subjectId: r.subjectId,
                  nodeId: r.nodeId,
                  scorePercent: r.scorePercent
                }))
              );
            }
          } catch (e) {
            console.warn('trial apply failed', e);
          }
          navigate(`${basePath}/trial/complete`, { replace: true });
        }
        return;
      }

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

  useEffect(() => {
    if (!isSolo || !test || submitting) return;
    const id = window.setInterval(() => {
      setSoloNowMs(Date.now());
    }, 200);
    return () => window.clearInterval(id);
  }, [isSolo, test?._id, submitting]);

  useEffect(() => {
    if (!isSolo || !test || submitting) return;
    const elapsed = soloNowMs - soloQuestionStartedAt;
    if (elapsed < soloTimeLimitMs) return;
    void handleSoloNext();
  }, [
    isSolo,
    soloNowMs,
    soloQuestionStartedAt,
    soloTimeLimitMs,
    soloIndex,
    test,
    submitting
  ]);

  const handleSoloNext = async () => {
    if (!isSolo || !test || submitting) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const answer = answers[soloIndex] ?? '';
      const ack = await new Promise<SoloAnswerAck>((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket || !test.soloSessionId) {
          reject(new Error('Solo socket disconnected'));
          return;
        }
        socket.emit(
          'solo:answer',
          {
            soloSessionId: test.soloSessionId,
            questionIndex: soloIndex,
            selectedOption: answer
          },
          (response: SoloAnswerAck) => resolve(response)
        );
      });

      if (!ack?.success) {
        throw new Error(ack?.message || 'Не удалось отправить ответ');
      }

      if (ack.finished || ack.nextQuestionIndex === null) {
        await onSubmit();
        return;
      }

      setSoloIndex(ack.nextQuestionIndex ?? 0);
      setSoloQuestionStartedAt(ack.questionStartedAt ? new Date(ack.questionStartedAt).getTime() : Date.now());
      setSoloNowMs(Date.now());
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = test.questions.reduce(
    (acc, q, i) => acc + (isAnswerComplete(q, answers[i]) ? 1 : 0),
    0
  );
  const soloTimeLeftMs = Math.max(0, soloTimeLimitMs - (soloNowMs - soloQuestionStartedAt));
  const soloQuestionNumber = soloIndex + 1;
  const activeQuestion = isSolo ? test.questions[soloIndex] : null;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (isSolo) {
          void handleSoloNext();
          return;
        }
        void onSubmit();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="section-title">
          {test.testProfile === 'ent' ? 'Тест (профиль ЕНТ)' : 'Тест'}
        </h1>
        {!isSolo && answeredCount > 0 && (
          <span className="text-xs text-slate-500">
            Готово: {answeredCount} из {test.questions.length} · черновик сохраняется автоматически
          </span>
        )}
      </div>
      {isSolo && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-900">
              Вопрос {soloQuestionNumber} из {test.questions.length}
            </p>
            <p className={`text-sm font-semibold ${soloTimeLeftMs <= 3000 ? 'text-red-600' : 'text-indigo-700'}`}>
              {Math.ceil(soloTimeLeftMs / 1000)} c
            </p>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-indigo-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, (soloTimeLeftMs / soloTimeLimitMs) * 100))}%` }}
            />
          </div>
        </div>
      )}
      {serverError ? <ErrorMessage message={serverError} /> : null}

      {isSolo && activeQuestion ? (
        <div className="space-y-4">
          <EntQuestionBlock
            key={`${soloIndex}-${activeQuestion.questionText.slice(0, 48)}`}
            question={activeQuestion}
            index={soloIndex}
            value={answers[soloIndex] ?? ''}
            onChange={(v) => setAnswerAt(soloIndex, v)}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {test.questions.map((question, index) => (
            <EntQuestionBlock
              key={`${index}-${question.questionText.slice(0, 48)}`}
              question={question}
              index={index}
              value={answers[index] ?? ''}
              onChange={(v) => setAnswerAt(index, v)}
            />
          ))}
        </div>
      )}

      <Button type="submit" isLoading={submitting}>
        {isSolo
          ? soloIndex < test.questions.length - 1
            ? 'Следующий вопрос'
            : 'Завершить Solo'
          : 'Завершить тест'}
      </Button>
    </form>
  );
};
