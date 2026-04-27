import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { SoloAttempt, SoloSession, Test, User } from '../models';
import { AppError } from '../utils';
import { gradeAnswer, sanitizeQuestionForClient } from '../utils/entQuestion.util';
import { IQuestion, IJWTPayload } from '../types';
import {
  createLiveRoom,
  tryJoinByPin,
  setReady,
  startLiveGame,
  submitLiveAnswer,
  rejoinLiveRoom,
  onLiveUserDisconnect,
  initLiveKahootIo,
  leaveLiveLobby
} from '../services/liveKahoot.service';

type AuthSocket = Socket & { userId?: string; liveRoomId?: string };

const SOLO_QUESTION_TIME_LIMIT_SEC = 15;

const parseCookieValue = (cookieHeader: string | undefined, name: string): string | null => {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map((x) => x.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) return decodeURIComponent(part.slice(name.length + 1));
  }
  return null;
};

const calculateSoloQuestionScore = (isCorrect: boolean, responseTimeMs: number): number => {
  if (!isCorrect) return 0;
  const limitMs = SOLO_QUESTION_TIME_LIMIT_SEC * 1000;
  const remainingSec = Math.max(0, (limitMs - Math.max(0, responseTimeMs)) / 1000);
  const score = 1000 * (0.3 + 0.7 * (remainingSec / SOLO_QUESTION_TIME_LIMIT_SEC));
  return Math.round(score);
};

export const initSocketServer = (httpServer: HttpServer): Server => {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true }
  });

  initLiveKahootIo(io);

  io.use(async (socket: AuthSocket, next) => {
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) throw new Error('JWT secret missing');
      const fromCookie = parseCookieValue(socket.handshake.headers.cookie, 'token');
      const fromAuth =
        typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : null;
      const fromBearer = fromAuth?.startsWith('Bearer ') ? fromAuth.slice(7) : fromAuth;
      const token = fromCookie || fromBearer;
      if (!token) return next(new Error('Unauthorized'));

      const decoded = jwt.verify(token, jwtSecret) as IJWTPayload;
      const user = await User.findById(decoded.userId);
      if (!user) return next(new Error('Unauthorized'));
      socket.userId = decoded.userId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: AuthSocket) => {
    if (socket.userId) {
      void socket.join(`user:${socket.userId}`);
    }
    const joinLiveChannel = (roomId: string) => {
      if (socket.liveRoomId) {
        void socket.leave(`live:${socket.liveRoomId}`);
      }
      socket.liveRoomId = roomId;
      void socket.join(`live:${roomId}`);
    };

    socket.on('live:create', async (payload: { testId: string }, ack?: (data: any) => void) => {
      try {
        if (!socket.userId) throw AppError.unauthorized('Not authenticated');
        const { testId } = payload || {};
        if (!testId) throw AppError.badRequest('testId is required');
        const { roomId, pin, state } = await createLiveRoom(socket.userId, testId);
        joinLiveChannel(roomId);
        ack?.({ success: true, roomId, pin, state });
      } catch (error: any) {
        ack?.({ success: false, message: error.message || 'Не удалось создать комнату' });
      }
    });

    socket.on('live:join', (payload: { pin: string }, ack?: (data: any) => void) => {
      try {
        if (!socket.userId) throw AppError.unauthorized('Not authenticated');
        const { pin } = payload || {};
        if (!pin) throw AppError.badRequest('pin is required');
        const result = tryJoinByPin(socket.userId, pin);
        if (!result.ok) {
          if (result.code === 'ALREADY_STARTED') {
            ack?.({ success: false, code: 'ALREADY_STARTED', message: 'Live Kahoot уже начался, присоединиться нельзя' });
            return;
          }
          ack?.({ success: false, code: 'NOT_FOUND', message: 'Код не найден' });
          return;
        }
        joinLiveChannel(result.roomId);
        ack?.({ success: true, roomId: result.roomId, state: result.state });
      } catch (error: any) {
        ack?.({ success: false, message: error.message || 'Join failed' });
      }
    });

    socket.on('live:lobby_leave', (payload: { roomId: string }, ack?: (data: any) => void) => {
      try {
        if (!socket.userId) throw AppError.unauthorized('Not authenticated');
        const { roomId } = payload || {};
        if (!roomId) throw AppError.badRequest('roomId is required');
        const did = leaveLiveLobby(socket.userId, roomId);
        if (did && socket.liveRoomId === roomId) {
          void socket.leave(`live:${roomId}`);
          delete socket.liveRoomId;
        }
        ack?.({ success: true });
      } catch (error: any) {
        ack?.({ success: false, message: error.message || 'leave failed' });
      }
    });

    socket.on('live:rejoin', (payload: { roomId: string }, ack?: (data: any) => void) => {
      try {
        if (!socket.userId) throw AppError.unauthorized('Not authenticated');
        const { roomId } = payload || {};
        if (!roomId) throw AppError.badRequest('roomId is required');
        const r = rejoinLiveRoom(socket.userId, roomId);
        if (!r.ok) {
          ack?.({ success: false, code: r.code, message: 'Не удалось вернуться в комнату' });
          return;
        }
        joinLiveChannel(roomId);
        ack?.({ success: true, state: r.state });
      } catch (error: any) {
        ack?.({ success: false, message: error.message || 'Rejoin failed' });
      }
    });

    socket.on('live:ready', (payload: { roomId: string; ready: boolean }, ack?: (data: any) => void) => {
      try {
        if (!socket.userId) throw AppError.unauthorized('Not authenticated');
        const { roomId, ready } = payload || {};
        if (!roomId) throw AppError.badRequest('roomId is required');
        if (process.env.NODE_ENV !== 'production') {
          console.log('[socket:live:ready] вход', {
            userId: socket.userId,
            roomId: String(roomId),
            ready: Boolean(ready)
          });
        }
        const r = setReady(socket.userId, roomId, Boolean(ready));
        if (!r.ok) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('[socket:live:ready] отказ', { message: r.message, debug: r.debug });
          }
          ack?.({ success: false, message: r.message, debug: r.debug });
          return;
        }
        ack?.({ success: true });
      } catch (error: any) {
        console.warn('[socket:live:ready] исключение', error?.message || error);
        ack?.({ success: false, message: error.message || 'ready failed' });
      }
    });

    socket.on('live:host_start', (payload: { roomId: string }, ack?: (data: any) => void) => {
      try {
        if (!socket.userId) throw AppError.unauthorized('Not authenticated');
        const { roomId } = payload || {};
        if (!roomId) throw AppError.badRequest('roomId is required');
        const r = startLiveGame(socket.userId, roomId);
        if (!r.ok) {
          ack?.({ success: false, message: r.message });
          return;
        }
        ack?.({ success: true });
      } catch (error: any) {
        ack?.({ success: false, message: error.message || 'start failed' });
      }
    });

    socket.on(
      'live:submit_answer',
      (payload: { roomId: string; questionIndex: number; selectedOption: string }, ack?: (data: any) => void) => {
        try {
          if (!socket.userId) throw AppError.unauthorized('Not authenticated');
          const { roomId, questionIndex, selectedOption } = payload || {};
          if (!roomId) throw AppError.badRequest('roomId is required');
          if (typeof questionIndex !== 'number') throw AppError.badRequest('questionIndex is required');
          const r = submitLiveAnswer(socket.userId, roomId, questionIndex, selectedOption || '');
          if (!r.ok) {
            ack?.({ success: false, message: r.message });
            return;
          }
          ack?.({ success: true });
        } catch (error: any) {
          ack?.({ success: false, message: error.message || 'submit failed' });
        }
      }
    );

    socket.on('disconnect', () => {
      onLiveUserDisconnect(socket.userId || '', socket.liveRoomId);
    });

    socket.on('solo:join', async (payload: { soloSessionId: string }, ack?: (data: any) => void) => {
      try {
        const { soloSessionId } = payload || {};
        if (!soloSessionId) throw AppError.badRequest('soloSessionId is required');
        const session = await SoloSession.findById(soloSessionId);
        if (!session) throw AppError.notFound('Solo session not found');
        if (session.userId.toString() !== socket.userId) throw AppError.forbidden('Access denied');

        const test = await Test.findById(session.testId);
        if (!test) throw AppError.notFound('Test not found');

        socket.join(`solo:${session.id}`);
        const question = test.questions[session.currentQuestionIndex];
        ack?.({
          success: true,
          session: {
            soloSessionId: session.id,
            currentQuestionIndex: session.currentQuestionIndex,
            questionStartedAt: session.questionStartedAt,
            questionTimeLimitSec: session.questionTimeLimitSec,
            totalQuestions: test.questions.length,
            question: question ? sanitizeQuestionForClient(question as IQuestion) : null
          }
        });
      } catch (error: any) {
        ack?.({ success: false, message: error.message || 'Join failed' });
      }
    });

    socket.on(
      'solo:answer',
      async (
        payload: { soloSessionId: string; questionIndex: number; selectedOption: string },
        ack?: (data: any) => void
      ) => {
        try {
          const { soloSessionId, questionIndex, selectedOption } = payload || {};
          if (!soloSessionId) throw AppError.badRequest('soloSessionId is required');
          const session = await SoloSession.findById(soloSessionId);
          if (!session) throw AppError.notFound('Solo session not found');
          if (session.userId.toString() !== socket.userId) throw AppError.forbidden('Access denied');
          if (session.isFinished) throw AppError.badRequest('Solo session already finished');
          if (session.currentQuestionIndex !== questionIndex) throw AppError.badRequest('Question index mismatch');

          const test = await Test.findById(session.testId);
          if (!test) throw AppError.notFound('Test not found');
          const question = test.questions[questionIndex];
          if (!question) throw AppError.badRequest('Invalid question index');

          const elapsedMs = Math.max(0, Date.now() - session.questionStartedAt.getTime());
          const cappedMs = Math.min(elapsedMs, session.questionTimeLimitSec * 1000);
          const isCorrect = gradeAnswer(question as IQuestion, selectedOption || '');
          const questionScore = calculateSoloQuestionScore(isCorrect, cappedMs);

          const nextIndex = questionIndex + 1;
          const isLastQuestion = nextIndex >= test.questions.length;

          session.answers.push({
            questionIndex,
            selectedOption: selectedOption || '',
            isCorrect,
            responseTimeMs: cappedMs,
            questionScore
          });
          session.currentQuestionIndex = nextIndex;
          session.questionStartedAt = new Date();
          if (isLastQuestion) session.isFinished = true;
          await session.save();

          const nextQuestion = isLastQuestion ? null : test.questions[nextIndex];

          ack?.({
            success: true,
            accepted: true,
            questionIndex,
            isCorrect,
            questionScore,
            responseTimeMs: cappedMs,
            finished: isLastQuestion,
            nextQuestionIndex: isLastQuestion ? null : nextIndex,
            questionStartedAt: isLastQuestion ? null : session.questionStartedAt,
            nextQuestion: nextQuestion ? sanitizeQuestionForClient(nextQuestion as IQuestion) : null
          });
        } catch (error: any) {
          ack?.({ success: false, message: error.message || 'Answer failed' });
        }
      }
    );

    socket.on('solo:finish', async (payload: { soloSessionId: string }, ack?: (data: any) => void) => {
      try {
        const { soloSessionId } = payload || {};
        if (!soloSessionId) throw AppError.badRequest('soloSessionId is required');
        const session = await SoloSession.findById(soloSessionId);
        if (!session) throw AppError.notFound('Solo session not found');
        if (session.userId.toString() !== socket.userId) throw AppError.forbidden('Access denied');

        const test = await Test.findById(session.testId);
        if (!test) throw AppError.notFound('Test not found');
        if (session.answers.length !== test.questions.length) {
          throw AppError.badRequest('Solo session is not complete yet');
        }

        const alreadyExists = await SoloAttempt.findOne({
          userId: session.userId,
          dailyPackId: session.dailyPackId,
          createdAt: { $gte: session.createdAt },
          totalQuestions: test.questions.length
        }).sort({ createdAt: -1 });

        if (alreadyExists) {
          ack?.({ success: true, duplicate: true });
          return;
        }

        const finalScore = session.answers.reduce((sum, item) => sum + item.questionScore, 0);
        const correctCount = session.answers.filter((item) => item.isCorrect).length;

        const createdAttempt = await SoloAttempt.create({
          userId: session.userId,
          subjectId: test.subjectId,
          bookId: test.bookId,
          chapterId: test.chapterId,
          dailyPackId: session.dailyPackId,
          attemptType: session.attemptType,
          finalScore,
          correctCount,
          answeredCount: session.answers.length,
          totalQuestions: test.questions.length
        });

        const betterCount = await SoloAttempt.countDocuments({
          dailyPackId: session.dailyPackId,
          attemptType: 'ranked',
          $or: [
            { finalScore: { $gt: finalScore } },
            { finalScore, createdAt: { $lt: createdAttempt.createdAt } }
          ]
        });

        ack?.({
          success: true,
          result: {
            totalQuestions: test.questions.length,
            correctAnswers: correctCount,
            scorePercent: Math.round((correctCount / test.questions.length) * 100)
          },
          solo: {
            dailyPackId: session.dailyPackId,
            mode: session.mode,
            attemptType: session.attemptType,
            finalScore,
            questionTimeLimitSec: session.questionTimeLimitSec,
            rank: session.attemptType === 'ranked' ? betterCount + 1 : null
          }
        });
      } catch (error: any) {
        ack?.({ success: false, message: error.message || 'Finish failed' });
      }
    });
  });

  return io;
};

