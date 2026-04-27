import { io, Socket } from 'socket.io-client';
import type { TestQuestion } from '../types/test.types';

/** Без VITE_API_URL в dev — тот же origin что и фронт (5173), Vite проксирует /socket.io на сервер. */
const socketBase =
  import.meta.env.VITE_API_URL != null && String(import.meta.env.VITE_API_URL).length > 0
    ? String(import.meta.env.VITE_API_URL).replace(/\/api\/v\d+$/, '')
    : import.meta.env.DEV
      ? typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:5173'
      : 'http://localhost:5000';

let soloSocket: Socket | null = null;

export const getSoloSocket = (): Socket => {
  if (soloSocket) return soloSocket;
  soloSocket = io(socketBase, {
    withCredentials: true,
    transports: ['websocket', 'polling']
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

