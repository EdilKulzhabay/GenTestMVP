import { io, Socket } from 'socket.io-client';
import type { TestQuestion } from '../types/test.types';

/**
 * База URL для Socket.IO (тот же хост, что и API / фронт в prod).
 * Если задан VITE_API_URL — берём origin из него; иначе в браузере — window.location.origin
 * (важно для https://domain без .env: иначе был бы localhost:5000 и wss ломался).
 *
 * Nginx: нужен proxy на /socket.io/ с Upgrade (WebSocket), иначе оставьте polling (см. transports ниже).
 */
const socketBase: string = (() => {
  const raw = import.meta.env.VITE_API_URL;
  if (raw != null && String(raw).length > 0) {
    return String(raw).replace(/\/api\/v\d+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return import.meta.env.DEV ? 'http://localhost:5173' : 'http://localhost:5000';
})();

let soloSocket: Socket | null = null;

export const getSoloSocket = (): Socket => {
  if (soloSocket) return soloSocket;
  soloSocket = io(socketBase, {
    path: '/socket.io/',
    withCredentials: true,
    /** Сначала polling: часто проходит за прокси, где WebSocket не проброшен; затем upgrade */
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    timeout: 20000
  });
  return soloSocket;
};

export interface SoloJoinAck {
  success: boolean;
  message?: string;
  session?: {
    soloSessionId: string;
    currentQuestionIndex: number;
    questionStartedAt: string;
    questionTimeLimitSec: number;
    totalQuestions: number;
    question: TestQuestion | null;
  };
}

export interface SoloAnswerAck {
  success: boolean;
  message?: string;
  accepted?: boolean;
  questionIndex?: number;
  isCorrect?: boolean;
  questionScore?: number;
  responseTimeMs?: number;
  finished?: boolean;
  nextQuestionIndex?: number | null;
  questionStartedAt?: string | null;
  nextQuestion?: TestQuestion | null;
}

export interface SoloFinishAck {
  success: boolean;
  message?: string;
  duplicate?: boolean;
  result?: {
    totalQuestions: number;
    correctAnswers: number;
    scorePercent: number;
  };
  solo?: {
    dailyPackId: string;
    mode: 'daily_pack' | 'practice';
    attemptType: 'ranked' | 'practice';
    finalScore: number;
    questionTimeLimitSec: number;
    rank: number | null;
  };
}
