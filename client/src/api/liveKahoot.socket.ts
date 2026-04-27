import { getSoloSocket } from './solo.socket';
import type { TestQuestion } from '../types/test.types';

export const getLiveKahootSocket = getSoloSocket;

export type LiveRoomType = 'lobby' | 'playing' | 'finished';

export interface LiveParticipantRow {
  userId: string;
  displayName: string;
  isHost: boolean;
  ready: boolean;
  totalScore: number;
}

export interface LiveRoomStatePayload {
  revision: number;
  type: LiveRoomType;
  roomId: string;
  pin: string;
  testId: string;
  hostId: string;
  totalQuestions: number;
  me: { userId: string; isHost: boolean; ready: boolean };
  participants: LiveParticipantRow[];
  canHostStart: boolean;
  currentQuestionIndex: number | null;
  questionEndAt: number | null;
  currentQuestion: TestQuestion | null;
  hasSubmittedThisRound: boolean;
  finalLeaderboard: { rank: number; userId: string; displayName: string; totalScore: number }[] | null;
}

export interface LiveCreateAck {
  success: boolean;
  message?: string;
  roomId?: string;
  pin?: string;
  state?: LiveRoomStatePayload;
}

export interface LiveJoinAck {
  success: boolean;
  message?: string;
  code?: 'ALREADY_STARTED' | 'NOT_FOUND';
  roomId?: string;
  state?: LiveRoomStatePayload;
}

export interface LiveRejoinAck {
  success: boolean;
  code?: 'NOT_FOUND' | 'NOT_MEMBER';
  message?: string;
  state?: LiveRoomStatePayload;
}
