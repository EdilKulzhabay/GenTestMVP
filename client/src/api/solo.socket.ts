import { io, Socket } from 'socket.io-client';
import type { TestQuestion } from '../types/test.types';

const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api/v1';
const socketBase = apiBase.replace(/\/api\/v\d+$/, '');

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

