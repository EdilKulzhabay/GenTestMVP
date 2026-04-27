import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Socket } from 'socket.io-client';
import { getLiveKahootSocket, LiveRoomStatePayload } from '../../api/liveKahoot.socket';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { EntQuestionBlock } from '../../components/EntQuestionBlock';
import { getCurrentTest, clearCurrentTest } from '../../utils/session';
import { isAnswerComplete } from '../../utils/entAnswer.util';
import type { TestQuestion } from '../../types/test.types';

type LocationSt = {
  role?: 'host' | 'player';
  roomId?: string;
  seed?: LiveRoomStatePayload;
};

const QUESTION_TIME_LIMIT_SEC = 15;

const normalizeState = (raw: unknown): LiveRoomStatePayload | null => {
  if (!raw || typeof raw !== 'object') return null;
  return raw as LiveRoomStatePayload;
};

export const LiveKahootRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, roomId: stateRoomId, seed } = (location.state || {}) as LocationSt;
  const [error, setError] = useState<string | null>(null);
  const [readyLoading, setReadyLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [room, setRoom] = useState<LiveRoomStatePayload | null>(seed || null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [localAnswer, setLocalAnswer] = useState('');

  const roomId = room?.roomId ?? stateRoomId;

  const applyRoomState = useCallback((raw: unknown) => {
    const s = normalizeState(raw);
    if (s) setRoom(s);
  }, []);

  useEffect(() => {
    if (room?.type === 'playing' && !room.hasSubmittedThisRound) {
      setLocalAnswer('');
    }
  }, [room?.type, room?.currentQuestionIndex, room?.hasSubmittedThisRound, room?.revision]);

  useEffect(() => {
    if (!room || room.type !== 'playing' || !room.questionEndAt) return;
    const t = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [room?.type, room?.questionEndAt, room?.revision]);

  useEffect(() => {
    const socket: Socket = getLiveKahootSocket();
    const onState = (payload: unknown) => applyRoomState(payload);
    const onClosed = (payload: { reason?: string }) => {
      clearCurrentTest();
      const msg =
        payload?.reason === 'host_left'
          ? 'Ведущий вышел из лобби. Комната закрыта.'
          : 'Комната больше недоступна.';
      window.alert(msg);
      navigate('/user', { replace: true });
    };

    socket.on('live:room_state', onState);
    socket.on('live:room_closed', onClosed);
    return () => {
      socket.off('live:room_state', onState);
      socket.off('live:room_closed', onClosed);
    };
  }, [applyRoomState, navigate]);

  useEffect(() => {
    const socket: Socket = getLiveKahootSocket();
    if (role === 'host' && !seed) {
      const test = getCurrentTest();
      if (!test?._id) {
        setError('Сначала сгенерируйте тест. Вернитесь в дашборд и выберите «Создать Live Kahoot».');
        return;
      }
      socket.emit('live:create', { testId: test._id }, (ack: { success: boolean; message?: string; state?: unknown }) => {
        if (ack?.success && ack.state) {
          applyRoomState(ack.state);
        } else {
          setError(ack?.message || 'Не удалось создать комнату');
        }
      });
      return;
    }
    if (role === 'player' && seed) {
      applyRoomState(seed);
      const rid = seed.roomId;
      if (rid) {
        socket.emit('live:rejoin', { roomId: rid }, (ack: { success: boolean; state?: unknown; message?: string }) => {
          if (ack?.success && ack.state) {
            applyRoomState(ack.state);
          } else {
            setError(
              ack?.message ||
                'Сессия комнаты устарела или сброшена. Откройте снова «Присоединиться к Live Kahoot» и введите код.'
            );
          }
        });
      }
      return;
    }
    if (stateRoomId) {
      socket.emit('live:rejoin', { roomId: stateRoomId }, (ack: { success: boolean; state?: unknown; message?: string }) => {
        if (ack?.success && ack.state) {
          applyRoomState(ack.state);
        } else {
          setError(ack?.message || 'Сессия недоступна. Войдите по коду снова.');
        }
      });
      return;
    }
    if (!seed && !stateRoomId) {
      setError('Нет данных комнаты. Откройте страницу из дашборда или ввода кода.');
    }
  }, [role, seed, stateRoomId, applyRoomState]);

  const liveRef = useRef<{ phase?: string; roomId?: string }>({});
  liveRef.current = { phase: room?.type, roomId: room?.roomId };

  /** Не вызывать leave сразу при unmount: React Strict Mode снимает/вешает компонент → игрок выпадал из комнаты на сервере. */
  const lobbyLeaveMountIdRef = useRef(0);
  useEffect(() => {
    lobbyLeaveMountIdRef.current += 1;
    const mountId = lobbyLeaveMountIdRef.current;
    return () => {
      const { phase, roomId: rid } = liveRef.current;
      const unmountedAt = mountId;
      window.setTimeout(() => {
        if (lobbyLeaveMountIdRef.current !== unmountedAt) {
          return;
        }
        if (phase === 'lobby' && rid) {
          getLiveKahootSocket().emit('live:lobby_leave', { roomId: rid });
        }
      }, 450);
    };
  }, []);

  const setReady = (value: boolean) => {
    if (!roomId) {
      console.warn('[LiveKahoot] setReady: нет roomId', { room: room?.roomId, stateRoomId });
      setError('Нет id комнаты. Обновите страницу и зайдите снова.');
      return;
    }
    if (import.meta.env.DEV) {
      console.log('[LiveKahoot] live:ready →', { roomId, ready: value, me: room?.me, participantsCount: room?.participants.length });
    }
    setReadyLoading(true);
    getLiveKahootSocket().emit(
      'live:ready',
      { roomId, ready: value },
      (ack: { success?: boolean; message?: string; debug?: Record<string, unknown> }) => {
        setReadyLoading(false);
        if (!ack?.success) {
          if (ack?.debug) {
            console.warn('[LiveKahoot] live:ready отказ сервера', ack.debug);
          } else {
            console.warn('[LiveKahoot] live:ready отказ', ack);
          }
          const hint =
            ack?.message ||
            (ack?.debug
              ? `Ошибка (${String((ack.debug as { reason?: string }).reason ?? 'unknown')}). См. console.`
              : 'Не удалось обновить статус');
          setError(hint);
        } else {
          setError(null);
        }
      }
    );
  };

  const hostStart = () => {
    if (!roomId) return;
    setStartLoading(true);
    getLiveKahootSocket().emit('live:host_start', { roomId }, (ack: { success?: boolean; message?: string }) => {
      setStartLoading(false);
      if (!ack?.success) {
        setError(ack?.message || 'Не удалось начать');
      } else {
        setError(null);
      }
    });
  };

  const submitAnswer = () => {
    if (!room || !roomId || room.currentQuestionIndex == null) return;
    if (!isAnswerComplete(room.currentQuestion as TestQuestion, localAnswer)) {
      setError('Выберите или введите ответ.');
      return;
    }
    setSubmitLoading(true);
    getLiveKahootSocket().emit(
      'live:submit_answer',
      {
        roomId,
        questionIndex: room.currentQuestionIndex,
        selectedOption: localAnswer
      },
      (ack: { success?: boolean; message?: string }) => {
        setSubmitLoading(false);
        if (!ack?.success) {
          setError(ack?.message || 'Ответ не принят');
        } else {
          setError(null);
        }
      }
    );
  };

  const copyPin = () => {
    if (!room?.pin) return;
    void navigator.clipboard.writeText(room.pin);
  };

  const timeLeftMs =
    room?.questionEndAt != null
      ? Math.max(0, room.questionEndAt - nowMs)
      : 0;
  const limitMs = QUESTION_TIME_LIMIT_SEC * 1000;

  if (error && !room) {
    return (
      <div className="card space-y-3">
        <ErrorMessage message={error} />
        <Button onClick={() => navigate('/user')}>На дашборд</Button>
      </div>
    );
  }

  if (!room) {
    return <p className="text-sm text-slate-500">Загрузка…</p>;
  }

  if (room.type === 'lobby') {
    return (
      <div className="card max-w-lg space-y-4">
        <h1 className="section-title">Live Kahoot — лобби</h1>
        {error && <ErrorMessage message={error} />}
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/80 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Код комнаты</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-2xl font-bold tracking-[0.3em] text-slate-900">{room.pin}</span>
            <Button type="button" variant="outline" onClick={copyPin}>
              Копировать
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-600">Отправьте этот код друзьям, чтобы они вошли в «Live Kahoot → Войти».</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">Участники</p>
          <ul className="space-y-1 text-sm text-slate-700">
            {room.participants.map((p) => (
              <li key={p.userId} className="flex justify-between gap-2 rounded border border-slate-100 bg-slate-50/80 px-2 py-1">
                <span>
                  {p.displayName}
                  {p.isHost ? ' · ведущий' : ''}
                </span>
                <span className="shrink-0 text-slate-600">
                  {p.isHost ? (
                    <span className="text-slate-500">ведущий</span>
                  ) : p.ready ? (
                    <span className="font-medium text-emerald-700">Готов</span>
                  ) : (
                    <span className="text-amber-800">Не готов</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {!room.me.isHost && (
          <div className="flex flex-wrap items-center gap-2">
            <Button isLoading={readyLoading} onClick={() => setReady(true)} variant="outline" disabled={room.me.ready}>
              Готов
            </Button>
            {room.me.ready && (
              <Button isLoading={readyLoading} variant="ghost" onClick={() => setReady(false)}>
                Отменить готов
              </Button>
            )}
          </div>
        )}
        {room.me.isHost && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              {(() => {
                const guests = room.participants.filter((p) => !p.isHost);
                if (guests.length === 0) {
                  return 'Никто не присоединился — можете начать в одиночку или дождитесь гостей по коду.';
                }
                if (room.canHostStart) {
                  return 'Все участники нажали «Готово». Нажмите «Начать», чтобы запустить игру.';
                }
                return 'Дождитесь, пока каждый участник (кроме вас) нажмёт «Готово».';
              })()}
            </p>
            <Button
              isLoading={startLoading}
              onClick={hostStart}
              disabled={!room.canHostStart}
            >
              Начать
            </Button>
          </div>
        )}
        <Button variant="ghost" onClick={() => navigate('/user')}>
          Выйти (лобби закроется, если вы ведущий)
        </Button>
      </div>
    );
  }

  if (room.type === 'playing' && room.currentQuestion) {
    const q = room.currentQuestion as TestQuestion;
    return (
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submitAnswer();
        }}
      >
        {error && <ErrorMessage message={error} />}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-900">
              Вопрос {(room.currentQuestionIndex ?? 0) + 1} из {room.totalQuestions}
            </p>
            <p
              className={`text-sm font-semibold ${timeLeftMs <= 3000 ? 'text-red-600' : 'text-indigo-700'}`}
            >
              {Math.ceil(timeLeftMs / 1000)} c
            </p>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-indigo-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, (timeLeftMs / limitMs) * 100))}%` }}
            />
          </div>
        </div>
        <div className={room.hasSubmittedThisRound ? 'pointer-events-none opacity-60' : ''}>
          <EntQuestionBlock
            key={`${room.currentQuestionIndex}-${q.questionText.slice(0, 40)}`}
            question={q}
            index={room.currentQuestionIndex ?? 0}
            value={localAnswer}
            onChange={setLocalAnswer}
          />
        </div>
        <Button type="submit" isLoading={submitLoading} disabled={room.hasSubmittedThisRound || timeLeftMs <= 0}>
          {room.hasSubmittedThisRound ? 'Ответ отправлен' : 'Отправить ответ'}
        </Button>
      </form>
    );
  }

  if (room.type === 'finished' && room.finalLeaderboard) {
    return (
      <div className="card max-w-md space-y-4">
        <h1 className="section-title">Итоги Live Kahoot</h1>
        <ol className="space-y-2">
          {room.finalLeaderboard.map((row) => (
            <li
              key={row.userId}
              className="flex items-center justify-between rounded border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm"
            >
              <span>
                {row.rank}. {row.displayName}
              </span>
              <span className="font-semibold text-slate-900">{row.totalScore}</span>
            </li>
          ))}
        </ol>
        <Button onClick={() => navigate('/user', { replace: true })}>Готово</Button>
      </div>
    );
  }

  return <p className="text-slate-500">Ожидаем состояние…</p>;
};
