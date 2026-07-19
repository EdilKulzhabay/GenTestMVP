import { Request, Response } from 'express';
import { User, ProfileSubjectPair, Test } from '../models';
import { success, AppError } from '../utils';
import {
  testResultService,
  profileStatsService,
  entProgressService,
  achievementsService,
  scoreService
} from '../services';
import { ITestHistory, IUserAnswer } from '../types';

class UserController {
  /** Populate выбранной пары профильных предметов — свежий объект на каждый вызов. */
  private pairPopulate() {
    return {
      path: 'profileSubjectPairId',
      populate: [
        { path: 'subject1Id', select: 'title subjectKind' },
        { path: 'subject2Id', select: 'title subjectKind' }
      ]
    };
  }

  private userId(req: Request): string {
    return (req as any).user?.userId as string;
  }

  /**
   * GET /users/me — профиль (без тяжёлого testHistory; для истории есть /users/me/tests).
   * Включает avatarUrl и выбранную пару профильных предметов.
   */
  async getCurrentUser(req: Request, res: Response): Promise<void> {
    const user = await User.findById(this.userId(req))
      .select('-password -testHistory')
      .populate(this.pairPopulate());
    if (!user) throw AppError.notFound('User not found');
    success(res, user);
  }

  /** PATCH /users/me — редактирование профиля (имя, аватарка). */
  async updateProfile(req: Request, res: Response): Promise<void> {
    const userId = this.userId(req);
    const { fullName, avatarUrl } = req.body as { fullName?: string; avatarUrl?: string | null };

    const set: Record<string, unknown> = {};
    const unset: Record<string, unknown> = {};

    if (fullName !== undefined) set.fullName = String(fullName).trim();
    if (avatarUrl !== undefined) {
      if (avatarUrl === null || avatarUrl === '') unset.avatarUrl = 1;
      else set.avatarUrl = String(avatarUrl).trim();
    }

    if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
      throw AppError.badRequest('Нечего обновлять: передайте fullName и/или avatarUrl');
    }

    const updateOps: Record<string, unknown> = {};
    if (Object.keys(set).length) updateOps.$set = set;
    if (Object.keys(unset).length) updateOps.$unset = unset;

    const user = await User.findByIdAndUpdate(userId, updateOps, { new: true, runValidators: true })
      .select('-password -testHistory')
      .populate(this.pairPopulate());
    if (!user) throw AppError.notFound('User not found');
    success(res, user, 'Профиль обновлён');
  }

  /** PATCH /users/me/profile-subject-pair — id пары из GET /profile-subject-pairs или null для сброса */
  async setProfileSubjectPair(req: Request, res: Response): Promise<void> {
    const userId = this.userId(req);
    const { profileSubjectPairId } = req.body as { profileSubjectPairId?: string | null };

    if (profileSubjectPairId === undefined) {
      throw AppError.badRequest('profileSubjectPairId is required (Mongo id или null для сброса)');
    }

    if (profileSubjectPairId === null || profileSubjectPairId === '') {
      await User.findByIdAndUpdate(userId, { $unset: { profileSubjectPairId: 1 } });
      const user = await User.findById(userId)
        .select('-password -testHistory')
        .populate(this.pairPopulate());
      success(res, user, 'Profile subject pair cleared');
      return;
    }

    const pair = await ProfileSubjectPair.findById(profileSubjectPairId);
    if (!pair) throw AppError.notFound('Profile subject pair not found');

    await User.findByIdAndUpdate(userId, { profileSubjectPairId: pair._id });
    const user = await User.findById(userId)
      .select('-password -testHistory')
      .populate(this.pairPopulate());
    success(res, user, 'Profile subject pair saved');
  }

  /** GET /users/me/tests */
  async getTestHistory(req: Request, res: Response): Promise<void> {
    const { subjectId, limit, sortBy = 'createdAt', order = 'desc' } = req.query;

    const user = await User.findById(this.userId(req))
      .select('testHistory')
      .populate('testHistory.subjectId', 'title');
    if (!user) throw AppError.notFound('User not found');

    let tests = user.testHistory || [];

    if (subjectId) {
      tests = tests.filter((t) => t.subjectId.toString() === subjectId);
    }

    tests.sort((a, b) => {
      const aVal = sortBy === 'scorePercent' ? a.result.scorePercent : new Date(a.createdAt!).getTime();
      const bVal = sortBy === 'scorePercent' ? b.result.scorePercent : new Date(b.createdAt!).getTime();
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });

    if (limit) tests = tests.slice(0, parseInt(limit as string));

    success(res, { total: tests.length, tests });
  }

  /** GET /users/me/stats — агрегаты по истории тестов */
  async getUserStats(req: Request, res: Response): Promise<void> {
    const user = await User.findById(this.userId(req))
      .select('testHistory')
      .populate('testHistory.subjectId', 'title');
    if (!user) throw AppError.notFound('User not found');

    const tests = user.testHistory || [];
    if (tests.length === 0) {
      success(res, { totalTests: 0, averageScore: 0, bestResult: null, worstResult: null, recentProgress: [] });
      return;
    }

    const totalTests = tests.length;
    const averageScore = Math.round(
      tests.reduce((sum, t) => sum + t.result.scorePercent, 0) / totalTests
    );

    const sorted = [...tests].sort((a, b) => b.result.scorePercent - a.result.scorePercent);
    const pick = (t: typeof sorted[0]) => ({ testId: t._id, score: t.result.scorePercent, date: t.createdAt });

    success(res, {
      totalTests,
      averageScore,
      bestResult: pick(sorted[0]),
      worstResult: pick(sorted[sorted.length - 1]),
      recentProgress: tests.slice(-5).map(pick)
    });
  }

  /** GET /users/me/profile-stats — стрик, изучено тем, выбрано предметов (для карточек профиля). */
  async getProfileStats(req: Request, res: Response): Promise<void> {
    const stats = await profileStatsService.getProfileStats(this.userId(req));
    success(res, stats);
  }

  /** GET /users/me/ent-progress — прогноз балла ЕНТ (шкала 140) по накопленным результатам. */
  async getEntProgress(req: Request, res: Response): Promise<void> {
    success(res, await entProgressService.getEntProgress(this.userId(req)));
  }

  /** GET /users/me/achievements — статусы достижений (id из каталога клиента). */
  async getAchievements(req: Request, res: Response): Promise<void> {
    success(res, await achievementsService.getAchievements(this.userId(req)));
  }

  /** GET /users/me/score — серверный счёт баллов (тесты + solo + live). */
  async getMyScore(req: Request, res: Response): Promise<void> {
    success(res, await scoreService.getMyScore(this.userId(req)));
  }

  /**
   * GET /users/me/tests/:testHistoryId  (и /result) — ЛЁГКАЯ сводка результата.
   * Разбор и AI — отдельными запросами (/breakdown, /ai-explanation).
   */
  async getTestResult(req: Request, res: Response): Promise<void> {
    const entry = await this.loadEntry(req);
    success(res, testResultService.buildResultSummary(entry));
  }

  /** GET /users/me/tests/:testHistoryId/breakdown — по-вопросный разбор + темы для повторения. */
  async getTestBreakdown(req: Request, res: Response): Promise<void> {
    const { entry, test } = await this.loadEntryAndTest(req);
    const data = await testResultService.buildBreakdown(test, entry.answers as IUserAnswer[]);
    success(res, {
      testHistoryId: entry._id ? String(entry._id) : undefined,
      result: entry.result,
      ...data
    });
  }

  /**
   * GET /users/me/tests/:testHistoryId/ai-explanation — AI-объяснение.
   * Считается лениво при первом запросе и кэшируется в историю.
   */
  async getTestAiExplanation(req: Request, res: Response): Promise<void> {
    const { entry, test } = await this.loadEntryAndTest(req);

    if (entry.aiFeedback && entry.aiFeedback.summary) {
      success(res, entry.aiFeedback);
      return;
    }

    const feedback = await testResultService.buildAiExplanation(test, entry.answers as IUserAnswer[]);
    await User.updateOne(
      { _id: this.userId(req), 'testHistory._id': entry._id },
      { $set: { 'testHistory.$.aiFeedback': feedback } }
    );
    success(res, feedback);
  }

  // ==================== private ====================

  /** Найти запись истории по id (lean). */
  private async loadEntry(req: Request): Promise<ITestHistory> {
    const user = await User.findById(this.userId(req)).select('testHistory').lean();
    if (!user) throw AppError.notFound('User not found');
    const id = req.params.testHistoryId;
    const entry = (user.testHistory || []).find((t) => String(t._id) === id);
    if (!entry) throw AppError.notFound('Test history not found');
    return entry as ITestHistory;
  }

  /** Запись истории + исходный тест (для разбора/AI). Требует сохранённый testId. */
  private async loadEntryAndTest(req: Request): Promise<{ entry: ITestHistory; test: any }> {
    const entry = await this.loadEntry(req);
    if (!entry.testId) {
      throw AppError.badRequest('Разбор недоступен для этой попытки (нет ссылки на тест)');
    }
    const test = await Test.findById(entry.testId).lean();
    if (!test) throw AppError.notFound('Исходный тест не найден');
    return { entry, test };
  }
}

export const userController = new UserController();
