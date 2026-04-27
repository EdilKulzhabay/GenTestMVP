import { randomBytes, randomInt } from 'crypto';
import type { Server } from 'socket.io';
import { Test, User } from '../models';
import { IQuestion, ITest } from '../types';
import { assertLearnerSubjectAccess } from '../utils/learnerSubjectAccess.util';
import { gradeAnswer, sanitizeQuestionForClient } from '../utils/entQuestion.util';

const QUESTION_TIME_LIMIT_SEC = 15;
const BETWEEN_ROUNDS_MS = 1500;

const pinToRoomId = new Map<string, string>();
const rooms = new Map<string, LiveRoomState>();
const userRoom = new Map<string, string>();
const createInFlight = new Map<string, Promise<{ roomId: string; pin: string; state: Record<string, unknown> }>>();
let ioRef: Server | null = null;
let revGlobal = 0;

function nextRevision(): number {
  revGlobal += 1;
  return revGlobal;
}

function calculateQuestionScore(isCorrect: boolean, responseTimeMs: number): number {
  if (!isCorrect) return 0;
  const limitMs = QUESTION_TIME_LIMIT_SEC * 1000;
  const remainingSec = Math.max(0, (limitMs - Math.max(0, responseTimeMs)) / 1000);
  return Math.round(1000 * (0.3 + 0.7 * (remainingSec / QUESTION_TIME_LIMIT_SEC)));
}

function newRoomId(): string {
  return randomBytes(8).toString('hex');
}

function newPin(): string {
  for (let i = 0; i < 50; i += 1) {
    const n = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!pinToRoomId.has(n)) return n;
  }
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function normalizeJoinPin(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, '');
  if (d.length !== 6) return null;
  return d;
}

type LiveRoomPhase = 'lobby' | 'playing' | 'finished';

interface LiveRoomState {
  id: string;
  pin: string;
  hostId: string;
  testId: string;
  test: { questions: IQuestion[] };
  phase: LiveRoomPhase;
  revision: number;
  participants: Map<string, { displayName: string; ready: boolean; isHost: boolean }>;
  currentQuestionIndex: number;
  questionEndAt: number | null;
  questionStartedAt: number;
  currentAnswers: Map<string, { selectedOption: string; submittedAt: number }>;
  totalScoreByUser: Map<string, number>;
  questionTimer: ReturnType<typeof setTimeout> | null;
  betweenRoundsTimer: ReturnType<typeof setTimeout> | null;
  finishedTimer: ReturnType<typeof setTimeout> | null;
  finalLeaderboard: { rank: number; userId: string; displayName: string; totalScore: number }[] | null;
}

function getDisplayNameForUserId(userId: string): Promise<string> {
  return User.findById(userId)
    .lean()
    .then((u) => (u?.fullName && String(u.fullName).trim() ? String(u.fullName) : 'Игрок'));
}

function roomChannel(roomId: string): string {
  return `live:${roomId}`;
}

function emitToLiveRoom(roomId: string, event: string, payload: unknown): void {
  ioRef?.to(roomChannel(roomId)).emit(event, payload);
}

/** Персональные поля (me, canHostStart) — только в этот канал, иначе все клиенты в live:${room} получали бы последний payload. */
function emitRoomStateToUser(userId: string, room: LiveRoomState): void {
  ioRef?.to(`user:${userId}`).emit('live:room_state', buildStatePayload(room, userId));
}

function clearRoomTimers(room: LiveRoomState): void {
  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }
  if (room.betweenRoundsTimer) {
    clearTimeout(room.betweenRoundsTimer);
    room.betweenRoundsTimer = null;
  }
  if (room.finishedTimer) {
    clearTimeout(room.finishedTimer);
    room.finishedTimer = null;
  }
}

function canHostStart(room: LiveRoomState): boolean {
  const others = [...room.participants.values()].filter((p) => !p.isHost);
  if (others.length === 0) return true;
  return others.every((p) => p.ready);
}

function buildStatePayload(room: LiveRoomState, forUserId: string): Record<string, unknown> {
  const list = [...room.participants.entries()].map(([userId, p]) => {
    const base = {
      userId,
      displayName: p.displayName,
      isHost: p.isHost,
      ready: p.ready,
      totalScore: room.totalScoreByUser.get(userId) ?? 0
    };
    return base;
  });

  const me = room.participants.get(forUserId);
  const totalQuestions = room.test.questions.length;
  const q = room.test.questions[room.currentQuestionIndex];
  const sanitized =
    room.phase === 'playing' && q && room.currentQuestionIndex < totalQuestions
      ? sanitizeQuestionForClient(q as IQuestion)
      : null;

  return {
    revision: room.revision,
    type: room.phase,
    roomId: room.id,
    pin: room.pin,
    testId: room.testId,
    hostId: room.hostId,
    totalQuestions,
    me: me
      ? { userId: forUserId, isHost: me.isHost, ready: me.ready }
      : { userId: forUserId, isHost: false, ready: false },
    participants: list,
    canHostStart: forUserId === room.hostId ? canHostStart(room) : false,
    currentQuestionIndex:
      room.phase === 'playing' && room.currentQuestionIndex < totalQuestions
        ? room.currentQuestionIndex
        : null,
    questionEndAt: room.phase === 'playing' ? room.questionEndAt : null,
    currentQuestion: sanitized,
    hasSubmittedThisRound: room.currentAnswers.has(forUserId),
    finalLeaderboard: room.phase === 'finished' && room.finalLeaderboard ? room.finalLeaderboard : null
  };
}

function bumpAndEmit(room: LiveRoomState): void {
  room.revision = nextRevision();
  for (const uid of room.participants.keys()) {
    emitRoomStateToUser(uid, room);
  }
}

function deleteRoom(roomId: string): void {
  const r = rooms.get(roomId);
  if (!r) return;
  clearRoomTimers(r);
  pinToRoomId.delete(r.pin);
  for (const uid of r.participants.keys()) {
    userRoom.delete(uid);
  }
  rooms.delete(roomId);
}

function scheduleRoomCleanup(roomId: string, delayMs: number): void {
  const r = rooms.get(roomId);
  if (!r) return;
  if (r.finishedTimer) clearTimeout(r.finishedTimer);
  r.finishedTimer = setTimeout(() => {
    const cur = rooms.get(roomId);
    if (cur && cur.phase === 'finished') {
      clearRoomTimers(cur);
      for (const uid of cur.participants.keys()) {
        userRoom.delete(uid);
      }
      pinToRoomId.delete(cur.pin);
      rooms.delete(roomId);
    }
  }, delayMs);
}

function startQuestion(room: LiveRoomState, index: number): void {
  const total = room.test.questions.length;
  if (index >= total) {
    void finishGame(room);
    return;
  }
  clearRoomTimers(room);
  room.currentQuestionIndex = index;
  room.currentAnswers = new Map();
  const now = Date.now();
  room.questionStartedAt = now;
  room.questionEndAt = now + QUESTION_TIME_LIMIT_SEC * 1000;
  room.questionTimer = setTimeout(() => {
    void resolveCurrentQuestionRoom(room.id);
  }, QUESTION_TIME_LIMIT_SEC * 1000);
  bumpAndEmit(room);
}

async function finishGame(room: LiveRoomState): Promise<void> {
  room.phase = 'finished';
  clearRoomTimers(room);
  const scores = [...room.totalScoreByUser.entries()].map(([userId, totalScore]) => {
    const name = room.participants.get(userId)?.displayName ?? 'Игрок';
    return { userId, displayName: name, totalScore };
  });
  scores.sort((a, b) => b.totalScore - a.totalScore);
  room.finalLeaderboard = scores.map((s, i) => ({ rank: i + 1, ...s }));
  room.revision = nextRevision();
  for (const uid of room.participants.keys()) {
    emitRoomStateToUser(uid, room);
  }
  scheduleRoomCleanup(room.id, 60 * 60 * 1000);
}

function maybeEarlyResolve(room: LiveRoomState): void {
  const eligible = [...room.participants.keys()];
  if (eligible.length === 0) return;
  const allIn = eligible.every((uid) => room.currentAnswers.has(uid));
  if (allIn) {
    if (room.questionTimer) {
      clearTimeout(room.questionTimer);
      room.questionTimer = null;
    }
    void resolveCurrentQuestionRoom(room.id);
  }
}

async function resolveCurrentQuestionRoom(roomId: string): Promise<void> {
  const room = rooms.get(roomId);
  if (!room || room.phase !== 'playing') return;
  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }
  const q = room.test.questions[room.currentQuestionIndex];
  if (!q) {
    await finishGame(room);
    return;
  }
  for (const uid of room.participants.keys()) {
    const prev = room.totalScoreByUser.get(uid) ?? 0;
    const ans = room.currentAnswers.get(uid);
    if (!ans) {
      room.totalScoreByUser.set(uid, prev);
      continue;
    }
    const cappedMs = Math.min(
      Math.max(0, ans.submittedAt - room.questionStartedAt),
      QUESTION_TIME_LIMIT_SEC * 1000
    );
    const isCorrect = gradeAnswer(q as IQuestion, ans.selectedOption || '');
    const add = calculateQuestionScore(isCorrect, cappedMs);
    room.totalScoreByUser.set(uid, prev + add);
  }
  const lastIndex = room.test.questions.length - 1;
  if (room.currentQuestionIndex >= lastIndex) {
    await finishGame(room);
    return;
  }
  room.revision = nextRevision();
  for (const uid of room.participants.keys()) {
    emitRoomStateToUser(uid, room);
  }
  room.betweenRoundsTimer = setTimeout(() => {
    const r = rooms.get(roomId);
    if (r && r.phase === 'playing') {
      startQuestion(r, r.currentQuestionIndex + 1);
    }
  }, BETWEEN_ROUNDS_MS);
}

export function initLiveKahootIo(io: Server): void {
  ioRef = io;
}

export async function createLiveRoom(
  userId: string,
  testId: string
): Promise<{ roomId: string; pin: string; state: Record<string, unknown> }> {
  if (createInFlight.has(userId)) {
    return createInFlight.get(userId)!;
  }
  const run = (async () => {
    const testDoc = (await Test.findById(testId).lean()) as ITest & { _id: { toString: () => string } };
    if (!testDoc?.questions?.length) {
      throw new Error('Test not found');
    }
    await assertLearnerSubjectAccess(userId, testDoc.subjectId.toString());
    if (userRoom.has(userId)) {
      const old = userRoom.get(userId);
      if (old) {
        const r = rooms.get(old);
        if (r && r.hostId === userId) deleteRoom(old);
      }
    }
    const id = newRoomId();
    const pin = newPin();
    pinToRoomId.set(pin, id);
    const name = await getDisplayNameForUserId(userId);
    const room: LiveRoomState = {
      id,
      pin,
      hostId: userId,
      testId: testDoc._id.toString(),
      test: { questions: testDoc.questions as IQuestion[] },
      phase: 'lobby',
      revision: 0,
      participants: new Map([[userId, { displayName: name, ready: false, isHost: true }]]),
      currentQuestionIndex: 0,
      questionEndAt: null,
      questionStartedAt: Date.now(),
      currentAnswers: new Map(),
      totalScoreByUser: new Map([[userId, 0]]),
      questionTimer: null,
      betweenRoundsTimer: null,
      finishedTimer: null,
      finalLeaderboard: null
    };
    room.revision = nextRevision();
    rooms.set(id, room);
    userRoom.set(userId, id);
    return { roomId: id, pin, state: buildStatePayload(room, userId) };
  })();
  createInFlight.set(userId, run);
  try {
    return await run;
  } finally {
    createInFlight.delete(userId);
  }
}

export function tryJoinByPin(
  userId: string,
  pin: string
):
  | { ok: true; roomId: string; state: Record<string, unknown> }
  | { ok: false; code: 'NOT_FOUND' | 'ALREADY_STARTED' } {
  const n = normalizeJoinPin(pin);
  if (!n) return { ok: false, code: 'NOT_FOUND' };
  const roomId = pinToRoomId.get(n);
  if (!roomId) return { ok: false, code: 'NOT_FOUND' };
  const room = rooms.get(roomId);
  if (!room) {
    pinToRoomId.delete(n);
    return { ok: false, code: 'NOT_FOUND' };
  }
  if (room.phase !== 'lobby') {
    return { ok: false, code: 'ALREADY_STARTED' };
  }
  if (room.hostId === userId) {
    userRoom.set(userId, roomId);
    return { ok: true, roomId, state: buildStatePayload(room, userId) };
  }
  if (userRoom.has(userId) && userRoom.get(userId) !== roomId) {
    const other = userRoom.get(userId);
    if (other) {
      const r = rooms.get(other);
      if (r && r.phase === 'lobby' && r.hostId === userId) {
        deleteRoom(other);
      } else if (r && r.phase === 'lobby' && r.hostId !== userId) {
        r.participants.delete(userId);
        bumpAndEmit(r);
        userRoom.delete(userId);
      }
    }
  }
  if (!room.participants.has(userId)) {
    const displayName = 'Игрок';
    void getDisplayNameForUserId(userId).then((name) => {
      const r = rooms.get(roomId);
      if (!r || r.phase !== 'lobby' || !r.participants.has(userId)) return;
      const p = r.participants.get(userId);
      if (p) {
        p.displayName = name;
        bumpAndEmit(r);
      }
    });
    room.participants.set(userId, { displayName, ready: false, isHost: false });
    room.totalScoreByUser.set(userId, 0);
    userRoom.set(userId, roomId);
    bumpAndEmit(room);
  } else {
    userRoom.set(userId, roomId);
  }
  return { ok: true, roomId, state: buildStatePayload(room, userId) };
}

export function setReady(
  userId: string,
  roomId: string,
  ready: boolean
): { ok: boolean; message?: string; debug?: Record<string, unknown> } {
  const rid = String(roomId || '').trim();
  const room = rooms.get(rid);
  if (!room) {
    const debug = {
      reason: 'ROOM_NOT_FOUND' as const,
      roomIdRaw: roomId,
      roomIdUsed: rid,
      userId,
      roomCount: rooms.size,
      sampleRoomIds: [...rooms.keys()].slice(0, 5)
    };
    console.warn('[liveKahoot:setReady]', debug);
    return { ok: false, message: 'Комната не найдена', debug };
  }
  if (room.phase !== 'lobby') {
    const debug = { reason: 'NOT_LOBBY' as const, roomId, userId, phase: room.phase };
    console.warn('[liveKahoot:setReady]', debug);
    return { ok: false, message: 'Игра уже идёт', debug };
  }
  const p = room.participants.get(userId);
  if (!p) {
    const userMappedRoom = userRoom.get(userId);
    const debug = {
      reason: 'NOT_IN_PARTICIPANTS' as const,
      roomId,
      userId,
      userRoomMap: userMappedRoom,
      participantIds: [...room.participants.keys()],
      roomHostId: room.hostId
    };
    console.warn(
      '[liveKahoot:setReady] участник не в room.participants (сокет/сессия не совпали с картой userRoom?)',
      debug
    );
    return { ok: false, message: 'Вы не в комнате', debug };
  }
  if (p.isHost) {
    const debug = { reason: 'IS_HOST' as const, roomId, userId };
    console.warn('[liveKahoot:setReady]', debug);
    return { ok: false, message: 'Ведущему не нужно нажимать «Готово»', debug };
  }
  p.ready = Boolean(ready);
  bumpAndEmit(room);
  return { ok: true };
}

export function startLiveGame(
  userId: string,
  roomId: string
): { ok: boolean; message?: string } {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, message: 'Комната не найдена' };
  if (room.hostId !== userId) return { ok: false, message: 'Только ведущий может начать' };
  if (room.phase !== 'lobby') return { ok: false, message: 'Игра уже началась' };
  if (!canHostStart(room)) {
    return { ok: false, message: 'Дождитесь, пока все участники нажмут «Готово»' };
  }
  room.phase = 'playing';
  room.currentQuestionIndex = 0;
  startQuestion(room, 0);
  return { ok: true };
}

export function submitLiveAnswer(
  userId: string,
  roomId: string,
  questionIndex: number,
  selectedOption: string
): { ok: boolean; message?: string } {
  const room = rooms.get(roomId);
  if (!room || room.phase !== 'playing') return { ok: false, message: 'Сейчас нельзя ответить' };
  if (!room.participants.has(userId)) return { ok: false, message: 'Вы не в игре' };
  if (room.currentQuestionIndex !== questionIndex) return { ok: false, message: 'Несовпадение вопроса' };
  if (room.currentAnswers.has(userId)) return { ok: false, message: 'Ответ уже отправлен' };
  const end = room.questionEndAt;
  if (end != null && Date.now() > end) {
    return { ok: false, message: 'Время вышло' };
  }
  room.currentAnswers.set(userId, { selectedOption: selectedOption || '', submittedAt: Date.now() });
  bumpAndEmit(room);
  maybeEarlyResolve(room);
  return { ok: true };
}

export function rejoinLiveRoom(
  userId: string,
  roomId: string
): { ok: true; state: Record<string, unknown> } | { ok: false; code: 'NOT_FOUND' | 'NOT_MEMBER' } {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, code: 'NOT_FOUND' };
  if (!room.participants.has(userId)) return { ok: false, code: 'NOT_MEMBER' };
  userRoom.set(userId, roomId);
  return { ok: true, state: buildStatePayload(room, userId) };
}

export function onLiveUserDisconnect(userId: string, roomId?: string): void {
  const rid = roomId ?? userRoom.get(userId);
  if (!rid) return;
  const room = rooms.get(rid);
  if (!room) return;
  if (room.phase === 'lobby') {
    doLeaveLobby(userId, rid);
  }
}

export function leaveLiveLobby(userId: string, roomId: string): boolean {
  return doLeaveLobby(userId, roomId);
}

function doLeaveLobby(userId: string, roomId: string): boolean {
  const room = rooms.get(roomId);
  if (!room || room.phase !== 'lobby') return false;
  if (room.hostId !== userId && !room.participants.has(userId)) return false;
  if (room.hostId === userId) {
    room.revision = nextRevision();
    emitToLiveRoom(roomId, 'live:room_closed', { reason: 'host_left' });
    deleteRoom(roomId);
    return true;
  }
  room.participants.delete(userId);
  userRoom.delete(userId);
  if (room.totalScoreByUser.has(userId)) room.totalScoreByUser.delete(userId);
  if (room.participants.size === 0) {
    deleteRoom(roomId);
    return true;
  }
  bumpAndEmit(room);
  return true;
}

export function getRoomIdForUser(userId: string): string | undefined {
  return userRoom.get(userId);
}
