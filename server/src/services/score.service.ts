import { Types } from 'mongoose';
import { LiveMatchResult, SoloAttempt, User } from '../models';
import { AppError } from '../utils';

export interface IMyScore {
  total: number;
  breakdown: { tests: number; solo: number; live: number };
  updatedAt: string;
}

/** Баллы за правильный ответ в обычных тестах */
const POINTS_PER_CORRECT_ANSWER = 10;
/** Speed-очки solo/live (≈1000 за вопрос) идут в счёт в масштабе 1/10 */
const SPEED_SCORE_DIVISOR = 10;

/**
 * SCORE SERVICE
 * Серверный источник «баллов» пользователя (раньше клиент считал их формулой из
 * stats). Начисление только из реальных событий: правильные ответы в тестах +
 * speed-очки solo-кахутов и live-матчей.
 */
class ScoreService {
  async getMyScore(userId: string): Promise<IMyScore> {
    const user = await User.findById(userId).select('testHistory.result').lean();
    if (!user) throw AppError.notFound('User not found');

    const tests = (user.testHistory ?? []).reduce(
      (sum, t) => sum + (t.result?.correctAnswers ?? 0) * POINTS_PER_CORRECT_ANSWER,
      0
    );

    const uid = new Types.ObjectId(userId);
    const [soloAgg, liveAgg] = await Promise.all([
      SoloAttempt.aggregate<{ total: number }>([
        { $match: { userId: uid } },
        { $group: { _id: null, total: { $sum: '$finalScore' } } }
      ]),
      LiveMatchResult.aggregate<{ total: number }>([
        { $match: { userId: uid } },
        { $group: { _id: null, total: { $sum: '$totalScore' } } }
      ])
    ]);

    const solo = Math.round((soloAgg[0]?.total ?? 0) / SPEED_SCORE_DIVISOR);
    const live = Math.round((liveAgg[0]?.total ?? 0) / SPEED_SCORE_DIVISOR);

    return {
      total: tests + solo + live,
      breakdown: { tests, solo, live },
      updatedAt: new Date().toISOString()
    };
  }
}

export const scoreService = new ScoreService();
